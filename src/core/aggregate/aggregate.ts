/**
 * Aggregations-Kern der Berichte (Etappe E4 des Importer-Ports, portiert aus `output/aggregat_base.py`).
 *
 * Rein: keine Dateien, kein Vault, keine Uhr. Der Categorizer kommt als Funktion herein (wie `_categorizer`
 * im Python-Original), die Konto-Klassen (privat/Vermietung) als IBAN-Parameter — dort stand ein
 * Modul-Global, das beim Import `konten.yaml` las.
 *
 * Geld ist `Money` (decimal.js, ROUND_HALF_UP wie Pythons `Decimal`); die Sparquote ist wie im Original ein
 * Float, auf eine Nachkommastelle gerundet (siehe `rundeEineStelle`).
 */

import type { ImporterContext } from "../config/context";
import type { CategorizationResult } from "../import/categorize";
import type { BankTransaction } from "../import/transaction";
import { formatGermanEuro, type MoneyValue, ZERO } from "../money";
import { kategorieWikilink } from "../notes/wikilinks";
import { EINMALIG_PREFIX, FIX_FELDER, KATEGORIE_MAPPING } from "./kategorien";

export type Categorizer = (tx: BankTransaction) => CategorizationResult;

/** Aggregat einer Sicht (gesamt / privat / Vermietung). */
export interface SichtAggregat {
	ausgabenGesamt: MoneyValue;
	einnahmenGesamt: MoneyValue;
	saldo: MoneyValue;
	sparquoteProzent: number;
	/** Je Kategorie-Suffix, plus die berechneten `fix` und `variabel`. */
	kategorie: ReadonlyMap<string, MoneyValue>;
	einnahmenDetails: ReadonlyMap<string, MoneyValue>;
	/** Nur gesetzt, wenn es Einmal-Ausgaben gab. */
	ausgabenEinmalig: MoneyValue | null;
}

/** Auf Cent runden (ROUND_HALF_UP, bei Gleichstand weg von der Null). */
export function zweiStellen(v: MoneyValue): MoneyValue {
	return v.toDecimalPlaces(2);
}

export interface AggregateOptions {
	/** IBAN der Konto-Klasse, die ausgeschlossen wird (Sicht „privat“). */
	excludeIban?: string;
	/** IBAN der Konto-Klasse, die allein zählt (Sicht „Vermietung“). */
	onlyIban?: string;
}

/**
 * Pythons `round(x, 1)` auf einem Float: Gleichstand geht auf die gerade Ziffer, und ob es ein Gleichstand
 * ist, entscheidet der EXAKTE Wert des Floats (0.35 ist keiner, 12.25 schon). `toFixed` rechnet auf dem
 * exakten Wert, rundet aber bei echtem Gleichstand nach oben — den Fall fängt die Prüfung der
 * Nachkommastellen ab.
 */
function rundeEineStelle(x: number): number {
	const exakt = Math.abs(x).toFixed(40);
	const [ganz, nachKomma] = exakt.split(".");
	const gleichstand = nachKomma[1] === "5" && /^0*$/.test(nachKomma.slice(2));
	if (!gleichstand) return Number(x.toFixed(1));
	const zehntel = BigInt(ganz + nachKomma[0]);
	const gerade = zehntel % 2n === 0n ? zehntel : zehntel + 1n;
	return (Math.sign(x) * Number(gerade)) / 10;
}

/**
 * Pythons `f"{x:.1f}"`: eine Nachkommastelle, Gleichstand zur geraden Ziffer, `-0.0` bleibt `-0.0`
 * (`Number#toFixed` rundet einen echten Gleichstand nach oben und schreibt `-0` als `0.0`).
 */
function formatFixed1(x: number): string {
	const r = rundeEineStelle(x);
	return Object.is(r, -0) ? "-0.0" : r.toFixed(1);
}

/** Pythons `repr(float)` für einen auf eine Stelle gerundeten Wert: `100` wird `100.0`, `-0` wird `-0.0`. */
function pyFloatRepr(x: number): string {
	if (Object.is(x, -0)) return "-0.0";
	return Number.isInteger(x) ? x.toFixed(1) : String(x);
}

/** Die Sparquote, wie Python sie in die Frontmatter schreibt (`repr` des Floats: `100.0`, `12.5`, `-0.0`). */
export function sparquoteFrontmatter(agg: SichtAggregat): string {
	return pyFloatRepr(agg.sparquoteProzent);
}

