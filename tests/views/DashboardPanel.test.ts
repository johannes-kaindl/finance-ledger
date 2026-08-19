import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  DashboardPanel,
  DASHBOARD_BASES,
  DASHBOARD_QUICK_ACTIONS,
} from '../../src/views/DashboardPanel';
import { makeFakeEl, Platform, TFolder } from '../__mocks__/obsidian';
import { t } from '../../src/i18n/strings';

const FAKE_LEDGER_CURRENT_MONTH = `\
2026-05-01 * Edeka
    Aktiva:Girokonto                    -45.00 EUR
    Ausgaben:Lebensmittel                45.00 EUR

2026-05-02 * Vermieter
    Aktiva:Girokonto                  -1200.00 EUR
    Ausgaben:Wohnen:Miete              1200.00 EUR

2026-05-03 * Aral
    Aktiva:Girokonto                    -60.00 EUR
    Ausgaben:Mobilitaet:Tanken           60.00 EUR

2026-04-15 * Old (different month)
    Aktiva:Girokonto                    -50.00 EUR
    Ausgaben:Sonstiges                   50.00 EUR
`;

function makeFakeApp(opts?: { ledger?: string | null }) {
  return {
    vault: {
      adapter: {
        read: vi.fn().mockImplementation(async (_path: string) => {
          if (opts?.ledger === null) throw new Error('not found');
          return opts?.ledger ?? FAKE_LEDGER_CURRENT_MONTH;
        }),
      },
      getAbstractFileByPath: vi.fn().mockReturnValue(new TFolder()),
    },
    workspace: {
      openLinkText: vi.fn(),
    },
  };
}

function makeFakeAccessor() {
  return {
    loadData: vi.fn().mockResolvedValue({
      lastReimportTimestamp: '2026-05-09T10:00:00.000Z',
      rulesAddedSinceReimport: 3,
      importerCwd: '/tmp',
      importerTimeoutMs: 60_000,
      uvBinaryPath: '',
    }),
    saveData: vi.fn().mockResolvedValue(undefined),
  };
}

type FakeEl = ReturnType<typeof makeFakeEl>;

function walkAll(root: FakeEl): FakeEl[] {
  const out: FakeEl[] = [];
  function rec(el: FakeEl): void {
    out.push(el);
    const children = el.children as FakeEl[];
    for (const c of children) rec(c);
  }
  rec(root);
  return out;
}

function findCards(el: FakeEl): FakeEl[] {
  return walkAll(el).filter(e =>
    typeof e.cls === 'string' && e.cls.includes('finance-dashboard-card'),
  );
}

function findButtonsByText(el: FakeEl, texts: ReadonlyArray<string>): Map<string, FakeEl> {
  const buttons = walkAll(el).filter(e => e.tag === 'button');
  const found = new Map<string, FakeEl>();
  for (const t of texts) {
    const btn = buttons.find(b => b.text === t);
    if (btn) found.set(t, btn);
  }
  return found;
}

const PATHS = {
  isConfigured: true, root: 'R',
  journal: 'R/Ledger/journal.ledger', openingBalances: 'R/Ledger/opening_balances.ledger', accounts: 'R/Ledger/accounts.ledger',
  rulesFolder: 'R/55-Categorizer-Rules', basesFolder: 'R/05-Bases', kategorienFolder: 'R/45-Kategorien', empfaengerFolder: 'R/60-Empfänger', umsatzDir: 'R/Umsätze',
};

async function render(
  app: ReturnType<typeof makeFakeApp>,
  accessor: ReturnType<typeof makeFakeAccessor> | null,
  navigate: (id: string) => void = () => {},
): Promise<{ panel: DashboardPanel; el: FakeEl }> {
  const el = makeFakeEl('div');
  const panel = new DashboardPanel(app as never, accessor as never, () => PATHS, navigate as never, () => ({ signMode: 'intuitive' as const, colorScheme: 'classic' as const }));
  panel.mount(el as unknown as HTMLElement);
  await panel.onShow();
  return { panel, el };
}

