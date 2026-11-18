/**
 * Kontotyp eines Kontos: Vermögen, Schuld, Einnahme, Ausgabe, Eigenkapital.
 *
 * Der Typ ist eine Eigenschaft des Kontos, nicht seines Namens. Quelle ist der Kontenplan
 * (`accounts.ledger`): eine `account`-Direktive trägt den Typ als hledger-Tag (`; type: A`). Fehlt der
 * Eintrag, fällt die Auflösung auf die Wurzel des Namens zurück (deutsch wie bisher, dazu die englischen
 * hledger-Namen). Ein Kontenplan ohne Tags verhält sich daher wie vor dieser Funktion.
 *
 * obsidian-frei: lebt im Kern und läuft in Node.
 */

export type KontoTyp = 'asset' | 'liability' | 'income' | 'expense' | 'equity';

/** Typ je Konto-Name aus den `account`-Direktiven; ein Eintrag gilt auch für alle Unterkonten. */
export interface Kontenplan {
  readonly typen: ReadonlyMap<string, KontoTyp>;
}

export const KEIN_KONTENPLAN: Kontenplan = { typen: new Map() };

/** Wurzelsegment → Typ, wenn der Kontenplan nichts sagt. Deutsch zuerst: das ist der gewachsene Bestand. */
const WURZEL_TYP: ReadonlyMap<string, KontoTyp> = new Map<string, KontoTyp>([
  ['Aktiva', 'asset'],
  ['Passiva', 'liability'],
  ['Einnahmen', 'income'],
  ['Ausgaben', 'expense'],
  ['Eigenkapital', 'equity'],
  ['Assets', 'asset'],
  ['Liabilities', 'liability'],
  ['Income', 'income'],
  ['Revenues', 'income'],
  ['Expenses', 'expense'],
  ['Equity', 'equity'],
]);

/** hledger-Typwerte (Kürzel und Langform, ohne Groß-/Kleinschreibung) → Typ. `C` (Cash) ist ein Vermögenskonto. */
const TAG_TYP: ReadonlyMap<string, KontoTyp> = new Map<string, KontoTyp>([
  ['a', 'asset'],
  ['asset', 'asset'],
  ['c', 'asset'],
  ['cash', 'asset'],
  ['l', 'liability'],
  ['liability', 'liability'],
  ['e', 'equity'],
  ['equity', 'equity'],
  ['r', 'income'],
  ['revenue', 'income'],
  ['x', 'expense'],
  ['expense', 'expense'],
]);

/** Liest die `account`-Direktiven mit `type:`-Tag aus dem Text einer `accounts.ledger`. */
export function parseKontenplan(text: string): Kontenplan {
  const typen = new Map<string, KontoTyp>();
  for (const roh of text.split(/\r?\n/)) {
    const zeile = roh.trim();
    if (!zeile.startsWith('account ')) continue;
    const semikolon = zeile.indexOf(';');
    if (semikolon < 0) continue;
    const name = zeile.slice('account '.length, semikolon).split(/\s{2,}|\t/)[0]?.trim() ?? '';
    if (name === '') continue;
    const tag = /(?:^|[\s,;])type:\s*([A-Za-z]+)/.exec(zeile.slice(semikolon + 1));
    const typ = tag ? TAG_TYP.get((tag[1] ?? '').toLowerCase()) : undefined;
    if (typ) typen.set(name, typ);
  }
  return { typen };
}

/** Typ eines Kontos: Eintrag im Kontenplan (genauestes Konto oder Vorfahre), sonst die Wurzel des Namens. */
export function kontoTyp(konto: string, plan: Kontenplan = KEIN_KONTENPLAN): KontoTyp | undefined {
  if (plan.typen.size > 0) {
    const teile = konto.split(':');
    for (let n = teile.length; n >= 1; n--) {
      const typ = plan.typen.get(teile.slice(0, n).join(':'));
      if (typ) return typ;
    }
  }
  const doppelpunkt = konto.indexOf(':');
  if (doppelpunkt < 0) return undefined;
  return WURZEL_TYP.get(konto.slice(0, doppelpunkt));
}

export function istKontoTyp(konto: string, typ: KontoTyp, plan: Kontenplan = KEIN_KONTENPLAN): boolean {
  return kontoTyp(konto, plan) === typ;
}
