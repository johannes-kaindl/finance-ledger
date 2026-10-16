/**
 * Monats-, Quartals- und Jahresberichte (Etappe E5 des Importer-Ports, portiert aus `output/monatsbericht.py`,
 * `quartalsbericht.py` und `jahresbericht.py`).
 *
 * Alle drei Berichte tragen dieselben drei Sichten (gesamt, privat ohne das Vermietungskonto, Vermietung allein),
 * dieselbe Frontmatter-Kennzahlen-Reihe und dasselbe Gerüst; sie unterscheiden sich in Periode, Kopf und dem Block
 * „Monate im Quartal“ bzw. „Quartale im Jahr“. Python hat dafür drei Dateien mit kopiertem Rumpf, hier liegt der
 * Rumpf einmal (`renderBericht`).
 *
 * Rein: keine Dateien, kein Vault, keine Uhr. Bestehende Notizen kommen als Text herein, geschrieben wird vom
 * Aufrufer.
 *
 * Gegenüber Python bewusst anders (Roadmap „Verbesserungen“):
 * - Eine bestehende Notiz bekommt nur die Felder nachgezogen, die der Import besitzt (Kennzahlen, `updated`,
 *   `generiert_aus_ledger_am`). Python schrieb die ganze Frontmatter neu und setzte `created` bei jedem Lauf auf
 *   heute; eigene Tags, Status und Felder gingen verloren.
 * - Ohne Konto mit der Rolle `vermietung` entfallen die Sichten „Privat“ und „Vermietung“. Python brach beim
 *   Laden ab (`KeyError`).
 * - Verwaiste Berichte (eine Periode ohne Buchungen mehr) bleiben liegen und werden nicht gelöscht.
 */

import type { ImporterContext } from "../config/context";
import { splitIsoDate } from "../dates";
import { wrapCallout } from "../../vendor/kit/callout";
import { parseFrontmatter } from "../../vendor/kit/frontmatter";
import {
	aggregateTransactions,
	kategorienTabelle,
	kennzahlenTabelle,
	sparquoteFrontmatter,
	topEmpfaenger,
	topKategorienForPie,
	type Categorizer,
	type SichtAggregat,
	type TopEmpfaenger,
} from "../aggregate/aggregate";
import { computeBudgetForMonth, type BudgetState } from "../aggregate/budget";
import { MONAT_NAMEN_DE } from "../aggregate/kategorien";
import type { BankTransaction } from "../import/transaction";
import { formatGermanEuro, type MoneyValue } from "../money";
import { patchFrontmatter } from "./frontmatter";
import {
	empfaengerWikilink,
	kategorieWikilink,
	kontoWikilink,
	monatsberichtWikilink,
	quartalsberichtWikilink,
} from "./wikilinks";
import type { NotePlan } from "./kontoNotes";
import { assembleBody, replaceAutoSection } from "./markers";
import { renderBasesEmbed, renderMermaidPie } from "./render";

/** Q1 = Jan–Mär, Q2 = Apr–Jun, Q3 = Jul–Sep, Q4 = Okt–Dez. */
export const QUARTAL_MONATE: Readonly<Record<number, readonly [number, number, number]>> = {
	1: [1, 2, 3],
	2: [4, 5, 6],
	3: [7, 8, 9],
	4: [10, 11, 12],
};

/** Rollen der Konten, die zur Sicht „privat“ bzw. „Vermietung“ zählen. */
const PRIVAT_ROLLEN: ReadonlySet<string> = new Set(["hauptkonto_privat", "familienpool", "visa_daily"]);
const VERMIETUNG_ROLLE = "vermietung";

const USER_DEFAULT =
	"## 📌 Bemerkungen\n\n" + "_Eigene Notizen / Reflexionen — wird bei Re-Run NICHT überschrieben._\n";

/** Die Kategorie-Felder der Frontmatter in der Reihenfolge, in der Python sie schreibt (alphabetisch). */
const KATEGORIE_FELDER: ReadonlyArray<string> = [
	"bankgebuehren",
	"einmalig",
	"essen_auswaerts",
	"fix",
	"freizeit",
	"gesamt",
	"gesundheit",
	"kommunikation",
	"lebensmittel",
	"mitgliedschaft",
	"mobilitaet",
	"online_shopping",
	"privat_transfers",
	"sonstiges",
	"spende",
	"steuern",
	"tech_abos",
	"unkategorisiert",
	"variabel",
	"versicherung",
	"wohnen",
];

