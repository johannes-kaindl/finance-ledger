import type { App, TFile } from 'obsidian';
import type { CategorizerRule, CategorizerRulesResult, ConflictWarning } from './loader';
import { runGitBackup } from './gitBackup';

export interface CreateRuleParams {
  pattern: string;
  patternType: 'substring' | 'paypal-sub';
  ledgerAccount: string;
  tags: string[];
  aliases?: string[];
  notes?: string;
  priorityHint?: number;
}

export interface CreateRuleResult {
  file: TFile;
  slug: string;
  priority: number;
  conflicts: ConflictWarning[];
}

export function slugifyPattern(pattern: string): string {
  return pattern
    .toLowerCase()
    .replace(/ä/g, 'ae')
    .replace(/ö/g, 'oe')
    .replace(/ü/g, 'ue')
    .replace(/ß/g, 'ss')
    .replace(/[.''']/g, '')
    .replace(/\+/g, '-und-')
    .replace(/&/g, '-und-')
    .trim()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9-]/g, '')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

export function nextAvailablePriority(
  existing: CategorizerRule[],
  patternType: 'substring' | 'paypal-sub',
  hint?: number,
): number {
  const relevant = existing.filter(r => r.patternType === patternType);
  const used = new Set(relevant.map(r => r.priority));

  if (hint !== undefined) {
    const blockBase = Math.floor(hint / 100) * 100;
    for (let base = blockBase; base < blockBase + 100_000; base += 100) {
      for (let slot = base; slot < base + 100; slot += 10) {
        if (!used.has(slot)) return slot;
      }
    }
  }

  if (used.size === 0) return 100;
  return Math.max(...used) + 100;
}

function buildFrontmatter(
  params: CreateRuleParams,
  slug: string,
  priority: number,
  now: Date,
): string {
  const isoDate = now.toISOString().split('T')[0];
  const isoDateTime = now.toISOString().replace(/\.\d{3}Z$/, '');

  const tags = params.tags;
  const aliases = params.aliases ?? [];

  const tagsYaml =
    tags.length > 0 ? tags.map(t => `  - ${t}`).join('\n') : '  - ';
  const aliasesYaml =
    aliases.length > 0 ? aliases.map(a => `  - ${a}`).join('\n') : '  - ';

  return (
    `---\n` +
    `kategorie: categorizer-rule\n` +
    `pattern: ${params.pattern}\n` +
    `pattern_type: ${params.patternType}\n` +
    `ledger_account: ${params.ledgerAccount}\n` +
    `priority: ${priority}\n` +
    `tags:\n${tagsYaml}\n` +
    `aliases:\n${aliasesYaml}\n` +
    `notes: "${params.notes ?? ''}"\n` +
    `deprecated: false\n` +
    `created_by: jay-plugin\n` +
    `created_at: ${isoDate}\n` +
    `title: ${slug}\n` +
    `type: 📝 Notiz\n` +
    `status: 🌱 Entwurf\n` +
    `created: ${isoDateTime}\n` +
    `updated: ${isoDateTime}\n` +
    `---\n`
  );
}

export async function createCategorizerRule(
  app: App,
  rulesFolder: string,
  params: CreateRuleParams,
  existingRules: CategorizerRulesResult,
  options?: { vaultPath?: string },
): Promise<CreateRuleResult> {
  const baseSlug = slugifyPattern(params.pattern);

  const allRules: CategorizerRule[] = [
    ...existingRules.counterpartyRules,
    ...existingRules.paypalRules,
  ];

  // Paypal-sub collision: if slug already used by any existing note → append -pp
  const existingSlugs = new Set(allRules.map(r => r.noteFile.replace(/\.md$/, '')));
  let slug =
    params.patternType === 'paypal-sub' && existingSlugs.has(baseSlug)
      ? `${baseSlug}-pp`
      : baseSlug;

  // Guarantee a unique filename: two patterns can slugify identically (e.g.
  // "REWE" and "rewe."), which would make app.vault.create throw
  // "file already exists". Append a numeric suffix until the slug is free.
  if (existingSlugs.has(slug)) {
    let n = 2;
    while (existingSlugs.has(`${slug}-${n}`)) n++;
    slug = `${slug}-${n}`;
  }

  const priority = nextAvailablePriority(allRules, params.patternType, params.priorityHint);

  // Conflict detection: new pattern + aliases against existing patterns + aliases
  const seenPatterns = new Map<string, string>();
  for (const rule of allRules) {
    for (const p of [rule.pattern, ...rule.aliases]) {
      seenPatterns.set(p, rule.noteFile);
    }
  }

  const conflicts: ConflictWarning[] = [];
  for (const p of [params.pattern, ...(params.aliases ?? [])]) {
    const existing = seenPatterns.get(p);
    if (existing) {
      conflicts.push({ pattern: p, fileA: existing, fileB: `${slug}.md` });
    }
  }

  // Git backup pre-write (only when vaultPath provided — skipped in unit tests)
  if (options?.vaultPath) {
    const backup = await runGitBackup(
      options.vaultPath,
      rulesFolder,
      `[plugin] backup before rule write: ${slug}`,
    );
    if (backup.error) {
      throw new Error(`Git-Backup fehlgeschlagen: ${backup.error}`);
    }
  }

  const content = buildFrontmatter(params, slug, priority, new Date());
  const file = await app.vault.create(`${rulesFolder}/${slug}.md`, content);

  return { file, slug, priority, conflicts };
}
