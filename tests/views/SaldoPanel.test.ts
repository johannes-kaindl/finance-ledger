import { describe, it, expect, beforeEach, vi } from 'vitest';
import { SaldoPanel } from '../../src/views/SaldoPanel';
import { makeFakeEl } from '../__mocks__/obsidian';

const CLEAN_LEDGER = `\
2026-05-01 * Foo
    Aktiva:Girokonto                    -45.00 EUR
    Ausgaben:Lebensmittel                45.00 EUR
`;

const FAULTY_LEDGER = `\
2026-05-01 * Foo
    Aktiva:Girokonto                    -45.00 EUR
    Ausgaben:Lebensmittel                40.00 EUR
`;

function makeFakeApp(opts?: { ledger?: string | null }) {
  return {
    vault: {
      adapter: {
        // opening_balances is intentionally absent → movement-only fallback.
        read: vi.fn().mockImplementation(async (path: string) => {
          if (path.includes('opening_balances')) throw new Error('no opening');
          if (opts?.ledger === null) throw new Error('not found');
          return opts?.ledger ?? CLEAN_LEDGER;
        }),
      },
    },
    workspace: { openLinkText: vi.fn() },
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
  const panel = new SaldoPanel(app as never, () => PATHS, () => ({ signMode: 'intuitive' as const, colorScheme: 'classic' as const }));
  panel.mount(el as unknown as HTMLElement);
  await panel.onShow();
  return el;
}

function findBanner(el: FakeEl): FakeEl | undefined {
  return walkAll(el).find(
    n => typeof n.cls === 'string' && n.cls.includes('fl-diagnostics-banner'),
  );
}

describe('SaldoPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('has the saldo tab metadata', () => {
    const panel = new SaldoPanel(makeFakeApp() as never, () => PATHS, () => ({ signMode: 'intuitive' as const, colorScheme: 'classic' as const }));
    expect(panel.id).toBe('saldo');
    expect(panel.icon).toBe('landmark');
  });

  it('rendert Diagnose-Banner wenn das Journal Parse-Probleme hat', async () => {
    const el = await render(makeFakeApp({ ledger: FAULTY_LEDGER }));
    const banner = findBanner(el);
    expect(banner).toBeDefined();
    expect(banner!.text as string).toMatch(/unbalanced/i);
  });

  it('rendert KEINEN Banner bei sauberem Journal', async () => {
    const el = await render(makeFakeApp());
    expect(findBanner(el)).toBeUndefined();
  });
});
