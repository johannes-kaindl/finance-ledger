import { it, expect, describe, vi } from 'vitest';
import { createCategorizerRule, nextAvailablePriority } from '../../src/categorizer-rules/writer';
import type { CategorizerRule, CategorizerRulesResult } from '../../src/categorizer-rules/loader';

function makeRule(
  pattern: string,
  patternType: 'substring' | 'paypal-sub',
  priority: number,
  noteFile: string,
  aliases: string[] = [],
): CategorizerRule {
  return {
    pattern,
    patternType,
    ledgerAccount: `Ausgaben:Test:${pattern.replace(/ /g, '_')}`,
    priority,
    tags: [],
    aliases,
    noteFile,
  };
}

function emptyRules(): CategorizerRulesResult {
  return { counterpartyRules: [], paypalRules: [], conflicts: [] };
}

function makeApp(createdFile = { name: 'test.md' }) {
  return {
    vault: {
      create: vi.fn().mockResolvedValue(createdFile),
    },
  };
}

// --- nextAvailablePriority ---

describe('nextAvailablePriority', () => {
  it('returns 100 when no existing rules', () => {
    expect(nextAvailablePriority([], 'substring')).toBe(100);
  });

  it('returns max+100 without hint', () => {
    const rules = [makeRule('a', 'substring', 800, 'a.md'), makeRule('b', 'substring', 900, 'b.md')];
    expect(nextAvailablePriority(rules, 'substring')).toBe(1000);
  });

  it('finds first free slot in hint cluster', () => {
    const rules = [makeRule('a', 'substring', 1100, 'a.md')];
    // hint 1100: block 1100-1190; 1100 taken → next is 1110
    expect(nextAvailablePriority(rules, 'substring', 1100)).toBe(1110);
  });

  it('spills to next block when cluster full', () => {
    const rules: CategorizerRule[] = [];
    for (let i = 0; i < 10; i++) {
      rules.push(makeRule(`r${i}`, 'substring', 1100 + i * 10, `r${i}.md`));
    }
    // block 1100-1190 completely full → next block 1200
    expect(nextAvailablePriority(rules, 'substring', 1100)).toBe(1200);
  });

  it('filters by patternType — paypal-sub uses own range', () => {
    // substring rules at 1800 should not affect paypal-sub priority
    const rules = [makeRule('x', 'substring', 1800, 'x.md')];
    expect(nextAvailablePriority(rules, 'paypal-sub')).toBe(100);
  });

  it('hint mid-cluster picks first free below hint', () => {
    const rules = [makeRule('a', 'substring', 1150, 'a.md')];
    // hint 1150: block 1100-1190; 1100 free → returns 1100
    expect(nextAvailablePriority(rules, 'substring', 1150)).toBe(1100);
  });
});

// --- createCategorizerRule ---

