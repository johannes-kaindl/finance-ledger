import { describe, it, expect, vi } from 'vitest';
import { LedgerPanel } from '../../src/views/LedgerPanel';
import { CategoryPanel } from '../../src/views/CategoryPanel';
import { makeFakeEl, type FakeEl } from '../__mocks__/obsidian';

const LEDGER = `\
2026-05-01 * Edeka
    Aktiva:Girokonto                    -45.00 EUR
    Ausgaben:Lebensmittel                45.00 EUR
`;

const PATHS = {
  isConfigured: true, root: 'R', journal: 'R/Ledger/journal.ledger', openingBalances: 'R/o', accounts: 'R/a',
  rulesFolder: 'R/55', basesFolder: 'R/05', kategorienFolder: 'R/45', empfaengerFolder: 'R/60', umsatzDir: 'R/U',
  kontenFile: 'R/k.yaml', vertraegeFile: 'R/v.yaml', sparzieleFile: '', projektKey: 'projektbezug', snapshotsFolder: 'R/.s',
};
const DISPLAY = () => ({ signMode: 'intuitive' as const, colorScheme: 'classic' as const });

const app = () => ({
  vault: { adapter: { read: vi.fn().mockResolvedValue(LEDGER) }, getMarkdownFiles: vi.fn().mockReturnValue([]) },
  metadataCache: { getFileCache: vi.fn().mockReturnValue(undefined) },
  loadLocalStorage: vi.fn().mockReturnValue(null), saveLocalStorage: vi.fn(),
});

const all = (root: FakeEl): FakeEl[] => [root, ...(root.children as FakeEl[]).flatMap(all)];
const cls = (n: FakeEl): string[] => String(n.cls ?? '').split(/\s+/);

describe('Ledger: sortierbare Spaltenköpfe', () => {
  async function render() {
    const el = makeFakeEl('div');
    const panel = new LedgerPanel(app() as never, () => PATHS, DISPLAY);
    panel.mount(el as unknown as HTMLElement);
    await panel.onShow();
    return el;
  }
  const heads = (el: FakeEl): FakeEl[] => all(el).filter((n) => n.tag === 'th' && cls(n).includes('fl-sortable'));
  const arrowText = (th: FakeEl): string => String((th.children as FakeEl[]).find((c) => cls(c).includes('fl-sort-arrow'))?.text ?? '');

  it('genau eine Spalte trägt aria-sort und einen Pfeil, die übrigen „none“', async () => {
    const el = await render();
    const hs = heads(el);
    expect(hs).toHaveLength(5);
    const sorted = hs.filter((h) => h.attrs['aria-sort'] !== 'none');
    expect(sorted).toHaveLength(1);
    expect(sorted[0].attrs['aria-sort']).toBe('ascending'); // Standard: Datum aufsteigend
    expect(arrowText(sorted[0])).toContain('▲');
    for (const h of hs.filter((x) => x !== sorted[0])) expect(arrowText(h)).toBe('');
  });

  it('Klick wechselt Spalte (aufsteigend) und Richtung; der Pfeil zieht mit', async () => {
    const el = await render();
    const [, counterparty] = heads(el);
    (counterparty.onclick as () => void)();
    expect(counterparty.attrs['aria-sort']).toBe('ascending');
    expect(arrowText(counterparty)).toContain('▲');
    (counterparty.onclick as () => void)();
    expect(counterparty.attrs['aria-sort']).toBe('descending');
    expect(arrowText(counterparty)).toContain('▼');
    expect(heads(el).filter((h) => h.attrs['aria-sort'] !== 'none')).toHaveLength(1);
  });

  it('per Tastatur erreichbar: tabindex, Enter und Leertaste sortieren', async () => {
    const el = await render();
    const [, , account] = heads(el);
    expect(account.attrs.tabindex).toBe('0');
    const key = (k: string) => { const e = { key: k, preventDefault: vi.fn() }; (account.onkeydown as (e: unknown) => void)(e); return e; };
    key('Enter');
    expect(account.attrs['aria-sort']).toBe('ascending');
    const space = key(' ');
    expect(space.preventDefault).toHaveBeenCalled();
    expect(account.attrs['aria-sort']).toBe('descending');
    const tab = key('Tab');
    expect(tab.preventDefault).not.toHaveBeenCalled();
    expect(account.attrs['aria-sort']).toBe('descending');
  });
});

describe('Kategorien: Modus-Knöpfe sind Zustands-Knöpfe', () => {
  it('aria-pressed folgt dem gewählten Modus', async () => {
    const el = makeFakeEl('div');
    const panel = new CategoryPanel(app() as never, () => PATHS, (() => {}) as never, DISPLAY);
    panel.mount(el as unknown as HTMLElement);
    await panel.onShow();
    const bar = all(el).find((n) => cls(n).includes('fl-toolbar') && !cls(n).includes('fl-range-bar'))!;
    const btns = (bar.children as FakeEl[]).filter((c) => c.tag === 'button');
    expect(btns.map((b) => b.attrs['aria-pressed'])).toEqual(['true', 'false', 'false']);
    (btns[2].onclick as () => void)();
    expect(btns.map((b) => b.attrs['aria-pressed'])).toEqual(['false', 'false', 'true']);
    expect(cls(btns[2])).toContain('is-active');
    expect(cls(btns[0])).not.toContain('is-active');
  });
});