/**
 * Aggregiert die Buchungen einer Periode zu einer Sicht. `datePredicate` bekommt den Buchungstag
 * (`YYYY-MM-DD`) und sagt, ob die Buchung zur Periode gehört. Selbstüberweisungen (Tag `self-transfer`)
 * zählen nie.
 */
export function aggregateTransactions(
	transactions: readonly BankTransaction[],
	datePredicate: (day: string) => boolean,
	categorizer: Categorizer,
	opts: AggregateOptions = {},
): SichtAggregat {
	const ausgaben = new Map<string, MoneyValue>();
	const einnahmen = new Map<string, MoneyValue>();
	let einmalig: MoneyValue = ZERO;
	const add = (m: Map<string, MoneyValue>, key: string, v: MoneyValue): void => {
		m.set(key, (m.get(key) ?? ZERO).plus(v));
	};

	for (const tx of transactions) {
		if (!datePredicate(tx.buchungstag)) continue;
		if (opts.excludeIban && tx.accountIban === opts.excludeIban) continue;
		if (opts.onlyIban && tx.accountIban !== opts.onlyIban) continue;

		const r = categorizer(tx);
		if (r.tags.includes("self-transfer")) continue;

		const gegen = r.gegenAccount;
		if (gegen.startsWith("Ausgaben:")) {
			for (const [suffix, prefix] of KATEGORIE_MAPPING) {
				if (gegen.startsWith(prefix)) {
					add(ausgaben, suffix, tx.betrag.neg());
					break;
				}
			}
			if (gegen.startsWith(EINMALIG_PREFIX)) einmalig = einmalig.plus(tx.betrag.neg());
		} else if (gegen.startsWith("Einnahmen:")) {
			const parts = gegen.split(":");
			// Python: split(":", 2) — der Rest ab dem dritten Teil bleibt zusammen.
			const sub = parts.length > 2 ? parts.slice(2).join(":") : (parts[1] ?? gegen);
			add(einnahmen, sub, tx.betrag);
		}
	}

	const summe = (m: Map<string, MoneyValue>): MoneyValue => [...m.values()].reduce((a, b) => a.plus(b), ZERO);
	const ausgabenGesamt = zweiStellen(summe(ausgaben));
	const einnahmenGesamt = zweiStellen(summe(einnahmen));
	const saldo = zweiStellen(einnahmenGesamt.minus(ausgabenGesamt));
	const sparquote = einnahmenGesamt.gt(0) ? saldo.div(einnahmenGesamt).times(100).toNumber() : 0;

	const kategorie = new Map<string, MoneyValue>();
	for (const [k, v] of ausgaben) kategorie.set(k, zweiStellen(v));
	const fixSumme = [...FIX_FELDER].reduce((acc, f) => acc.plus(kategorie.get(f) ?? ZERO), ZERO);
	kategorie.set("fix", zweiStellen(fixSumme));
	kategorie.set("variabel", zweiStellen(ausgabenGesamt.minus(fixSumme)));

	const einnahmenDetails = new Map<string, MoneyValue>();
	for (const [k, v] of einnahmen) einnahmenDetails.set(k, zweiStellen(v));

	return {
		ausgabenGesamt,
		einnahmenGesamt,
		saldo,
		sparquoteProzent: rundeEineStelle(sparquote),
		kategorie,
		einnahmenDetails,
		ausgabenEinmalig: einmalig.isZero() ? null : zweiStellen(einmalig),
	};
}

/** Ein Kalendermonat (Monat 1–12). */
export interface YearMonth {
	year: number;
	month: number;
}

/** Die Periode eines Monats als Prädikat für `aggregateTransactions`. */
export function inMonth(ym: YearMonth): (day: string) => boolean {
	const prefix = `${String(ym.year).padStart(4, "0")}-${String(ym.month).padStart(2, "0")}-`;
	return (day) => day.startsWith(prefix);
}

