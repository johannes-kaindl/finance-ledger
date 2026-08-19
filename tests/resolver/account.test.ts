import { it, expect, describe, vi } from 'vitest';
import { TFile } from 'obsidian';

vi.mock('../../src/categorizer-rules/loader', () => ({
  loadCategorizerRules: vi.fn(),
}));

import { resolveAccountNote, resolveCounterpartyNote } from '../../src/resolver/account';
import { loadCategorizerRules } from '../../src/categorizer-rules/loader';

const loadRulesMock = loadCategorizerRules as ReturnType<typeof vi.fn>;

type MockFrontmatter = Record<string, string | undefined>;

interface MockFile {
  path: string;
  frontmatter: MockFrontmatter | null;
}

function makeApp(files: MockFile[]) {
  return {
    vault: {
      getMarkdownFiles: () => files.map(f => ({ path: f.path })),
    },
    metadataCache: {
      getFileCache: (file: { path: string }) => {
        const found = files.find(f => f.path === file.path);
        if (!found || !found.frontmatter) return null;
        return { frontmatter: found.frontmatter };
      },
    },
  };
}

describe('resolveAccountNote', () => {
  it('matches via ledger_account frontmatter key', () => {
    const app = makeApp([
      {
        path: '10-Konten/Konto 01 – Hauptkonto Sparkasse.md',
        frontmatter: {
          kategorie: 'konto',
          ledger_account: 'Aktiva:Bank:Sparkasse:Hauptkonto',
        },
      },
    ]);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = resolveAccountNote('Aktiva:Bank:Sparkasse:Hauptkonto', app as any);
    expect(result).not.toBeNull();
    expect(result!.path).toBe('10-Konten/Konto 01 – Hauptkonto Sparkasse.md');
  });

  it('matches via ledger_kategorie frontmatter key', () => {
    const app = makeApp([
      {
        path: '20-Vertraege/Telekom – Festnetz.md',
        frontmatter: {
          kategorie: 'vertrag',
          ledger_kategorie: 'Ausgaben:Kommunikation:Festnetz:Telekom',
        },
      },
    ]);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = resolveAccountNote('Ausgaben:Kommunikation:Festnetz:Telekom', app as any);
    expect(result).not.toBeNull();
    expect(result!.path).toBe('20-Vertraege/Telekom – Festnetz.md');
  });

  it('returns null when no file matches', () => {
    const app = makeApp([
      {
        path: 'some-note.md',
        frontmatter: { ledger_account: 'Aktiva:Bank:Sparkasse:Hauptkonto' },
      },
    ]);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = resolveAccountNote('Aktiva:Unknown:Account', app as any);
    expect(result).toBeNull();
  });

  it('returns null when file has no frontmatter', () => {
    const app = makeApp([{ path: 'no-fm.md', frontmatter: null }]);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect(resolveAccountNote('Aktiva:Bank:Sparkasse:Hauptkonto', app as any)).toBeNull();
  });

  it('returns first match when multiple files could match', () => {
    const app = makeApp([
      {
        path: 'first.md',
        frontmatter: { ledger_account: 'Aktiva:Bank:Sparkasse:Hauptkonto' },
      },
      {
        path: 'second.md',
        frontmatter: { ledger_account: 'Aktiva:Bank:Sparkasse:Hauptkonto' },
      },
    ]);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = resolveAccountNote('Aktiva:Bank:Sparkasse:Hauptkonto', app as any);
    expect(result!.path).toBe('first.md');
  });
});

describe('resolveCounterpartyNote', () => {
  const RULES = 'R/55-Categorizer-Rules';

  function appWith(existingPaths: string[]) {
    return {
      vault: {
        getAbstractFileByPath: (p: string) => {
          if (!existingPaths.includes(p)) return null;
          const f = new TFile();
          f.path = p;
          return f;
        },
      },
    };
  }

  it('matches a counterparty to its rule note via pattern substring', () => {
    loadRulesMock.mockReturnValue({
      counterpartyRules: [{ pattern: 'viabakery', aliases: [], noteFile: 'viabakery.md' }],
      paypalRules: [],
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const res = resolveCounterpartyNote('VIABAKERY Berlin', RULES, appWith([`${RULES}/viabakery.md`]) as any);
    expect(res).not.toBeNull();
    expect(res!.path).toBe(`${RULES}/viabakery.md`);
  });

  it('matches via an alias, not just the pattern', () => {
    loadRulesMock.mockReturnValue({
      counterpartyRules: [{ pattern: 'edeka', aliases: ['e-center'], noteFile: 'edeka.md' }],
      paypalRules: [],
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const res = resolveCounterpartyNote('E-CENTER Foo', RULES, appWith([`${RULES}/edeka.md`]) as any);
    expect(res!.path).toBe(`${RULES}/edeka.md`);
  });

  it('returns null when no rule matches the counterparty', () => {
    loadRulesMock.mockReturnValue({ counterpartyRules: [], paypalRules: [] });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect(resolveCounterpartyNote('Unknown Payee', RULES, appWith([]) as any)).toBeNull();
  });

  it('returns null when the rule matches but its note file is missing', () => {
    loadRulesMock.mockReturnValue({
      counterpartyRules: [{ pattern: 'gone', aliases: [], noteFile: 'gone.md' }],
      paypalRules: [],
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect(resolveCounterpartyNote('gone', RULES, appWith([]) as any)).toBeNull();
  });
});
