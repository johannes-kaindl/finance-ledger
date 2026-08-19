import { App, Modal, Notice, normalizePath } from 'obsidian';
import { parseLedgerWithDiagnostics } from '../parser/ledger';
import { renderDiagnosticsBanner } from './diagnosticsBanner';
import { filterTbcCounterpartiesWithoutRule, groupTbcByCounterparty, groupTbcAmount, formatMoneyAmount, flowCtxFromSign, buildImporterCommand, summarizeStderr, type MoneyDisplay } from './helpers';
import { loadCategorizerRules } from '../categorizer-rules/loader';
import { CategorizerRuleModal } from '../ui/categorizerRuleModal';
import { resolveCounterpartyNote } from '../resolver/account';
import { runImporter, FULL_IMPORT_ARGS } from '../categorizer-rules/spawnImporter';
import { isMobile } from '../utils/platform';
import type { PluginData } from '../types/plugin-data';
import { notConfiguredMessage, importerEnvFor, type ResolvedFinancePaths } from '../state/financePaths';
import type { FinancePanel } from './hub/panelTypes';
import { t } from '../i18n/strings';

export type DataAccessor = {
  loadData: () => Promise<PluginData>;
  saveData: (data: PluginData) => Promise<void>;
};

class ImportErrorModal extends Modal {
  constructor(
    app: App,
    private readonly stderr: string,
    private readonly onRetry: () => void,
    private readonly importerCwd: string,
  ) {
    super(app);
  }

  onOpen(): void {
    const { contentEl } = this;
    contentEl.createEl('h3', { text: t('tbc.importError.title') });
    contentEl.createEl('pre', { text: this.stderr || t('tbc.importError.noStderr'), cls: 'fl-pre' });

    const cmd = buildImporterCommand(this.importerCwd);
    const btnRow = contentEl.createDiv({ cls: 'fl-row-actions' });

    const btnRetry = btnRow.createEl('button', { text: t('tbc.importError.retry') });
    btnRetry.onclick = () => { this.close(); this.onRetry(); };

    const btnCopy = btnRow.createEl('button', { text: t('tbc.importError.copyCmd') });
    btnCopy.onclick = () => { void navigator.clipboard.writeText(cmd); new Notice(t('tbc.importError.copied')); };

    btnRow.createEl('button', { text: t('tbc.importError.close') }).onclick = () => this.close();
  }

  onClose(): void { this.contentEl.empty(); }
}

export class TBCPanel implements FinancePanel {
  readonly id = 'tbc' as const;
  readonly label = t('panel.tbc.label');
  readonly icon = 'tags';

  private container!: HTMLElement;
  private counterEl!: HTMLSpanElement;
  private tableBody!: HTMLTableSectionElement;
  private footerEl!: HTMLDivElement;
  private reimportBtn?: HTMLButtonElement;
  private bannerEl!: HTMLDivElement;
  // Dedicated slot for the non-fatal parse-diagnostics banner (M1). Separate
  // from bannerEl, which is the importer-progress banner.
  private diagnosticsEl!: HTMLDivElement;

  constructor(
    private readonly app: App,
    private readonly accessor: DataAccessor,
    private readonly getPaths: () => ResolvedFinancePaths,
    private readonly getDisplay: () => MoneyDisplay,
  ) {}

  mount(container: HTMLElement): void {
    this.container = container;
    container.addClass('finance-plugin');
    container.addClass('fl-view');
  }

  onHide(): void {}
  destroy(): void {}

  async onShow(): Promise<void> {
    const container = this.container;
    container.empty();

    if (!this.getPaths().isConfigured) {
      container.createEl('p', { text: notConfiguredMessage(), cls: 'fl-empty' });
      return;
    }

    // Diagnostics banner sits at the very top so silent parse issues surface
    // above the header; refresh() fills it from the current journal.
    this.diagnosticsEl = container.createDiv();
    this.buildHeader(container);
    this.buildBanner(container);
    this.buildTable(container);
    this.buildFooter(container);
    await this.refresh();
  }

  // ── Header ─────────────────────────────────────────────────────────────

