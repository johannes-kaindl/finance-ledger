/**
 * Budget-Schicht: Soll / Ist / Prognose / Diff / Ampel je Ausgaben-Kategorie und Monat (Etappe E4 des
 * Importer-Ports, portiert aus `output/budget.py`).
 *
 * - Nur Ausgaben-Kategorien.
 * - Soll = Durchschnitt der letzten bis zu 12 Monate mit Buchungen (bei weniger Monaten alle, der Aufrufer
 *   zeigt dann einen Vorbehalt anhand von `sampleMonths`).
 * - Prognose = lineare Hochrechnung des laufenden Monats: `ist * tageImMonat / tageBisher`.
 * - Ampel: unter 90 % des Soll grün, bis 110 % gelb, darüber rot.
 *
 * Rein: „heute“ kommt als Parameter herein.
 */

import { daysInMonth, splitIsoDate, type IsoDate } from "../dates";
import type { BankTransaction } from "../import/transaction";
import { Money, type MoneyValue, ZERO } from "../money";
import { type Categorizer, zweiStellen } from "./aggregate";
import { KATEGORIE_MAPPING } from "./kategorien";

export const AMPEL_GRUEN_SCHWELLE: MoneyValue = new Money("0.90");
export const AMPEL_ROT_SCHWELLE: MoneyValue = new Money("1.10");

export type Ampel = "🟢" | "🟡" | "🔴" | "—";

export interface BudgetState {
	kategorie: string;
	sollEur: MoneyValue;
	istEur: MoneyValue;
	prognoseEur: MoneyValue;
	diffEur: MoneyValue;
	ampel: Ampel;
	/** Zahl der Monate im Soll-Durchschnitt — unter 12 löst den Vorbehalt aus. */
	sampleMonths: number;
}

function ampelFor(ratio: MoneyValue): Ampel {
	if (ratio.lt(AMPEL_GRUEN_SCHWELLE)) return "🟢";
	if (ratio.lte(AMPEL_ROT_SCHWELLE)) return "🟡";
	return "🔴";
}

/** Volumen je Monat (`YYYY-MM`) für ein Konto-Präfix; Selbstüberweisungen zählen nicht. */
function kategorieMonatlich(
	transactions: readonly BankTransaction[],
	prefix: string,
	categorizer: Categorizer,
): Map<string, MoneyValue> {
	const agg = new Map<string, MoneyValue>();
	for (const tx of transactions) {
		const r = categorizer(tx);
		if (r.tags.includes("self-transfer")) continue;
		if (!r.gegenAccount.startsWith(prefix)) continue;
		const key = tx.buchungstag.slice(0, 7);
		agg.set(key, (agg.get(key) ?? ZERO).plus(tx.betrag.neg()));
	}
	const out = new Map<string, MoneyValue>();
	for (const [k, v] of agg) out.set(k, zweiStellen(v));
	return out;
}

function sollAusMonaten(monatlich: ReadonlyMap<string, MoneyValue>): { avg: MoneyValue; samples: number } {
	if (monatlich.size === 0) return { avg: ZERO, samples: 0 };
	// Die letzten 12 Monate (oder weniger), neueste zuerst.
	const sample = [...monatlich.keys()].sort().reverse().slice(0, 12);
	const summe = sample.reduce((acc, k) => acc.plus(monatlich.get(k) ?? ZERO), ZERO);
	return { avg: zweiStellen(summe.div(sample.length)), samples: sample.length };
}

/** 12-Monats-Durchschnitt einer Kategorie und die Zahl der Monate, über die er gebildet wurde. */
export function computeBudgetAvgSoll(
	transactions: readonly BankTransaction[],
	prefix: string,
	categorizer: Categorizer,
): { avg: MoneyValue; samples: number } {
	return sollAusMonaten(kategorieMonatlich(transactions, prefix, categorizer));
}

/** Titel-Schreibweise des Suffixes (`online_shopping` → `Online Shopping`), wie Pythons `str.title()`. */
function kategorieName(suffix: string): string {
	return suffix.replace(/_/g, " ").replace(/\S+/g, (w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase());
}

/**
 * Das Budget aller Ausgaben-Kategorien für einen Monat, absteigend nach Ist. `today` bestimmt, wie weit der
 * Monat „gelaufen“ ist: ein vergangener Monat ist voll gelaufen (Prognose = Ist), ein künftiger noch nicht
 * begonnen.
 */
export function computeBudgetForMonth(
	transactions: readonly BankTransaction[],
	year: number,
	month: number,
	today: IsoDate,
	categorizer: Categorizer,
): BudgetState[] {
	const tageImMonat = daysInMonth(year, month);
	const t = splitIsoDate(today);
	let tageBisher: number;
	if (t.year === year && t.month === month) tageBisher = t.day;
	else if (t.year * 12 + t.month > year * 12 + month) tageBisher = tageImMonat;
	else tageBisher = 0;

	const key = `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}`;
	const results: BudgetState[] = [];
	for (const [suffix, prefix] of KATEGORIE_MAPPING) {
		if (!prefix.startsWith("Ausgaben:")) continue;
		const monatlich = kategorieMonatlich(transactions, prefix, categorizer);
		const { avg: soll, samples } = sollAusMonaten(monatlich);
		const ist = monatlich.get(key) ?? ZERO;

		if (soll.isZero() && ist.isZero()) continue;

		const prognose =
			tageBisher > 0 && tageBisher < tageImMonat
				? zweiStellen(ist.times(tageImMonat).div(tageBisher))
				: ist;
		const ratio = soll.gt(0) ? ist.div(soll) : ZERO;
		results.push({
			kategorie: kategorieName(suffix),
			sollEur: soll,
			istEur: ist,
			prognoseEur: prognose,
			diffEur: zweiStellen(ist.minus(soll)),
			ampel: soll.gt(0) ? ampelFor(ratio) : "—",
			sampleMonths: samples,
		});
	}
	results.sort((a, b) => b.istEur.cmp(a.istEur));
	return results;
}
