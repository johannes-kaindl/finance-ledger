import { App, Notice, normalizePath, setIcon, TFolder } from 'obsidian';
import { parseLedgerWithDiagnostics, type Transaction } from '../parser/ledger';
import { renderDiagnosticsBanner } from './diagnosticsBanner';
import { aggregateAccountSaldos } from '../aggregator/saldo';
import { parseOpeningBalances, type OpeningBalance } from '../aggregator/openingBalances';
import { aggregateCategoryTotals } from '../aggregator/category';
import { saveState } from '../state/filterState';
import { runImporter, FULL_IMPORT_ARGS } from '../categorizer-rules/spawnImporter';
import { isMobile } from '../utils/platform';
import { buildAccountFilter, formatMoneyAmount, moneyCtx, type MoneyDisplay } from './helpers';
import type { DataAccessor } from './TBCPanel';
import { notConfiguredMessage, importerEnvFor, type ResolvedFinancePaths } from '../state/financePaths';
import type { FinancePanel, HubNavigate } from './hub/panelTypes';
import { t } from '../i18n/strings';

// labelKey statt Klartext — Übersetzung erfolgt lazy am Render-Ort (t()), da
// dieses Modul-Level-Array vor registerI18n()/setLang() (im onload) importiert wird.
export const DASHBOARD_BASES: ReadonlyArray<{ labelKey: string; name: string }> = [
  { labelKey: 'dashboard.base.accounts', name: 'finanzen-konten' },
  { labelKey: 'dashboard.base.contracts', name: 'finanzen-vertraege' },
  { labelKey: 'dashboard.base.savingsGoals', name: 'finanzen-sparziele' },
  { labelKey: 'dashboard.base.monthlyReports', name: 'finanzen-monatsberichte' },
  { labelKey: 'dashboard.base.quarterlyReports', name: 'finanzen-quartalsberichte' },
  { labelKey: 'dashboard.base.annualReports', name: 'finanzen-jahresberichte' },
  { labelKey: 'dashboard.base.categories', name: 'finanzen-kategorien' },
  { labelKey: 'dashboard.base.payees', name: 'finanzen-empfaenger' },
];

// Only genuine actions remain here — tab navigation to the other panels is the
// hub's tab bar's job (the former "Open …" quick-actions were redundant).
export const DASHBOARD_QUICK_ACTIONS: ReadonlyArray<{ id: string; labelKey: string }> = [
  { id: 'import-csv', labelKey: 'dashboard.action.importCsv' },
  { id: 'reimport', labelKey: 'dashboard.action.reimport' },
];

export class DashboardPanel implements FinancePanel {
  readonly id = 'dashboard' as const;
  readonly label = t('panel.dashboard.label');
  readonly icon = 'layout-dashboard';

  private container!: HTMLElement;

  constructor(
    private readonly app: App,
    private readonly accessor: DataAccessor | null,
    private readonly getPaths: () => ResolvedFinancePaths,
    private readonly navigate: HubNavigate,
    private readonly getDisplay: () => MoneyDisplay,
  ) {}

  mount(container: HTMLElement): void {
    this.container = container;
    container.addClass('finance-plugin');
    container.addClass('finance-dashboard');
  }

  onHide(): void {}
  destroy(): void {}

