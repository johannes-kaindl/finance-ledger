/**
 * Geld-Arithmetik für den Importer-Kern.
 *
 * Der Python-Importer rechnet durchgängig mit `Decimal` und `ROUND_HALF_UP`.
 * `decimal.js` bildet beides exakt ab: sein `ROUND_HALF_UP` rundet bei
 * Gleichstand **weg von der Null** — identisch zu Python, anders als
 * `Math.round`, das `-0.5` auf `-0` zieht. Bei überwiegend negativen Beträgen
 * ist genau das die Fehlerklasse, die still danebenliegt.
 *
 * Die Rundung wird hier auf einem eigenen Constructor konfiguriert statt global,
 * damit fremder Code (oder ein späterer Import) die Einstellung nicht umbiegt.
 */

import DecimalJS from "decimal.js";

/** Decimal-Constructor mit ROUND_HALF_UP — der einzige, den der Kern benutzt. */
export const Money = DecimalJS.clone({ rounding: DecimalJS.ROUND_HALF_UP });

export type MoneyValue = InstanceType<typeof Money>;

/** Nachkommastellen aller Geldbeträge (EUR-Cent). */
export const MONEY_SCALE = 2;

export const ZERO: MoneyValue = new Money(0);

/**
 * Deutsche Zahldarstellung → Money. `'-39,95'` → `-39.95`,
 * `'1.307,60'` → `1307.60`.
 *
 * Punkte sind Tausendertrenner und fallen weg, das Komma wird zum Dezimalpunkt.
 * Ein `+`-Vorzeichen und umschließende Leerzeichen sind erlaubt, alles andere
 * ist ein Datenfehler und wirft — ein still auf `NaN` laufender Betrag würde
 * sich sonst durch die gesamte Aggregation ziehen.
 */
export function parseGermanDecimal(raw: string): MoneyValue {
	const cleaned = raw.trim().replace(/\./g, "").replace(",", ".");
	if (cleaned === "") {
		throw new Error("Leerer Betrag");
	}
	let value: MoneyValue;
	try {
		value = new Money(cleaned);
	} catch {
		// decimal.js meldet nur den bereinigten Wert ("kA" statt "k.A.") — für die
		// Diagnose am Datensatz zählt aber, was wirklich in der Zelle stand.
		throw new Error(`Betrag nicht lesbar: ${JSON.stringify(raw)}`);
	}
	if (!value.isFinite()) {
		throw new Error(`Betrag nicht lesbar: ${JSON.stringify(raw)}`);
	}
	return value;
}

/**
 * Money → Journal-Darstellung mit **Punkt** als Dezimaltrenner
 * (hledger-Standard, siehe AGENTS.md → Dezimaltrenner): `-39.95`.
 */
export function formatJournalAmount(value: MoneyValue): string {
	return value.toFixed(MONEY_SCALE);
}

/**
 * Money → deutsche Anzeige ohne Währungszeichen: `-1.234,56`.
 *
 * Bewusst von `formatJournalAmount` getrennt: formatierte und rohe Zahlen
 * bleiben im gesamten Kern zwei verschiedene Dinge (apple-health-Muster) —
 * das Journal braucht `1234.56`, die Notiz `1.234,56 €`.
 */
export function formatGermanAmount(value: MoneyValue): string {
	const fixed = value.toFixed(MONEY_SCALE);
	const negative = fixed.startsWith("-");
	const [intPart, fracPart] = (negative ? fixed.slice(1) : fixed).split(".");
	const grouped = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
	return `${negative ? "-" : ""}${grouped},${fracPart}`;
}

/** Money → deutsche Anzeige mit Währung: `-1.234,56 €`. */
export function formatGermanEuro(value: MoneyValue): string {
	return `${formatGermanAmount(value)} €`;
}

/** Summe einer Liste — leere Liste ergibt 0, nicht `undefined`. */
export function sumMoney(values: readonly MoneyValue[]): MoneyValue {
	return values.reduce<MoneyValue>((acc, v) => acc.plus(v), new Money(0));
}

/**
 * Auf Cent runden (ROUND_HALF_UP). Nötig überall dort, wo eine Division im
 * Spiel war — Median, Sparquote, Budget-Prognose.
 */
export function roundToCents(value: MoneyValue): MoneyValue {
	return value.toDecimalPlaces(MONEY_SCALE);
}
