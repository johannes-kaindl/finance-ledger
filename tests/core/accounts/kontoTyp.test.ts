import { describe, expect, it } from 'vitest';
import {
  KEIN_KONTENPLAN,
  istKontoTyp,
  kontoTyp,
  parseKontenplan,
} from '../../../src/core/accounts/kontoTyp';

describe('kontoTyp ohne Kontenplan (Rückfall auf das Präfix)', () => {
  it('liest die deutschen Wurzeln wie bisher', () => {
    expect(kontoTyp('Aktiva:Bank:Giro')).toBe('asset');
    expect(kontoTyp('Passiva:Hypothek')).toBe('liability');
    expect(kontoTyp('Einnahmen:Gehalt')).toBe('income');
    expect(kontoTyp('Ausgaben:Wohnen:Miete')).toBe('expense');
    expect(kontoTyp('Eigenkapital:Eroeffnungsbilanz')).toBe('equity');
  });

  it('lässt Unbekanntes und Verrechnungskonten ohne Typ', () => {
    expect(kontoTyp('Verrechnung:Umbuchung')).toBeUndefined();
    expect(kontoTyp('')).toBeUndefined();
  });

  it('verlangt wie bisher den Doppelpunkt hinter der Wurzel', () => {
    expect(kontoTyp('Aktiva')).toBeUndefined();
    expect(kontoTyp('AktivaBank:Giro')).toBeUndefined();
    expect(kontoTyp('aktiva:Bank')).toBeUndefined();
  });

  it('kennt auch die englischen hledger-Namen', () => {
    expect(kontoTyp('Assets:Bank:Checking')).toBe('asset');
    expect(kontoTyp('Liabilities:Mortgage')).toBe('liability');
    expect(kontoTyp('Income:Salary')).toBe('income');
    expect(kontoTyp('Revenues:Salary')).toBe('income');
    expect(kontoTyp('Expenses:Groceries:Northwind')).toBe('expense');
    expect(kontoTyp('Equity:Opening')).toBe('equity');
  });
});

describe('parseKontenplan', () => {
  it('liest type-Tags in hledger-Schreibweise (Kürzel und Langform)', () => {
    const plan = parseKontenplan(
      [
        '; Generated',
        'account Konto:Giro  ; type: A',
        'account Konto:Kredit  ; type:Liability',
        'account Konto:Lohn  ; type:R',
        'account Konto:Essen  ; note, type:X',
        'account Konto:Start  ; type: E',
        'account Konto:Bargeld  ; type: C',
        '',
      ].join('\n'),
    );
    expect(kontoTyp('Konto:Giro', plan)).toBe('asset');
    expect(kontoTyp('Konto:Kredit', plan)).toBe('liability');
    expect(kontoTyp('Konto:Lohn', plan)).toBe('income');
    expect(kontoTyp('Konto:Essen', plan)).toBe('expense');
    expect(kontoTyp('Konto:Start', plan)).toBe('equity');
    expect(kontoTyp('Konto:Bargeld', plan)).toBe('asset');
  });

  it('vererbt den Typ vom nächsten Vorfahren mit Eintrag, das genauere Konto gewinnt', () => {
    const plan = parseKontenplan(
      ['account Haben  ; type: A', 'account Haben:Schulden  ; type: L'].join('\n'),
    );
    expect(kontoTyp('Haben:Bank:Giro', plan)).toBe('asset');
    expect(kontoTyp('Haben:Schulden:Auto', plan)).toBe('liability');
  });

  it('lässt der Direktive den Vorrang vor dem Namen', () => {
    const plan = parseKontenplan('account Ausgaben:Sparen  ; type: A\n');
    expect(kontoTyp('Ausgaben:Sparen:Depot', plan)).toBe('asset');
    expect(kontoTyp('Ausgaben:Wohnen', plan)).toBe('expense');
  });

  it('ignoriert Direktiven ohne Tag, Kommentare, unbekannte Werte und CRLF', () => {
    const plan = parseKontenplan(
      ['account Aktiva:Bank', '; account X  ; type: A', 'account Y  ; type: Q', 'account Z  ; type: A\r'].join(
        '\r\n',
      ),
    );
    expect(kontoTyp('Aktiva:Bank', plan)).toBe('asset');
    expect(kontoTyp('X', plan)).toBeUndefined();
    expect(kontoTyp('Y:Sub', plan)).toBeUndefined();
    expect(kontoTyp('Z', plan)).toBe('asset');
  });

  it('nimmt einen Konto-Namen mit Leerzeichen bis zum Zwischenraum aus zwei Leerzeichen', () => {
    const plan = parseKontenplan('account Konto:Mein Giro  ; type: A\n');
    expect(kontoTyp('Konto:Mein Giro', plan)).toBe('asset');
  });

  it('ein leerer Plan verhält sich wie KEIN_KONTENPLAN', () => {
    expect(kontoTyp('Aktiva:X', parseKontenplan(''))).toBe(kontoTyp('Aktiva:X', KEIN_KONTENPLAN));
  });
});

describe('istKontoTyp', () => {
  it('prüft Typ und Konto in einem Aufruf', () => {
    expect(istKontoTyp('Aktiva:Bank', 'asset')).toBe(true);
    expect(istKontoTyp('Aktiva:Bank', 'expense')).toBe(false);
    expect(istKontoTyp('Assets:Bank', 'asset')).toBe(true);
  });
});