  async onShow(): Promise<void> {
    const container = this.container;
    container.empty();

    const paths = this.getPaths();
    if (!paths.isConfigured) {
      container.createEl('p', { text: notConfiguredMessage(), cls: 'fl-empty' });
      return;
    }

    // Diagnostics slot sits above the title so silent parse issues surface at
    // the very top of the view (filled after the journal read below).
    const diagnosticsSlot = container.createDiv();

    container.createEl('h3', { text: t('dashboard.title'), cls: 'finance-dashboard__title' });

    const grid = container.createDiv({ cls: 'finance-dashboard-grid' });

    let txs: Transaction[] = [];
    let journalReadOk = false;
    try {
      const text = await this.app.vault.adapter.read(normalizePath(paths.journal));
      const { transactions, diagnostics } = parseLedgerWithDiagnostics(text);
      txs = transactions;
      renderDiagnosticsBanner(diagnosticsSlot, diagnostics);
      journalReadOk = true;
    } catch {
      // graceful degrade — cards render placeholder
    }

    // Opening balances so the saldo card shows the real account balance
    // (opening balance + movement since the as-of date), not just movement.
    let openingBalances = new Map<string, OpeningBalance>();
    try {
      const openingText = await this.app.vault.adapter.read(normalizePath(paths.openingBalances));
      openingBalances = parseOpeningBalances(openingText);
    } catch {
      // opening_balances.ledger missing → movement-only fallback (as in SaldoPanel)
    }

    let pluginData: { lastReimportTimestamp: string | null; rulesAddedSinceReimport: number } = {
      lastReimportTimestamp: null,
      rulesAddedSinceReimport: 0,
    };
    if (this.accessor) {
      try {
        const data = await this.accessor.loadData();
        pluginData = {
          lastReimportTimestamp: data.lastReimportTimestamp,
          rulesAddedSinceReimport: data.rulesAddedSinceReimport,
        };
      } catch {
        // keep defaults
      }
    }

    this.buildSaldoCard(grid, txs, journalReadOk, openingBalances);
    this.buildActivityCard(grid, pluginData, txs);
    this.buildQuickNavCard(grid);
    this.buildQuickActionsCard(grid);
    this.buildTopCategoriesCard(grid, txs, journalReadOk);
  }

  // ── Card factory ──────────────────────────────────────────────────────────

  private makeCard(grid: HTMLElement, title: string, cls: string, cardType?: string): HTMLElement {
    const card = grid.createDiv({ cls: `finance-dashboard-card fl-card ${cls}` });
    if (cardType) card.setAttribute('data-card', cardType);
    card.createEl('h4', { text: title, cls: 'fl-card__title' });
    return card;
  }

  // ── Card 1: Saldo-Übersicht ───────────────────────────────────────────────

  private buildSaldoCard(
    grid: HTMLElement,
    txs: Transaction[],
    readOk: boolean,
    openingBalances: Map<string, OpeningBalance>,
  ): void {
    const card = this.makeCard(grid, t('dashboard.card.saldo.title'), 'card-saldo', 'balance');

    if (!readOk) {
      card.createEl('p', { text: t('dashboard.card.saldo.noJournal'), cls: 'fl-empty' });
      return;
    }

    const saldos = aggregateAccountSaldos(txs, openingBalances);
    if (saldos.length === 0) {
      card.createEl('p', { text: t('dashboard.card.saldo.noAssets'), cls: 'fl-empty' });
      return;
    }

    let total = 0;
    for (const s of saldos) {
      total += s.saldoEur;
      const row = card.createDiv({ cls: 'fl-stat-row' });
      const left = row.createEl('span', { text: s.account.replace(/^Aktiva:/, ''), cls: 'fl-acct-chip fl-ellipsis fl-mr-2' });
      left.setAttribute('data-type', 'asset');
      const saldo = formatMoneyAmount(s.saldoEur, 'balance', this.getDisplay());
      const right = row.createEl('span', { text: saldo.text, cls: 'fl-money fl-num' });
      right.addClass(`is-${saldo.tone}`);
    }

    card.createDiv({ cls: 'fl-divider' });

    const totalRow = card.createDiv({ cls: 'fl-total-row' });
    totalRow.createEl('span', { text: t('common.total') });
    const totalRounded = Math.round(total * 100) / 100;
    const totalFmt = formatMoneyAmount(totalRounded, 'balance', this.getDisplay());
    const totalRight = totalRow.createEl('span', { text: totalFmt.text, cls: 'fl-money' });
    totalRight.addClass(`is-${totalFmt.tone}`);

    const link = card.createEl('a', { text: t('dashboard.card.saldo.openLink'), cls: 'fl-card-link' });
    link.onclick = (e: Event) => { e.preventDefault(); this.navigate('saldo'); };
  }