export type BerichtArt = "monat" | "quartal" | "jahr";

/** Die Periode eines Berichts. */
export type Periode =
	| { art: "monat"; year: number; month: number }
	| { art: "quartal"; year: number; quarter: number }
	| { art: "jahr"; year: number };

interface Sichten {
	gesamt: SichtAggregat;
	/** `null`, wenn es kein Konto mit der Rolle `vermietung` gibt. */
	privat: SichtAggregat | null;
	vermietung: SichtAggregat | null;
}

interface PeriodeInfo {
	art: BerichtArt;
	/** `2026-04`, `2026-Q2`, `2025`. */
	label: string;
	folder: string;
	/** Dateiname ohne `.md`. */
	name: string;
	predicate: (day: string) => boolean;
}

/** Alle Monate mit Buchungen, aufsteigend. */
export function detectMonate(transactions: readonly BankTransaction[]): Array<{ year: number; month: number }> {
	const keys = new Set(transactions.map((t) => t.buchungstag.slice(0, 7)));
	return [...keys].sort().map((k) => ({ year: Number(k.slice(0, 4)), month: Number(k.slice(5, 7)) }));
}

/** Alle Quartale mit Buchungen, aufsteigend. */
export function detectQuartale(transactions: readonly BankTransaction[]): Array<{ year: number; quarter: number }> {
	const keys = new Set(
		transactions.map((t) => {
			const { year, month } = splitIsoDate(t.buchungstag);
			return year * 10 + Math.floor((month - 1) / 3) + 1;
		}),
	);
	return [...keys].sort((a, b) => a - b).map((k) => ({ year: Math.floor(k / 10), quarter: k % 10 }));
}

/** Alle Jahre mit Buchungen, aufsteigend. */
export function detectJahre(transactions: readonly BankTransaction[]): number[] {
	return [...new Set(transactions.map((t) => Number(t.buchungstag.slice(0, 4))))].sort((a, b) => a - b);
}

/** Alle Berichte, die der Bestand trägt: Monate, dann Quartale, dann Jahre. */
export function alleBerichtePerioden(transactions: readonly BankTransaction[]): Periode[] {
	return [
		...detectMonate(transactions).map((m): Periode => ({ art: "monat", ...m })),
		...detectQuartale(transactions).map((q): Periode => ({ art: "quartal", ...q })),
		...detectJahre(transactions).map((year): Periode => ({ art: "jahr", year })),
	];
}

/** Vault-Pfad des Berichts. */
export function berichtPath(ctx: ImporterContext, periode: Periode): string {
	const info = periodeInfo(ctx, periode);
	return `${ctx.notesPrefix}/${info.folder}/${info.name}.md`;
}

/**
 * Baut für jede Periode den zu schreibenden Text. `existing` ist nach Pfad geschlüsselt; ein vorhandener Bericht
 * wird nachgezogen, nicht ersetzt.
 */
export function planBerichte(
	ctx: ImporterContext,
	transactions: readonly BankTransaction[],
	categorizer: Categorizer,
	perioden: readonly Periode[],
	existing: Readonly<Record<string, string>>,
): NotePlan[] {
	return perioden.map((periode) => {
		const path = berichtPath(ctx, periode);
		const vorhanden = existing[path];
		return {
			path,
			existed: vorhanden !== undefined,
			content: renderBericht(ctx, transactions, categorizer, periode, vorhanden),
		};
	});
}

/** Ein Bericht als Text: neu von Grund auf, oder, wenn `existing` gesetzt ist, nachgezogen. */
export function renderBericht(
	ctx: ImporterContext,
	transactions: readonly BankTransaction[],
	categorizer: Categorizer,
	periode: Periode,
	existing?: string,
): string {
	const info = periodeInfo(ctx, periode);
	const today = ctx.clock.today();
	const sichten = berechneSichten(ctx, transactions, categorizer, info.predicate);

	const auto = renderAuto(ctx, transactions, categorizer, periode, info, sichten, today);
	const felder = ownedFields(sichten.gesamt, today);

	if (existing === undefined) {
		return renderFrontmatter(ctx, periode, info, felder, today) + assembleBody("", auto, USER_DEFAULT);
	}
	const patched = patchFrontmatter(existing, {
		set: { ...Object.fromEntries(felder), updated: `${today} 00:00:00` },
	});
	// Der Zeilenumbruch hinter dem schließenden Zaun gehört zum Rumpf: `assembleBody` setzt ihn selbst, und
	// bliebe er im Kopf stehen, wüchse bei jedem Lauf eine Leerzeile nach.
	let cut = patched.length - parseFrontmatter(patched).body.length;
	if (cut > 0 && patched[cut - 1] === "\n") cut -= 1;
	if (cut > 0 && patched[cut - 1] === "\r") cut -= 1;
	return patched.slice(0, cut) + replaceAutoSection(patched.slice(cut), auto, USER_DEFAULT);
}