  private buildHeader(container: HTMLElement): void {
    const header = container.createDiv({ cls: 'fl-view-header' });

    header.createEl('span', { text: t('tbc.header.title'), cls: 'fl-bold' });

    this.counterEl = header.createEl('span', { cls: 'fl-badge' });

    header.createDiv({ cls: 'fl-spacer' });

    // Re-import is a desktop-only feature (importer subprocess). On mobile the
    // core renderer stays read-only — show a hint instead of a dead button.
    if (isMobile()) {
      header.createEl('span', { text: t('tbc.header.desktopOnly'), cls: 'fl-muted fl-fs-sm' });
      return;
    }
    this.reimportBtn = header.createEl('button', { text: t('tbc.header.reimportNow'), cls: 'fl-fs-sm' });
    this.reimportBtn.onclick = () => this.triggerReimport();
  }

  private updateCounter(count: number): void {
    this.counterEl.setText(t('tbc.counter', count));
  }

  private openCounterpartyNote(counterparty: string): void {
    const file = resolveCounterpartyNote(counterparty, this.getPaths().rulesFolder, this.app);
    if (file) {
      void this.app.workspace.openLinkText(file.path, '', false);
    } else {
      new Notice(t('notice.noRuleNoteYet', counterparty));
    }
  }

  // ── Progress banner ────────────────────────────────────────────────────

  private buildBanner(container: HTMLElement): void {
    this.bannerEl = container.createDiv({ cls: 'fl-banner fl-hidden' });
  }

  private showBanner(text: string): void {
    this.bannerEl.removeClass('fl-hidden');
    this.bannerEl.setText(text);
  }

  private hideBanner(): void {
    this.bannerEl.addClass('fl-hidden');
  }

  // ── Re-Import with UI-lock ─────────────────────────────────────────────

  private async triggerReimport(): Promise<void> {
    const data = await this.accessor.loadData();
    const importerCwd = data.importerCwd;
    const timeoutMs = data.importerTimeoutMs;
    const uvBinaryPath = data.uvBinaryPath || null;

    if (this.reimportBtn) {
      this.reimportBtn.disabled = true;
      this.reimportBtn.setText(t('dashboard.action.reimportRunning'));
    }
    this.showBanner(t('tbc.banner.running'));

    try {
      const result = await runImporter(importerCwd, uvBinaryPath, timeoutMs, (line) => {
        this.showBanner(line);
      }, [...FULL_IMPORT_ARGS], importerEnvFor(this.app, this.getPaths()));

      if (result.exitCode === 0) {
        await this.onReimportSuccess();
        new Notice(t('notice.reimportSuccess', Math.round(result.durationMs / 1000)));
      } else {
        new ImportErrorModal(
          this.app,
          summarizeStderr(result.stderr),
          () => { void this.triggerReimport(); },
          importerCwd,
        ).open();
      }
    } catch (err) {
      new Notice(t('notice.reimportError', err instanceof Error ? err.message : String(err)));
    } finally {
      if (this.reimportBtn) {
        this.reimportBtn.disabled = false;
        this.reimportBtn.setText(t('tbc.header.reimportNow'));
      }
      this.hideBanner();
    }
  }

  async onReimportSuccess(): Promise<void> {
    const data = await this.accessor.loadData();
    data.lastReimportTimestamp = new Date().toISOString();
    data.rulesAddedSinceReimport = 0;
    await this.accessor.saveData(data);
    this.updateCounter(0);
    await this.refresh();
  }

  // ── Table ──────────────────────────────────────────────────────────────

  private buildTable(container: HTMLElement): void {
    const wrap = container.createDiv({ cls: 'fl-scroll' });

    const table = wrap.createEl('table', { cls: 'fl-table' });

    const thead = table.createTHead();
    const tr = thead.insertRow();
    // '#' keeps the count column narrow (the long "Transactions" label bloated
    // it); the title attribute keeps it understandable on hover.
    const headers: { labelKey?: string; label?: string; titleKey?: string; num?: boolean }[] = [
      { labelKey: 'common.counterparty' },
      { label: '#', titleKey: 'tbc.col.hashTitle', num: true },
      { labelKey: 'common.amountEur' },
      { label: '' },
    ];
    for (const h of headers) {
      const th = tr.createEl('th', { text: h.labelKey ? t(h.labelKey) : (h.label ?? '') });
      if (h.titleKey) th.setAttribute('title', t(h.titleKey));
      if (h.num) th.addClass('fl-num');
    }

    this.tableBody = table.createTBody();
  }

