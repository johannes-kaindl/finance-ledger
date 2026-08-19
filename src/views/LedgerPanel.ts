import { App, normalizePath, Notice } from 'obsidian';
import { parseLedgerWithDiagnostics } from '../parser/ledger';
import { renderDiagnosticsBanner } from './diagnosticsBanner';
import { resolveAccountNote, resolveCounterpartyNote } from '../resolver/account';
import {
  buildPostingRows,
  filterRows,
  sortRows,
  calculateVisibleSum,
  accountType,
  formatMoneyAmount,
  moneyCtx,
  type MoneyDisplay,
  type PostingRow,
  type FilterState,
  type SlugMaps,
  type SortColumn,
  type SortDirection,
} from './helpers';
import { loadState, saveState, loadPresets, savePreset, deletePreset } from '../state/filterState';
import { loadSlugMaps } from './slugMaps';
import { promptText } from '../ui/promptModal';
import { confirmAction } from '../vendor/kit-obsidian/confirm';
import { notConfiguredMessage, type ResolvedFinancePaths } from '../state/financePaths';
import type { FinancePanel } from './hub/panelTypes';
import { t } from '../i18n/strings';

export class LedgerPanel implements FinancePanel {
  readonly id = 'ledger' as const;
  readonly label = t('panel.ledger.label');
  readonly icon = 'piggy-bank';

  private container!: HTMLElement;
  private allRows: PostingRow[] = [];
  private filter: FilterState = { dateFrom: '', dateTo: '', counterparty: '', account: '', tags: '' };
  private sortCol: SortColumn = 'date';
  private sortDir: SortDirection = 'asc';
  private tbody!: HTMLTableSectionElement;
  private footer!: HTMLDivElement;
  private filterInputs!: Record<'dateFrom' | 'dateTo' | 'counterparty' | 'account' | 'tags', HTMLInputElement>;
  private presetSelect!: HTMLSelectElement;
  private activePresetName: string | null = null;
  private slugMaps?: SlugMaps;

  constructor(
    private readonly app: App,
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

    const paths = this.getPaths();
    if (!paths.isConfigured) {
      container.createEl('p', { text: notConfiguredMessage(), cls: 'fl-empty' });
      return;
    }

    let text: string;
    try {
      text = await this.app.vault.adapter.read(normalizePath(paths.journal));
    } catch {
      container.createEl('p', { text: t('ledger.noJournal', paths.journal) });
      return;
    }

    const { transactions, diagnostics } = parseLedgerWithDiagnostics(text);
    this.allRows = buildPostingRows(transactions);
    // Filter arrives via the vault-scoped localStorage channel — a category or
    // dashboard deep-link writes it, then switches to this tab.
    this.filter = loadState();
    this.slugMaps = await loadSlugMaps(this.app, paths);
    renderDiagnosticsBanner(container, diagnostics);
    this.buildFilterBar(container);
    this.buildTable(container);
    this.buildFooter(container);
    this.rerender();
  }

  // ── Filter bar ─────────────────────────────────────────────────────────────

  private buildFilterBar(container: HTMLElement): void {
    const bar = container.createDiv({ cls: 'ledger-filter-bar' });

    type StringFilterKey = 'dateFrom' | 'dateTo' | 'counterparty' | 'account' | 'tags';

    const mkInput = (label: string, type: string, key: StringFilterKey): HTMLInputElement => {
      const wrap = bar.createDiv();
      wrap.createEl('label', { text: label, cls: 'fl-filter-label' });
      const inp = wrap.createEl('input', { type, cls: 'fl-filter-input' });
      inp.value = this.filter[key];
      inp.oninput = () => {
        this.filter[key] = inp.value;
        saveState(this.filter);
        this.activePresetName = null;
        this.rerender();
      };
      return inp;
    };

    this.filterInputs = {
      dateFrom:     mkInput(t('ledger.filter.from'),         'date', 'dateFrom'),
      dateTo:       mkInput(t('ledger.filter.to'),           'date', 'dateTo'),
      counterparty: mkInput(t('ledger.filter.counterparty'), 'text', 'counterparty'),
      account:      mkInput(t('ledger.filter.account'),      'text', 'account'),
      tags:         mkInput(t('ledger.filter.tags'),         'text', 'tags'),
    };

    this.buildPresetBar(bar);
  }

  // ── Preset bar ─────────────────────────────────────────────────────────────

  private buildPresetBar(bar: HTMLElement): void {
    bar.createDiv({ cls: 'fl-vsep' });

    // Dropdown
    const selectWrap = bar.createDiv();
    selectWrap.createEl('label', { text: t('ledger.preset.label'), cls: 'fl-filter-label' });
    this.presetSelect = selectWrap.createEl('select', { cls: 'fl-filter-select' });
    this.refreshPresetSelect();
    this.presetSelect.onchange = () => {
      const name = this.presetSelect.value;
      if (!name) return;
      const preset = loadPresets().find(p => p.name === name);
      if (!preset) return;
      this.filter = { ...preset.state };
      this.activePresetName = name;
      saveState(this.filter);
      this.syncInputsFromFilter();
      this.rerender();
    };

    // Save
    const btnSave = bar.createEl('button', { text: t('ledger.preset.save'), cls: 'fl-fs-xs fl-self-end' });
    btnSave.onclick = async () => {
      const name = await promptText(this.app, t('ledger.preset.namePrompt'));
      if (!name?.trim()) return;
      savePreset(name.trim(), this.filter);
      this.activePresetName = name.trim();
      this.refreshPresetSelect();
    };

    // Delete
    const btnDel = bar.createEl('button', { text: t('ledger.preset.delete'), cls: 'fl-fs-xs fl-self-end mod-warning' });
    btnDel.onclick = async () => {
      const name = this.presetSelect.value;
      if (!name) return;
      const ok = await confirmAction(this.app, {
        message: t('ledger.preset.deleteConfirm', name),
        confirmLabel: t('common.delete'),
        cancelLabel: t('common.cancel'),
      });
      if (!ok) return;
      deletePreset(name);
      this.activePresetName = null;
      this.refreshPresetSelect();
    };
  }

