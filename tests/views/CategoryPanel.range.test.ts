import { describe, it, expect, beforeEach, vi } from 'vitest';
import { makeFakeEl, type FakeEl } from '../__mocks__/obsidian';

vi.mock('../../src/state/filterState', () => ({ saveState: vi.fn() }));

import { CategoryPanel } from '../../src/views/CategoryPanel';
import { fixedClock } from '../../src/core/config/context';
import { saveState } from '../../src/state/filterState';

const LEDGER = `\
2026-01-10 * Alt
    Aktiva:Girokonto                    -100.00 EUR
    Ausgaben:Lebensmittel                100.00 EUR

2026-02-10 * Neu
    Aktiva:Girokonto                    -30.00 EUR
    Ausgaben:Lebensmittel                30.00 EUR

2026-02-20 * Neu2
    Aktiva:Girokonto                    -20.00 EUR
    Ausgaben:Miete                       20.00 EUR
`;

const PATHS = {
  isConfigured: true, root: 'R', journal: 'R/Ledger/journal.ledger', openingBalances: 'R/Ledger/o.ledger', accounts: 'R/Ledger/a.ledger',
  rulesFolder: 'R/55', basesFolder: 'R/05', kategorienFolder: 'R/45', empfaengerFolder: 'R/60', umsatzDir: 'R/U',
  kontenFile: 'R/k.yaml', vertraegeFile: 'R/v.yaml', snapshotsFolder: 'R/.s',
};

function all(root: FakeEl): FakeEl[] {
  return [root, ...(root.children as FakeEl[]).flatMap(all)];
}
const byTag = (root: FakeEl, tag: string): FakeEl[] => all(root).filter((n) => n.tag === tag);
const clsOf = (n: FakeEl): string[] => String(n.cls ?? '').split(/\s+/);

async function render(today = '2026-02-15') {
  const app = { vault: { adapter: { read: vi.fn().mockResolvedValue(LEDGER) } } };
  const el = makeFakeEl('div');
  const navigate = vi.fn();
  const panel = new CategoryPanel(
    app as never, () => PATHS, navigate as never,
    () => ({ signMode: 'intuitive' as const, colorScheme: 'classic' as const }), fixedClock(today),
  );
  panel.mount(el as unknown as HTMLElement);
  await panel.onShow();
  return { el, navigate };
}

/** Beträge der obersten Zeile (Ausgaben) — die Summe aller Ausgaben im Zeitrahmen. */
function topVolume(el: FakeEl): string {
  const row = byTag(el, 'tr').find((r) => all(r).some((c) => clsOf(c).includes('fl-tree-cell')))!;
  return String(all(row).find((c) => clsOf(c).includes('fl-money'))!.text);
}
function preset(el: FakeEl): FakeEl {
  return byTag(el, 'select').find((s) => clsOf(s).includes('fl-filter-select'))!;
}
function dateInputs(el: FakeEl): FakeEl[] {
  return byTag(el, 'input').filter((i) => i.attrs.type === 'date' || i.type === 'date');
}
const choose = (sel: FakeEl, value: string): void => { sel.value = value; (sel.onchange as () => void)(); };
const type = (inp: FakeEl, value: string): void => { inp.value = value; (inp.oninput as () => void)(); };

describe('CategoryPanel — Zeitrahmen', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('ohne Zeitrahmen zählen alle Buchungen; Voreinstellung „Gesamter Zeitraum“ ist gewählt', async () => {
    const { el } = await render();
    expect(topVolume(el)).toContain('150');
    expect(preset(el).value).toBe('all');
  });

  it('Preset „Dieser Monat“ rechnet vom Tag der Uhr und füllt die Datumsfelder', async () => {
    const { el } = await render('2026-02-15');
    choose(preset(el), 'thisMonth');
    expect(topVolume(el)).toContain('50'); // 30 + 20, die Januar-Buchung fällt weg
    const [from, to] = dateInputs(el);
    expect([from.value, to.value]).toEqual(['2026-02-01', '2026-02-28']);
  });

  it('Datumsfelder von Hand: Grenzen eingeschlossen, die Auswahl springt auf „Eigener Zeitraum“', async () => {
    const { el } = await render('2026-02-15');
    const [from, to] = dateInputs(el);
    type(from, '2026-02-10');
    type(to, '2026-02-10');
    expect(topVolume(el)).toContain('30');
    expect(preset(el).value).toBe('custom');
  });

  it('von Hand eingegebener Zeitraum, der ein Preset trifft, zeigt dieses Preset', async () => {
    const { el } = await render('2026-02-15');
    const [from, to] = dateInputs(el);
    type(from, '2026-02-01');
    type(to, '2026-02-28');
    expect(preset(el).value).toBe('thisMonth');
  });

  it('Zeitraum ohne Buchungen: Hinweis statt Absturz', async () => {
    const { el } = await render('2030-06-01');
    choose(preset(el), 'thisMonth');
    expect(all(el).some((n) => String(n.text) === 'Keine Daten.' || String(n.text) === 'No data.')).toBe(true);
  });

  it('der Zeitrahmen reist in den Ledger-Filter mit, wenn man eine Kategorie anklickt', async () => {
    const { el, navigate } = await render('2026-02-15');
    choose(preset(el), 'thisMonth');
    const link = all(el).find((n) => n.tag === 'span' && clsOf(n).includes('fl-link-affordance'))!;
    (link.onclick as () => void)();
    expect(navigate).toHaveBeenCalledWith('ledger');
    expect(saveState).toHaveBeenCalledWith(expect.objectContaining({ dateFrom: '2026-02-01', dateTo: '2026-02-28' }));
  });

  it('ohne Zeitrahmen bleibt der Ledger-Filter ohne Datum (wie bisher)', async () => {
    const { el } = await render();
    const link = all(el).find((n) => n.tag === 'span' && clsOf(n).includes('fl-link-affordance'))!;
    (link.onclick as () => void)();
    expect(saveState).toHaveBeenCalledWith(expect.objectContaining({ dateFrom: '', dateTo: '' }));
  });
});
