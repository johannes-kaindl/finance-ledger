export interface Posting {
  account: string;
  amountEur: number;
}

export interface Transaction {
  date: string;
  counterparty: string;
  postings: Posting[];
  tags: string[];
  quelle: string | null;
  verwendungszweck: string | null;
}

/** A transaction whose postings do not sum to zero (double-entry violated). */
export interface UnbalancedTx {
  date: string;
  counterparty: string;
  residualEur: number;
}

/** A posting whose amount looks ambiguous (≥3 decimal places → thousand-dot risk). */
export interface SuspiciousAmount {
  date: string;
  line: string;
}

/**
 * Non-fatal parse findings the UI can surface so silent data problems become
 * visible: posting lines that were dropped, transactions that do not balance,
 * and amounts with a suspicious decimal shape.
 */
export interface LedgerDiagnostics {
  skippedLines: string[];
  unbalanced: UnbalancedTx[];
  suspiciousAmounts: SuspiciousAmount[];
}

export interface LedgerParseResult {
  transactions: Transaction[];
  diagnostics: LedgerDiagnostics;
}

const HEADER_RE = /^(\d{4}-\d{2}-\d{2}) \* (.+)$/;
const TAG_LINE_RE = /^; (:[a-z0-9_-]+)+:$/i;
// Separator between account and amount: 2+ spaces OR one-or-more tabs (a single
// tab is valid hledger and must not drop the posting).
const POSTING_RE = /^(\S.+?)(?:\t+|\s{2,})(-?\d+(?:\.\d+)?)\s+EUR$/;

/**
 * Parse an hledger-subset journal and collect non-fatal diagnostics.
 *
 * Line endings are normalised first (CRLF from the Windows importer / classic
 * CR) — otherwise the blank-line block split and the `EUR$` posting match would
 * silently yield zero transactions.
 */
export function parseLedgerWithDiagnostics(text: string): LedgerParseResult {
  const transactions: Transaction[] = [];
  const skippedLines: string[] = [];
  const unbalanced: UnbalancedTx[] = [];
  const suspiciousAmounts: SuspiciousAmount[] = [];

  const normalized = text.replace(/\r\n?/g, '\n');

  for (const block of normalized.split(/\n{2,}/)) {
    const lines = block.trim().split('\n');
    if (!lines.length) continue;

    const headerMatch = lines[0].match(HEADER_RE);
    if (!headerMatch) continue;

    const date = headerMatch[1];
    const counterparty = headerMatch[2].trim();
    const postings: Posting[] = [];
    const tags: string[] = [];
    let quelle: string | null = null;
    let verwendungszweck: string | null = null;

    for (let i = 1; i < lines.length; i++) {
      const trimmed = lines[i].trim();
      if (!trimmed) continue;

      if (trimmed.startsWith('; verwendungszweck:')) {
        verwendungszweck = trimmed.slice('; verwendungszweck:'.length).trim();
      } else if (trimmed.startsWith('; quelle:')) {
        quelle = trimmed.slice('; quelle:'.length).trim();
      } else if (TAG_LINE_RE.test(trimmed)) {
        const tagStr = trimmed.slice(2); // remove "; "
        tags.push(...tagStr.split(':').filter(t => t.length > 0));
      } else if (!trimmed.startsWith(';')) {
        const m = trimmed.match(POSTING_RE);
        if (m) {
          postings.push({ account: m[1].trim(), amountEur: parseFloat(m[2]) });
          const decimals = m[2].split('.')[1];
          if (decimals && decimals.length >= 3) {
            suspiciousAmounts.push({ date, line: trimmed });
          }
        } else {
          // A posting-position line that did not parse: dropping it silently
          // would unbalance the transaction with no trace — record it.
          skippedLines.push(trimmed);
        }
      }
    }

    if (postings.length > 0) {
      transactions.push({ date, counterparty, postings, tags, quelle, verwendungszweck });
      const residual = Math.round(postings.reduce((s, p) => s + p.amountEur, 0) * 100) / 100;
      if (Math.abs(residual) > 0.005) {
        unbalanced.push({ date, counterparty, residualEur: residual });
      }
    }
  }

  return { transactions, diagnostics: { skippedLines, unbalanced, suspiciousAmounts } };
}

/** Convenience wrapper returning only the transactions (diagnostics dropped). */
export function parseLedger(text: string): Transaction[] {
  return parseLedgerWithDiagnostics(text).transactions;
}
