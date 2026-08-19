import { it, expect, describe } from 'vitest';
import {
  moneyCtx,
  flowCtxFromSign,
  formatMoneyAmount,
  type MoneyDisplay,
} from '../../src/views/helpers';

// hledger-Rohvorzeichen: Einnahmen negativ, Ausgaben positiv.
const INCOME_RAW = -2500; // Einnahmen:Gehalt
const EXPENSE_RAW = 900; // Ausgaben:Miete
const ASSET_RAW = 1200; // Aktiva:Giro (positiver Bestand)
const DEBT_RAW = -5000; // Passiva:Kredit (negativer Bestand)

const d = (
  signMode: MoneyDisplay['signMode'],
  colorScheme: MoneyDisplay['colorScheme'],
): MoneyDisplay => ({ signMode, colorScheme });

describe('moneyCtx — Konto-Typ zu Fluss/Saldo-Kontext', () => {
  it('bildet Einnahmen auf income ab', () => {
    expect(moneyCtx('Einnahmen:Gehalt')).toBe('income');
  });
  it('bildet Ausgaben auf expense ab', () => {
    expect(moneyCtx('Ausgaben:Miete')).toBe('expense');
  });
  it('bildet Aktiva/Passiva/Eigenkapital auf balance ab', () => {
    expect(moneyCtx('Aktiva:Giro')).toBe('balance');
    expect(moneyCtx('Passiva:Kredit')).toBe('balance');
    expect(moneyCtx('Eigenkapital:Startkapital')).toBe('balance');
  });
  it('bildet unbekannte Konten sicher auf balance ab', () => {
    expect(moneyCtx('Sonstiges:Foo')).toBe('balance');
  });
});

describe('flowCtxFromSign — TBC-Edge: Fluss aus Roh-Vorzeichen', () => {
  it('positiver Rohbetrag ist eine Ausgabe', () => {
    expect(flowCtxFromSign(900)).toBe('expense');
  });
  it('negativer Rohbetrag ist eine Einnahme', () => {
    expect(flowCtxFromSign(-2500)).toBe('income');
  });
});

describe('formatMoneyAmount — Vorzeichen (Zahl)', () => {
  it('intuitiv: Einnahme wird positiv angezeigt', () => {
    expect(formatMoneyAmount(INCOME_RAW, 'income', d('intuitive', 'classic')).text).toMatch(/^\+/);
  });
  it('intuitiv: Ausgabe wird negativ angezeigt', () => {
    expect(formatMoneyAmount(EXPENSE_RAW, 'expense', d('intuitive', 'classic')).text).toMatch(/^-/);
  });
  it('buchhalterisch: Einnahme bleibt negativ (roh)', () => {
    expect(formatMoneyAmount(INCOME_RAW, 'income', d('accounting', 'classic')).text).toMatch(/^-/);
  });
  it('buchhalterisch: Ausgabe bleibt positiv (roh)', () => {
    expect(formatMoneyAmount(EXPENSE_RAW, 'expense', d('accounting', 'classic')).text).toMatch(/^\+/);
  });
  it('Saldo ignoriert signMode (immer roh)', () => {
    expect(formatMoneyAmount(ASSET_RAW, 'balance', d('intuitive', 'classic')).text).not.toMatch(/^[+-]/);
    expect(formatMoneyAmount(ASSET_RAW, 'balance', d('accounting', 'classic')).text).not.toMatch(/^[+-]/);
    expect(formatMoneyAmount(DEBT_RAW, 'balance', d('intuitive', 'classic')).text).toMatch(/^-/);
  });
});

describe('formatMoneyAmount — Farbe (tone), orthogonal zum Vorzeichen', () => {
  it('classic: Einnahme grün, Ausgabe rot — unabhängig vom signMode', () => {
    expect(formatMoneyAmount(INCOME_RAW, 'income', d('intuitive', 'classic')).tone).toBe('good');
    expect(formatMoneyAmount(INCOME_RAW, 'income', d('accounting', 'classic')).tone).toBe('good');
    expect(formatMoneyAmount(EXPENSE_RAW, 'expense', d('intuitive', 'classic')).tone).toBe('bad');
    expect(formatMoneyAmount(EXPENSE_RAW, 'expense', d('accounting', 'classic')).tone).toBe('bad');
  });
  it('inverted: Einnahme rot, Ausgabe grün', () => {
    expect(formatMoneyAmount(INCOME_RAW, 'income', d('intuitive', 'inverted')).tone).toBe('bad');
    expect(formatMoneyAmount(EXPENSE_RAW, 'expense', d('intuitive', 'inverted')).tone).toBe('good');
  });
  it('monochrome: alle Beträge neutral (auch Saldo)', () => {
    expect(formatMoneyAmount(INCOME_RAW, 'income', d('intuitive', 'monochrome')).tone).toBe('muted');
    expect(formatMoneyAmount(EXPENSE_RAW, 'expense', d('intuitive', 'monochrome')).tone).toBe('muted');
    expect(formatMoneyAmount(ASSET_RAW, 'balance', d('intuitive', 'monochrome')).tone).toBe('muted');
    expect(formatMoneyAmount(DEBT_RAW, 'balance', d('intuitive', 'monochrome')).tone).toBe('muted');
  });
  it('balance classic: positiv grün, negativ rot', () => {
    expect(formatMoneyAmount(ASSET_RAW, 'balance', d('intuitive', 'classic')).tone).toBe('good');
    expect(formatMoneyAmount(DEBT_RAW, 'balance', d('intuitive', 'classic')).tone).toBe('bad');
  });
  it('Null ist immer zero-tone, ohne Vorzeichen', () => {
    const income0 = formatMoneyAmount(0, 'income', d('intuitive', 'classic'));
    expect(income0.tone).toBe('zero');
    expect(income0.text).not.toMatch(/^[+-]/);
    expect(formatMoneyAmount(0, 'balance', d('intuitive', 'classic')).tone).toBe('zero');
  });
});