describe('DashboardPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('has the dashboard tab metadata', () => {
    const panel = new DashboardPanel(makeFakeApp() as never, makeFakeAccessor() as never, () => PATHS, () => {}, () => ({ signMode: 'intuitive' as const, colorScheme: 'classic' as const }));
    expect(panel.id).toBe('dashboard');
    expect(panel.label).toBe('Dashboard');
    expect(panel.icon).toBe('layout-dashboard');
  });

  it('rendert 5 Card-Elemente im DOM', async () => {
    const { el } = await render(makeFakeApp(), makeFakeAccessor());
    expect(findCards(el).length).toBe(5);
  });

  it('jede Card hat eine eigene Spezial-Klasse (saldo/activity/quicknav/quickactions/top-categories)', async () => {
    const { el } = await render(makeFakeApp(), makeFakeAccessor());
    const clsList = findCards(el).map(c => c.cls as string).join(' ');
    expect(clsList).toContain('card-saldo');
    expect(clsList).toContain('card-activity');
    expect(clsList).toContain('card-quicknav');
    expect(clsList).toContain('card-quickactions');
    expect(clsList).toContain('card-top-categories');
  });

  it('Quick-Navigation enthält 8 Bases-Buttons mit korrekten Pfaden', async () => {
    const { el } = await render(makeFakeApp(), makeFakeAccessor());
    const labels = DASHBOARD_BASES.map(b => t(b.labelKey));
    expect(labels).toHaveLength(8);
    const found = findButtonsByText(el, labels);
    expect(found.size).toBe(8);
    for (const base of DASHBOARD_BASES) {
      const btn = found.get(t(base.labelKey))!;
      expect((btn.dataset as Record<string, string>).basesPath)
        .toBe(`R/05-Bases/${base.name}`);
    }
  });

  it('Bases-Button-Click öffnet via workspace.openLinkText mit Bases-Pfad', async () => {
    const app = makeFakeApp();
    const { el } = await render(app, makeFakeAccessor());
    const btn = findButtonsByText(el, ['Accounts']).get('Accounts')!;
    (btn.onclick as () => void)();
    expect(app.workspace.openLinkText).toHaveBeenCalledWith(
      'R/05-Bases/finanzen-konten',
      '',
      false,
    );
  });

  it('Quick-Actions enthält nur noch 2 Action-Buttons (Import CSV + Re-Import)', async () => {
    const { el } = await render(makeFakeApp(), makeFakeAccessor());
    const labels = DASHBOARD_QUICK_ACTIONS.map(a => t(a.labelKey));
    expect(labels).toHaveLength(2);
    expect(labels).toContain('Import CSV');
    expect(labels).toContain('Re-import');
    const found = findButtonsByText(el, labels);
    expect(found.size).toBe(2);
  });

  it('Import-CSV-Button delegiert an commands.executeCommandById("finance-ledger:finance-import-csv")', async () => {
    const app = makeFakeApp() as ReturnType<typeof makeFakeApp> & { commands: { executeCommandById: ReturnType<typeof vi.fn> } };
    app.commands = { executeCommandById: vi.fn() };
    const { el } = await render(app, makeFakeAccessor());
    const btn = findButtonsByText(el, ['Import CSV']).get('Import CSV')!;
    (btn.onclick as () => void)();
    expect(app.commands.executeCommandById).toHaveBeenCalledWith('finance-ledger:finance-import-csv');
  });

  it('Saldo-Card aggregiert Aktiva und zeigt Gesamt-Saldo-Zeile', async () => {
    const { el } = await render(makeFakeApp(), makeFakeAccessor());
    const saldoCard = findCards(el).find(c => (c.cls as string).includes('card-saldo'))!;
    const allTexts = walkAll(saldoCard).map(e => e.text as string).join('|');
    expect(allTexts).toContain('Total');
    expect(allTexts).toContain('Girokonto');
  });

  it('Saldo-Card-Link navigiert zum saldo-Tab', async () => {
    const navigate = vi.fn();
    const { el } = await render(makeFakeApp(), makeFakeAccessor(), navigate);
    const link = walkAll(el).find(e => e.tag === 'a' && (e.text as string).includes('balance overview'))!;
    (link.onclick as (e: Event) => void)({ preventDefault() {} } as Event);
    expect(navigate).toHaveBeenCalledWith('saldo');
  });

  it('Activity-Card zeigt timestamp aus accessor + rulesAdded count', async () => {
    const { el } = await render(makeFakeApp(), makeFakeAccessor());
    const activityCard = findCards(el).find(c => (c.cls as string).includes('card-activity'))!;
    const allTexts = walkAll(activityCard).map(e => e.text as string).join('|');
    expect(allTexts).toContain('Last re-import');
    expect(allTexts).toContain('Postings in ledger');
    expect(allTexts).toContain('New rules since re-import');
  });

  it('Activity-Card-Link navigiert zum tbc-Tab', async () => {
    const navigate = vi.fn();
    const { el } = await render(makeFakeApp(), makeFakeAccessor(), navigate);
    const link = walkAll(el).find(e => e.tag === 'a' && (e.text as string).includes('TBC triage'))!;
    (link.onclick as (e: Event) => void)({ preventDefault() {} } as Event);
    expect(navigate).toHaveBeenCalledWith('tbc');
  });

  it('Activity-Card zeigt "never" wenn lastReimportTimestamp null', async () => {
    const accessor = makeFakeAccessor();
    accessor.loadData.mockResolvedValue({
      lastReimportTimestamp: null,
      rulesAddedSinceReimport: 0,
      importerCwd: '/tmp',
      importerTimeoutMs: 60_000,
      uvBinaryPath: '',
    });
    const { el } = await render(makeFakeApp(), accessor);
    const activityCard = findCards(el).find(c => (c.cls as string).includes('card-activity'))!;
    const allTexts = walkAll(activityCard).map(e => e.text as string).join('|');
    expect(allTexts).toContain('never');
  });

  it('Top-Categories-Card filtert Buchungen auf aktuellen Monat (YYYY-MM)', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-05-15T12:00:00.000Z'));
    try {
      const { el } = await render(makeFakeApp(), makeFakeAccessor());
      const topCard = findCards(el).find(c => (c.cls as string).includes('card-top-categories'))!;
      const allTexts = walkAll(topCard).map(e => e.text as string).join('|');
      expect(allTexts).toContain('Wohnen');
      expect(allTexts).toContain('Mobilitaet');
      expect(allTexts).toContain('Lebensmittel');
      expect(allTexts).not.toContain('Sonstiges');
    } finally {
      vi.useRealTimers();
    }
  });

  it('Top-Categories-Row navigiert zum ledger-Tab', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-05-15T12:00:00.000Z'));
    try {
      const navigate = vi.fn();
      const { el } = await render(makeFakeApp(), makeFakeAccessor(), navigate);
      const topCard = findCards(el).find(c => (c.cls as string).includes('card-top-categories'))!;
      const row = walkAll(topCard).find(e => typeof e.cls === 'string' && e.cls.includes('fl-link-affordance'))!;
      (row.onclick as () => void)();
      expect(navigate).toHaveBeenCalledWith('ledger');
    } finally {
      vi.useRealTimers();
    }
  });

  it('Top-Categories-Card zeigt Placeholder wenn aktuell kein Monat gefunden', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2030-01-15T12:00:00.000Z'));
    try {
      const { el } = await render(makeFakeApp(), makeFakeAccessor());
      const topCard = findCards(el).find(c => (c.cls as string).includes('card-top-categories'))!;
      const allTexts = walkAll(topCard).map(e => e.text as string).join('|');
      expect(allTexts).toContain('No transactions for 2030-01');
    } finally {
      vi.useRealTimers();
    }
  });

  it('graceful degradation: zeigt "could not find journal.ledger" wenn read fehlschlägt', async () => {
    const { el } = await render(makeFakeApp({ ledger: null }), makeFakeAccessor());
    const cards = findCards(el);
    expect(cards.length).toBe(5);
    const saldoCard = cards.find(c => (c.cls as string).includes('card-saldo'))!;
    const saldoTexts = walkAll(saldoCard).map(e => e.text as string).join('|');
    expect(saldoTexts).toContain('Could not find journal.ledger');
  });

  it('toleriert null accessor (Activity-Card defaults)', async () => {
    const { el } = await render(makeFakeApp(), null);
    const cards = findCards(el);
    expect(cards.length).toBe(5);
    const activityCard = cards.find(c => (c.cls as string).includes('card-activity'))!;
    const allTexts = walkAll(activityCard).map(e => e.text as string).join('|');
    expect(allTexts).toContain('never');
  });
});