  // ── Card 2: Last Activity ─────────────────────────────────────────────────

  private buildActivityCard(
    grid: HTMLElement,
    data: { lastReimportTimestamp: string | null; rulesAddedSinceReimport: number },
    txs: Transaction[],
  ): void {
    const card = this.makeCard(grid, t('dashboard.card.activity.title'), 'card-activity', 'trend');

    const tsLine = card.createDiv({ cls: 'fl-stat-line' });
    tsLine.createEl('span', { text: t('dashboard.card.activity.lastReimport'), cls: 'fl-muted' });
    const tsValue = data.lastReimportTimestamp
      ? new Date(data.lastReimportTimestamp).toLocaleString('de-DE')
      : t('dashboard.card.activity.never');
    tsLine.createEl('span', { text: tsValue });

    const cntLine = card.createDiv({ cls: 'fl-stat-line' });
    cntLine.createEl('span', { text: t('dashboard.card.activity.postings'), cls: 'fl-muted' });
    const totalPostings = txs.reduce((sum, tx) => sum + tx.postings.length, 0);
    cntLine.createEl('span', { text: String(totalPostings) });

    const tbcLine = card.createDiv({ cls: 'fl-stat-line' });
    tbcLine.createEl('span', { text: t('dashboard.card.activity.newRules'), cls: 'fl-muted' });
    tbcLine.createEl('span', { text: String(data.rulesAddedSinceReimport) });

    const link = card.createEl('a', { text: t('dashboard.card.activity.openLink'), cls: 'fl-card-link' });
    link.onclick = (e: Event) => { e.preventDefault(); this.navigate('tbc'); };
  }

  // ── Card 3: Quick-Navigation (Obsidian bases — not hub tabs) ───────────────

  private buildQuickNavCard(grid: HTMLElement): void {
    const card = this.makeCard(grid, t('dashboard.card.quicknav.title'), 'card-quicknav');

    const btnGrid = card.createDiv({ cls: 'fl-grid-2' });

    const basesFolder = this.getPaths().basesFolder;
    if (!(this.app.vault.getAbstractFileByPath(basesFolder) instanceof TFolder)) {
      btnGrid.createEl('span', { text: t('dashboard.card.quicknav.noBases'), cls: 'fl-empty' });
      return;
    }

    for (const base of DASHBOARD_BASES) {
      const btn = btnGrid.createEl('button', { text: t(base.labelKey), cls: 'fl-btn-compact' });
      btn.dataset.basesPath = `${basesFolder}/${base.name}`;
      btn.onclick = () => {
        void this.app.workspace.openLinkText(`${basesFolder}/${base.name}`, '', false);
      };
    }
  }

  // ── Card 4: Quick-Actions ─────────────────────────────────────────────────

  private buildQuickActionsCard(grid: HTMLElement): void {
    const card = this.makeCard(grid, t('dashboard.card.quickactions.title'), 'card-quickactions');

    const mobile = isMobile();

    if (mobile) {
      const info = card.createDiv({ cls: 'finance-mobile-info fl-info-banner' });
      setIcon(info.createSpan({ cls: 'fl-inline-icon' }), 'smartphone');
      info.createSpan({ text: t('dashboard.card.quickactions.mobileHint') });
    }

    const wrap = card.createDiv({ cls: 'fl-vstack' });

    // Import + re-import are desktop-only (importer subprocess).
    const desktopOnlyIds = new Set(['import-csv', 'reimport']);
    const actions = mobile
      ? DASHBOARD_QUICK_ACTIONS.filter(a => !desktopOnlyIds.has(a.id))
      : DASHBOARD_QUICK_ACTIONS;

    for (const action of actions) {
      const btn = wrap.createEl('button', { text: t(action.labelKey), cls: 'fl-btn-compact fl-text-left' });
      btn.dataset.actionId = action.id;
      btn.onclick = () => this.handleQuickAction(action.id, btn);
    }
  }