/** Wie Pythons `str.title()` auf einem Kategorie-Suffix: `online_shopping` → `Online Shopping`. */
function kategorieName(suffix: string): string {
	return suffix
		.replace(/_/g, " ")
		.replace(/\S+/g, (w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase());
}

/** Kennzahlen-Tabelle (Markdown) eines Aggregats. */
export function kennzahlenTabelle(agg: SichtAggregat): string {
	return [
		"| Kennzahl | Wert |",
		"|---|---:|",
		`| Einnahmen | ${formatGermanEuro(agg.einnahmenGesamt)} |`,
		`| Ausgaben | ${formatGermanEuro(agg.ausgabenGesamt)} |`,
		`| Saldo | ${formatGermanEuro(agg.saldo)} |`,
		`| Sparquote | ${formatFixed1(agg.sparquoteProzent)} % |`,
	].join("\n");
}

/** Kategorien-Tabelle (Markdown), absteigend nach Betrag; Kategorien ohne Betrag fehlen. */
export function kategorienTabelle(ctx: ImporterContext, agg: SichtAggregat, withWikilinks = true): string {
	const rows = ["| Kategorie | Betrag | Anteil % |", "|---|---:|---:|"];
	const gesamt = agg.ausgabenGesamt;
	const items = KATEGORIE_MAPPING.map(([suffix]) => ({ suffix, wert: agg.kategorie.get(suffix) ?? ZERO }));
	items.sort((a, b) => b.wert.cmp(a.wert));
	for (const { suffix, wert } of items) {
		if (wert.isZero()) continue;
		const anteil = gesamt.isZero() ? 0 : wert.div(gesamt).times(100).toNumber();
		const name = kategorieName(suffix);
		const cell = withWikilinks ? kategorieWikilink(ctx, suffix, { display: name, forTable: true }) : name;
		rows.push(`| ${cell} | ${formatGermanEuro(wert)} | ${formatFixed1(anteil)}% |`);
	}
	rows.push(`| **Summe** | **${formatGermanEuro(gesamt)}** | 100% |`);
	return rows.join("\n");
}

/** Ein Empfänger in der Top-Liste. */
export interface TopEmpfaenger {
	counterparty: string;
	volumen: MoneyValue;
	anzahl: number;
	/** Das Konto mit dem größten Volumen bei diesem Empfänger (für den Wikilink). */
	ledgerAccount: string;
}

/** Die größten Ausgaben-Empfänger einer Periode nach Volumen; Selbstüberweisungen und Einnahmen fehlen. */
export function topEmpfaenger(
	transactions: readonly BankTransaction[],
	datePredicate: (day: string) => boolean,
	categorizer: Categorizer,
	opts: AggregateOptions & { limit?: number } = {},
): TopEmpfaenger[] {
	const limit = opts.limit ?? 5;
	const agg = new Map<string, { vol: MoneyValue; cnt: number; accounts: Map<string, MoneyValue> }>();
	for (const tx of transactions) {
		if (!datePredicate(tx.buchungstag)) continue;
		if (opts.excludeIban && tx.accountIban === opts.excludeIban) continue;
		if (opts.onlyIban && tx.accountIban !== opts.onlyIban) continue;
		const r = categorizer(tx);
		if (r.tags.includes("self-transfer")) continue;
		if (!r.gegenAccount.startsWith("Ausgaben:")) continue;
		const roh = tx.beguenstigter.trim() || tx.buchungstext.trim() || "(unbekannt)";
		// Python kürzt nach Codepoints, nicht nach UTF-16-Einheiten.
		const cp = Array.from(roh.replace(/\s+/g, " ")).slice(0, 60).join("");
		let e = agg.get(cp);
		if (!e) {
			e = { vol: ZERO, cnt: 0, accounts: new Map() };
			agg.set(cp, e);
		}
		const betrag = tx.betrag.abs();
		e.accounts.set(r.gegenAccount, (e.accounts.get(r.gegenAccount) ?? ZERO).plus(betrag));
		e.vol = e.vol.plus(betrag);
		e.cnt += 1;
	}
	return [...agg.entries()]
		.sort((a, b) => b[1].vol.cmp(a[1].vol))
		.slice(0, limit)
		.map(([counterparty, e]) => {
			let dominant = "";
			let best: MoneyValue | null = null;
			for (const [account, vol] of e.accounts) {
				// Erster Höchstwert gewinnt (Pythons `max` bei Gleichstand).
				if (best === null || vol.gt(best)) { best = vol; dominant = account; }
			}
			return { counterparty, volumen: zweiStellen(e.vol), anzahl: e.cnt, ledgerAccount: dominant };
		});
}

/** Die größten Kategorien eines Aggregats (Name, Betrag) für das Kuchendiagramm; ohne leere Kategorien. */
export function topKategorienForPie(agg: SichtAggregat, limit = 8): Array<{ name: string; wert: MoneyValue }> {
	const items = KATEGORIE_MAPPING
		.map(([suffix]) => ({ name: kategorieName(suffix), wert: agg.kategorie.get(suffix) ?? ZERO }))
		.filter((i) => i.wert.gt(0));
	items.sort((a, b) => b.wert.cmp(a.wert));
	return items.slice(0, limit);
}