describe('DashboardPanel — Mobile-Readiness', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    Platform.isMobile = false;
    Platform.isDesktop = true;
  });

  it('Quick-Actions-Card filtert Import-CSV + Re-Import auf Mobile (0 Buttons, beide desktop-only)', async () => {
    Platform.isMobile = true;
    Platform.isDesktop = false;
    try {
      const { el } = await render(makeFakeApp(), makeFakeAccessor());
      const qaCard = findCards(el).find(c => (c.cls as string).includes('card-quickactions'))!;
      const buttons = walkAll(qaCard).filter(e => e.tag === 'button');
      expect(buttons.length).toBe(0);
    } finally {
      Platform.isMobile = false;
      Platform.isDesktop = true;
    }
  });

  it('Quick-Actions-Card zeigt Mobile-Info-Hinweis statt Import-Buttons', async () => {
    Platform.isMobile = true;
    Platform.isDesktop = false;
    try {
      const { el } = await render(makeFakeApp(), makeFakeAccessor());
      const qaCard = findCards(el).find(c => (c.cls as string).includes('card-quickactions'))!;
      const nodes = walkAll(qaCard);
      const allTexts = nodes.map(e => e.text as string).join('|');
      const hasSmartphoneIcon = nodes.some(
        e => (e.attrs as Record<string, string> | undefined)?.['data-icon'] === 'smartphone',
      );
      expect(hasSmartphoneIcon).toBe(true);
      expect(allTexts).toContain('desktop');
    } finally {
      Platform.isMobile = false;
      Platform.isDesktop = true;
    }
  });

  it('Quick-Actions-Card auf Desktop zeigt 2 Buttons (Import + Re-Import)', async () => {
    const { el } = await render(makeFakeApp(), makeFakeAccessor());
    const qaCard = findCards(el).find(c => (c.cls as string).includes('card-quickactions'))!;
    const buttons = walkAll(qaCard).filter(e => e.tag === 'button');
    expect(buttons.length).toBe(2);
    const labels = buttons.map(b => b.text as string);
    expect(labels).toContain('Import CSV');
    expect(labels).toContain('Re-import');
  });

  it('container hat finance-plugin Root-Klasse für Theme-Scoping', async () => {
    const { el } = await render(makeFakeApp(), makeFakeAccessor());
    expect(el.cls as string).toContain('finance-plugin');
  });

  it('Cards tragen .fl-card-Klasse zusätzlich zu finance-dashboard-card', async () => {
    const { el } = await render(makeFakeApp(), makeFakeAccessor());
    const cards = findCards(el);
    expect(cards.length).toBeGreaterThan(0);
    for (const card of cards) {
      expect(card.cls as string).toContain('fl-card');
    }
  });

  it('Saldo-Card und Activity-Card haben data-card-Attribut (balance/trend)', async () => {
    const { el } = await render(makeFakeApp(), makeFakeAccessor());
    const cards = findCards(el);
    const saldoCard = cards.find(c => (c.cls as string).includes('card-saldo'))!;
    const activityCard = cards.find(c => (c.cls as string).includes('card-activity'))!;
    expect((saldoCard.attrs as Record<string, string>)['data-card']).toBe('balance');
    expect((activityCard.attrs as Record<string, string>)['data-card']).toBe('trend');
  });

  it('Saldo-Card-Money-Zellen haben .fl-money + tone-Modifier (is-good/is-bad/is-muted/is-zero)', async () => {
    const { el } = await render(makeFakeApp(), makeFakeAccessor());
    const saldoCard = findCards(el).find(c => (c.cls as string).includes('card-saldo'))!;
    const moneySpans = walkAll(saldoCard).filter(e =>
      e.tag === 'span' && typeof e.cls === 'string' && e.cls.includes('fl-money'),
    );
    expect(moneySpans.length).toBeGreaterThan(0);
    for (const span of moneySpans) {
      const c = span.cls as string;
      expect(
        c.includes('is-good') || c.includes('is-bad') || c.includes('is-muted') || c.includes('is-zero'),
      ).toBe(true);
    }
  });

  it('Saldo-Card-Konto-Labels haben .fl-acct-chip data-type=asset', async () => {
    const { el } = await render(makeFakeApp(), makeFakeAccessor());
    const saldoCard = findCards(el).find(c => (c.cls as string).includes('card-saldo'))!;
    const chips = walkAll(saldoCard).filter(e =>
      typeof e.cls === 'string' && e.cls.includes('fl-acct-chip'),
    );
    expect(chips.length).toBeGreaterThan(0);
    for (const chip of chips) {
      expect((chip.attrs as Record<string, string>)['data-type']).toBe('asset');
    }
  });
});

