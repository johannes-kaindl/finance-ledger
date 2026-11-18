import { describe, expect, it } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { parseLedger, type Transaction } from '../../src/parser/ledger';
import { aggregateAccountSaldos } from '../../src/aggregator/saldo';
import { aggregateCategoryTotals } from '../../src/aggregator/category';
import { accountType, moneyCtx } from '../../src/views/helpers';
import { parseKontenplan } from '../../src/core/accounts/kontoTyp';

const FIXTURE = readFileSync(join(__dirname, '../fixtures/sample-journal.ledger'), 'utf-8');

function tx(date: string, ...postings: Array<[string, number]>): Transaction {
  return {
    date,
    counterparty: 'Test',
    tags: [],
    quelle: null,
    verwendungszweck: null,
    postings: postings.map(([account, amountEur]) => ({ account, amountEur })),
  };
}

describe('Deutsche Konten: Typfilter liefert dasselbe wie der Präfixfilter (unverändertes Verhalten)', () => {
  const txs = parseLedger(FIXTURE);
  it.each([
    ['Ausgaben:', 'expense'],
    ['Einnahmen:', 'income'],
  ] as const)('%s ↔ %s', (prefix, typ) => {
    expect(aggregateCategoryTotals(txs, '', { typ })).toEqual(aggregateCategoryTotals(txs, prefix));
  });

  it('Saldo mit leerem Plan ist gleich dem ohne', () => {
    expect(aggregateAccountSaldos(txs, undefined, parseKontenplan(''))).toEqual(aggregateAccountSaldos(txs));
  });
});

describe('Englischer Kontenplan', () => {
  const plan = parseKontenplan('');
  const txs = [
    tx('2026-01-02', ['Assets:Bank:Checking', 1000], ['Income:Salary', -1000]),
    tx('2026-01-03', ['Assets:Bank:Checking', -40], ['Expenses:Groceries:Northwind', 40]),
    tx('2026-01-04', ['Liabilities:Card', -10], ['Expenses:Fees', 10]),
  ];

  it('Saldo zählt nur Vermögenskonten', () => {
    const saldos = aggregateAccountSaldos(txs, undefined, plan);
    expect(saldos.map((s) => s.account)).toEqual(['Assets:Bank:Checking']);
    expect(saldos[0]?.saldoEur).toBeCloseTo(960, 2);
  });

  it('Kategorien nach Typ: Ausgaben ohne Einnahmen', () => {
    const nodes = aggregateCategoryTotals(txs, '', { typ: 'expense', plan });
    expect(nodes).toHaveLength(1);
    expect(nodes[0]?.account).toBe('Expenses');
    expect(nodes[0]?.totalEur).toBeCloseTo(50, 2);
  });

  it('accountType und moneyCtx folgen dem Typ', () => {
    expect(accountType('Assets:Bank:Checking', plan)).toBe('asset');
    expect(moneyCtx('Income:Salary', plan)).toBe('income');
    expect(moneyCtx('Expenses:Fees', plan)).toBe('expense');
  });
});

describe('Frei benannter Kontenplan mit type-Tags', () => {
  const plan = parseKontenplan(
    ['account Girokonto  ; type: A', 'account Lohn  ; type: R', 'account Essen  ; type: X', ''].join('\n'),
  );
  const txs = [
    tx('2026-02-01', ['Girokonto:Sparkasse', 500], ['Lohn:Firma', -500]),
    tx('2026-02-02', ['Girokonto:Sparkasse', -20], ['Essen:Markt', 20]),
  ];

  it('erkennt Vermögen, Einnahme und Ausgabe ohne bekannte Wurzel', () => {
    expect(aggregateAccountSaldos(txs, undefined, plan).map((s) => s.account)).toEqual(['Girokonto:Sparkasse']);
    expect(aggregateCategoryTotals(txs, '', { typ: 'income', plan })[0]?.account).toBe('Lohn');
    expect(aggregateCategoryTotals(txs, '', { typ: 'expense', plan })[0]?.totalEur).toBeCloseTo(20, 2);
  });

  it('ohne Plan bleibt das Konto ohne Typ (kein Raten)', () => {
    expect(aggregateAccountSaldos(txs)).toEqual([]);
  });
});
