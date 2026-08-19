import { describe, it, expect, vi } from 'vitest';
import { makeFakeEl } from '../../__mocks__/obsidian';
import { buildHubInto } from '../../../src/views/hub/hubController';
import type { FinancePanel, FinanceTabId } from '../../../src/views/hub/panelTypes';

type FakeEl = ReturnType<typeof makeFakeEl>;

function fakePanel(id: FinanceTabId): FinancePanel & {
  mount: ReturnType<typeof vi.fn>;
  onShow: ReturnType<typeof vi.fn>;
  onHide: ReturnType<typeof vi.fn>;
  destroy: ReturnType<typeof vi.fn>;
} {
  return {
    id,
    label: id,
    icon: 'wallet',
    mount: vi.fn(),
    onShow: vi.fn(),
    onHide: vi.fn(),
    destroy: vi.fn(),
  };
}

function panelDivs(root: FakeEl): Map<string, FakeEl> {
  // root.children = [tabsEl, contentEl]; contentEl.children = panel divs.
  const contentEl = (root.children as FakeEl[])[1];
  const map = new Map<string, FakeEl>();
  for (const div of contentEl.children as FakeEl[]) {
    const id = (div.attrs as Record<string, string>)['data-tab'];
    if (id) map.set(id, div);
  }
  return map;
}

const IDS: FinanceTabId[] = ['dashboard', 'ledger', 'category', 'saldo', 'tbc'];

describe('buildHubInto', () => {
  it('mounts every panel exactly once', () => {
    const panels = IDS.map(fakePanel);
    buildHubInto(makeFakeEl('div') as unknown as HTMLElement, panels, 'dashboard');
    for (const p of panels) expect(p.mount).toHaveBeenCalledTimes(1);
  });

  it('calls onShow only on the default panel initially', () => {
    const panels = IDS.map(fakePanel);
    buildHubInto(makeFakeEl('div') as unknown as HTMLElement, panels, 'dashboard');
    const dashboard = panels.find(p => p.id === 'dashboard')!;
    expect(dashboard.onShow).toHaveBeenCalledTimes(1);
    for (const p of panels.filter(p => p.id !== 'dashboard')) {
      expect(p.onShow).not.toHaveBeenCalled();
    }
  });

  it('only the active panel div is visible initially', () => {
    const root = makeFakeEl('div');
    buildHubInto(root as unknown as HTMLElement, IDS.map(fakePanel), 'ledger');
    const divs = panelDivs(root);
    expect((divs.get('ledger')!.cls as string).includes('is-hidden')).toBe(false);
    expect((divs.get('dashboard')!.cls as string).includes('is-hidden')).toBe(true);
  });

  it('setTab hides the old panel, shows the new one, and fires lifecycle hooks', () => {
    const root = makeFakeEl('div');
    const panels = IDS.map(fakePanel);
    const ctrl = buildHubInto(root as unknown as HTMLElement, panels, 'dashboard');

    ctrl.setTab('ledger');

    const dashboard = panels.find(p => p.id === 'dashboard')!;
    const ledger = panels.find(p => p.id === 'ledger')!;
    expect(dashboard.onHide).toHaveBeenCalledTimes(1);
    expect(ledger.onShow).toHaveBeenCalledTimes(1);
    expect(ctrl.currentTab()).toBe('ledger');

    const divs = panelDivs(root);
    expect((divs.get('ledger')!.cls as string).includes('is-hidden')).toBe(false);
    expect((divs.get('dashboard')!.cls as string).includes('is-hidden')).toBe(true);
  });

  it('setTab to the already-active tab is a no-op', () => {
    const panels = IDS.map(fakePanel);
    const ctrl = buildHubInto(makeFakeEl('div') as unknown as HTMLElement, panels, 'dashboard');
    const dashboard = panels.find(p => p.id === 'dashboard')!;
    dashboard.onShow.mockClear();

    ctrl.setTab('dashboard');

    expect(dashboard.onShow).not.toHaveBeenCalled();
    expect(dashboard.onHide).not.toHaveBeenCalled();
  });

  it('falls back to the first panel when the default tab is unknown', () => {
    const panels = IDS.map(fakePanel);
    const ctrl = buildHubInto(
      makeFakeEl('div') as unknown as HTMLElement,
      panels,
      'nonexistent' as FinanceTabId,
    );
    expect(ctrl.currentTab()).toBe('dashboard');
    expect(panels.find(p => p.id === 'dashboard')!.onShow).toHaveBeenCalledTimes(1);
  });

  it('refreshActive re-runs onShow on the current panel only', () => {
    const panels = IDS.map(fakePanel);
    const ctrl = buildHubInto(makeFakeEl('div') as unknown as HTMLElement, panels, 'dashboard');
    const dashboard = panels.find(p => p.id === 'dashboard')!;
    dashboard.onShow.mockClear();

    ctrl.refreshActive();

    expect(dashboard.onShow).toHaveBeenCalledTimes(1);
    for (const p of panels.filter(p => p.id !== 'dashboard')) {
      expect(p.onShow).not.toHaveBeenCalled();
    }
  });

  it('destroy tears down every panel', () => {
    const panels = IDS.map(fakePanel);
    const ctrl = buildHubInto(makeFakeEl('div') as unknown as HTMLElement, panels, 'dashboard');
    ctrl.destroy();
    for (const p of panels) expect(p.destroy).toHaveBeenCalledTimes(1);
  });
});