  private async handleQuickAction(id: string, btn: HTMLButtonElement): Promise<void> {
    switch (id) {
      case 'reimport':
        await this.triggerReimport(btn); return;
      case 'import-csv':
        this.openImportCsvViaCommand(); return;
    }
  }

  private openImportCsvViaCommand(): void {
    const commands = (this.app as { commands?: { executeCommandById?: (id: string) => boolean } }).commands;
    if (commands && typeof commands.executeCommandById === 'function') {
      commands.executeCommandById('finance-ledger:finance-import-csv');
    } else {
      new Notice(t('notice.importCsvCommandMissing'));
    }
  }

  private async triggerReimport(btn: HTMLButtonElement): Promise<void> {
    if (!this.accessor) {
      new Notice(t('notice.reimportUnavailable'));
      return;
    }
    const data = await this.accessor.loadData();
    btn.disabled = true;
    const originalLabel = btn.textContent ?? t('dashboard.action.reimport');
    btn.textContent = t('dashboard.action.reimportRunning');
    try {
      const result = await runImporter(
        data.importerCwd,
        data.uvBinaryPath || null,
        data.importerTimeoutMs,
        () => { /* progress no-op */ },
        [...FULL_IMPORT_ARGS],
        importerEnvFor(this.app, this.getPaths()),
      );
      if (result.exitCode === 0) {
        data.lastReimportTimestamp = new Date().toISOString();
        data.rulesAddedSinceReimport = 0;
        await this.accessor.saveData(data);
        new Notice(t('notice.reimportSuccess', Math.round(result.durationMs / 1000)));
        await this.onShow();
      } else {
        new Notice(t('notice.reimportFailedSeeTbc'));
      }
    } catch (err) {
      new Notice(t('notice.reimportError', err instanceof Error ? err.message : String(err)));
    } finally {
      btn.disabled = false;
      btn.textContent = originalLabel;
    }
  }

  // ── Card 5: Top-3 Kategorien (aktueller Monat) ────────────────────────────

  private buildTopCategoriesCard(grid: HTMLElement, txs: Transaction[], readOk: boolean): void {
    const card = this.makeCard(grid, t('dashboard.card.topCategories.title'), 'card-top-categories', 'trend');

    if (!readOk) {
      card.createEl('p', { text: t('dashboard.card.saldo.noJournal'), cls: 'fl-empty' });
      return;
    }

    const ymPrefix = new Date().toISOString().slice(0, 7);
    const filtered = txs.filter(tx => tx.date.startsWith(ymPrefix));

    if (filtered.length === 0) {
      card.createEl('p', { text: t('dashboard.card.topCategories.noTx', ymPrefix), cls: 'fl-empty' });
      return;
    }

    const nodes = aggregateCategoryTotals(filtered, 'Ausgaben:');
    const root = nodes[0];
    const top3 = (root?.children ?? []).slice(0, 3);

    if (top3.length === 0) {
      card.createEl('p', { text: t('dashboard.card.topCategories.noExpense'), cls: 'fl-empty' });
      return;
    }

    for (const node of top3) {
      const row = card.createDiv({ cls: 'fl-stat-row fl-link-affordance' });
      row.createEl('span', { text: node.account.split(':').slice(-1)[0] });
      const amt = formatMoneyAmount(node.totalEur, moneyCtx(node.account), this.getDisplay());
      const right = row.createEl('span', { text: amt.text, cls: 'fl-money' });
      right.addClass(`is-${amt.tone}`);
      row.onclick = () => this.openLedgerWithFilter(node.account);
    }
  }

  // ── Helpers ──────────────────────────────────────────────────────────────

  private openLedgerWithFilter(accountPrefix: string): void {
    // Fresh account-only filter (no inherited invisible kategorie/empfaenger).
    saveState(buildAccountFilter(accountPrefix));
    // Filter travels via the vault-scoped localStorage channel; ledger reads it
    // in onShow(). Just switch tabs.
    this.navigate('ledger');
  }
}