describe('DashboardPanel — Saldo card opening balances (H3)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const JOURNAL = `\
2026-05-10 * Foo
    Aktiva:Girokonto  -30.00 EUR
    Ausgaben:X         30.00 EUR
`;
  const OPENING = `\
2026-05-01 * Eröffnungsbilanz Konto
    Aktiva:Girokonto                  1000.00 EUR
    Eigenkapital:Eroeffnungsbilanz   -1000.00 EUR
`;

  function makeAppWithOpening(): ReturnType<typeof makeFakeApp> {
    const app = makeFakeApp();
    app.vault.adapter.read = vi.fn().mockImplementation(async (path: string) =>
      path.includes('opening_balances') ? OPENING : JOURNAL,
    );
    return app;
  }

  it('Saldo total includes opening balances, not just transaction movement', async () => {
    const { el } = await render(makeAppWithOpening(), makeFakeAccessor());

    const eur = new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' });
    const saldoCard = findCards(el).find(c => (c.cls as string).includes('card-saldo'))!;
    const totalRow = walkAll(saldoCard).find(
      e => typeof e.cls === 'string' && e.cls.includes('fl-total-row'),
    )!;
    const money = walkAll(totalRow).find(
      e => typeof e.cls === 'string' && e.cls.includes('fl-money'),
    )!;

    // 1000 opening + (−30) movement after the as-of date = 970
    expect(money.text).toBe(eur.format(970));
  });
});

describe('DashboardPanel — diagnostics banner (M1)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const FAULTY_LEDGER = `\
2026-05-01 * Foo
    Aktiva:Girokonto                    -45.00 EUR
    Ausgaben:X                           40.00 EUR
`;

  it('rendert Diagnose-Banner wenn das Journal Parse-Probleme hat', async () => {
    const { el } = await render(makeFakeApp({ ledger: FAULTY_LEDGER }), makeFakeAccessor());
    const banner = walkAll(el).find(
      e => typeof e.cls === 'string' && e.cls.includes('fl-diagnostics-banner'),
    );
    expect(banner).toBeDefined();
    expect(banner!.text as string).toMatch(/unbalanced/i);
  });

  it('rendert KEINEN Banner bei sauberem Journal', async () => {
    const { el } = await render(makeFakeApp(), makeFakeAccessor());
    const banner = walkAll(el).find(
      e => typeof e.cls === 'string' && e.cls.includes('fl-diagnostics-banner'),
    );
    expect(banner).toBeUndefined();
  });
});