function periodeInfo(ctx: ImporterContext, periode: Periode): PeriodeInfo {
	const year4 = String(periode.year).padStart(4, "0");
	if (periode.art === "monat") {
		const label = `${year4}-${String(periode.month).padStart(2, "0")}`;
		return {
			art: "monat",
			label,
			folder: ctx.folders.monatsberichte,
			name: `${label} Monatsbericht`,
			predicate: (day) => day.startsWith(`${label}-`),
		};
	}
	if (periode.art === "quartal") {
		if (!(periode.quarter in QUARTAL_MONATE)) {
			throw new RangeError(`Quartal muss 1–4 sein, bekam ${periode.quarter}`);
		}
		const monate = QUARTAL_MONATE[periode.quarter];
		const label = `${periode.year}-Q${periode.quarter}`;
		return {
			art: "quartal",
			label,
			folder: ctx.folders.quartalsberichte,
			name: `${label} Quartalsbericht`,
			predicate: (day) => day.startsWith(`${year4}-`) && monate.includes(Number(day.slice(5, 7))),
		};
	}
	return {
		art: "jahr",
		label: String(periode.year),
		folder: ctx.folders.jahresberichte,
		name: `${periode.year} Jahresbericht`,
		predicate: (day) => day.startsWith(`${year4}-`),
	};
}

function berechneSichten(
	ctx: ImporterContext,
	transactions: readonly BankTransaction[],
	categorizer: Categorizer,
	predicate: (day: string) => boolean,
): Sichten {
	const gesamt = aggregateTransactions(transactions, predicate, categorizer);
	const vermietungIban = ctx.ibanByRolle.get(VERMIETUNG_ROLLE);
	if (vermietungIban === undefined) {
		return { gesamt, privat: null, vermietung: null };
	}
	return {
		gesamt,
		privat: aggregateTransactions(transactions, predicate, categorizer, { excludeIban: vermietungIban }),
		vermietung: aggregateTransactions(transactions, predicate, categorizer, { onlyIban: vermietungIban }),
	};
}

// --- Frontmatter ---

function fmt(v: MoneyValue | null | undefined): string {
	return v === null || v === undefined ? "null" : v.toFixed(2);
}

/** Die Felder, die der Import besitzt, in Schreibreihenfolge. */
function ownedFields(gesamt: SichtAggregat, today: string): Array<[string, string]> {
	const out: Array<[string, string]> = [];
	for (const key of KATEGORIE_FELDER) {
		const wert =
			key === "einmalig" ? gesamt.ausgabenEinmalig : key === "gesamt" ? gesamt.ausgabenGesamt : gesamt.kategorie.get(key);
		out.push([`ausgaben_${key}_eur`, fmt(wert)]);
	}
	out.push(["einnahmen_gesamt_eur", fmt(gesamt.einnahmenGesamt)]);
	out.push(["generiert_aus_ledger_am", today]);
	out.push(["saldo_eur", fmt(gesamt.saldo)]);
	out.push(["sparquote_prozent", sparquoteFrontmatter(gesamt)]);
	return out;
}

