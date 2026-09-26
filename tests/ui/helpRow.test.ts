import { describe, it, expect, vi, afterEach } from 'vitest';

import { FinanceSettingTab } from '../../src/ui/settingsTab';
import { DEFAULT_PLUGIN_DATA } from '../../src/types/plugin-data';
import { setLang } from '../../src/i18n/strings';
import { makeFakeEl, Setting } from '../__mocks__/obsidian';

// UI-STANDARD §8 „Hilfe-Zeile (Settings)": erstes Element des Tabs, „Open documentation" auf den
// Doku-Index, `bug`-Knopf auf die Issues dieses Repos.
const DOCS = 'https://github.com/johannes-kaindl/finance-ledger/blob/main/docs/README.md';
const ISSUES = 'https://github.com/johannes-kaindl/finance-ledger/issues';

function makeTab(): FinanceSettingTab {
  const accessor = { getData: () => ({ ...DEFAULT_PLUGIN_DATA }), saveData: async () => undefined };
  return new FinanceSettingTab({} as never, {} as never, accessor as never, () => undefined);
}

type Erste = { type?: string; name?: string; desc?: string; render?: (s: Setting) => unknown };

afterEach(() => { vi.restoreAllMocks(); setLang('en'); });

describe('Hilfe-Zeile in den Settings', () => {
  it('ist das ERSTE Element von getSettingDefinitions(), vor jeder Überschrift', () => {
    const first = makeTab().getSettingDefinitions()[0] as Erste;
    expect(first.type).not.toBe('group');
    expect(first.name).toBe('Help');
    expect(typeof first.render).toBe('function');
  });

  it('öffnet Doku-Index und Issues dieses Repos', () => {
    const open = vi.fn();
    vi.stubGlobal('window', { open });
    const first = makeTab().getSettingDefinitions()[0] as Erste;
    const setting = new Setting(makeFakeEl('div') as never);
    first.render!(setting);
    const [docsBtn, bugBtn] = setting.components as unknown as Array<{
      buttonEl?: { onclick: () => void; text: string }; iconName?: string; tooltip?: string; clickCB?: () => void;
    }>;
    expect(docsBtn.buttonEl!.text).toBe('Open documentation');
    expect(bugBtn.iconName).toBe('bug');
    expect(bugBtn.tooltip).toBe('Report an issue');
    docsBtn.buttonEl!.onclick();
    bugBtn.clickCB!();
    expect(open.mock.calls.map((c) => c[0])).toEqual([DOCS, ISSUES]);
    vi.unstubAllGlobals();
  });

  it('spricht Deutsch, wenn die Oberfläche Deutsch ist', () => {
    setLang('de');
    const first = makeTab().getSettingDefinitions()[0] as Erste;
    expect(first.name).toBe('Hilfe');
    expect(first.desc).toBe('Erste Schritte, Anleitungen und Fehlersuche');
  });
});
