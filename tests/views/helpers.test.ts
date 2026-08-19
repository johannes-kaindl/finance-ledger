import { it, expect, describe } from 'vitest';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { parseLedger } from '../../src/parser/ledger';
import {
  buildPostingRows,
  filterRows,
  sortRows,
  calculateVisibleSum,
  accountType,
  summarizeDiagnostics,
  buildAccountFilter,
  type PostingRow,
  type FilterState,
  type SlugMaps,
} from '../../src/views/helpers';

const __dirnameTest = dirname(fileURLToPath(import.meta.url));
const fixtureText = readFileSync(join(__dirnameTest, '../fixtures/sample-journal.ledger'), 'utf-8');
const txs = parseLedger(fixtureText);

// ── A1.3: buildPostingRows ──────────────────────────────────────────────────

describe('buildPostingRows', () => {
  it('produces 2 rows per transaction (14 rows for 7 transactions)', () => {
    const rows = buildPostingRows(txs);
    expect(rows).toHaveLength(14);
  });

  it('maps date, counterparty, account, amountEur, tags onto each row', () => {
    const rows = buildPostingRows(txs);
    const first = rows[0];
    expect(first.date).toBe('2025-05-07');
    expect(first.counterparty).toBe('Baeckerei Konditorei Muster GmbH//FIL.01. MUSTERSTADT/DE');
    expect(first.account).toBe('Aktiva:Bank:Sparkasse:Hauptkonto');
    expect(first.amountEur).toBe(-9.46);
    expect(first.tags).toEqual([]);
  });

  it('carries tags from transaction onto both posting rows', () => {
    const rows = buildPostingRows(txs);
    // VW Leasing tx at index 1 → rows[2] and rows[3]
    expect(rows[2].tags).toEqual(['recurring']);
    expect(rows[3].tags).toEqual(['recurring']);
  });
});

// ── A1.4: filterRows ────────────────────────────────────────────────────────

const emptyFilter: FilterState = {
  dateFrom: '',
  dateTo: '',
  counterparty: '',
  account: '',
  tags: '',
};

describe('filterRows — date range', () => {
  it('returns all rows when filter is empty', () => {
    const rows = buildPostingRows(txs);
    expect(filterRows(rows, emptyFilter)).toHaveLength(14);
  });

  it('filters by dateFrom (inclusive)', () => {
    const rows = buildPostingRows(txs);
    const result = filterRows(rows, { ...emptyFilter, dateFrom: '2025-05-08' });
    // only AOK (2025-05-08) and PayPal (2025-05-12)
    expect(result).toHaveLength(4);
    expect(result.every(r => r.date >= '2025-05-08')).toBe(true);
  });

  it('filters by dateTo (inclusive)', () => {
    const rows = buildPostingRows(txs);
    const result = filterRows(rows, { ...emptyFilter, dateTo: '2025-05-07' });
    // all 5 transactions are 2025-05-07
    expect(result).toHaveLength(10);
    expect(result.every(r => r.date <= '2025-05-07')).toBe(true);
  });
});

describe('filterRows — counterparty substring', () => {
  it('filters case-insensitively by counterparty substring', () => {
    const rows = buildPostingRows(txs);
    const result = filterRows(rows, { ...emptyFilter, counterparty: 'telekom' });
    expect(result).toHaveLength(2);
    expect(result[0].counterparty).toContain('Telekom');
  });
});

describe('filterRows — account substring', () => {
  it('filters case-insensitively by account substring', () => {
    const rows = buildPostingRows(txs);
    const result = filterRows(rows, { ...emptyFilter, account: 'hauptkonto' });
    // every transaction has an Aktiva:Bank:Sparkasse:Hauptkonto posting = 7 rows
    expect(result).toHaveLength(7);
  });
});

