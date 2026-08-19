import { App, normalizePath, Notice } from 'obsidian';
import { parseLedgerWithDiagnostics } from '../parser/ledger';
import { renderDiagnosticsBanner } from './diagnosticsBanner';
import { resolveAccountNote } from '../resolver/account';
import { aggregateAccountSaldos } from '../aggregator/saldo';
import { parseOpeningBalances } from '../aggregator/openingBalances';
import { formatMoneyAmount, type MoneyDisplay } from './helpers';
import { notConfiguredMessage, type ResolvedFinancePaths } from '../state/financePaths';
import type { FinancePanel } from './hub/panelTypes';
import { t } from '../i18n/strings';

export class SaldoPanel implements FinancePanel {
  readonly id = 'saldo' as const;
  readonly label = t('panel.saldo.label');
  readonly icon = 'landmark';

  private container!: HTMLElement;

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
      container.createEl('p', { text: t('saldo.noJournal', paths.journal) });
      return;
    }

    let openingText = '';
    try {
      openingText = await this.app.vault.adapter.read(normalizePath(paths.openingBalances));
    } catch {
      // opening_balances.ledger fehlt → leere Map, alle Konten Bootstrap-Pending
    }
    const openingBalances = parseOpeningBalances(openingText);

    const { transactions: txs, diagnostics } = parseLedgerWithDiagnostics(text);
    const saldos = aggregateAccountSaldos(txs, openingBalances);

    renderDiagnosticsBanner(container, diagnostics);

    container.createEl('h4', { text: t('saldo.title'), cls: 'fl-section-title' });

    const hint = container.createEl('p', { cls: 'fl-hint' });
    hint.setText(
      openingBalances.size > 0
        ? t('saldo.hint.withOpening')
        : t('saldo.hint.withoutOpening')
    );

    const wrap = container.createDiv({ cls: 'fl-scroll' });

    const table = wrap.createEl('table', { cls: 'fl-table' });

    const thead = table.createTHead();
    const htr = thead.insertRow();
    for (const labelKey of ['saldo.col.account', 'saldo.col.balance', 'saldo.col.asOf', 'saldo.col.txSinceAsOf', 'saldo.col.lastTx']) {
      htr.createEl('th', { text: t(labelKey) });
    }

    const tbody = table.createTBody();
    for (const s of saldos) {
      const tr = tbody.insertRow();

      const accountTd = tr.createEl('td', { cls: 'fl-clickable fl-nowrap' });
      const chip = accountTd.createSpan({ cls: 'fl-acct-chip fl-link-affordance', text: s.account });
      chip.setAttribute('data-type', 'asset');
      accountTd.onclick = () => {
        const file = resolveAccountNote(s.account, this.app);
        if (file) {
          void this.app.workspace.openLinkText(file.path, '', false);
        } else {
          new Notice(t('notice.noAccountNote', s.account));
        }
      };

      const saldo = formatMoneyAmount(s.saldoEur, 'balance', this.getDisplay());
      const saldoTd = tr.createEl('td', { text: saldo.text, cls: 'fl-money fl-num' });
      saldoTd.addClass(`is-${saldo.tone}`);

      const standAmTd = tr.createEl('td', { cls: 'fl-fs-lg' });
      if (s.hasOpeningBalance) {
        standAmTd.setText(s.standAm ?? '');
      } else {
        const dot = standAmTd.createSpan({ cls: 'fl-txn-state fl-mr-1' });
        dot.setAttribute('data-state', 'tbc');
        standAmTd.createSpan({ text: 'TBC' });
        standAmTd.addClass('fl-warning');
        standAmTd.title = t('saldo.openingTbcTitle', s.account);
      }

      tr.createEl('td', { text: String(s.postingCount), cls: 'fl-num' });

      tr.createEl('td', { text: s.lastDate });
    }

    if (saldos.length === 0) {
      const tr = tbody.insertRow();
      tr.createEl('td', { text: t('saldo.noAssets') })
        .setAttribute('colspan', '5');
    }
  }
}
