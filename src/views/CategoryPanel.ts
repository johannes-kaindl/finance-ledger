import { App, normalizePath, setIcon } from 'obsidian';
import { parseLedgerWithDiagnostics, type Transaction } from '../parser/ledger';
import { renderDiagnosticsBanner } from './diagnosticsBanner';
import { aggregateCategoryTotals, type CategoryNode } from '../aggregator/category';
import { saveState } from '../state/filterState';
import { buildAccountFilter, formatMoneyAmount, moneyCtx, type MoneyDisplay } from './helpers';
import { notConfiguredMessage, type ResolvedFinancePaths } from '../state/financePaths';
import type { FinancePanel, HubNavigate } from './hub/panelTypes';
import { t } from '../i18n/strings';

type PrefixMode = 'Ausgaben' | 'Einnahmen' | 'Alle';

interface CategoryRowRef {
  tr: HTMLTableRowElement;
  expanded: boolean;
  parent: CategoryRowRef | null;
  toggle: HTMLElement | null;
}

export class CategoryPanel implements FinancePanel {
  readonly id = 'category' as const;
  readonly label = t('panel.category.label');
  readonly icon = 'badge-euro';

  private container!: HTMLElement;
  private prefixMode: PrefixMode = 'Ausgaben';
  private allTransactions: Transaction[] = [];
  private treeContainer!: HTMLElement;

  constructor(
    private readonly app: App,
    private readonly getPaths: () => ResolvedFinancePaths,
    private readonly navigate: HubNavigate,
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
      container.createEl('p', { text: t('category.noJournal', paths.journal) });
      return;
    }

    const { transactions, diagnostics } = parseLedgerWithDiagnostics(text);
    this.allTransactions = transactions;
    renderDiagnosticsBanner(container, diagnostics);
    this.buildTopBar(container);
    this.treeContainer = container.createDiv({ cls: 'fl-scroll' });
    this.rerender();
  }

  // ── Top bar ────────────────────────────────────────────────────────────────

  private buildTopBar(container: HTMLElement): void {
    const bar = container.createDiv({ cls: 'fl-toolbar' });

    const modeLabels: Record<PrefixMode, string> = {
      Ausgaben: t('category.mode.expenses'),
      Einnahmen: t('category.mode.income'),
      Alle: t('category.mode.all'),
    };

    for (const mode of ['Ausgaben', 'Einnahmen', 'Alle'] as PrefixMode[]) {
      const btn = bar.createEl('button', { text: modeLabels[mode], cls: 'fl-fs-sm' });
      btn.onclick = () => {
        this.prefixMode = mode;
        this.rerender();
      };
    }
  }

  // ── Re-render ──────────────────────────────────────────────────────────────

  private rerender(): void {
    const prefix =
      this.prefixMode === 'Ausgaben' ? 'Ausgaben:'
      : this.prefixMode === 'Einnahmen' ? 'Einnahmen:'
      : '';

    const nodes = aggregateCategoryTotals(this.allTransactions, prefix);
    this.treeContainer.empty();

    const table = this.treeContainer.createEl('table', { cls: 'fl-table' });

    const thead = table.createTHead();
    const htr = thead.insertRow();
    const cols: ReadonlyArray<{ labelKey: string; align: 'left' | 'right' }> = [
      { labelKey: 'category.col.category', align: 'left' },
      { labelKey: 'category.col.volume', align: 'right' },
      { labelKey: 'category.col.postings', align: 'right' },
      { labelKey: 'category.col.share', align: 'right' },
    ];
    for (const { labelKey, align } of cols) {
      const th = htr.createEl('th', { text: t(labelKey) });
      th.toggleClass('fl-num', align === 'right');
    }

    const tbody = table.createTBody();
    const rowRefs: CategoryRowRef[] = [];
    this.buildRows(tbody, nodes, 0, null, this.prefixMode === 'Alle', rowRefs);

    // A row is visible iff every one of its ancestors is expanded. This keeps
    // nested subtrees collapsed independently and avoids the flat "toggle all
    // descendants" bug (first-click no-op + grandchildren leaking open).
    const applyVisibility = (): void => {
      for (const r of rowRefs) {
        let visible = true;
        for (let p = r.parent; p; p = p.parent) {
          if (!p.expanded) { visible = false; break; }
        }
        r.tr.toggleClass('fl-hidden', !visible);
      }
    };

    for (const ref of rowRefs) {
      const toggle = ref.toggle;
      if (!toggle) continue;
      toggle.onclick = (e) => {
        e.stopPropagation();
        ref.expanded = !ref.expanded;
        setIcon(toggle, ref.expanded ? 'chevron-down' : 'chevron-right');
        applyVisibility();
      };
    }
    applyVisibility();

    if (nodes.length === 0) {
      tbody.insertRow().createEl('td', { text: t('category.noData') }).setAttribute('colspan', '4');
    }
  }

  private buildRows(
    tbody: HTMLTableSectionElement,
    nodes: CategoryNode[],
    depth: number,
    parent: CategoryRowRef | null,
    hideTopPct: boolean,
    out: CategoryRowRef[],
  ): void {
    for (const node of nodes) {
      const hasChildren = (node.children?.length ?? 0) > 0;
      const tr = tbody.insertRow();

      // Category cell: indent by depth (via --fl-indent) + caret (or spacer for leaves)
      const nameTd = tr.createEl('td');
      nameTd.addClass('fl-tree-cell');
      nameTd.style.setProperty('--fl-indent', `${8 + depth * 18}px`);

      let toggle: HTMLElement | null = null;
      if (hasChildren) {
        toggle = nameTd.createSpan({ cls: 'fl-caret' });
        setIcon(toggle, 'chevron-right');
      } else {
        nameTd.createSpan({ cls: 'fl-caret-spacer' });
      }

      const namePart = nameTd.createSpan({ text: this.shortName(node.account, depth), cls: 'fl-link-affordance' });
      namePart.onclick = () => this.navigateToFilter(node.account);

      const amt = formatMoneyAmount(node.totalEur, moneyCtx(node.account), this.getDisplay());
      const amtTd = tr.createEl('td', { text: amt.text, cls: 'fl-money fl-num' });
      amtTd.addClass(`is-${amt.tone}`);

      tr.createEl('td', { text: String(node.postingCount), cls: 'fl-num' });

      const pctText = (hideTopPct && depth === 0) ? '—' : `${Math.abs(node.percentOfTotal).toFixed(1)} %`;
      tr.createEl('td', { text: pctText, cls: 'fl-num' });

      const ref: CategoryRowRef = { tr, expanded: false, parent, toggle };
      out.push(ref);

      if (hasChildren && node.children) {
        this.buildRows(tbody, node.children, depth + 1, ref, hideTopPct, out);
      }
    }
  }

  // ── Helpers ────────────────────────────────────────────────────────────────

  private shortName(account: string, depth: number): string {
    const parts = account.split(':');
    return parts[depth] ?? parts[parts.length - 1];
  }

  private navigateToFilter(account: string): void {
    // Fresh account-only filter — must NOT inherit invisible kategorie/empfaenger
    // deep-link filters, which would AND with the account and blank the ledger.
    saveState(buildAccountFilter(account));
    // The filter travels through the (vault-scoped) localStorage channel; the
    // ledger panel reads it in onShow(). Just switch tabs.
    this.navigate('ledger');
  }
}
