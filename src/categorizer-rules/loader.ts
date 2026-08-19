import type { App } from 'obsidian';

export interface CategorizerRule {
  pattern: string;
  patternType: 'substring' | 'paypal-sub';
  ledgerAccount: string;
  priority: number;
  tags: string[];
  aliases: string[];
  noteFile: string;
}

export interface ConflictWarning {
  pattern: string;
  fileA: string;
  fileB: string;
}

export interface CategorizerRulesResult {
  counterpartyRules: CategorizerRule[];
  paypalRules: CategorizerRule[];
  conflicts: ConflictWarning[];
  /**
   * Notizen, die sich als `categorizer-rule` ausgeben, aber ein Pflichtfeld
   * leer lassen — sie werden verworfen.
   *
   * Bewusst gemeldet statt still übersprungen: eine halbfertige Regel sieht im
   * Vault vollständig aus und wirkt einfach nicht. Der Python-Importer prüfte
   * nur, ob der Schlüssel *vorhanden* ist, und schrieb bei leerem Wert ein
   * Konto namens `None` ins Journal — dort standen dadurch drei Wochen lang
   * zwei Buchungen auf einem Konto, das es nicht gibt.
   */
  incomplete: string[];
}

export function loadCategorizerRules(app: App): CategorizerRulesResult {
  const cpRules: CategorizerRule[] = [];
  const ppRules: CategorizerRule[] = [];
  const conflicts: ConflictWarning[] = [];
  const incomplete: string[] = [];

  // pattern → filename of first occurrence (for conflict detection)
  const seenPatterns = new Map<string, string>();

  for (const file of app.vault.getMarkdownFiles()) {
    const fm: Record<string, unknown> | undefined =
      app.metadataCache.getFileCache(file)?.frontmatter;
    if (!fm) continue;
    if (fm['kategorie'] !== 'categorizer-rule') continue;
    if (fm['deprecated'] === true) continue;

    const rawPattern = fm['pattern'];
    const rawPatternType = fm['pattern_type'];
    const rawLedgerAccount = fm['ledger_account'];
    const rawPriority = fm['priority'];

    const pattern: string | undefined = typeof rawPattern === 'string' ? rawPattern : undefined;
    const patternType: string | undefined =
      typeof rawPatternType === 'string' ? rawPatternType : undefined;
    const ledgerAccount: string | undefined =
      typeof rawLedgerAccount === 'string' ? rawLedgerAccount : undefined;
    const priority: number | undefined = typeof rawPriority === 'number' ? rawPriority : undefined;

    if (!pattern || !patternType || !ledgerAccount || priority === undefined) {
      incomplete.push(file.name);
      continue;
    }
    if (patternType !== 'substring' && patternType !== 'paypal-sub') {
      incomplete.push(file.name);
      continue;
    }

    const rawTags: unknown = fm['tags'];
    const tags: string[] = Array.isArray(rawTags)
      ? rawTags.filter((t): t is string => t !== null && t !== undefined)
      : [];

    const rawAliases: unknown = fm['aliases'];
    const aliases: string[] = Array.isArray(rawAliases)
      ? rawAliases.filter((a): a is string => a !== null && a !== undefined)
      : [];

    const rule: CategorizerRule = {
      pattern,
      patternType,
      ledgerAccount,
      priority: Number(priority),
      tags,
      aliases,
      noteFile: file.name,
    };

    // Conflict check: primary pattern + all aliases
    for (const p of [pattern, ...aliases]) {
      const existing = seenPatterns.get(p);
      if (existing) {
        conflicts.push({ pattern: p, fileA: existing, fileB: file.name });
      } else {
        seenPatterns.set(p, file.name);
      }
    }

    if (patternType === 'paypal-sub') {
      ppRules.push(rule);
    } else {
      cpRules.push(rule);
    }
  }

  cpRules.sort((a, b) => a.priority - b.priority);
  ppRules.sort((a, b) => a.priority - b.priority);

  incomplete.sort();
  return { counterpartyRules: cpRules, paypalRules: ppRules, conflicts, incomplete };
}
