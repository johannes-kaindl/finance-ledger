import { Notice, Plugin, WorkspaceLeaf, getLanguage } from 'obsidian';
import { pickLang, setLang } from './vendor/kit/i18n';
import { t, registerI18n } from './i18n/strings';
import { DashboardPanel } from './views/DashboardPanel';
import { LedgerPanel } from './views/LedgerPanel';
import { CategoryPanel } from './views/CategoryPanel';
import { SaldoPanel } from './views/SaldoPanel';
import { TBCPanel } from './views/TBCPanel';
import { FinanceHubView, VIEW_TYPE_HUB } from './views/hub/FinanceHubView';
import type { FinancePanel, FinanceTabId, HubNavigate } from './views/hub/panelTypes';
import { FinanceSettingTab } from './ui/settingsTab';
import { ImportCSVModal } from './ui/importCSVModal';
import { invalidateKonten } from './state/konten';
import { DEFAULT_PLUGIN_DATA } from './types/plugin-data';
import type { PluginData } from './types/plugin-data';
import { resolveFinancePaths, migrateFinanceRoot, type ResolvedFinancePaths } from './state/financePaths';
import { setStorageApp, migrateRawLocalStorageToApp, migrateLegacyKeys, loadState, saveState } from './state/filterState';
import type { FilterState, MoneyDisplay } from './views/helpers';
import { isMobile } from './utils/platform';
import { runNativeImport } from './obsidian/nativeImport';

/** Anzeigedauer der Import-Meldung: lang genug, um vier Zahlen zu lesen. */
const REBUILD_NOTICE_MS = 20_000;

type Accessor = {
  loadData: () => Promise<PluginData>;
  saveData: (data: PluginData) => Promise<void>;
};

export default class FinancePlugin extends Plugin {
  private pluginData: PluginData = { ...DEFAULT_PLUGIN_DATA };

  async onload(): Promise<void> {
    setLang(pickLang(safeGetLanguage()));
    registerI18n();

    setStorageApp(this.app);
    migrateRawLocalStorageToApp(); // one-time: raw localStorage -> vault-scoped App storage
    migrateLegacyKeys();
    invalidateKonten();

    const loaded = (await this.loadData()) as Partial<PluginData> | null;
    this.pluginData = { ...DEFAULT_PLUGIN_DATA, ...(loaded ?? {}) };

    // One-time: adopt the author's legacy folder if no root configured yet.
    if (migrateFinanceRoot(this.app, this.pluginData)) {
      await this.saveData(this.pluginData);
    }

    const accessor: Accessor = {
      loadData: async () => ({ ...this.pluginData }),
      saveData: async (data: PluginData) => {
        this.pluginData = data;
        await this.saveData(data);
      },
    };

    const getPaths = (): ResolvedFinancePaths => this.resolvePaths();
    const getDisplay = (): MoneyDisplay => ({
      signMode: this.pluginData.signMode,
      colorScheme: this.pluginData.colorScheme,
    });

    // One hub view (UI-STANDARD §1) holding five panels. The navigate channel is
    // late-bound to the view instance so panels can switch tabs without knowing
    // the plugin or the view.
    this.registerView(VIEW_TYPE_HUB, (leaf: WorkspaceLeaf) => {
      let hubRef: FinanceHubView | null = null;
      const navigate: HubNavigate = (id) => hubRef?.showTab(id);
      const panels: FinancePanel[] = [
        new DashboardPanel(this.app, accessor, getPaths, navigate, getDisplay),
        new LedgerPanel(this.app, getPaths, getDisplay),
        new CategoryPanel(this.app, getPaths, navigate, getDisplay),
        new SaldoPanel(this.app, getPaths, getDisplay),
        new TBCPanel(this.app, accessor, getPaths, getDisplay),
      ];
      hubRef = new FinanceHubView(leaf, panels, 'dashboard');
      return hubRef;
    });

    this.addRibbonIcon('chart-pie', t('ribbon.openHub'), () => {
      void this.activateHub('dashboard');
    });

    if (!isMobile()) {
      this.addRibbonIcon('file-up', t('action.importCsv'), () => {
        this.openImportCSVModal(accessor);
      });
    }

    const refreshHub = (): void => {
      for (const leaf of this.app.workspace.getLeavesOfType(VIEW_TYPE_HUB)) {
        if (leaf.view instanceof FinanceHubView) leaf.view.refresh();
      }
    };
    this.addSettingTab(new FinanceSettingTab(this.app, this, accessor, refreshHub));

    this.registerObsidianProtocolHandler('finance-ledger', (params) => {
      void this.handleProtocol(params);
    });
    // Legacy-Alias: bestehende obsidian://finance-Deep-Links (vor Rename 2026-06-10)
    this.registerObsidianProtocolHandler('finance', (params) => {
      void this.handleProtocol(params);
    });

    const tabCommands: ReadonlyArray<{ id: string; nameKey: string; tab: FinanceTabId }> = [
      { id: 'open-finance-dashboard', nameKey: 'cmd.openDashboard', tab: 'dashboard' },
      { id: 'open-ledger-viewer', nameKey: 'cmd.openLedger', tab: 'ledger' },
      { id: 'open-category-overview', nameKey: 'cmd.openCategory', tab: 'category' },
      { id: 'open-saldo-overview', nameKey: 'cmd.openSaldo', tab: 'saldo' },
      { id: 'open-tbc-triage', nameKey: 'cmd.openTbc', tab: 'tbc' },
    ];
    for (const cmd of tabCommands) {
      this.addCommand({
        id: cmd.id,
        name: t(cmd.nameKey),
        callback: () => this.activateHub(cmd.tab),
      });
    }

    if (!isMobile()) {
      this.addCommand({
        id: 'finance-import-csv',
        name: t('action.importCsv'),
        callback: () => this.openImportCSVModal(accessor),
      });
    }

    // Bewusst ohne isMobile-Guard: der eingebaute Import berührt kein
    // Node-Modul. Dass der CSV-Import bisher Desktop-only war, lag allein am
    // Python-Subprozess.
    this.addCommand({
      id: 'finance-rebuild-journal',
      name: t('cmd.rebuildJournal'),
      callback: () => {
        void this.rebuildJournal();
      },
    });
  }