  private refreshPresetSelect(): void {
    this.presetSelect.empty();
    const placeholder = this.presetSelect.createEl('option', { text: t('ledger.preset.loadPlaceholder'), value: '' });
    placeholder.disabled = true;
    placeholder.selected = !this.activePresetName;
    for (const p of loadPresets()) {
      const opt = this.presetSelect.createEl('option', { text: p.name, value: p.name });
      if (p.name === this.activePresetName) opt.selected = true;
    }
  }

  private syncInputsFromFilter(): void {
    if (!this.filterInputs) return;
    this.filterInputs.dateFrom.value = this.filter.dateFrom;
    this.filterInputs.dateTo.value = this.filter.dateTo;
    this.filterInputs.counterparty.value = this.filter.counterparty;
    this.filterInputs.account.value = this.filter.account;
    this.filterInputs.tags.value = this.filter.tags;
  }

  // ── Table ──────────────────────────────────────────────────────────────────

  private buildTable(container: HTMLElement): void {
    const wrap = container.createDiv({ cls: 'fl-scroll' });

    const table = wrap.createEl('table', { cls: 'fl-table' });

    const cols: { labelKey: string; col: SortColumn }[] = [
      { labelKey: 'ledger.col.date', col: 'date' },
      { labelKey: 'ledger.col.counterparty', col: 'counterparty' },
      { labelKey: 'ledger.col.account', col: 'account' },
      { labelKey: 'ledger.col.amount', col: 'amountEur' },
      { labelKey: 'ledger.col.tags', col: 'tags' },
    ];

    const thead = table.createTHead();
    const tr = thead.insertRow();
    for (const { labelKey, col } of cols) {
      const th = tr.createEl('th', { text: t(labelKey), cls: 'fl-sortable' });
      th.onclick = () => {
        if (this.sortCol === col) {
          this.sortDir = this.sortDir === 'asc' ? 'desc' : 'asc';
        } else {
          this.sortCol = col;
          this.sortDir = 'asc';
        }
        this.rerender();
      };
    }

    this.tbody = table.createTBody();
    this.footer = container.createDiv();
  }

  // ── Footer ─────────────────────────────────────────────────────────────────

  private buildFooter(container: HTMLElement): void {
    this.footer = container.createDiv({ cls: 'fl-view-footer fl-nowrap' });
  }

  // ── Re-render ──────────────────────────────────────────────────────────────

  private rerender(): void {
    const visible = sortRows(filterRows(this.allRows, this.filter, this.slugMaps), this.sortCol, this.sortDir);

    this.tbody.empty();
    for (const row of visible) {
      const tr = this.tbody.insertRow();

      const cell = (text: string) => {
        const td = tr.createEl('td');
        td.setText(text);
        return td;
      };

      cell(row.date);

      // Counterparty cell — clickable → its categorizer-rule note ("payee page")
      const cpTd = tr.createEl('td', { cls: 'fl-clickable' });
      cpTd.createSpan({ cls: 'fl-link-affordance', text: row.counterparty });
      cpTd.onclick = () => this.openCounterpartyNote(row.counterparty);

      // Account cell — clickable for navigation (A1.5), wrapped in .fl-acct-chip
      const accountTd = tr.createEl('td', { cls: 'fl-clickable' });
      const chip = accountTd.createSpan({ cls: 'fl-acct-chip fl-link-affordance', text: row.account });
      const type = accountType(row.account);
      if (type) chip.setAttribute('data-type', type);
      accountTd.onclick = () => {
        const file = resolveAccountNote(row.account, this.app);
        if (file) {
          void this.app.workspace.openLinkText(file.path, '', false);
        } else {
          new Notice(t('notice.noAccountNote', row.account));
        }
      };

      const amount = formatMoneyAmount(row.amountEur, moneyCtx(row.account), this.getDisplay());
      const amountTd = tr.createEl('td', { cls: 'fl-money' });
      amountTd.addClass(`is-${amount.tone}`);
      amountTd.setText(amount.text);

      cell(row.tags.join(', '));
    }

    const sum = calculateVisibleSum(visible);
    this.footer.empty();
    this.footer.createSpan({ text: t('ledger.footer.visibleSum', visible.length) });
    const sumFmt = formatMoneyAmount(sum, 'balance', this.getDisplay());
    const sumSpan = this.footer.createSpan({ cls: 'fl-money', text: sumFmt.text });
    sumSpan.addClass(`is-${sumFmt.tone}`);
  }

  private openCounterpartyNote(counterparty: string): void {
    const file = resolveCounterpartyNote(counterparty, this.getPaths().rulesFolder, this.app);
    if (file) {
      void this.app.workspace.openLinkText(file.path, '', false);
    } else {
      new Notice(t('notice.noRuleNoteYet', counterparty));
    }
  }
}