describe('filterRows — kategorie + empfaenger (Slice-5 Phase-2 Deep-Link)', () => {
  const synthRows: PostingRow[] = [
    { date: '2025-05-01', counterparty: 'REWE', account: 'Ausgaben:Lebensmittel:Supermarkt:REWE', amountEur: -10, tags: [] },
    { date: '2025-05-02', counterparty: 'ALDI', account: 'Ausgaben:Lebensmittel:Supermarkt:ALDI', amountEur: -20, tags: [] },
    { date: '2025-05-03', counterparty: 'Telekom', account: 'Ausgaben:Kommunikation:Festnetz:Telekom', amountEur: -40, tags: [] },
    { date: '2025-05-04', counterparty: 'Vodafone', account: 'Ausgaben:Kommunikation:Mobilfunk:Vodafone', amountEur: -25, tags: [] },
    { date: '2025-05-05', counterparty: 'Bank', account: 'Aktiva:Bank:Sparkasse:Hauptkonto', amountEur: 100, tags: [] },
  ];

  const slugMaps: SlugMaps = {
    kategorieToPrefix: new Map([
      ['lebensmittel', 'Ausgaben:Lebensmittel:'],
      ['kommunikation', 'Ausgaben:Kommunikation:'],
    ]),
    empfaengerToAccount: new Map([
      ['ausgaben-kommunikation-festnetz-telekom', 'Ausgaben:Kommunikation:Festnetz:Telekom'],
      ['ausgaben-lebensmittel-supermarkt-rewe', 'Ausgaben:Lebensmittel:Supermarkt:REWE'],
    ]),
  };

  it('kategorie slug filters by ledger_account prefix', () => {
    const result = filterRows(synthRows, { ...emptyFilter, kategorie: 'lebensmittel' }, slugMaps);
    expect(result).toHaveLength(2);
    expect(result.every(r => r.account.startsWith('Ausgaben:Lebensmittel:'))).toBe(true);
  });

  it('empfaenger slug filters by exact ledger_account', () => {
    const result = filterRows(synthRows, { ...emptyFilter, empfaenger: 'ausgaben-kommunikation-festnetz-telekom' }, slugMaps);
    expect(result).toHaveLength(1);
    expect(result[0].account).toBe('Ausgaben:Kommunikation:Festnetz:Telekom');
  });

  it('unresolvable slug is ignored (no-op), never blanks the view', () => {
    // A slug that does not resolve to a concrete prefix/account must be treated
    // as "no filter" — NOT "hide everything". Otherwise a stale, invisible,
    // non-removable deep-link filter blanks the whole ledger (bug 2026-07-12).
    const result = filterRows(synthRows, { ...emptyFilter, kategorie: 'does-not-exist' }, slugMaps);
    expect(result).toHaveLength(synthRows.length);
  });

  it('unresolvable empfaenger slug is likewise ignored', () => {
    const result = filterRows(synthRows, { ...emptyFilter, empfaenger: 'nope-not-here' }, slugMaps);
    expect(result).toHaveLength(synthRows.length);
  });

  it('without slugMaps, kategorie/empfaenger filters are ignored (degraded mode)', () => {
    const result = filterRows(synthRows, { ...emptyFilter, kategorie: 'lebensmittel' });
    expect(result).toHaveLength(synthRows.length);
  });

  it('combines with existing filters (kategorie + dateFrom)', () => {
    const result = filterRows(synthRows, { ...emptyFilter, kategorie: 'kommunikation', dateFrom: '2025-05-04' }, slugMaps);
    expect(result).toHaveLength(1);
    expect(result[0].counterparty).toBe('Vodafone');
  });
});

describe('buildAccountFilter (deep-link → clean account-only filter)', () => {
  it('sets only account, with no inherited hidden kategorie/empfaenger', () => {
    const f = buildAccountFilter('Ausgaben:Unkategorisiert');
    expect(f.account).toBe('Ausgaben:Unkategorisiert');
    expect(f.dateFrom).toBe('');
    expect(f.dateTo).toBe('');
    expect(f.counterparty).toBe('');
    expect(f.tags).toBe('');
    expect(f.kategorie).toBeUndefined();
    expect(f.empfaenger).toBeUndefined();
  });

  it('produces a filter that shows the account rows (no stale deep-link filter)', () => {
    const rows: PostingRow[] = [
      { date: '2025-05-01', counterparty: 'X', account: 'Ausgaben:Unkategorisiert:foo', amountEur: -5, tags: [] },
      { date: '2025-05-02', counterparty: 'Y', account: 'Ausgaben:Lebensmittel:REWE', amountEur: -9, tags: [] },
    ];
    // A stale slugMaps would have blanked everything before; buildAccountFilter
    // carries no kategorie/empfaenger, so the account substring is all that applies.
    const visible = filterRows(rows, buildAccountFilter('Ausgaben:Unkategorisiert'));
    expect(visible).toHaveLength(1);
    expect(visible[0].account).toBe('Ausgaben:Unkategorisiert:foo');
  });
});

describe('filterRows — tags (AND logic)', () => {
  it('filters rows that include a given tag', () => {
    const rows = buildPostingRows(txs);
    const result = filterRows(rows, { ...emptyFilter, tags: 'recurring' });
    // VW (2 rows), AOK (2 rows), PayPal (2 rows), Telekom (2 rows) = 8 rows
    expect(result).toHaveLength(8);
  });

  it('AND-logic: both tags must be present', () => {
    const rows = buildPostingRows(txs);
    const result = filterRows(rows, { ...emptyFilter, tags: 'recurring,paypal-via' });
    // only PayPal has both recurring and paypal-via
    expect(result).toHaveLength(2);
    expect(result[0].counterparty).toContain('PayPal');
  });

  it('returns empty when no row matches all required tags', () => {
    const rows = buildPostingRows(txs);
    const result = filterRows(rows, { ...emptyFilter, tags: 'recurring,tbc' });
    expect(result).toHaveLength(0);
  });
});

