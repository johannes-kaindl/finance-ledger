import { describe, it, expect, vi } from 'vitest';

import { FinanceSettingTab } from '../../src/ui/settingsTab';
import { makeFakeEl } from '../__mocks__/obsidian';

/**
 * Gemessen am 2026-09-03 gegen ein laufendes Obsidian (Zweitinstanz, Port 9334):
 * beim ZWEITEN Oeffnen des Einstellungen-Tabs stand der gesamte Inhalt doppelt —
 * 8 Abschnitts-Ueberschriften statt 4, Inhaltshoehe 3713px statt 1905px.
 *
 * Ursache ist die Naht in `display()`: `containerEl.empty()` laeuft SYNCHRON, das
 * Rendern haengt am `.then()` von `loadData()`. Ruft Obsidian `display()` zweimal,
 * bevor das erste Laden fertig ist (genau das passiert bei `setting.open()` plus
 * `openTabById()`), leeren beide Aufrufe den Container und BEIDE rendern danach hinein.
 */
function fakeAccessor(verzoegerung = 0) {
  return {
    loadData: vi.fn(
      () =>
        new Promise<Record<string, unknown>>((r) =>
          setTimeout(() => r({ financeRoot: 'Finance' }), verzoegerung),
        ),
    ),
    saveData: vi.fn(async () => undefined),
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
  it('rendert die Abschnitte einmal, auch bei zwei ueberlappenden Aufrufen', async () => {
    const accessor = fakeAccessor(5);
    const tab = new FinanceSettingTab(
      {} as never,
      {} as never,
      accessor as never,
      () => undefined,
    );
    tab.containerEl = makeFakeEl('div') as never;

    // Erster Aufruf einzeln — das ist die Referenz.
    tab.display();
    await new Promise((r) => setTimeout(r, 40));
    const einmal = zaehleUeberschriften(tab.containerEl as never);
    expect(einmal).toBeGreaterThan(0);

    // Zwei Aufrufe OHNE Wartezeit dazwischen: genau der Fall aus dem Live-Befund.
    tab.display();
    tab.display();
    await new Promise((r) => setTimeout(r, 60));

    expect(zaehleUeberschriften(tab.containerEl as never)).toBe(einmal);
  });
});
