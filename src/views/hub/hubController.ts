import { setIcon } from 'obsidian';
import type { FinancePanel, FinanceTabId, HubController } from './panelTypes';

/**
 * Pure build/navigation logic for the finance hub — node-testable, no ItemView.
 * Builds a tab bar (icon + label, §4) and a content area, mounts every panel
 * once, and toggles `is-hidden` on tab switch. Returns a controller so the host
 * ItemView (and command palette) can drive the active tab.
 */
export function buildHubInto(
  root: HTMLElement,
  panels: FinancePanel[],
  defaultTab: FinanceTabId,
): HubController {
  root.empty();
  root.addClass('finance-plugin');
  root.addClass('fl-hub-root');

  const tabsEl = root.createDiv({ cls: 'fl-hub-tabs' });
  const contentEl = root.createDiv({ cls: 'fl-hub-content' });

  const panelDivs = new Map<FinanceTabId, HTMLElement>();
  const tabBtns = new Map<FinanceTabId, HTMLElement>();

  // A persisted layout state can reference a tab whose panel was not built;
  // without this fallback the hub would render blank.
  let navState: FinanceTabId = panels.some(p => p.id === defaultTab)
    ? defaultTab
    : (panels[0]?.id ?? defaultTab);

  const applyVisibility = (): void => {
    for (const [id, div] of panelDivs) div.toggleClass('is-hidden', id !== navState);
    for (const [id, btn] of tabBtns) btn.toggleClass('is-active', id === navState);
  };

  for (const panel of panels) {
    const btn = tabsEl.createEl('button', { cls: 'fl-hub-tab' });
    btn.setAttribute('data-tab', panel.id);
    const ic = btn.createSpan({ cls: 'fl-hub-tab-icon' });
    setIcon(ic, panel.icon);
    btn.createSpan({ cls: 'fl-hub-tab-label', text: panel.label });
    btn.onclick = (): void => ctrl.setTab(panel.id);
    tabBtns.set(panel.id, btn);

    const div = contentEl.createDiv({ cls: 'fl-hub-panel' });
    div.setAttribute('data-tab', panel.id);
    panelDivs.set(panel.id, div);
    panel.mount(div);
  }

  const ctrl: HubController = {
    currentTab: () => navState,
    setTab(id: FinanceTabId): void {
      if (id === navState) return;
      if (!panelDivs.has(id)) return;
      panels.find(p => p.id === navState)?.onHide?.();
      navState = id;
      applyVisibility();
      void panels.find(p => p.id === navState)?.onShow?.();
    },
    refreshActive(): void {
      void panels.find(p => p.id === navState)?.onShow?.();
    },
    destroy(): void {
      for (const p of panels) p.destroy();
    },
  };

  applyVisibility();
  void panels.find(p => p.id === navState)?.onShow?.();
  return ctrl;
}
