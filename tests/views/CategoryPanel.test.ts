import { describe, it, expect, beforeEach, vi } from 'vitest';
import { CategoryPanel } from '../../src/views/CategoryPanel';
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

const NESTED_LEDGER = `\
2026-05-01 * Foo
    Aktiva:Girokonto                    -45.00 EUR
    Ausgaben:Lebensmittel:REWE           45.00 EUR
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
    },
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

async function render(
  app: ReturnType<typeof makeFakeApp>,
  navigate: (id: string) => void = () => {},
): Promise<FakeEl> {
  const el = makeFakeEl('div');
  const panel = new CategoryPanel(app as never, () => PATHS, navigate as never, () => ({ signMode: 'intuitive' as const, colorScheme: 'classic' as const }));
  panel.mount(el as unknown as HTMLElement);
  await panel.onShow();
  return el;
}

function findBanner(el: FakeEl): FakeEl | undefined {
  return walkAll(el).find(
    n => typeof n.cls === 'string' && n.cls.includes('fl-diagnostics-banner'),
  );
}

describe('CategoryPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('has the category tab metadata', () => {
    const panel = new CategoryPanel(makeFakeApp() as never, () => PATHS, () => {}, () => ({ signMode: 'intuitive' as const, colorScheme: 'classic' as const }));
    expect(panel.id).toBe('category');
    expect(panel.icon).toBe('badge-euro');
  });

  it('nested tree expands one level per click — no first-click no-op, no grandchild leak', async () => {
    const el = await render(makeFakeApp({ ledger: NESTED_LEDGER }));

    const isTreeRow = (n: FakeEl): boolean =>
      n.tag === 'tr' && walkAll(n).some(c => typeof c.cls === 'string' && c.cls.includes('fl-tree-cell'));
    const label = (tr: FakeEl): string | undefined =>
      walkAll(tr).find(c => typeof c.cls === 'string' && c.cls.includes('fl-link-affordance'))?.text as string | undefined;
    const hidden = (tr: FakeEl): boolean => typeof tr.cls === 'string' && tr.cls.split(/\s+/).includes('fl-hidden');
    const caret = (tr: FakeEl): FakeEl | undefined =>
      walkAll(tr).find(c => typeof c.cls === 'string' && c.cls.split(/\s+/).includes('fl-caret'));

    const rows = walkAll(el).filter(isTreeRow);
    const ausgaben = rows.find(r => label(r) === 'Ausgaben')!;
    const lebensmittel = rows.find(r => label(r) === 'Lebensmittel')!;
    const rewe = rows.find(r => label(r) === 'REWE')!;
    expect([ausgaben, lebensmittel, rewe].every(Boolean)).toBe(true);

    // Initial: only the top-level row is visible.
    expect(hidden(ausgaben)).toBe(false);
    expect(hidden(lebensmittel)).toBe(true);
    expect(hidden(rewe)).toBe(true);

    // Expand top → direct child shows, grandchild stays collapsed (no leak).
    (caret(ausgaben)!.onclick as (e: unknown) => void)({ stopPropagation() {} });
    expect(hidden(lebensmittel)).toBe(false);
    expect(hidden(rewe)).toBe(true);

    // Expand mid → grandchild shows.
    (caret(lebensmittel)!.onclick as (e: unknown) => void)({ stopPropagation() {} });
    expect(hidden(rewe)).toBe(false);

    // Collapse top → everything below hides again.
    (caret(ausgaben)!.onclick as (e: unknown) => void)({ stopPropagation() {} });
    expect(hidden(lebensmittel)).toBe(true);
    expect(hidden(rewe)).toBe(true);
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

  it('clicking a category deep-links to the ledger tab via navigate', async () => {
    const navigate = vi.fn();
    const el = await render(makeFakeApp(), navigate);
    // The category name is a clickable link (fl-link-affordance span).
    const link = walkAll(el).find(
      n => n.tag === 'span' && typeof n.cls === 'string' && n.cls.includes('fl-link-affordance'),
    );
    expect(link).toBeDefined();
    (link!.onclick as () => void)();
    expect(navigate).toHaveBeenCalledWith('ledger');
  });
});
