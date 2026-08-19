import { it, expect, describe, vi, beforeEach } from 'vitest';

// vi.mock for accountSuggestions spy
vi.mock('../../src/categorizer-rules/accountSuggestions', () => ({
  loadAccountSuggestions: vi.fn().mockResolvedValue({
    accounts: ['Aktiva:Girokonto', 'Ausgaben:Lebensmittel', 'Ausgaben:Lebensmittel:REWE'],
    sourceCount: { fromLedger: 3, fromFrontmatter: 0, deduped: 0 },
  }),
}));

vi.mock('../../src/categorizer-rules/loader', () => ({
  loadCategorizerRules: vi.fn().mockReturnValue({ counterpartyRules: [], paypalRules: [] }),
}));
vi.mock('../../src/categorizer-rules/writer', () => ({
  createCategorizerRule: vi.fn(),
  slugifyPattern: vi.fn((p: string) => p),
}));
vi.mock('../../src/views/helpers', () => ({
  previewMatchCount: vi.fn().mockReturnValue({ tbcMatches: 0, nonTbcMatches: 0 }),
}));
vi.mock('../../src/types/plugin-data', () => ({
  RULES_FOLDER: 'Rules',
}));

import { loadAccountSuggestions } from '../../src/categorizer-rules/accountSuggestions';
import { CategorizerRuleModal } from '../../src/ui/categorizerRuleModal';
import { makeFakeEl } from '../__mocks__/obsidian';

function makeApp(opts?: { slugFileExists?: boolean }) {
  return {
    vault: {
      getMarkdownFiles: () => [],
      getAbstractFileByPath: vi.fn().mockReturnValue(opts?.slugFileExists ? {} : null),
      adapter: { basePath: '/vault', read: vi.fn() },
    },
    metadataCache: { getFileCache: () => null },
  } as unknown as Parameters<typeof CategorizerRuleModal>[0];
}

function findButtonByText(
  el: ReturnType<typeof makeFakeEl>,
  text: string,
): ReturnType<typeof makeFakeEl> | null {
  if (el.tag === 'button' && el.text === text) return el;
  for (const child of el.children as ReturnType<typeof makeFakeEl>[]) {
    const found = findButtonByText(child, text);
    if (found) return found;
  }
  return null;
}

function findByTag(el: ReturnType<typeof makeFakeEl>, tag: string): boolean {
  if (el.tag === tag) return true;
  return (el.children as ReturnType<typeof makeFakeEl>[]).some(child => findByTag(child, tag));
}

function findInputWithList(el: ReturnType<typeof makeFakeEl>): boolean {
  if (el.tag === 'input' && typeof el.attrs === 'object' && (el.attrs as Record<string, string>)['list']) return true;
  return (el.children as ReturnType<typeof makeFakeEl>[]).some(child => findInputWithList(child));
}

const getPaths = () => ({
  isConfigured: true, root: 'R',
  journal: 'R/Ledger/journal.ledger', openingBalances: 'R/Ledger/opening_balances.ledger', accounts: 'R/Ledger/accounts.ledger',
  rulesFolder: 'Rules', basesFolder: 'R/05-Bases', kategorienFolder: 'R/45-Kategorien', empfaengerFolder: 'R/60-Empfänger', umsatzDir: 'R/Umsätze',
});

describe('CategorizerRuleModal', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (loadAccountSuggestions as ReturnType<typeof vi.fn>).mockResolvedValue({
      accounts: ['Aktiva:Girokonto', 'Ausgaben:Lebensmittel', 'Ausgaben:Lebensmittel:REWE'],
      sourceCount: { fromLedger: 3, fromFrontmatter: 0, deduped: 0 },
    });
  });

  it('ruft loadAccountSuggestions in onOpen auf', () => {
    const app = makeApp();
    const modal = new CategorizerRuleModal(app, {
      counterparty: 'rewe',
      allTransactions: [],
      onSuccess: async () => {},
    }, getPaths);
    modal.onOpen();
    expect(loadAccountSuggestions).toHaveBeenCalledOnce();
  });

  it('fügt datalist-Element in contentEl ein', () => {
    const app = makeApp();
    const modal = new CategorizerRuleModal(app, {
      counterparty: 'rewe',
      allTransactions: [],
      onSuccess: async () => {},
    }, getPaths);
    modal.onOpen();
    expect(findByTag(modal.contentEl, 'datalist')).toBe(true);
  });

  it('accountInput hat list-Attribut gesetzt', () => {
    const app = makeApp();
    const modal = new CategorizerRuleModal(app, {
      counterparty: 'rewe',
      allTransactions: [],
      onSuccess: async () => {},
    }, getPaths);
    modal.onOpen();
    expect(findInputWithList(modal.contentEl)).toBe(true);
  });

  it('prüft Slug-Existenz via getAbstractFileByPath', () => {
    const app = makeApp();
    const modal = new CategorizerRuleModal(app, {
      counterparty: 'rewe',
      allTransactions: [],
      onSuccess: async () => {},
    }, getPaths);
    modal.onOpen();
    expect(app.vault.getAbstractFileByPath).toHaveBeenCalled();
  });

  it('deaktiviert btnSave wenn Slug-File existiert', () => {
    const app = makeApp({ slugFileExists: true });
    const modal = new CategorizerRuleModal(app, {
      counterparty: 'rewe',
      allTransactions: [],
      onSuccess: async () => {},
    }, getPaths);
    modal.onOpen();
    const btn = findButtonByText(modal.contentEl, 'Save rule');
    expect(btn).not.toBeNull();
    expect((btn as Record<string, unknown>).disabled).toBe(true);
  });

  it('lässt btnSave enabled wenn Slug-File nicht existiert', () => {
    const app = makeApp({ slugFileExists: false });
    const modal = new CategorizerRuleModal(app, {
      counterparty: 'rewe',
      allTransactions: [],
      onSuccess: async () => {},
    }, getPaths);
    modal.onOpen();
    const btn = findButtonByText(modal.contentEl, 'Save rule');
    expect(btn).not.toBeNull();
    expect((btn as Record<string, unknown>).disabled).toBeFalsy();
  });
});
