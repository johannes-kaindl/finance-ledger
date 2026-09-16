import { describe, it, expect, vi } from 'vitest';

import { FinanceSettingTab } from '../../src/ui/settingsTab';
import { DEFAULT_PLUGIN_DATA, type PluginData } from '../../src/types/plugin-data';
import { makeFakeEl } from '../__mocks__/obsidian';

/**
 * Ursprünglich (bis Welle 3, 2026-09-16) gemessen gegen ein laufendes Obsidian
 * (Zweitinstanz, Port 9334): beim ZWEITEN Öffnen des Einstellungen-Tabs stand der
 * gesamte Inhalt doppelt — 8 Abschnitts-Überschriften statt 4. Ursache war die Naht
 * zwischen synchronem `containerEl.empty()` und dem `.then()` von `loadData()`: zwei
 * schnell aufeinanderfolgende `display()`-Aufrufe leerten beide den Container und
 * rendern beide hinein.
 *
 * Mit dem Umbau auf `getSettingDefinitions()` (Kit-Walker) entfällt die Naht
 * strukturell: `SettingsAccessor.getData()` ist synchron (Obsidian ≥1.13 ruft
 * `getSettingDefinitions()` selbst ohne await auf, das erzwingt es), `display()`
 * rendert deshalb ohne Async-Lücke zwischen `empty()` und dem Aufbau. Der Test bleibt
 * als Regression stehen: er belegt, dass ein zweiter `display()`-Aufruf den ersten
 * sauber ersetzt statt sich daneben zu häufen.
 */
function fakeAccessor(overrides: Partial<PluginData> = {}) {
  let data: PluginData = { ...DEFAULT_PLUGIN_DATA, ...overrides };
  return {
    getData: vi.fn((): PluginData => data),
    saveData: vi.fn(async (d: PluginData): Promise<void> => {
      data = d;
    }),
  };
}

function zaehleUeberschriften(el: ReturnType<typeof makeFakeEl>): number {
  let n = 0;
  const lauf = (knoten: { cls?: string; children?: unknown[] }): void => {
    if (typeof knoten.cls === 'string' && knoten.cls.includes('setting-item-heading')) n++;
    for (const k of (knoten.children ?? []) as { cls?: string; children?: unknown[] }[]) lauf(k);
  };
  lauf(el as unknown as { cls?: string; children?: unknown[] });
  return n;
}

describe('FinanceSettingTab.display', () => {
  it('rendert die Abschnitte einmal, auch bei zwei aufeinanderfolgenden Aufrufen', () => {
    const accessor = fakeAccessor({ financeRoot: 'Finance' });
    const tab = new FinanceSettingTab(
      {} as never,
      {} as never,
      accessor as never,
      () => undefined,
    );
    tab.containerEl = makeFakeEl('div') as never;

    tab.display();
    const einmal = zaehleUeberschriften(tab.containerEl as never);
    expect(einmal).toBeGreaterThan(0);

    tab.display();
    tab.display();

    expect(zaehleUeberschriften(tab.containerEl as never)).toBe(einmal);
  });

  it('liefert dieselben Feld-Keys, die getControlValue/setControlValue bedienen', () => {
    const accessor = fakeAccessor({ financeRoot: 'Finance' });
    const tab = new FinanceSettingTab(
      {} as never,
      {} as never,
      accessor as never,
      () => undefined,
    );
    tab.containerEl = makeFakeEl('div') as never;
    tab.display();

    // financeRoot ist über die Vault-Paths-Gruppe deklarativ eingebunden — der Wert
    // muss über getControlValue lesbar sein (das ist es, was Obsidian ≥1.13 nativ tut).
    expect(tab.getControlValue('financeRoot')).toBe('Finance');
  });
});
