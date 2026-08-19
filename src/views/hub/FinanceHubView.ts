import { ItemView, WorkspaceLeaf, type ViewStateResult } from 'obsidian';
import { buildHubInto } from './hubController';
import type { FinancePanel, FinanceTabId, HubController } from './panelTypes';
import { t } from '../../i18n/strings';

export const VIEW_TYPE_HUB = 'finance-hub';

/**
 * The one finance view (UI-STANDARD §1). A thin ItemView shell around the
 * node-tested buildHubInto: it owns the panels + persisted tab, and exposes
 * showTab/refresh for the command palette, ribbon, and deep-links.
 */
export class FinanceHubView extends ItemView {
  private ctrl: HubController | null = null;

  constructor(
    leaf: WorkspaceLeaf,
    private readonly panels: FinancePanel[],
    private navState: FinanceTabId,
  ) {
    super(leaf);
  }

  getViewType(): string { return VIEW_TYPE_HUB; }
  getDisplayText(): string { return t('hub.viewTitle'); }
  getIcon(): string { return 'wallet'; }

  async onOpen(): Promise<void> {
    const root = this.containerEl.children[1] as HTMLElement;
    this.ctrl = buildHubInto(root, this.panels, this.navState);
  }

  async onClose(): Promise<void> {
    this.ctrl?.destroy();
    this.ctrl = null;
  }

  /**
   * Activate a tab. Always (re)loads the target panel — switching fires its
   * onShow; targeting the already-active tab refreshes it (so deep-links that
   * land on the current tab still pick up a freshly written filter).
   */
  showTab(id: FinanceTabId): void {
    if (!this.ctrl) { this.navState = id; return; }
    if (this.ctrl.currentTab() === id) this.ctrl.refreshActive();
    else this.ctrl.setTab(id);
    this.navState = id;
  }

  /** Re-render the currently active panel (e.g. after a CSV import). */
  refresh(): void {
    this.ctrl?.refreshActive();
  }

  getState(): Record<string, unknown> {
    return { tab: this.ctrl?.currentTab() ?? this.navState };
  }

  async setState(state: unknown, result: ViewStateResult): Promise<void> {
    const tab = (state as { tab?: FinanceTabId } | null)?.tab;
    if (tab) {
      this.navState = tab;
      this.ctrl?.setTab(tab);
    }
    return super.setState(state, result);
  }
}
