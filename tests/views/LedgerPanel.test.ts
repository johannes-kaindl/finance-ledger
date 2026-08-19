import { describe, it, expect, beforeEach, vi } from 'vitest';
import { LedgerPanel } from '../../src/views/LedgerPanel';
import { makeFakeEl } from '../__mocks__/obsidian';

const CLEAN_LEDGER = `\
2026-05-01 * Edeka
    Aktiva:Girokonto                    -45.00 EUR
    Ausgaben:Lebensmittel                45.00 EUR
`;

const FAULTY_LEDGER = `\
2026-05-01 * Edeka
    Aktiva:Girokonto                    -45.00 EUR
    Ausgaben:Lebensmittel                40.00 EUR
`;

function makeFakeApp(opts?: { ledger?: string | null }) {
  return {
    vault: {
      adapter: {
        read: vi.fn().mockImplementation(async (_path: string) => {
          if (opts?.ledger === null) throw new Error('not found');
          return opts?.ledger ?? CLEAN_LEDGER;
        }),
      },
      getMarkdownFiles: vi.fn().mockReturnValue([]),
    },
    metadataCache: { getFileCache: vi.fn().mockReturnValue(undefined) },
    // App#*LocalStorage — filterState falls back to NOOP when unset, but
    // provide them so loadState() stays inert and safe here.
    loadLocalStorage: vi.fn().mockReturnValue(null),
    saveLocalStorage: vi.fn(),
  };
}

type FakeEl = ReturnType<typeof makeFakeEl>;

function walkAll(root: FakeEl): FakeEl[] {
  const out: FakeEl[] = [];
  function rec(el: FakeEl): void {
    out.push(el);
    for (const c of el.children as FakeEl[]) rec(c);
  }
  rec(root);
  return out;
}

const PATHS = {
  isConfigured: true, root: 'R',
  journal: 'R/Ledger/journal.ledger', openingBalances: 'R/Ledger/opening_balances.ledger', accounts: 'R/Ledger/accounts.ledger',
  rulesFolder: 'R/55-Categorizer-Rules', basesFolder: 'R/05-Bases', kategorienFolder: 'R/45-Kategorien', empfaengerFolder: 'R/60-Empfänger', umsatzDir: 'R/Umsätze',
};

async function render(app: ReturnType<typeof makeFakeApp>): Promise<FakeEl> {
  const el = makeFakeEl('div');
  const panel = new LedgerPanel(app as never, () => PATHS, () => ({ signMode: 'intuitive' as const, colorScheme: 'classic' as const }));
  panel.mount(el as unknown as HTMLElement);
  await panel.onShow();
  return el;
}

describe('LedgerPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('has the ledger tab metadata', () => {
    const panel = new LedgerPanel(makeFakeApp() as never, () => PATHS, () => ({ signMode: 'intuitive' as const, colorScheme: 'classic' as const }));
    expect(panel.id).toBe('ledger');
    expect(panel.label).toBe('Ledger');
    expect(panel.icon).toBe('piggy-bank');
  });

  it('renders a filter bar and a posting table from the journal', async () => {
    const el = await render(makeFakeApp());
    const all = walkAll(el);
    expect(all.some(e => typeof e.cls === 'string' && e.cls.includes('ledger-filter-bar'))).toBe(true);
    expect(all.some(e => typeof e.cls === 'string' && e.cls.includes('fl-table'))).toBe(true);
    // Two postings rendered → the counterparty appears in a cell.
    expect(all.some(e => (e.text as string) === 'Edeka')).toBe(true);
  });

  it('rendert Diagnose-Banner wenn das Journal Parse-Probleme hat', async () => {
    const el = await render(makeFakeApp({ ledger: FAULTY_LEDGER }));
    const banner = walkAll(el).find(
      e => typeof e.cls === 'string' && e.cls.includes('fl-diagnostics-banner'),
    );
    expect(banner).toBeDefined();
    expect(banner!.text as string).toMatch(/unbalanced/i);
  });
});
