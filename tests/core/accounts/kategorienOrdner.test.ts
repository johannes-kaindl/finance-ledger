import { describe, expect, it } from 'vitest';
import {
  STANDARD_ORDNER,
  ausgabenKonto,
  leseKategorien,
  normalizeOrdner,
} from '../../../src/core/accounts/kategorienOrdner';
import { DEUTSCHE_WURZELN, normalizeWurzeln } from '../../../src/core/accounts/wurzeln';
import { parseKontenConfig } from '../../../src/core/config/konten';
import { createImporterContext } from '../../../src/core/config/context';
import { kategorieMapping, einmaligPrefix, unkategorisiertPrefix } from '../../../src/core/aggregate/kategorien';

const konto = {
  id: 'a', iban: 'DE1', ledger_account: 'Assets:Bank', bank: 'B', konto_typ: 'giro',
  konto_rolle: 'r', csv_schema: 's', inhaber: 'X',
};

describe('STANDARD_ORDNER', () => {
  it('ist die deutsche Liste in der Vertragsreihenfolge (17 Kategorien)', () => {
    expect(Object.keys(STANDARD_ORDNER)).toHaveLength(17);
    expect(Object.keys(STANDARD_ORDNER)[0]).toBe('wohnen');
    expect(STANDARD_ORDNER.lebensmittel).toBe('Lebensmittel');
    expect(Object.keys(STANDARD_ORDNER).at(-1)).toBe('unkategorisiert');
  });
});

describe('normalizeOrdner', () => {
  it('ergänzt Teilangaben mit dem Standard und behält die Reihenfolge', () => {
    const o = normalizeOrdner({ lebensmittel: 'Groceries' });
    expect(o.lebensmittel).toBe('Groceries');
    expect(o.wohnen).toBe('Wohnen');
    expect(Object.keys(o)).toEqual(Object.keys(STANDARD_ORDNER));
    expect(normalizeOrdner()).toEqual(STANDARD_ORDNER);
  });

  it('verwirft Unbrauchbares und fällt auf den Standard zurück', () => {
    const o = normalizeOrdner({ wohnen: 'A:B', steuern: '', freizeit: ' Fun', gesundheit: 3, spende: 'Giving' });
    expect(o.wohnen).toBe('Wohnen');
    expect(o.steuern).toBe('Steuern');
    expect(o.freizeit).toBe('Freizeit');
    expect(o.gesundheit).toBe('Gesundheit');
    expect(o.spende).toBe('Giving');
  });
});

describe('ausgabenKonto', () => {
  it('stellt eine Kategorie samt Unterkonto unter die Ausgaben-Wurzel', () => {
    const w = normalizeWurzeln({ expense: 'Expenses' });
    const o = normalizeOrdner({ bankgebuehren: 'Bank_Fees' });
    expect(ausgabenKonto(w, o, 'bankgebuehren', 'Entgelt')).toBe('Expenses:Bank_Fees:Entgelt');
    expect(ausgabenKonto(DEUTSCHE_WURZELN, STANDARD_ORDNER, 'bankgebuehren', 'Entgelt')).toBe('Ausgaben:Bankgebuehren:Entgelt');
    expect(ausgabenKonto(DEUTSCHE_WURZELN, STANDARD_ORDNER, 'wohnen')).toBe('Ausgaben:Wohnen');
  });
});

describe('konten.yaml: kategorien', () => {
  it('liest eine Zuordnung Suffix → Ordnername', () => {
    const cfg = parseKontenConfig({ konten: [konto], kategorien: { lebensmittel: 'Groceries', wohnen: 'Housing' } });
    expect(cfg.kategorien).toEqual({ lebensmittel: 'Groceries', wohnen: 'Housing' });
  });

  it('ohne den Schlüssel gibt es keine Kategorien-Angabe', () => {
    expect(parseKontenConfig({ konten: [konto] }).kategorien).toBeUndefined();
  });

  it('meldet unbekannte Suffixe, unbrauchbare Namen, Nicht-Zuordnungen und doppelte Ordner auf einmal', () => {
    expect(() => parseKontenConfig({ konten: [konto], kategorien: { essen: 'Food' } })).toThrow(/kategorien\.essen: unbekannter Schlüssel/);
    expect(() => parseKontenConfig({ konten: [konto], kategorien: { wohnen: 'A:B' } })).toThrow(/einzelner Ordnername/);
    expect(() => parseKontenConfig({ konten: [konto], kategorien: 'x' })).toThrow(/Zuordnung/);
    expect(() => parseKontenConfig({ konten: [konto], kategorien: { wohnen: 'Home', freizeit: 'Home' } })).toThrow(/mehrfach/);
    expect(() => parseKontenConfig({ konten: [konto], kategorien: { wohnen: 'Freizeit' } })).toThrow(/mehrfach/);
  });

  it('leseKategorien ohne Angabe liefert nichts', () => {
    expect(leseKategorien(undefined)).toBeUndefined();
    expect(leseKategorien(null)).toBeUndefined();
  });
});

describe('Kontext und Kategorienliste', () => {
  it('der Kontext trägt die vollständige Liste, Standard deutsch', () => {
    const ctx = createImporterContext({ notesPrefix: 'F', konten: parseKontenConfig({ konten: [konto] }) });
    expect(ctx.ordner).toEqual(STANDARD_ORDNER);
  });

  it('der Kontext übernimmt kategorien aus konten.yaml', () => {
    const ctx = createImporterContext({
      notesPrefix: 'F',
      konten: parseKontenConfig({ konten: [konto], kategorien: { lebensmittel: 'Groceries' } }),
    });
    expect(ctx.ordner.lebensmittel).toBe('Groceries');
    expect(ctx.ordner.wohnen).toBe('Wohnen');
  });

  it('kategorieMapping, Einmalig- und Auffang-Präfix folgen den Ordnern; der Suffix bleibt', () => {
    const w = normalizeWurzeln({ expense: 'Expenses' });
    const o = normalizeOrdner({ lebensmittel: 'Groceries', sonstiges: 'Misc', unkategorisiert: 'Uncategorized' });
    const m = kategorieMapping(w, o);
    expect(m).toContainEqual(['lebensmittel', 'Expenses:Groceries:']);
    expect(m.map(([s]) => s)).toEqual(Object.keys(STANDARD_ORDNER));
    expect(einmaligPrefix(w, o)).toBe('Expenses:Misc:Einmalig:');
    expect(unkategorisiertPrefix(w, o)).toBe('Expenses:Uncategorized:');
    expect(kategorieMapping()[0]).toEqual(['wohnen', 'Ausgaben:Wohnen:']);
  });
});
