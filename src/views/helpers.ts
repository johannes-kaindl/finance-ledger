import type { Transaction, LedgerDiagnostics } from '../parser/ledger';
import { t, tPlural } from '../i18n/strings';

/**
 * One-line, human-readable summary of non-fatal parse findings — or `null` when
 * the journal parsed cleanly. Pure so views can surface it via a banner (§6).
 */
export function summarizeDiagnostics(d: LedgerDiagnostics): string | null {
  const parts: string[] = [];
  if (d.skippedLines.length) parts.push(tPlural('diag.skippedLine', d.skippedLines.length));
  if (d.unbalanced.length) parts.push(tPlural('diag.unbalanced', d.unbalanced.length));
  if (d.suspiciousAmounts.length) parts.push(tPlural('diag.suspiciousAmount', d.suspiciousAmounts.length));
  if (!parts.length) return null;
  return t('diag.summary', parts.join(' · '));
}

// ── TBC helpers ────────────────────────────────────────────────────────────

export function filterTbcTransactions(txs: Transaction[]): Transaction[] {
  return txs.filter(tx => tx.tags.includes('tbc'));
}

export function filterTbcCounterpartiesWithoutRule(
  txs: Transaction[],
  rules: Array<{ pattern: string; aliases: string[] }>,
): Transaction[] {
  const tbcTxs = txs.filter(tx => tx.tags.includes('tbc'));
  if (rules.length === 0) return tbcTxs;
  return tbcTxs.filter(tx => {
    const cpLower = tx.counterparty.toLowerCase();
    return !rules.some(rule =>
      [rule.pattern, ...rule.aliases].some(p => cpLower.includes(p.toLowerCase())),
    );
  });
}

export function groupTbcByCounterparty(txs: Transaction[]): Map<string, Transaction[]> {
  const map = new Map<string, Transaction[]>();
  for (const tx of txs) {
    const group = map.get(tx.counterparty) ?? [];
    group.push(tx);
    map.set(tx.counterparty, group);
  }
  return map;
}

/**
 * Sum of the positive (debit-side) posting amounts across a counterparty's
 * transaction group — the figure the TBC triage table shows per counterparty.
 * The negative bank-side legs are excluded so the amount reflects what still
 * needs categorizing, not the net (which nets to ~0 for balanced txs).
 */
export function groupTbcAmount(txGroup: Transaction[]): number {
  return txGroup.reduce(
    (sum, tx) => sum + tx.postings.filter(p => p.amountEur > 0).reduce((s, p) => s + p.amountEur, 0),
    0,
  );
}

export interface PreviewMatchCount {
  tbcMatches: number;
  nonTbcMatches: number;
}

export function previewMatchCount(pattern: string, allTxs: Transaction[]): PreviewMatchCount {
  if (!pattern) return { tbcMatches: 0, nonTbcMatches: 0 };
  const lower = pattern.toLowerCase();
  let tbcMatches = 0;
  let nonTbcMatches = 0;
  for (const tx of allTxs) {
    if (!tx.counterparty.toLowerCase().includes(lower)) continue;
    if (tx.tags.includes('tbc')) {
      tbcMatches++;
    } else {
      nonTbcMatches++;
    }
  }
  return { tbcMatches, nonTbcMatches };
}

// ── Existing helpers ───────────────────────────────────────────────────────

export interface PostingRow {
  date: string;
  counterparty: string;
  account: string;
  amountEur: number;
  tags: string[];
}

export interface FilterState {
  dateFrom: string;
  dateTo: string;
  counterparty: string;
  account: string;
  tags: string;
  kategorie?: string;
  empfaenger?: string;
}

export interface SlugMaps {
  kategorieToPrefix: Map<string, string>;
  empfaengerToAccount: Map<string, string>;
}

export type SortColumn = 'date' | 'counterparty' | 'account' | 'amountEur' | 'tags';
export type SortDirection = 'asc' | 'desc';

