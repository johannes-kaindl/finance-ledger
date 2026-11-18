import { describe, expect, it } from 'vitest';
import {
  DEUTSCHE_WURZELN,
  kontenplanAusWurzeln,
  normalizeWurzeln,
  wurzelDirektiven,
} from '../../../src/core/accounts/wurzeln';
import { kontoTyp, parseKontenplan } from '../../../src/core/accounts/kontoTyp';
import { parseKontenConfig } from '../../../src/core/config/konten';

describe('normalizeWurzeln', () => {
  it('ergänzt Teilangaben mit dem deutschen Standard', () => {
    expect(normalizeWurzeln({ asset: 'Assets' })).toEqual({ ...DEUTSCHE_WURZELN, asset: 'Assets' });
    expect(normalizeWurzeln()).toEqual(DEUTSCHE_WURZELN);
  });

  it('verwirft Unbrauchbares und fällt auf den Standard zurück', () => {
    const w = normalizeWurzeln({ asset: 'A:B', expense: '', income: ' Lohn', equity: 3, liability: 'Debt' });
    expect(w.asset).toBe('Aktiva');
    expect(w.expense).toBe('Ausgaben');
    expect(w.income).toBe('Einnahmen');
    expect(w.equity).toBe('Eigenkapital');
    expect(w.liability).toBe('Debt');
  });

  it('eine Wurzel ist ein einzelnes Segment (Leerzeichen erlaubt, Doppelpunkt und Semikolon nicht)', () => {
    expect(normalizeWurzeln({ asset: 'Mein Vermögen' }).asset).toBe('Mein Vermögen');
    expect(normalizeWurzeln({ asset: 'x; type: A' }).asset).toBe('Aktiva');
  });
});

describe('wurzelDirektiven', () => {
  it('ist beim deutschen Standard leer (accounts.ledger bleibt unverändert)', () => {
    expect(wurzelDirektiven(DEUTSCHE_WURZELN)).toEqual([]);
  });

  it('schreibt nur die abweichenden Wurzeln, und sie lassen sich zurücklesen', () => {
    const w = normalizeWurzeln({ asset: 'Vermoegen', expense: 'Spending' });
    const zeilen = wurzelDirektiven(w);
    expect(zeilen).toEqual(['account Vermoegen  ; type: A', 'account Spending  ; type: X']);
    const plan = parseKontenplan(zeilen.join('\n'));
    expect(kontoTyp('Vermoegen:Bank:Giro', plan)).toBe('asset');
    expect(kontoTyp('Spending:Food', plan)).toBe('expense');
  });
});

describe('kontenplanAusWurzeln', () => {
  it('bildet jede Wurzel auf ihren Typ ab, das Durchlaufkonto hat keinen', () => {
    const w = normalizeWurzeln({ income: 'Revenue', clearing: 'Transit' });
    const plan = kontenplanAusWurzeln(w);
    expect(kontoTyp('Revenue:Salary', plan)).toBe('income');
    expect(kontoTyp('Transit:Umbuchung', plan)).toBeUndefined();
  });
});

describe('konten.yaml: kontowurzeln', () => {
  const konto = {
    id: 'a', iban: 'DE1', ledger_account: 'Assets:Bank', bank: 'B', konto_typ: 'giro',
    konto_rolle: 'r', csv_schema: 's', inhaber: 'X',
  };

  it('liest eine Zuordnung', () => {
    const cfg = parseKontenConfig({ konten: [konto], kontowurzeln: { asset: 'Assets', expense: 'Expenses' } });
    expect(cfg.wurzeln).toEqual({ asset: 'Assets', expense: 'Expenses' });
  });

  it('ohne den Schlüssel gibt es keine Wurzel-Angabe', () => {
    expect(parseKontenConfig({ konten: [konto] }).wurzeln).toBeUndefined();
  });

  it('meldet unbekannte Schlüssel und unbrauchbare Namen', () => {
    expect(() => parseKontenConfig({ konten: [konto], kontowurzeln: { assets: 'A' } })).toThrow(/unbekannter Schlüssel/);
    expect(() => parseKontenConfig({ konten: [konto], kontowurzeln: { asset: 'A:B' } })).toThrow(/einzelner Kontoname/);
    expect(() => parseKontenConfig({ konten: [konto], kontowurzeln: 'x' })).toThrow(/Zuordnung/);
  });
});