  /**
   * Baut journal.ledger, accounts.ledger und opening_balances.ledger aus den
   * CSVs neu auf und zieht Konto- und Vertrags-Notizen nach — im Plugin, ohne
   * Python.
   *
   * Die Konto-Notizen gehören dazu, auch wenn der Befehlsname nur vom Journal
   * spricht: die Saldo-Übersicht liest `saldo_eur` aus ihnen. Ein Lauf, der sie
   * ausließe, hinterließe genau den Zustand, den Jay am 2026-08-01 gemeldet hat
   * — neue Buchungen, alte Kontostände.
   *
   * Berichte und Dimensions-Notizen erzeugt weiterhin der Importer-Subprozess
   * (Etappen E4–E7 des Ports).
   */
  private async rebuildJournal(): Promise<void> {
    const paths = this.resolvePaths();
    new Notice(t('notice.rebuildRunning'));
    try {
      const result = await runNativeImport({ app: this.app, paths });
      if (result.files.length === 0) {
        new Notice(t('notice.rebuildNoFiles', paths.umsatzDir));
        return;
      }
      // Bewusst lange stehen lassen: die Meldung trägt vier Zahlen, die man
      // gegen die Erwartung prüfen will. Obsidians Standarddauer reicht dafür
      // nicht — sie war weg, bevor sie gelesen war.
      const lines = [
        t(
          'notice.rebuildSuccess',
          String(result.transactionCount),
          String(result.files.length),
          String(result.duplicatesSkipped),
          String(result.unkategorisiert),
        ),
      ];
      if (result.notesWritten > 0) {
        lines.push(t('notice.rebuildNotes', String(result.notesWritten)));
      }
      // Eine halbfertige Regel-Notiz sieht im Vault vollständig aus und wirkt
      // einfach nicht — deshalb hier benennen statt still verwerfen.
      if (result.incompleteRules.length > 0) {
        lines.push(
          t(
            'notice.rebuildIncompleteRules',
            String(result.incompleteRules.length),
            result.incompleteRules.join(', '),
          ),
        );
      }
      new Notice(lines.join('\n\n'), REBUILD_NOTICE_MS);
      this.refreshFinanceHub();
    } catch (e) {
      // ConfigError und InputFormatError tragen eine Meldung, die für sich
      // steht — sie wird unverändert gezeigt, nie als Stacktrace.
      new Notice(t('notice.rebuildError', (e as Error).message), 15_000);
    }
  }

  private resolvePaths(): ResolvedFinancePaths {
    return resolveFinancePaths(this.pluginData);
  }

  private openImportCSVModal(accessor: Accessor): void {
    if (isMobile()) {
      new Notice(t('notice.importCsvDesktopOnlyLong'));
      return;
    }
    const modal = new ImportCSVModal(this.app, accessor, () => this.resolvePaths(), {
      onImportSuccess: async () => {
        this.refreshFinanceHub();
      },
    });
    modal.open();
  }

  private refreshFinanceHub(): void {
    for (const leaf of this.app.workspace.getLeavesOfType(VIEW_TYPE_HUB)) {
      const view = leaf.view;
      if (view instanceof FinanceHubView) view.refresh();
    }
  }

  onunload(): void {
    // Leaves werden bewusst NICHT beim Unload detached (Obsidian-Vorgabe:
    // würde das User-Layout zerstören).
  }

  private async activateHub(tab?: FinanceTabId): Promise<void> {
    const { workspace } = this.app;
    let leaf = workspace.getLeavesOfType(VIEW_TYPE_HUB)[0];
    if (!leaf) {
      leaf = workspace.getRightLeaf(false) ?? workspace.getLeaf(true);
      await leaf.setViewState({ type: VIEW_TYPE_HUB, active: true });
      leaf = workspace.getLeavesOfType(VIEW_TYPE_HUB)[0] ?? leaf;
    }
    if (tab) {
      const view = leaf.view;
      if (view instanceof FinanceHubView) view.showTab(tab);
    }
    await workspace.revealLeaf(leaf);
  }

  private async handleProtocol(params: Record<string, string>): Promise<void> {
    if (params.mode !== 'filter') return;

    const next: FilterState = {
      ...loadState(),
      kategorie: params.kategorie ?? '',
      empfaenger: params.empfaenger ?? '',
      account: params.account ?? '',
    };
    saveState(next);

    // Open the hub on the ledger tab; its onShow reads the filter we just wrote.
    await this.activateHub('ledger');
  }
}

function safeGetLanguage(): string | null {
  try { return getLanguage(); } catch { return null; }
}