function renderFrontmatter(
	ctx: ImporterContext,
	periode: Periode,
	info: PeriodeInfo,
	felder: ReadonlyArray<[string, string]>,
	today: string,
): string {
	const feld = new Map(felder);
	const get = (key: string): string => feld.get(key) ?? "null";
	const kategorieFelder = KATEGORIE_FELDER.map((k) => `ausgaben_${k}_eur: ${get(`ausgaben_${k}_eur`)}`);

	let titel: string;
	let aliases: string[];
	let slug: string;
	let vorKategorie: string[] = [];
	let nachKategorie: string[] = [];
	let nachProjekt: string[] = [];
	let sticker: string;
	if (periode.art === "monat") {
		titel = `${info.label} Monatsbericht`;
		aliases = [info.label, `${MONAT_NAMEN_DE[periode.month]} ${periode.year}`];
		slug = "monatsbericht";
		nachKategorie = [`monat: ${info.label}`];
		sticker = "lucide//calendar";
	} else if (periode.art === "quartal") {
		titel = `${info.label} Quartalsbericht`;
		aliases = [info.label, `Q${periode.quarter} ${periode.year}`, `Quartal ${periode.quarter} ${periode.year}`];
		slug = "quartalsbericht";
		nachProjekt = [`quartal: ${info.label}`];
		sticker = "lucide//calendar-range";
	} else {
		titel = `${periode.year} Jahresbericht`;
		aliases = [`"${periode.year}"`, `Jahr ${periode.year}`];
		slug = "jahresbericht";
		vorKategorie = [`jahr: ${periode.year}`];
		sticker = "lucide//calendar-days";
	}

	// `created` und `updated` tragen wie in Python eine Uhrzeit; der Import kennt nur den Tag.
	const lines = [
		"---",
		`title: ${titel}`,
		"type: 📋 Referenz",
		"tags:",
		"  - 🏗_Finanzplan",
		`  - finanzen/${slug}`,
		"aliases:",
		...aliases.map((a) => `  - ${a}`),
		"bereich: 💰 Finanzen",
		"status: ✏️ In-Arbeit",
		`created: ${today} 00:00:00`,
		`updated: ${today} 00:00:00`,
		...kategorieFelder,
		`einnahmen_gesamt_eur: ${get("einnahmen_gesamt_eur")}`,
		`generiert_aus_ledger_am: ${today}`,
		...vorKategorie,
		`kategorie: ${slug}`,
		...nachKategorie,
		"projektbezug:",
		`  - [[${ctx.notesPrefix}/${ctx.projectNote}]]`,
		...nachProjekt,
		`saldo_eur: ${get("saldo_eur")}`,
		`sparquote_prozent: ${get("sparquote_prozent")}`,
		`sticker: ${sticker}`,
		"---",
	];
	return lines.join("\n");
}

// --- Rumpf ---