export function buildPostingRows(transactions: Transaction[]): PostingRow[] {
  const rows: PostingRow[] = [];
  for (const tx of transactions) {
    for (const posting of tx.postings) {
      rows.push({
        date: tx.date,
        counterparty: tx.counterparty,
        account: posting.account,
        amountEur: posting.amountEur,
        tags: tx.tags,
      });
    }
  }
  return rows;
}

/**
 * A fresh filter for a "show me this account" deep-link (category tree /
 * dashboard card → ledger). Deliberately carries NO inherited state — most
 * importantly none of the invisible kategorie/empfaenger deep-link filters,
 * which the ledger filter bar does not surface and which would otherwise AND
 * with `account` and blank the view.
 */
export function buildAccountFilter(account: string): FilterState {
  return { dateFrom: '', dateTo: '', counterparty: '', account, tags: '' };
}

export function filterRows(rows: PostingRow[], f: FilterState, slugMaps?: SlugMaps): PostingRow[] {
  // Deep-link filters resolve a slug to a concrete prefix/account. A slug that
  // does not resolve (missing slugMaps OR slug not in the map) is treated as
  // "no filter" — never as "hide everything". Otherwise a stale, invisible,
  // non-removable deep-link filter would blank the whole ledger.
  const kategoriePrefix = f.kategorie && slugMaps ? slugMaps.kategorieToPrefix.get(f.kategorie) : undefined;
  const empfaengerAccount = f.empfaenger && slugMaps ? slugMaps.empfaengerToAccount.get(f.empfaenger) : undefined;

  return rows.filter(row => {
    if (f.dateFrom && row.date < f.dateFrom) return false;
    if (f.dateTo && row.date > f.dateTo) return false;
    if (f.counterparty && !row.counterparty.toLowerCase().includes(f.counterparty.toLowerCase())) return false;
    if (f.account && !row.account.toLowerCase().includes(f.account.toLowerCase())) return false;
    if (f.tags) {
      const required = f.tags.split(',').map(t => t.trim()).filter(Boolean);
      if (!required.every(rt => row.tags.includes(rt))) return false;
    }
    if (kategoriePrefix && !row.account.startsWith(kategoriePrefix)) return false;
    if (empfaengerAccount && row.account !== empfaengerAccount) return false;
    return true;
  });
}

export function sortRows(rows: PostingRow[], col: SortColumn, dir: SortDirection): PostingRow[] {
  return [...rows].sort((a, b) => {
    let cmp: number;
    if (col === 'amountEur') {
      cmp = a.amountEur - b.amountEur;
    } else if (col === 'tags') {
      cmp = a.tags.join(',').localeCompare(b.tags.join(','));
    } else {
      cmp = a[col].localeCompare(b[col]);
    }
    return dir === 'asc' ? cmp : -cmp;
  });
}

export function calculateVisibleSum(rows: PostingRow[]): number {
  return rows.reduce((acc, row) => acc + row.amountEur, 0);
}

// ── Design-System helpers (KSP wiring) ─────────────────────────────────────

export type AccountType = 'asset' | 'liability' | 'income' | 'expense' | 'equity';

export function accountType(account: string): AccountType | undefined {
  if (account.startsWith('Aktiva:')) return 'asset';
  if (account.startsWith('Passiva:')) return 'liability';
  if (account.startsWith('Einnahmen:')) return 'income';
  if (account.startsWith('Ausgaben:')) return 'expense';
  if (account.startsWith('Eigenkapital:')) return 'equity';
  return undefined;
}

// ── Vorzeichen- & Farb-Darstellung (F1) ─────────────────────────────────────
//
// Eine Regel, pro Konto-Typ angewandt. Fluss (Einnahmen/Ausgaben) folgt den
// Settings (signMode + colorScheme); Saldo (Aktiva/Passiva/EK/Netto) bleibt
// vorzeichen-basiert. Farbe hängt am Konto-Typ, nicht am angezeigten Vorzeichen
// → signMode und colorScheme sind orthogonal.

export type SignMode = 'intuitive' | 'accounting';
export type ColorScheme = 'classic' | 'monochrome' | 'inverted';
export type MoneyCtx = 'income' | 'expense' | 'balance';
export type MoneyTone = 'good' | 'bad' | 'muted' | 'zero';

