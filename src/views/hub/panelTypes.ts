export type FinanceTabId = 'dashboard' | 'ledger' | 'category' | 'saldo' | 'tbc';

/**
 * A single function inside the finance hub. Mounted once into its container;
 * tab switches only toggle visibility (mount-once pattern, UI-STANDARD §4).
 */
export interface FinancePanel {
  id: FinanceTabId;
  label: string;
  icon: string;
  /** Build the one-time DOM scaffold into `container`. Called once. */
  mount(container: HTMLElement): void;
  /** Tab became active — (re)load data and render. */
  onShow?(): void | Promise<void>;
  /** Tab left — pause/cleanup transient work. */
  onHide?(): void;
  destroy(): void;
}

/** Narrow navigation channel handed to panels that jump to another tab. */
export type HubNavigate = (tabId: FinanceTabId) => void;

export interface HubController {
  setTab(id: FinanceTabId): void;
  currentTab(): FinanceTabId;
  /** Re-run onShow on the currently active panel (e.g. after a data import). */
  refreshActive(): void;
  destroy(): void;
}