function renderAuto(
	ctx: ImporterContext,
	transactions: readonly BankTransaction[],
	categorizer: Categorizer,
	periode: Periode,
	info: PeriodeInfo,
	sichten: Sichten,
	today: string,
): string {
	const sektionen: string[] = [];

	sektionen.push(kopfCallout(periode, info, today, sichten.vermietung !== null));

	const pieTitel =
		periode.art === "monat"
			? `Ausgaben ${MONAT_NAMEN_DE[periode.month]} ${periode.year}`
			: `Ausgaben ${periode.art === "quartal" ? info.label : periode.year}`;
	const pie = topKategorienForPie(sichten.gesamt, 8);
	if (pie.length > 0) {
		const data: Record<string, MoneyValue> = {};
		for (const p of pie) data[p.name] = p.wert;
		sektionen.push("## 📊 Top-Kategorien (Pie)\n\n" + renderMermaidPie(pieTitel, data));
	}

	sektionen.push(
		"## 📊 Gesamt-Sicht\n\n" +
			`### Kennzahlen\n\n${kennzahlenTabelle(sichten.gesamt)}\n\n` +
			`### Ausgaben pro Top-Kategorie\n\n${kategorienTabelle(ctx, sichten.gesamt)}`,
	);

	if (sichten.privat !== null && sichten.vermietung !== null) {
		sektionen.push(
			`## 🏠 Privat-only (${kontoLinks(ctx, (rolle) => PRIVAT_ROLLEN.has(rolle))})\n\n` +
				"> Konto 1 (Hauptkonto) + Konto 2 (Familienpool) + Visa — ohne Konto 3 Vermietung.\n\n" +
				`### Kennzahlen\n\n${kennzahlenTabelle(sichten.privat)}\n\n` +
				`### Ausgaben pro Top-Kategorie\n\n${kategorienTabelle(ctx, sichten.privat)}`,
		);
		sektionen.push(
			`## 🏘️ Vermietung-only (${kontoLinks(ctx, (rolle) => rolle === VERMIETUNG_ROLLE)})\n\n` +
				"> Nur Konto 3 (Vermietung) — Mieteinnahmen und Bewirtschaftungs-Ausgaben.\n\n" +
				`### Kennzahlen\n\n${kennzahlenTabelle(sichten.vermietung)}\n\n` +
				`### Ausgaben pro Top-Kategorie\n\n${kategorienTabelle(ctx, sichten.vermietung)}`,
		);
	}

	if (periode.art === "monat") {
		const budget = computeBudgetForMonth(transactions, periode.year, periode.month, today, categorizer);
		if (budget.length > 0) sektionen.push(budgetSektion(ctx, budget));
		const top = topEmpfaenger(transactions, info.predicate, categorizer, { limit: 5 });
		if (top.length > 0) sektionen.push(topEmpfaengerSektion(ctx, top));
		sektionen.push(embedCallout(ctx, "finanzen-empfaenger", "📊 Empfänger-Übersicht", "📚 Vollständige Empfänger-Liste (Base-Embed)"));
	} else if (periode.art === "quartal") {
		const zeilen = QUARTAL_MONATE[periode.quarter].map((m) => ({
			label: monatsberichtWikilink(ctx, periode.year, m, { forTable: true }),
			sicht: aggregateTransactions(transactions, periodeInfo(ctx, { art: "monat", year: periode.year, month: m }).predicate, categorizer),
		}));
		sektionen.push(unterperiodenTabelle("## 📅 Monate im Quartal", "Monat", zeilen));
		sektionen.push(embedCallout(ctx, "finanzen-quartalsberichte", "📊 Quartals-Trend", "📚 Quartals-Trend (Base-Embed)"));
	} else {
		const zeilen = ([1, 2, 3, 4] as const)
			.map((q) => ({
				label: quartalsberichtWikilink(ctx, periode.year, q, { forTable: true }),
				sicht: aggregateTransactions(transactions, periodeInfo(ctx, { art: "quartal", year: periode.year, quarter: q }).predicate, categorizer),
			}))
			// Quartale ohne Bewegung entfallen (typisch bei einem laufenden Jahr).
			.filter((z) => !(z.sicht.einnahmenGesamt.isZero() && z.sicht.ausgabenGesamt.isZero()));
		sektionen.push(unterperiodenTabelle("## 📅 Quartale im Jahr", "Quartal", zeilen));
		sektionen.push(embedCallout(ctx, "finanzen-jahresberichte", "📅 Jahres-Trend", "📚 Jahres-Trend (Base-Embed)"));
	}

	sektionen.push(verweise(ctx, periode));
	return sektionen.join("\n\n");
}

function kopfCallout(periode: Periode, info: PeriodeInfo, today: string, dreiSichten: boolean): string {
	const sichtenText = dreiSichten
		? "Drei Sichten parallel: Gesamt (inkl. Vermietung), Privat-only (Konto 1+2+Visa), Vermietung-only (Konto 3)."
		: "Eine Sicht: Gesamt (kein Konto mit der Rolle `vermietung` konfiguriert).";
	if (periode.art === "monat") {
		return (
			`> [!info] ${MONAT_NAMEN_DE[periode.month]} ${periode.year} Monatsbericht\n` +
			`> Generiert aus journal.ledger-Daten (${today}). ${sichtenText}`
		);
	}
	if (periode.art === "quartal") {
		const m = QUARTAL_MONATE[periode.quarter];
		const range = `Monate ${String(m[0]).padStart(2, "0")}–${String(m[2]).padStart(2, "0")}/${periode.year}`;
		return `> [!info] ${info.label} Quartalsbericht\n> Generiert aus journal.ledger-Daten (${today}). ${range}. ${sichtenText}`;
	}
	return (
		`> [!info] ${periode.year} Jahresbericht\n` +
		`> Generiert aus journal.ledger-Daten (${today}). Gesamtjahr ${periode.year} (alle Monate mit Postings). ${sichtenText}`
	);
}

/** `[[Konto 01]] + [[Konto 02]]` — die Konten einer Sicht, Anzeige ist der Teil vor dem Gedankenstrich. */
function kontoLinks(ctx: ImporterContext, rolleGehoert: (rolle: string) => boolean): string {
	return ctx.activeKonten
		.filter((spec) => rolleGehoert(spec.kontoRolle))
		.map((spec) => {
			const stem = ctx.ibanToFilename.get(spec.iban) ?? spec.iban;
			const display = stem.includes(" – ") ? stem.split(" – ")[0] : stem;
			return kontoWikilink(ctx, stem, { display });
		})
		.join(" + ");
}