export interface MoneyDisplay {
  signMode: SignMode;
  colorScheme: ColorScheme;
}

/** Leitet den Fluss-/Saldo-Kontext aus dem Konto-Präfix ab (undefined → balance). */
export function moneyCtx(account: string): MoneyCtx {
  const t = accountType(account);
  if (t === 'income') return 'income';
  if (t === 'expense') return 'expense';
  return 'balance';
}

/**
 * TBC-Edge: unklassifizierte Beträge haben noch keine Kategorie — der Fluss
 * wird aus dem hledger-Rohvorzeichen abgeleitet (positiv = Ausgabe).
 */
export function flowCtxFromSign(amountEur: number): MoneyCtx {
  return amountEur >= 0 ? 'expense' : 'income';
}

const EUR_PLAIN = new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' });
const EUR_SIGNED = new Intl.NumberFormat('de-DE', {
  style: 'currency',
  currency: 'EUR',
  signDisplay: 'exceptZero',
});

function moneyTone(amountEur: number, ctx: MoneyCtx, display: MoneyDisplay): MoneyTone {
  if (amountEur === 0) return 'zero';
  if (display.colorScheme === 'monochrome') return 'muted';
  if (ctx === 'balance') return amountEur > 0 ? 'good' : 'bad';
  // Fluss: Farbe nach Konto-Typ (income/expense), unabhängig vom Vorzeichen.
  const incomeIsGood = display.colorScheme === 'classic';
  if (ctx === 'income') return incomeIsGood ? 'good' : 'bad';
  return incomeIsGood ? 'bad' : 'good'; // expense
}

/**
 * Zentrale Geld-Darstellung: liefert den formatierten Text (mit Vorzeichen für
 * Fluss-Beträge) und den semantischen `tone` (→ CSS `.fl-money.is-{tone}`).
 * Löst die gestreute `EUR_FMT.format` + `moneySignClass`-Kombination ab.
 */
export function formatMoneyAmount(
  amountEur: number,
  ctx: MoneyCtx,
  display: MoneyDisplay,
): { text: string; tone: MoneyTone } {
  const isFlow = ctx === 'income' || ctx === 'expense';
  const value = isFlow && display.signMode === 'intuitive' ? -amountEur : amountEur;
  const text = isFlow ? EUR_SIGNED.format(value) : EUR_PLAIN.format(value);
  return { text, tone: moneyTone(amountEur, ctx, display) };
}

// ── Importer command (obsidian-free, so views can surface a copyable hint) ──

/**
 * Shell command that runs the importer manually — shown as a copy-button in the
 * import-error modal. Built from the configured path (Pfad-SSOT): hardcoding a
 * maintainer-local path here breaks every other install and leaks a private path
 * into a published plugin.
 */
export function buildImporterCommand(importerCwd: string): string {
  const target = importerCwd.trim() || '<importer-repo-path>';
  const quoted = /\s/.test(target) ? `'${target}'` : target;
  return `cd ${quoted} && uv run python -m importer.cli`;
}

/**
 * Reduziert stderr eines Subprozesses auf das, was in einer Notice Sinn ergibt.
 *
 * Ein Python-Traceback ist ~40 Zeilen lang und trägt die eigentliche Aussage in der
 * LETZTEN Zeile — ungefiltert in einer Obsidian-Notice ist er unlesbar. Saubere
 * Meldungen (der Normalfall seit der Format-Diagnose im Importer) bleiben unangetastet.
 */
export function summarizeStderr(stderr: string, maxLen = 600): string {
  const lines = stderr.split('\n').map(l => l.trimEnd()).filter(l => l.trim() !== '');
  if (lines.length === 0) return '';

  const isTraceback = lines[0].startsWith('Traceback (most recent call last)');
  const text = isTraceback ? lines[lines.length - 1] : lines.join('\n');
  return text.length > maxLen ? `${text.slice(0, maxLen - 1)}…` : text;
}