describe('createCategorizerRule', () => {
  it('creates file with correct path and returns slug + priority', async () => {
    const app = makeApp();
    const result = await createCategorizerRule(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      app as any,
      '55-Categorizer-Rules',
      { pattern: 'edeka', patternType: 'substring', ledgerAccount: 'Ausgaben:Lebensmittel', tags: [] },
      emptyRules(),
    );
    expect(result.slug).toBe('edeka');
    expect(result.priority).toBe(100);
    expect(app.vault.create).toHaveBeenCalledWith(
      '55-Categorizer-Rules/edeka.md',
      expect.stringContaining('pattern: edeka'),
    );
  });

  // Burst-A Pflicht: Umlaut slug
  it('slugifies umlaut pattern: müller mering → mueller-mering', async () => {
    const app = makeApp();
    const result = await createCategorizerRule(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      app as any,
      '55-Categorizer-Rules',
      { pattern: 'müller mering', patternType: 'substring', ledgerAccount: 'Ausgaben:Test', tags: [] },
      emptyRules(),
    );
    expect(result.slug).toBe('mueller-mering');
    expect(app.vault.create).toHaveBeenCalledWith(
      '55-Categorizer-Rules/mueller-mering.md',
      expect.any(String),
    );
  });

  // Burst-A Pflicht: paypal-sub + existing CP-rule → -pp suffix
  it('appends -pp when paypal-sub slug collides with existing rule', async () => {
    const app = makeApp();
    const existing: CategorizerRulesResult = {
      counterpartyRules: [makeRule('pop-mart', 'substring', 500, 'pop-mart.md')],
      paypalRules: [],
      conflicts: [],
    };
    const result = await createCategorizerRule(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      app as any,
      '55-Categorizer-Rules',
      { pattern: 'pop-mart', patternType: 'paypal-sub', ledgerAccount: 'Ausgaben:Test', tags: [] },
      existing,
    );
    expect(result.slug).toBe('pop-mart-pp');
    expect(app.vault.create).toHaveBeenCalledWith(
      '55-Categorizer-Rules/pop-mart-pp.md',
      expect.any(String),
    );
  });

  it('no -pp suffix when paypal-sub slug does not collide', async () => {
    const app = makeApp();
    const result = await createCategorizerRule(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      app as any,
      '55-Categorizer-Rules',
      { pattern: 'spotify', patternType: 'paypal-sub', ledgerAccount: 'Ausgaben:Abo', tags: [] },
      emptyRules(),
    );
    expect(result.slug).toBe('spotify');
  });

  // M3: two substring patterns that slugify identically must not collide on create
  it('dedupes a substring slug that collides with an existing note (M3)', async () => {
    const app = makeApp();
    const existing: CategorizerRulesResult = {
      counterpartyRules: [makeRule('REWE', 'substring', 500, 'rewe.md')],
      paypalRules: [],
      conflicts: [],
    };
    const result = await createCategorizerRule(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      app as any,
      '55-Categorizer-Rules',
      { pattern: 'rewe.', patternType: 'substring', ledgerAccount: 'Ausgaben:Lebensmittel', tags: [] },
      existing,
    );
    expect(result.slug).toBe('rewe-2');
    expect(app.vault.create).toHaveBeenCalledWith(
      '55-Categorizer-Rules/rewe-2.md',
      expect.any(String),
    );
  });

  it('dedupes further when the deduped slug also exists (M3)', async () => {
    const app = makeApp();
    const existing: CategorizerRulesResult = {
      counterpartyRules: [
        makeRule('REWE', 'substring', 500, 'rewe.md'),
        makeRule('rewe x', 'substring', 600, 'rewe-2.md'),
      ],
      paypalRules: [],
      conflicts: [],
    };
    const result = await createCategorizerRule(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      app as any,
      '55-Categorizer-Rules',
      { pattern: 'rewe.', patternType: 'substring', ledgerAccount: 'Ausgaben:Lebensmittel', tags: [] },
      existing,
    );
    expect(result.slug).toBe('rewe-3');
  });

  it('adds a numeric suffix when a paypal-sub -pp slug also already exists (M3)', async () => {
    const app = makeApp();
    const existing: CategorizerRulesResult = {
      counterpartyRules: [makeRule('pop-mart', 'substring', 500, 'pop-mart.md')],
      paypalRules: [makeRule('pop-mart', 'paypal-sub', 100, 'pop-mart-pp.md')],
      conflicts: [],
    };
    const result = await createCategorizerRule(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      app as any,
      '55-Categorizer-Rules',
      { pattern: 'pop-mart', patternType: 'paypal-sub', ledgerAccount: 'Ausgaben:Test', tags: [] },
      existing,
    );
    expect(result.slug).toBe('pop-mart-pp-2');
  });

  it('detects pattern conflict with existing rule', async () => {
    const app = makeApp();
    const existing: CategorizerRulesResult = {
      counterpartyRules: [makeRule('edeka', 'substring', 800, 'edeka.md')],
      paypalRules: [],
      conflicts: [],
    };
    const result = await createCategorizerRule(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      app as any,
      '55-Categorizer-Rules',
      { pattern: 'edeka', patternType: 'substring', ledgerAccount: 'Ausgaben:Test', tags: [] },
      existing,
    );
    expect(result.conflicts).toHaveLength(1);
    expect(result.conflicts[0].pattern).toBe('edeka');
    expect(result.conflicts[0].fileA).toBe('edeka.md');
  });

  it('detects alias conflict with existing pattern', async () => {
    const app = makeApp();
    const existing: CategorizerRulesResult = {
      counterpartyRules: [makeRule('aldi sued', 'substring', 810, 'aldi-sued.md', ['aldi süd'])],
      paypalRules: [],
      conflicts: [],
    };
    const result = await createCategorizerRule(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      app as any,
      '55-Categorizer-Rules',
      {
        pattern: 'aldi neu',
        patternType: 'substring',
        ledgerAccount: 'Ausgaben:Lebensmittel',
        tags: [],
        aliases: ['aldi sued'],
      },
      existing,
    );
    expect(result.conflicts.some(c => c.pattern === 'aldi sued')).toBe(true);
  });

  it('no conflicts when no pattern overlap', async () => {
    const app = makeApp();
    const existing: CategorizerRulesResult = {
      counterpartyRules: [makeRule('rewe', 'substring', 700, 'rewe.md')],
      paypalRules: [],
      conflicts: [],
    };
    const result = await createCategorizerRule(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      app as any,
      '55-Categorizer-Rules',
      { pattern: 'edeka', patternType: 'substring', ledgerAccount: 'Ausgaben:Lebensmittel', tags: [] },
      existing,
    );
    expect(result.conflicts).toHaveLength(0);
  });

  it('frontmatter schema: required fields present', async () => {
    const app = makeApp();
    await createCategorizerRule(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      app as any,
      '55-Categorizer-Rules',
      {
        pattern: 'telekom',
        patternType: 'substring',
        ledgerAccount: 'Ausgaben:Kommunikation:Telekom',
        tags: ['recurring'],
        aliases: ['telekom deutschland'],
        notes: 'Festnetz-Vertrag',
      },
      emptyRules(),
    );
    const content: string = (app.vault.create.mock.calls[0] as [string, string])[1];
    expect(content).toContain('kategorie: categorizer-rule');
    expect(content).toContain('pattern: telekom');
    expect(content).toContain('pattern_type: substring');
    expect(content).toContain('ledger_account: Ausgaben:Kommunikation:Telekom');
    expect(content).toContain('deprecated: false');
    expect(content).toContain('created_by: jay-plugin');
    expect(content).toContain('- recurring');
    expect(content).toContain('- telekom deutschland');
    expect(content).toContain('notes: "Festnetz-Vertrag"');
    expect(content).toContain('type: 📝 Notiz');
    expect(content).toContain('status: 🌱 Entwurf');
  });

  it('uses priorityHint for slot selection', async () => {
    const app = makeApp();
    const result = await createCategorizerRule(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      app as any,
      '55-Categorizer-Rules',
      {
        pattern: 'burger king',
        patternType: 'substring',
        ledgerAccount: 'Ausgaben:Gastronomie',
        tags: [],
        priorityHint: 1100,
      },
      emptyRules(),
    );
    // block 1100-1190, first slot is 1100
    expect(result.priority).toBe(1100);
  });
});
