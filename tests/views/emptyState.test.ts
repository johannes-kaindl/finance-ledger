import { describe, it, expect, vi } from 'vitest';
import { makeFakeEl, type FakeEl } from '../__mocks__/obsidian';
import { renderEmptyState, renderNoJournal, renderNotConfigured } from '../../src/views/emptyState';
import { CategoryPanel } from '../../src/views/CategoryPanel';
import { LedgerPanel } from '../../src/views/LedgerPanel';
import { SaldoPanel } from '../../src/views/SaldoPanel';
import { t } from '../../src/i18n/strings';

const all = (root: FakeEl): FakeEl[] => [root, ...(root.children as FakeEl[]).flatMap(all)];
const buttons = (root: FakeEl): FakeEl[] => all(root).filter((n) => n.tag === 'button');
const cls = (n: FakeEl): string[] => String(n.cls ?? '').split(/\s+/);

describe('renderEmptyState', () => {
  it('fl-empty mit Text und genau einem mod-cta', () => {
    const root = makeFakeEl('div');
    const onClick = vi.fn();
    renderEmptyState(root as unknown as HTMLElement, 'Nichts da', { label: 'Los', onClick });
    expect(all(root).some((n) => cls(n).includes('fl-empty'))).toBe(true);
    expect(all(root).some((n) => n.text === 'Nichts da')).toBe(true);
    const btns = buttons(root);
    expect(btns).toHaveLength(1);
    expect(cls(btns[0])).toContain('mod-cta');
    (btns[0].onclick as () => void)();
    expect(onClick).toHaveBeenCalledOnce();
  });

  it('ohne Aktion: kein Knopf', () => {
    const root = makeFakeEl('div');
    renderEmptyState(root as unknown as HTMLElement, 'Nur Text');
    expect(buttons(root)).toHaveLength(0);
  });

  it('nicht eingerichtet: der Knopf öffnet die Einstellungen dieses Plugins', () => {
    const root = makeFakeEl('div');
    const setting = { open: vi.fn(), openTabById: vi.fn() };
    renderNotConfigured(root as unknown as HTMLElement, { setting } as never, 'x');
    (buttons(root)[0].onclick as () => void)();
    expect(setting.open).toHaveBeenCalledOnce();
    expect(setting.openTabById).toHaveBeenCalledWith('finance-ledger');
  });

  it('die interne Settings-API fehlt oder wirft: kein Fehler', () => {
    const root = makeFakeEl('div');
    renderNotConfigured(root as unknown as HTMLElement, {} as never, 'x');
    expect(() => (buttons(root)[0].onclick as () => void)()).not.toThrow();
    const root2 = makeFakeEl('div');
    renderNotConfigured(root2 as unknown as HTMLElement, { setting: { open: () => { throw new Error('x'); } } } as never, 'x');
    expect(() => (buttons(root2)[0].onclick as () => void)()).not.toThrow();
  });

  it('kein Journal: der Knopf startet den CSV-Import', () => {
    const root = makeFakeEl('div');
    const executeCommandById = vi.fn();
    renderNoJournal(root as unknown as HTMLElement, { commands: { executeCommandById } } as never, 'x');
    expect(buttons(root)[0].text).toBe(t('dashboard.action.importCsv'));
    (buttons(root)[0].onclick as () => void)();
    expect(executeCommandById).toHaveBeenCalledWith('finance-ledger:finance-import-csv');
  });
});

const PATHS = {
  isConfigured: true, root: 'R', journal: 'R/Ledger/journal.ledger', openingBalances: 'R/o', accounts: 'R/a',
  rulesFolder: 'R/55', basesFolder: 'R/05', kategorienFolder: 'R/45', empfaengerFolder: 'R/60', umsatzDir: 'R/U',
  kontenFile: 'R/k.yaml', vertraegeFile: 'R/v.yaml', snapshotsFolder: 'R/.s',
};
const DISPLAY = () => ({ signMode: 'intuitive' as const, colorScheme: 'classic' as const });

describe('Leerzustände der Panels haben einen Einstieg', () => {
  const missingJournal = { vault: { adapter: { read: vi.fn().mockRejectedValue(new Error('nf')) } }, commands: { executeCommandById: vi.fn() }, setting: { open: vi.fn(), openTabById: vi.fn() } };

  const make = (kind: string, paths: typeof PATHS | (typeof PATHS & { isConfigured: boolean })) => {
    const app = missingJournal as never;
    switch (kind) {
      case 'category': return new CategoryPanel(app, () => paths, (() => {}) as never, DISPLAY);
      case 'ledger': return new LedgerPanel(app, () => paths, DISPLAY);
      default: return new SaldoPanel(app, () => paths, DISPLAY);
    }
  };

  for (const kind of ['category', 'ledger', 'saldo']) {
    it(`${kind}: kein Journal → Hinweis mit Knopf „Import CSV“`, async () => {
      const el = makeFakeEl('div');
      const panel = make(kind, PATHS);
      panel.mount(el as unknown as HTMLElement);
      await panel.onShow();
      expect(all(el).some((n) => cls(n).includes('fl-empty'))).toBe(true);
      expect(buttons(el).map((b) => b.text)).toEqual([t('dashboard.action.importCsv')]);
    });

    it(`${kind}: nicht eingerichtet → Hinweis mit Knopf „Einstellungen öffnen“`, async () => {
      const el = makeFakeEl('div');
      const panel = make(kind, { ...PATHS, isConfigured: false });
      panel.mount(el as unknown as HTMLElement);
      await panel.onShow();
      expect(buttons(el).map((b) => b.text)).toEqual([t('empty.openSettings')]);
    });
  }
});
