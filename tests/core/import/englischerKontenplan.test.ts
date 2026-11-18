/**
 * Ein englischer Kontenplan läuft vom Import bis zur Ansicht: Importer legt seine Konten unter den gewählten
 * Wurzeln an, `accounts.ledger` trägt die Typen, die Ansicht liest sie wieder (und umgekehrt: der deutsche
 * Standard bleibt Byte für Byte, wie er war).
 */
import { describe, expect, it } from 'vitest';
import { aggregateAccountSaldos } from '../../../src/aggregator/saldo';
import { aggregateCategoryTotals } from '../../../src/aggregator/category';
import { parseOpeningBalances } from '../../../src/aggregator/openingBalances';
import { parseLedger } from '../../../src/parser/ledger';
import { parseKontenplan } from '../../../src/core/accounts/kontoTyp';
import { aggregateTransactions } from '../../../src/core/aggregate/aggregate';
import { computeBudgetForMonth } from '../../../src/core/aggregate/budget';
import { kategorieMapping } from '../../../src/core/aggregate/kategorien';
import { createImporterContext } from '../../../src/core/config/context';
import { parseKontenConfig } from '../../../src/core/config/konten';
import { categorize, deriveOwnerNames } from '../../../src/core/import/categorize';
import { defaultSignRules } from '../../../src/core/import/defaultSignRules';
import { categorizeAll, formatAccounts, formatJournal } from '../../../src/core/import/journal';
import { formatOpeningBalances } from '../../../src/core/import/openingBalances';
import { EMPTY_RULES } from '../../../src/core/import/rules';
import { Money } from '../../../src/core/money';
import { makeTx } from './factory';

const WURZELN = { asset: 'Assets', liability: 'Liabilities', income: 'Income', expense: 'Expenses', equity: 'Equity', clearing: 'Clearing' };

function bauKontext(kontowurzeln?: Record<string, string>) {
  return createImporterContext({
    notesPrefix: 'Finance',
    konten: parseKontenConfig({
      konten: [
        {
          id: 'main', iban: 'DE1', ledger_account: kontowurzeln ? 'Assets:Bank:Checking' : 'Aktiva:Bank:Giro',
          bank: 'Bank', konto_typ: 'giro', konto_rolle: 'main', csv_schema: 'x', inhaber: 'Pat Example',
          anfangssaldo: undefined,
        },
      ],
      ...(kontowurzeln ? { kontowurzeln } : {}),
    }),
  });
}

describe('Importer unter englischen Wurzeln', () => {
  const ctx = bauKontext(WURZELN);
  const input = { ctx, rules: EMPTY_RULES, ownerNames: deriveOwnerNames(ctx), signRules: defaultSignRules(ctx.wurzeln) };

  it('legt Auffang-, Gebühren- und Zinskonten unter den gewählten Wurzeln an', () => {
    expect(categorize(makeTx({ buchungstext: 'ENTGELT' }), input).gegenAccount).toMatch(/^Expenses:/);
    expect(categorize(makeTx({ beguenstigter: 'Unbekannt AG', quelle: 'a.CSV' }), input).gegenAccount).toBe(
      'Expenses:Unkategorisiert:a',
    );
    expect(categorize(makeTx({ accountIban: 'DE-x' }), input).gegenAccount).not.toMatch(/Ausgaben|Einnahmen|Aktiva/);
  });

  it('die Vorzeichenregeln folgen den Wurzeln', () => {
    const konten = defaultSignRules(ctx.wurzeln).flatMap((r) => [r.positive.account, r.negative.account]);
    expect(konten.every((a) => a.startsWith('Income:') || a.startsWith('Expenses:'))).toBe(true);
  });

  it('accounts.ledger trägt die Typen der abweichenden Wurzeln, ohne dass ein deutscher Name übrig bleibt', () => {
    const text = formatAccounts(ctx, EMPTY_RULES);
    expect(text).toContain('account Assets  ; type: A');
    expect(text).toContain('account Expenses  ; type: X');
    expect(text).toContain('account Clearing:Umbuchung');
    expect(text).toContain('account Equity:Eroeffnungsbilanz');
    expect(text).not.toMatch(/account (Aktiva|Passiva|Einnahmen|Ausgaben|Eigenkapital|Verrechnung)/);
  });

  it('die Eröffnungsbilanz bucht gegen das Eigenkapital unter der gewählten Wurzel', () => {
    const note = '---\nanfangssaldo_eur: "100,00"\nanfangssaldo_stand_am: 2026-01-01\n---\n';
    const text = formatOpeningBalances(ctx, { 'Konto 01 – Bank.md': note, [`${ctx.ibanToFilename.get('DE1') ?? 'x'}.md`]: note });
    expect(text).toContain('Equity:Eroeffnungsbilanz');
    expect(text).not.toContain('Eigenkapital');
    const plan = parseKontenplan(formatAccounts(ctx, EMPTY_RULES));
    expect([...parseOpeningBalances(text, plan).keys()]).toEqual(['Assets:Bank:Checking']);
  });

  it('Kategorienliste, Aggregation und Budget laufen unter der Wurzel', () => {
    expect(kategorieMapping(ctx.wurzeln)[0]).toEqual(['wohnen', 'Expenses:Wohnen:']);
    const tx = makeTx({ buchungstag: '2026-03-05', betrag: new Money('-50.00') });
    const kategorisierer = () => ({ gegenAccount: 'Expenses:Lebensmittel:Markt', tags: [], ruleName: 'r' });
    const agg = aggregateTransactions([tx], () => true, kategorisierer, { wurzeln: ctx.wurzeln });
    expect(agg.ausgabenGesamt.toString()).toBe('50');
    expect(agg.kategorie.get('lebensmittel')?.toString()).toBe('50');
    const budget = computeBudgetForMonth([tx], 2026, 3, '2026-03-31', kategorisierer, ctx.wurzeln);
    expect(budget.map((b) => b.istEur.toString())).toContain('50');
  });

  it('Gesamtweg: Journal und accounts.ledger des Importers genügen der Ansicht für Saldo und Kategorien', () => {
    const buchungen = [
      makeTx({ buchungstag: '2026-04-01', betrag: new Money('1000.00'), beguenstigter: 'Employer Ltd', rawRowIdx: 1 }),
      makeTx({ buchungstag: '2026-04-02', betrag: new Money('-30.00'), buchungstext: 'ENTGELT', rawRowIdx: 2 }),
    ];
    const rules = { counterparty: [{ pattern: 'employer', ledgerAccount: 'Income:Salary:Employer', tags: [] }], paypal: [] };
    const categorized = categorizeAll(buchungen, { ...input, rules });
    const journal = formatJournal(categorized);
    const plan = parseKontenplan(formatAccounts(ctx, rules));
    const txs = parseLedger(journal);

    const saldos = aggregateAccountSaldos(txs, undefined, plan);
    expect(saldos.map((s) => s.account)).toEqual(['Assets:Bank:Checking']);
    expect(saldos[0]?.saldoEur).toBeCloseTo(970, 2);
    const ausgaben = aggregateCategoryTotals(txs, '', { typ: 'expense', plan });
    expect(ausgaben[0]?.account).toBe('Expenses');
    expect(ausgaben[0]?.totalEur).toBeCloseTo(30, 2);
  });
});