  private buildFooter(container: HTMLElement): void {
    this.footerEl = container.createDiv({ cls: 'fl-view-footer' });
  }

  // ── Refresh ────────────────────────────────────────────────────────────

  async refresh(): Promise<void> {
    let text: string;
    try {
      text = await this.app.vault.adapter.read(normalizePath(this.getPaths().journal));
    } catch {
      this.diagnosticsEl.empty();
      this.tableBody.empty();
      this.footerEl.setText(t('tbc.noJournal'));
      return;
    }

    const { transactions: allTxs, diagnostics } = parseLedgerWithDiagnostics(text);
    this.diagnosticsEl.empty();
    renderDiagnosticsBanner(this.diagnosticsEl, diagnostics);
    const existingRules = loadCategorizerRules(this.app);
    const allRules = [...existingRules.counterpartyRules, ...existingRules.paypalRules];
    const tbcTxs = filterTbcCounterpartiesWithoutRule(allTxs, allRules);
    const grouped = groupTbcByCounterparty(tbcTxs);
    const sorted = [...grouped.entries()].sort((a, b) => a[0].localeCompare(b[0]));

    this.tableBody.empty();

    let totalEur = 0;
    for (const [counterparty, txGroup] of sorted) {
      const groupAmount = groupTbcAmount(txGroup);
      totalEur += groupAmount;

      const tr = this.tableBody.insertRow();

      const cell = (text: string) => {
        const td = tr.createEl('td');
        td.setText(text);
        return td;
      };

      // Counterparty cell with TBC-state dot prefix — name links to its rule note
      const cpTd = tr.createEl('td', { cls: 'fl-clickable' });
      const dot = cpTd.createSpan({ cls: 'fl-txn-state fl-mr-1' });
      dot.setAttribute('data-state', 'tbc');
      cpTd.createSpan({ cls: 'fl-link-affordance', text: counterparty });
      cpTd.onclick = () => this.openCounterpartyNote(counterparty);

      cell(String(txGroup.length)).addClass('fl-num');

      const amount = formatMoneyAmount(groupAmount, flowCtxFromSign(groupAmount), this.getDisplay());
      const amountTd = tr.createEl('td', { cls: 'fl-money' });
      amountTd.addClass(`is-${amount.tone}`);
      amountTd.setText(amount.text);

      const actionTd = tr.createEl('td');
      const btn = actionTd.createEl('button', { text: t('tbc.action.classify'), cls: 'fl-fs-sm' });
      btn.onclick = () => {
        new CategorizerRuleModal(this.app, {
          counterparty,
          allTransactions: allTxs,
          onSuccess: async () => {
            const data = await this.accessor.loadData();
            data.rulesAddedSinceReimport++;
            await this.accessor.saveData(data);
            this.updateCounter(data.rulesAddedSinceReimport);
            // Re-run the triage: the counterparty now has a matching rule, so
            // filterTbcCounterpartiesWithoutRule drops it from the list right
            // away (no re-import needed to clear it from the view).
            await this.refresh();
          },
        }, this.getPaths).open();
      };
    }

    const data = await this.accessor.loadData();
    this.updateCounter(data.rulesAddedSinceReimport);
    this.footerEl.empty();
    this.footerEl.createSpan({
      text: t('tbc.footer.summary', tbcTxs.length, sorted.length),
    });
    const totalFmt = formatMoneyAmount(totalEur, flowCtxFromSign(totalEur), this.getDisplay());
    const totalSpan = this.footerEl.createSpan({ cls: 'fl-money', text: totalFmt.text });
    totalSpan.addClass(`is-${totalFmt.tone}`);
  }
}