function budgetSektion(ctx: ImporterContext, budget: readonly BudgetState[]): string {
	const rows = [
		"| Kategorie | Soll (Ø 12M) | Ist | Prognose | Diff | Ampel |",
		"|---|---:|---:|---:|---:|:---:|",
	];
	for (const b of budget) {
		const cell = kategorieWikilink(ctx, b.kategorie, { display: b.kategorie, forTable: true });
		rows.push(
			`| ${cell} | ${formatGermanEuro(b.sollEur)} | ${formatGermanEuro(b.istEur)} | ${formatGermanEuro(b.prognoseEur)} | ${formatGermanEuro(b.diffEur)} | ${b.ampel} |`,
		);
	}
	let text = "## 💰 Budget-Übersicht\n\n" + rows.join("\n");
	if (budget.some((b) => b.sampleMonths < 12)) {
		const mitDaten = budget.filter((b) => b.sampleMonths > 0).map((b) => b.sampleMonths);
		if (mitDaten.length > 0) {
			text +=
				"\n\n> [!warning] Avg-Caveat\n" +
				`> Budget-Soll basiert auf nur ${Math.min(...mitDaten)} Monaten Tx-Daten (Bootstrap). ` +
				"Werte sind volatil bis 12 Monate vorliegen. User-Override per " +
				"`## 📌 Bemerkungen`-Section unten möglich.";
		}
	}
	return text;
}

function topEmpfaengerSektion(ctx: ImporterContext, top: readonly TopEmpfaenger[]): string {
	const rows = ["| Empfänger | Volumen | Buchungen |", "|---|---:|---:|"];
	for (const t of top) {
		const cell = empfaengerWikilink(ctx, t.ledgerAccount, { display: t.counterparty, forTable: true });
		rows.push(`| ${cell} | ${formatGermanEuro(t.volumen)} | ${t.anzahl} |`);
	}
	return "## 🏆 Top-Empfänger\n\n" + rows.join("\n");
}

function unterperiodenTabelle(
	titel: string,
	spalte: string,
	zeilen: ReadonlyArray<{ label: string; sicht: SichtAggregat }>,
): string {
	const rows = [`| ${spalte} | Einnahmen | Ausgaben | Saldo |`, "|---|---:|---:|---:|"];
	for (const z of zeilen) {
		rows.push(
			`| ${z.label} | ${formatGermanEuro(z.sicht.einnahmenGesamt)} | ${formatGermanEuro(z.sicht.ausgabenGesamt)} | ${formatGermanEuro(z.sicht.saldo)} |`,
		);
	}
	return `${titel}\n\n` + rows.join("\n");
}

function embedCallout(ctx: ImporterContext, base: string, view: string, titel: string): string {
	const embed = renderBasesEmbed(`${ctx.notesPrefix}/${ctx.folders.bases}/${base}`, view);
	return wrapCallout(titel, embed, "quote", false);
}

function verweise(ctx: ImporterContext, periode: Periode): string {
	const p = ctx.notesPrefix;
	const f = ctx.folders;
	const index = (ordner: string, anzeige: string): string => `- [[${p}/${ordner}/${ordner}|${anzeige}]]`;
	// Je Berichtsart die Indizes der eigenen und der feineren Perioden, wie die Python-Fassungen sie führen.
	const indizes =
		periode.art === "monat"
			? [index(f.monatsberichte, "Monatsberichte-Index")]
			: periode.art === "quartal"
				? [index(f.quartalsberichte, "Quartalsberichte-Index"), index(f.monatsberichte, "Monatsberichte-Index")]
				: [
						index(f.jahresberichte, "Jahresberichte-Index"),
						index(f.quartalsberichte, "Quartalsberichte-Index"),
						index(f.monatsberichte, "Monatsberichte-Index"),
					];
	return (
		"## 🔗 Verweise\n\n" +
		[
			...indizes,
			`- [[${p}/_Foundation – Konten-Plan und Kategorien|Foundation]]`,
			`- [[${p}/_Dashboard – Finanzen|Dashboard]]`,
			`- [[${p}/Ledger/import_report|Import-Report]]`,
			`- [[${p}/${ctx.projectNote}|Projekt]]`,
		].join("\n")
	);
}