describe('Frei benannte Wurzeln: der Typ kommt allein aus accounts.ledger', () => {
  const FREI = { asset: 'Vermoegen', liability: 'Schulden', income: 'Ertrag', expense: 'Aufwand', equity: 'Kapital', clearing: 'Transit' };
  const ctx = createImporterContext({
    notesPrefix: 'Finance',
    konten: parseKontenConfig({
      konten: [{ id: 'm', iban: 'DE1', ledger_account: 'Vermoegen:Bank:Giro', bank: 'B', konto_typ: 'giro', konto_rolle: 'm', csv_schema: 'x', inhaber: 'Pat Example' }],
      kontowurzeln: FREI,
    }),
  });

  it('Saldo und Kategorien stimmen mit dem Plan und fehlen ohne ihn (die Namen allein verraten nichts)', () => {
    const input = { ctx, rules: EMPTY_RULES, ownerNames: deriveOwnerNames(ctx), signRules: defaultSignRules(ctx.wurzeln) };
    const buchungen = [
      makeTx({ buchungstag: '2026-05-01', betrag: new Money('200.00'), beguenstigter: 'Quelle AG', rawRowIdx: 1 }),
      makeTx({ buchungstag: '2026-05-02', betrag: new Money('-25.00'), buchungstext: 'ENTGELT', rawRowIdx: 2 }),
    ];
    const rules = { counterparty: [{ pattern: 'quelle', ledgerAccount: 'Ertrag:Lohn', tags: [] }], paypal: [] };
    const txs = parseLedger(formatJournal(categorizeAll(buchungen, { ...input, rules })));
    const plan = parseKontenplan(formatAccounts(ctx, rules));

    expect(aggregateAccountSaldos(txs, undefined, plan).map((s) => s.account)).toEqual(['Vermoegen:Bank:Giro']);
    expect(aggregateCategoryTotals(txs, '', { typ: 'expense', plan })[0]?.account).toBe('Aufwand');
    expect(aggregateCategoryTotals(txs, '', { typ: 'income', plan })[0]?.account).toBe('Ertrag');
    // Gegenprobe: ohne Plan bleibt das Konto ohne Typ — der Test kann also rot werden, wenn die Tags fehlen.
    expect(aggregateAccountSaldos(txs)).toEqual([]);
  });
});

describe('Deutscher Standard bleibt unverändert', () => {
  const ctx = bauKontext();
  it('accounts.ledger enthält keine type-Tags und keine englischen Namen', () => {
    const text = formatAccounts(ctx, EMPTY_RULES);
    expect(text).not.toContain('type:');
    expect(text).toContain('account Aktiva:Bank:Giro');
    expect(text).toContain('account Verrechnung:Umbuchung');
    expect(text).toContain('account Eigenkapital:Eroeffnungsbilanz');
  });

  it('die Kategorienliste behält die deutschen Präfixe', () => {
    expect(kategorieMapping(ctx.wurzeln)[0]).toEqual(['wohnen', 'Ausgaben:Wohnen:']);
  });
});
