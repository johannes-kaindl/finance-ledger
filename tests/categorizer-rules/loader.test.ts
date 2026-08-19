import { it, expect, describe } from 'vitest';
import { loadCategorizerRules } from '../../src/categorizer-rules/loader';

type Frontmatter = Record<string, unknown>;

interface MockFile {
  name: string;
  frontmatter: Frontmatter | null;
}

function makeApp(files: MockFile[]) {
  return {
    vault: {
      getMarkdownFiles: () => files.map(f => ({ name: f.name })),
    },
    metadataCache: {
      getFileCache: (file: { name: string }) => {
        const found = files.find(f => f.name === file.name);
        if (!found || !found.frontmatter) return null;
        return { frontmatter: found.frontmatter };
      },
    },
  };
}

const ruleFile = (
  name: string,
  pattern: string,
  patternType: string,
  priority: number,
  opts?: { tags?: unknown[]; aliases?: unknown[]; deprecated?: boolean }
): MockFile => ({
  name,
  frontmatter: {
    kategorie: 'categorizer-rule',
    pattern,
    pattern_type: patternType,
    ledger_account: `Ausgaben:Test:${pattern.replace(/ /g, '_')}`,
    priority,
    tags: opts?.tags ?? [],
    aliases: opts?.aliases ?? [],
    deprecated: opts?.deprecated ?? false,
  },
});

describe('loadCategorizerRules', () => {
  it('separates substring and paypal-sub rules', () => {
    const app = makeApp([
      ruleFile('edeka.md', 'edeka', 'substring', 800),
      ruleFile('spotify-pp.md', 'spotify', 'paypal-sub', 1700),
    ]);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { counterpartyRules, paypalRules } = loadCategorizerRules(app as any);
    expect(counterpartyRules).toHaveLength(1);
    expect(counterpartyRules[0].pattern).toBe('edeka');
    expect(paypalRules).toHaveLength(1);
    expect(paypalRules[0].pattern).toBe('spotify');
  });

  it('sorts by priority ASC', () => {
    const app = makeApp([
      ruleFile('telekom.md', 'telekom', 'substring', 720),
      ruleFile('congstar.md', 'congstar', 'substring', 710),
    ]);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { counterpartyRules } = loadCategorizerRules(app as any);
    expect(counterpartyRules[0].pattern).toBe('congstar');
    expect(counterpartyRules[1].pattern).toBe('telekom');
  });

  it('filters out deprecated notes', () => {
    const app = makeApp([
      ruleFile('edeka.md', 'edeka', 'substring', 800),
      ruleFile('old.md', 'alte firma', 'substring', 1200, { deprecated: true }),
    ]);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { counterpartyRules } = loadCategorizerRules(app as any);
    expect(counterpartyRules).toHaveLength(1);
    expect(counterpartyRules[0].pattern).toBe('edeka');
  });

  it('filters null values from tags and aliases (Obsidian normalization)', () => {
    const app = makeApp([
      ruleFile('aldi-sued.md', 'aldi süd', 'substring', 810, {
        tags: [null, 'recurring'],
        aliases: [null, 'aldi sued'],
      }),
    ]);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { counterpartyRules } = loadCategorizerRules(app as any);
    expect(counterpartyRules[0].tags).toEqual(['recurring']);
    expect(counterpartyRules[0].aliases).toEqual(['aldi sued']);
  });

  it('detects pattern conflicts across notes', () => {
    const app = makeApp([
      ruleFile('edeka.md', 'edeka', 'substring', 800),
      ruleFile('edeka-2.md', 'edeka', 'substring', 810),
    ]);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { conflicts } = loadCategorizerRules(app as any);
    expect(conflicts).toHaveLength(1);
    expect(conflicts[0].pattern).toBe('edeka');
  });

  it('detects alias conflicts with primary pattern of another note', () => {
    const app = makeApp([
      ruleFile('aldi-sued.md', 'aldi süd', 'substring', 810, { aliases: ['aldi sued'] }),
      ruleFile('aldi-sued-2.md', 'aldi sued', 'substring', 820),
    ]);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { conflicts } = loadCategorizerRules(app as any);
    expect(conflicts.some(c => c.pattern === 'aldi sued')).toBe(true);
  });

  it('ignores non-categorizer-rule notes', () => {
    const app = makeApp([
      ruleFile('edeka.md', 'edeka', 'substring', 800),
      { name: 'README.md', frontmatter: { kategorie: 'moc' } },
      { name: 'no-fm.md', frontmatter: null },
    ]);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { counterpartyRules } = loadCategorizerRules(app as any);
    expect(counterpartyRules).toHaveLength(1);
  });
});