// ── A1.4: sortRows ──────────────────────────────────────────────────────────

describe('sortRows', () => {
  it('sorts by amountEur ascending', () => {
    const rows = buildPostingRows(txs);
    const sorted = sortRows(rows, 'amountEur', 'asc');
    for (let i = 1; i < sorted.length; i++) {
      expect(sorted[i].amountEur).toBeGreaterThanOrEqual(sorted[i - 1].amountEur);
    }
  });

  it('sorts by amountEur descending', () => {
    const rows = buildPostingRows(txs);
    const sorted = sortRows(rows, 'amountEur', 'desc');
    for (let i = 1; i < sorted.length; i++) {
      expect(sorted[i].amountEur).toBeLessThanOrEqual(sorted[i - 1].amountEur);
    }
  });

  it('sorts by date lexicographically ascending', () => {
    const rows = buildPostingRows(txs);
    const sorted = sortRows(rows, 'date', 'asc');
    for (let i = 1; i < sorted.length; i++) {
      expect(sorted[i].date >= sorted[i - 1].date).toBe(true);
    }
  });

  it('does not mutate the original array', () => {
    const rows = buildPostingRows(txs);
    const original = rows.map(r => r.date);
    sortRows(rows, 'date', 'asc');
    expect(rows.map(r => r.date)).toEqual(original);
  });
});

// ── A1.6: calculateVisibleSum ───────────────────────────────────────────────

describe('calculateVisibleSum', () => {
  it('sums all amountEur values', () => {
    const rows: PostingRow[] = [
      { date: '', counterparty: '', account: '', amountEur: 100.0, tags: [] },
      { date: '', counterparty: '', account: '', amountEur: -42.5, tags: [] },
      { date: '', counterparty: '', account: '', amountEur: 10.0, tags: [] },
    ];
    expect(calculateVisibleSum(rows)).toBeCloseTo(67.5);
  });

  it('returns 0 for empty array', () => {
    expect(calculateVisibleSum([])).toBe(0);
  });

  it('sum of all fixture rows is 0 (balanced transactions)', () => {
    const rows = buildPostingRows(txs);
    expect(calculateVisibleSum(rows)).toBeCloseTo(0, 5);
  });

  it('sum of filtered Hauptkonto rows equals sum of those amounts', () => {
    const rows = buildPostingRows(txs);
    const filtered = filterRows(rows, { ...emptyFilter, account: 'hauptkonto' });
    // -9.46 + -42.86 + 60.00 + -2264.18 + 1418.88 + -17.99 + -110.67 = -966.28
    expect(calculateVisibleSum(filtered)).toBeCloseTo(-966.28, 2);
  });
});


// ── F15: Design-System wiring helpers ──────────────────────────────────────

describe('accountType', () => {
  it('maps Aktiva prefix to asset', () => {
    expect(accountType('Aktiva:Bank:Sparkasse')).toBe('asset');
  });

  it('maps Passiva prefix to liability', () => {
    expect(accountType('Passiva:Visa-Hauptkarte')).toBe('liability');
  });

  it('maps Einnahmen prefix to income', () => {
    expect(accountType('Einnahmen:Gehalt')).toBe('income');
  });

  it('maps Ausgaben prefix to expense', () => {
    expect(accountType('Ausgaben:Lebensmittel:Edeka')).toBe('expense');
  });

  it('maps Eigenkapital prefix to equity', () => {
    expect(accountType('Eigenkapital:Eroeffnung')).toBe('equity');
  });

  it('returns undefined for unknown prefix', () => {
    expect(accountType('Sonstiges:Foo')).toBeUndefined();
    expect(accountType('')).toBeUndefined();
  });
});

// ── H2/M1: summarizeDiagnostics ──────────────────────────────────────────────

describe('summarizeDiagnostics', () => {
  const clean = { skippedLines: [], unbalanced: [], suspiciousAmounts: [] };

  it('returns null when there is nothing to report', () => {
    expect(summarizeDiagnostics(clean)).toBeNull();
  });

  it('summarizes counts of each issue type in one message', () => {
    const msg = summarizeDiagnostics({
      skippedLines: ['a', 'b'],
      unbalanced: [{ date: '2025-01-01', counterparty: 'X', residualEur: -10 }],
      suspiciousAmounts: [{ date: '2025-01-01', line: 'y' }],
    });
    expect(msg).not.toBeNull();
    expect(msg).toContain('2');
    expect(msg).toMatch(/ignored/i);
    expect(msg).toMatch(/unbalanced/i);
    expect(msg).toMatch(/suspicious/i);
  });

  it('omits issue types with zero count', () => {
    const msg = summarizeDiagnostics({
      skippedLines: ['a'],
      unbalanced: [],
      suspiciousAmounts: [],
    });
    expect(msg).toMatch(/ignored/i);
    expect(msg).not.toMatch(/unbalanced/i);
  });
});
