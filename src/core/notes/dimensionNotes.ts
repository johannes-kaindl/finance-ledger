/**
 * Dimensions-Notizen (Etappe E6 des Importer-Ports, portiert aus `output/kategorie_notes.py`,
 * `empfaenger_notes.py` und `tx_typ_notes.py`): je Hauptkategorie, je Empfänger-Konto und je Tx-Typ-Klasse eine
 * Notiz mit Aggregat über den gesamten Bestand (alltime).
 *
 * Die drei Gattungen teilen Gerüst und Schreibweg (Frontmatter, Marker-Block, Benutzerteil) und unterscheiden sich
 * in Auswahl der Buchungen, Kennzahlen und Tabellen; Python hat dafür drei Dateien mit kopiertem Rumpf, hier liegt
 * der Rumpf einmal (`renderNote`).
 *
 * Rein: keine Dateien, kein Vault, keine Uhr. Bestehende Notizen kommen als Text herein, geschrieben wird vom
 * Aufrufer.
 *
 * Gegenüber Python bewusst anders (Roadmap „Verbesserungen“, wie bei den Berichten):
 * - Eine bestehende Notiz bekommt nur die Felder nachgezogen, die der Import besitzt (Kennzahlen, `ledger_accounts`,
 *   `updated`, `generated`). Python schrieb die ganze Frontmatter neu und setzte `created` bei jedem Lauf auf heute.
 * - Der Name der Gegenseite stammt aus Bankdaten Dritter; ein Pipe oder eckige Klammern darin zerrissen die Tabelle
 *   (`neutralizeCellText` aus code-kit, auch für den Anzeigetext der Wikilinks).
 */

import type { ImporterContext } from "../config/context";
import {
	KATEGORIE_MAPPING,
	TX_TYP_DISPLAY,
	TX_TYP_KLASSEN,
	detectTxTyp,
	lebensbereichFor,
	type TxTyp,
} from "../aggregate/kategorien";
import { zweiStellen, type Categorizer } from "../aggregate/aggregate";
import type { BankTransaction } from "../import/transaction";
import { Money, ZERO, formatGermanEuro, type MoneyValue } from "../money";
import { neutralizeCellText } from "../../vendor/kit/markdown-table";
import { updateAutoNote } from "./autoNote";
import { patchFrontmatter } from "./frontmatter";
import { empfaengerWikilink, monatsberichtWikilink, quartalsberichtWikilink } from "./wikilinks";
import type { NotePlan } from "./kontoNotes";
import { assembleBody } from "./markers";
import { renderMermaidPie } from "./render";
import { canonicalFromAccount, ledgerToSlug } from "./slug";
import { quoteScalar } from "../../vendor/kit/frontmatter";

/** Ab so vielen Buchungen oder so viel Volumen bekommt ein Empfänger eine Notiz. */
export const MIN_POSTINGS = 5;
export const MIN_VOLUMEN_EUR: MoneyValue = new Money("200.00");
export const TOP_N = 10;

/** Gegenseiten ohne eigene Notiz (Bank-Interna, Sammelposten, PayPal als Durchlauf). Vergleich ohne Groß-/Kleinschreibung. */
const SKIP_PATTERNS: readonly string[] = [
	"NOTPROVIDED",
	"ENTGELTABSCHLUSS",
	"ABSCHLUSS",
	"GA NR",
	"AUSZAHLUNG MIT",
	"2% für",
	"ST SPK Musterstadt",
	"PayPal Europe",
	"PAYPAL EUROPE",
	"PayPal (Europe)",
];

const PLUGIN_PROTOCOL = "finance";

export type DimensionArt = "kategorie" | "empfaenger" | "txTyp";

export interface EmpfaengerInfo {
	ledgerAccount: string;
	counterpartyCanonical: string;
	postingCount: number;
	volumen: MoneyValue;
}

// --- Auswahl ---

/** Hauptkategorien mit mindestens einer Buchung, nach Suffix sortiert. Selbstüberweisungen zählen nicht. */
export function detectKategorien(
	transactions: readonly BankTransaction[],
	categorizer: Categorizer,
): Array<readonly [string, string]> {
	const treffer = new Set<string>();
	for (const tx of transactions) {
		const r = categorizer(tx);
		if (r.tags.includes("self-transfer")) continue;
		for (const [suffix, prefix] of KATEGORIE_MAPPING) {
			if (r.gegenAccount.startsWith(prefix)) {
				treffer.add(suffix);
				break;
			}
		}
	}
	return KATEGORIE_MAPPING.filter(([suffix]) => treffer.has(suffix)).sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));
}

function sollUeberspringen(beguenstigter: string): boolean {
	const klein = beguenstigter.toLowerCase();
	return SKIP_PATTERNS.some((p) => klein.includes(p.toLowerCase()));
}

/** Empfänger-Konten über der Schwelle (≥ 5 Buchungen oder ≥ 200 €), nach Volumen absteigend. */
export function detectEmpfaenger(transactions: readonly BankTransaction[], categorizer: Categorizer): EmpfaengerInfo[] {
	const summen = new Map<string, MoneyValue>();
	const anzahl = new Map<string, number>();
	for (const tx of transactions) {
		const r = categorizer(tx);
		if (r.tags.includes("self-transfer")) continue;
		if (sollUeberspringen(tx.beguenstigter)) continue;
		const gegen = r.gegenAccount;
		// Nur Ausgaben und Einnahmen, keine Aktiva-Übertragungen.
		if (!gegen.startsWith("Ausgaben:") && !gegen.startsWith("Einnahmen:")) continue;
		summen.set(gegen, (summen.get(gegen) ?? ZERO).plus(zweiStellen(tx.betrag.abs())));
		anzahl.set(gegen, (anzahl.get(gegen) ?? 0) + 1);
	}
	const out: EmpfaengerInfo[] = [];
	for (const [account, summe] of summen) {
		const count = anzahl.get(account) ?? 0;
		if (summe.gte(MIN_VOLUMEN_EUR) || count >= MIN_POSTINGS) {
			out.push({
				ledgerAccount: account,
				counterpartyCanonical: canonicalFromAccount(account),
				postingCount: count,
				volumen: zweiStellen(summe),
			});
		}
	}
	// Absteigend nach Volumen; bei Gleichstand bleibt die Reihenfolge des ersten Auftretens (stabile Sortierung).
	return out.sort((a, b) => b.volumen.comparedTo(a.volumen));
}

// --- Pfade ---

export function kategoriePath(ctx: ImporterContext, suffix: string): string {
	return `${ctx.notesPrefix}/${ctx.folders.kategorien}/${suffix}.md`;
}

export function empfaengerPath(ctx: ImporterContext, ledgerAccount: string): string {
	return `${ctx.notesPrefix}/${ctx.folders.empfaenger}/${ledgerToSlug(ledgerAccount)}.md`;
}

export function txTypPath(ctx: ImporterContext, klasse: TxTyp): string {
	return `${ctx.notesPrefix}/${ctx.folders.txTypen}/${klasse}.md`;
}

// --- Planung ---

interface Eintrag {
	path: string;
	render: (existing: string | undefined) => string;
}

/** Alle Dimensions-Notizen eines Bestands. `existing` ist nach Pfad geschlüsselt; Vorhandenes wird nachgezogen. */
export function planDimensionNotes(
	ctx: ImporterContext,
	transactions: readonly BankTransaction[],
	categorizer: Categorizer,
	existing: Readonly<Record<string, string>>,
): NotePlan[] {
	return eintraege(ctx, transactions, categorizer).map((e) => {
		const vorhanden = existing[e.path];
		return { path: e.path, existed: vorhanden !== undefined, content: e.render(vorhanden) };
	});
}

/** Die Pfade, die `planDimensionNotes` für diesen Bestand schreibt — damit der Aufrufer die vorhandenen lesen kann. */
export function dimensionPaths(
	ctx: ImporterContext,
	transactions: readonly BankTransaction[],
	categorizer: Categorizer,
): string[] {
	return eintraege(ctx, transactions, categorizer).map((e) => e.path);
}

function eintraege(ctx: ImporterContext, transactions: readonly BankTransaction[], categorizer: Categorizer): Eintrag[] {
	const out: Eintrag[] = [];
	for (const [suffix, prefix] of detectKategorien(transactions, categorizer)) {
		out.push({
			path: kategoriePath(ctx, suffix),
			render: (existing) => renderKategorie(ctx, suffix, prefix, transactions, categorizer, existing),
		});
	}
	for (const info of detectEmpfaenger(transactions, categorizer)) {
		out.push({
			path: empfaengerPath(ctx, info.ledgerAccount),
			render: (existing) => renderEmpfaenger(ctx, info.ledgerAccount, info.counterpartyCanonical, transactions, categorizer, existing),
		});
	}
	// Die Verteilung über alle Klassen ist allen Tx-Typ-Notizen gemeinsam. Klassen ohne Volumen bekommen keine Notiz.
	const pie = new Map<TxTyp, MoneyValue>(TX_TYP_KLASSEN.map((k) => [k, ZERO]));
	for (const tx of transactions) {
		const k = detectTxTyp(tx.buchungstext);
		pie.set(k, (pie.get(k) ?? ZERO).plus(zweiStellen(tx.betrag.abs())));
	}
	for (const klasse of TX_TYP_KLASSEN) {
		if ((pie.get(klasse) ?? ZERO).lte(0)) continue;
		out.push({
			path: txTypPath(ctx, klasse),
			render: (existing) => renderTxTyp(ctx, klasse, transactions, categorizer, pie, existing),
		});
	}
	return out;
}

// --- Gemeinsamer Rumpf ---

export interface NoteSpec {
	/** Frontmatter-Zeilen zwischen den Zäunen, in Schreibreihenfolge. */
	frontmatter: string[];
	/** Die Felder, die ein Lauf auf eine bestehende Notiz nachzieht. */
	owned: Record<string, string>;
	/** Block-Listen, die der Import besitzt (`ledger_accounts`): bei einer bestehenden Notiz ersetzt. */
	lists?: Record<string, string[]>;
	auto: string;
	userDefault: string;
}

export function renderNote(spec: NoteSpec, existing: string | undefined, today: string): string {
	if (existing === undefined) {
		return ["---", ...spec.frontmatter, "---"].join("\n") + assembleBody("", spec.auto, spec.userDefault);
	}
	const nachgezogen = updateAutoNote(existing, {
		set: { ...spec.owned, updated: today },
		auto: spec.auto,
		userDefault: spec.userDefault,
	});
	return spec.lists === undefined ? nachgezogen : patchFrontmatter(nachgezogen, { lists: spec.lists });
}

const fmt = (v: MoneyValue): string => v.toFixed(2);

/** Kennzahlen-Tabelle; `einheit` heißt bei Kategorie/Empfänger „Buchungen“, beim Tx-Typ „Tx“. */
function kennzahlen(
	volumen: MoneyValue,
	anzahl: number,
	betraege: readonly MoneyValue[],
	labels: { anzahl: string; schnitt: string; max: string; min: string },
): string {
	const avg = anzahl > 0 ? zweiStellen(volumen.div(anzahl)) : ZERO;
	const mx = betraege[0] ?? ZERO;
	const mn = betraege[betraege.length - 1] ?? ZERO;
	return (
		"## 📊 Aggregat-Übersicht\n\n" +
		"| Kennzahl | Wert |\n|---|---:|\n" +
		`| Gesamt (alltime) | ${formatGermanEuro(volumen)} |\n` +
		`| ${labels.anzahl} (alltime) | ${anzahl} |\n` +
		`| ${labels.schnitt} | ${formatGermanEuro(avg)} |\n` +
		`| ${labels.max} | ${formatGermanEuro(mx)} |\n` +
		`| ${labels.min} | ${formatGermanEuro(mn)} |`
	);
}

const absteigend = (a: MoneyValue, b: MoneyValue): number => b.comparedTo(a);

function frontmatterKopf(titel: string, tag: string, noteType: string, today: string): string[] {
	return [
		`title: ${titel}`,
		"type: 📋 Referenz",
		"tags:",
		"  - 🏗_Finanzplan",
		`  - finanzen/${tag}`,
		"bereich: 💰 Finanzen",
		"status: ✏️ In-Arbeit",
		`created: ${today}`,
		`updated: ${today}`,
		`note_type: ${noteType}`,
	];
}

function titleCase(text: string): string {
	return text.replace(/\S+/g, (w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase());
}

// --- Kategorie ---

function renderKategorie(
	ctx: ImporterContext,
	suffix: string,
	prefix: string,
	transactions: readonly BankTransaction[],
	categorizer: Categorizer,
	existing: string | undefined,
): string {
	const today = ctx.clock.today();
	const canonical = titleCase(suffix.replace(/_/g, " "));

	let total = ZERO;
	const accounts = new Set<string>();
	const postings: Array<{ day: string; betrag: MoneyValue; gegen: string }> = [];
	const proQuartal = new Map<string, { year: number; quarter: number; summe: MoneyValue }>();
	for (const tx of transactions) {
		const r = categorizer(tx);
		if (r.tags.includes("self-transfer")) continue;
		if (!r.gegenAccount.startsWith(prefix)) continue;
		const betrag = zweiStellen(tx.betrag.neg());
		total = total.plus(betrag);
		accounts.add(r.gegenAccount);
		postings.push({ day: tx.buchungstag, betrag, gegen: r.gegenAccount });
		const year = Number(tx.buchungstag.slice(0, 4));
		const quarter = Math.floor((Number(tx.buchungstag.slice(5, 7)) - 1) / 3) + 1;
		const key = `${year}-${quarter}`;
		const eintrag = proQuartal.get(key) ?? { year, quarter, summe: ZERO };
		eintrag.summe = eintrag.summe.plus(betrag);
		proQuartal.set(key, eintrag);
	}
	postings.sort((a, b) => absteigend(a.betrag, b.betrag));
	const volumen = zweiStellen(total);
	const ledgerAccounts = [...accounts].sort();

	const trendRows = ["| Quartal | Betrag |", "|---|---:|"];
	for (const q of [...proQuartal.values()].sort((a, b) => a.year - b.year || a.quarter - b.quarter)) {
		trendRows.push(
			`| ${quartalsberichtWikilink(ctx, q.year, q.quarter, { forTable: true })} | ${formatGermanEuro(zweiStellen(q.summe))} |`,
		);
	}
	const topRows = ["| Datum | Betrag | Empfänger |", "|---|---:|---|"];
	for (const p of postings.slice(0, TOP_N)) {
		const datum = monatsberichtWikilink(ctx, Number(p.day.slice(0, 4)), Number(p.day.slice(5, 7)), {
			display: p.day,
			forTable: true,
		});
		const empf = empfaengerWikilink(ctx, p.gegen, { display: canonicalFromAccount(p.gegen), forTable: true });
		topRows.push(`| ${datum} | ${formatGermanEuro(p.betrag)} | ${empf} |`);
	}

	const auto = [
		`> [!info] ${canonical} — alltime Aggregat`,
		kennzahlen(volumen, postings.length, postings.map((p) => p.betrag), {
			anzahl: "Buchungen",
			schnitt: "Ø pro Buchung",
			max: "Max Einzelbuchung",
			min: "Min Einzelbuchung",
		}) + "\n",
		"## 📈 Trend (pro Quartal)\n\n" + trendRows.join("\n"),
		`## 🏆 Top-${TOP_N} Buchungen\n\n` + topRows.join("\n"),
		`## 🔗 Plugin-Deep-Link\n\n[In LedgerView filtern](obsidian://${PLUGIN_PROTOCOL}?mode=filter&kategorie=${suffix})\n`,
		"## 🔗 Verweise\n\n" +
			`- [[${ctx.notesPrefix}/${ctx.folders.kategorien}/${ctx.folders.kategorien}|Kategorien-Index]]\n` +
			`- [[${ctx.notesPrefix}/${FOUNDATION}|Foundation]]\n`,
	].join("\n\n");

	return renderNote(
		{
			frontmatter: [
				...frontmatterKopf(`Kategorie ${canonical}`, "kategorie-note", "kategorie-note", today),
				`kategorie_slug: ${suffix}`,
				`kategorie_canonical: ${canonical}`,
				`kategorie_prefix: "${prefix}"`,
				`lebensbereich: ${lebensbereichFor(suffix)}`,
				"sicht: gesamt",
				"period: alltime",
				"ledger_accounts:",
				...ledgerAccounts.map((a) => `  - ${a}`),
				`posting_count: ${postings.length}`,
				`volumen_total_eur: ${fmt(volumen)}`,
				"aggregat_base: shared",
				`generated: ${today}`,
				"projektbezug:",
				`  - ${quoteScalar(`[[${ctx.notesPrefix}/${ctx.projectNote}]]`)}`,
			],
			owned: { posting_count: String(postings.length), volumen_total_eur: fmt(volumen), generated: today },
			lists: { ledger_accounts: ledgerAccounts },
			auto,
			userDefault:
				"## 📌 Notizen\n\n_Eigene Anmerkungen zu dieser Kategorie — wird bei Re-Run NICHT überschrieben._\n",
		},
		existing,
		today,
	);
}

const FOUNDATION = "_Foundation – Konten-Plan und Kategorien";

// --- Empfänger ---

function renderEmpfaenger(
	ctx: ImporterContext,
	ledgerAccount: string,
	canonical: string,
	transactions: readonly BankTransaction[],
	categorizer: Categorizer,
	existing: string | undefined,
): string {
	const today = ctx.clock.today();
	const slug = ledgerToSlug(ledgerAccount);

	let total = ZERO;
	const postings: Array<{ day: string; betrag: MoneyValue; beguenstigter: string }> = [];
	const proMonat = new Map<string, { year: number; month: number; summe: MoneyValue }>();
	for (const tx of transactions) {
		const r = categorizer(tx);
		if (r.tags.includes("self-transfer")) continue;
		if (r.gegenAccount !== ledgerAccount) continue;
		const betrag = zweiStellen(tx.betrag.abs());
		total = total.plus(betrag);
		postings.push({ day: tx.buchungstag, betrag, beguenstigter: tx.beguenstigter });
		const year = Number(tx.buchungstag.slice(0, 4));
		const month = Number(tx.buchungstag.slice(5, 7));
		const key = `${year}-${month}`;
		const eintrag = proMonat.get(key) ?? { year, month, summe: ZERO };
		eintrag.summe = eintrag.summe.plus(betrag);
		proMonat.set(key, eintrag);
	}
	postings.sort((a, b) => absteigend(a.betrag, b.betrag));
	const volumen = zweiStellen(total);

	const trendRows = ["| Monat | Betrag |", "|---|---:|"];
	for (const m of [...proMonat.values()].sort((a, b) => a.year - b.year || a.month - b.month)) {
		trendRows.push(`| ${monatsberichtWikilink(ctx, m.year, m.month, { forTable: true })} | ${formatGermanEuro(zweiStellen(m.summe))} |`);
	}
	const topRows = ["| Datum | Betrag | Empfänger |", "|---|---:|---|"];
	for (const p of postings.slice(0, TOP_N)) {
		const datum = monatsberichtWikilink(ctx, Number(p.day.slice(0, 4)), Number(p.day.slice(5, 7)), {
			display: p.day,
			forTable: true,
		});
		topRows.push(`| ${datum} | ${formatGermanEuro(p.betrag)} | ${neutralizeCellText(p.beguenstigter)} |`);
	}

	const auto = [
		`> [!info] ${canonical} — alltime Aggregat`,
		kennzahlen(volumen, postings.length, postings.map((p) => p.betrag), {
			anzahl: "Buchungen",
			schnitt: "Ø pro Buchung",
			max: "Max Einzelbuchung",
			min: "Min Einzelbuchung",
		}) + "\n",
		"## 📈 Trend (pro Monat)\n\n" + trendRows.join("\n"),
		`## 🏆 Top-${TOP_N} Buchungen\n\n` + topRows.join("\n"),
		`## 🔗 Plugin-Deep-Link\n\n[In LedgerView filtern](obsidian://${PLUGIN_PROTOCOL}?mode=filter&empfaenger=${slug})\n`,
		"## 🔗 Verweise\n\n" +
			`- [[${ctx.notesPrefix}/${ctx.folders.empfaenger}/${ctx.folders.empfaenger}|Empfänger-Index]]\n` +
			`- [[${ctx.notesPrefix}/${FOUNDATION}|Foundation]]\n`,
	].join("\n\n");

	return renderNote(
		{
			frontmatter: [
				...frontmatterKopf(`Empfänger ${canonical}`, "empfaenger-note", "empfaenger-note", today),
				`empfaenger_slug: ${slug}`,
				`counterparty_canonical: ${canonical}`,
				`ledger_account: "${ledgerAccount}"`,
				`posting_count: ${postings.length}`,
				`volumen_total_eur: ${fmt(volumen)}`,
				"period: alltime",
				"aggregat_base: shared",
				`generated: ${today}`,
				"projektbezug:",
				`  - ${quoteScalar(`[[${ctx.notesPrefix}/${ctx.projectNote}]]`)}`,
			],
			owned: { posting_count: String(postings.length), volumen_total_eur: fmt(volumen), generated: today },
			auto,
			userDefault:
				"## 📌 Notizen\n\n_Eigene Anmerkungen zu diesem Empfänger — wird bei Re-Run NICHT überschrieben._\n",
		},
		existing,
		today,
	);
}

// --- Tx-Typ ---

function renderTxTyp(
	ctx: ImporterContext,
	klasse: TxTyp,
	transactions: readonly BankTransaction[],
	categorizer: Categorizer,
	pie: ReadonlyMap<TxTyp, MoneyValue>,
	existing: string | undefined,
): string {
	const today = ctx.clock.today();
	const canonical = TX_TYP_DISPLAY[klasse];

	let total = ZERO;
	const betraege: MoneyValue[] = [];
	const proEmpfaenger = new Map<string, { volumen: MoneyValue; anzahl: number }>();
	for (const tx of transactions) {
		if (detectTxTyp(tx.buchungstext) !== klasse) continue;
		const r = categorizer(tx);
		if (r.tags.includes("self-transfer")) continue;
		const betrag = zweiStellen(tx.betrag.abs());
		total = total.plus(betrag);
		betraege.push(betrag);
		const e = proEmpfaenger.get(r.gegenAccount) ?? { volumen: ZERO, anzahl: 0 };
		e.volumen = e.volumen.plus(betrag);
		e.anzahl += 1;
		proEmpfaenger.set(r.gegenAccount, e);
	}
	betraege.sort(absteigend);
	const volumen = zweiStellen(total);

	const sektionen: string[] = [
		`> [!info] ${canonical} — alltime Tx-Typ-Aggregat\n` +
			"> Klassifiziert via `buchungstext`-Heuristik (Slice-10 D0.5). " +
			"Drill-Down auf einzelne Tx erfolgt via Empfänger-Notes (siehe Top-Empfänger unten).",
		kennzahlen(volumen, betraege.length, betraege, {
			anzahl: "Tx-Count",
			schnitt: "Ø pro Tx",
			max: "Max Einzeltx",
			min: "Min Einzeltx",
		}),
	];
	if (proEmpfaenger.size > 0) {
		const rows = ["| Empfänger | Volumen | Tx |", "|---|---:|---:|"];
		const top = [...proEmpfaenger.entries()].sort((a, b) => absteigend(a[1].volumen, b[1].volumen)).slice(0, TOP_N);
		for (const [account, e] of top) {
			const zelle = empfaengerWikilink(ctx, account, { display: canonicalFromAccount(account), forTable: true });
			rows.push(`| ${zelle} | ${formatGermanEuro(e.volumen)} | ${e.anzahl} |`);
		}
		sektionen.push(`## 🏆 Top-${TOP_N} Empfänger (${canonical})\n\n` + rows.join("\n"));
	}
	const pieData: Record<string, MoneyValue> = {};
	for (const [k, v] of pie) {
		if (v.gt(0)) pieData[TX_TYP_DISPLAY[k]] = v;
	}
	if (Object.keys(pieData).length > 0) {
		sektionen.push("## 📈 Tx-Typ-Verteilung (alltime, alle Klassen)\n\n" + renderMermaidPie("Tx-Typ-Verteilung (€)", pieData));
	}
	sektionen.push(
		"## 🔗 Verbindungen\n\n" +
			`- Tx-Typen-Hub: [[${ctx.notesPrefix}/${ctx.folders.txTypen}/${ctx.folders.txTypen}|${ctx.folders.txTypen}]]\n` +
			`- Empfänger-Index: [[${ctx.notesPrefix}/${ctx.folders.empfaenger}/${ctx.folders.empfaenger}|${ctx.folders.empfaenger}]]\n` +
			`- Foundation: [[${ctx.notesPrefix}/${FOUNDATION}|Foundation]]`,
	);

	return renderNote(
		{
			frontmatter: [
				...frontmatterKopf(`Tx-Typ ${canonical}`, "tx-typ-note", "tx-typ-note", today),
				`tx_typ_slug: ${klasse}`,
				`tx_typ_canonical: ${canonical}`,
				"period: alltime",
				`tx_count: ${betraege.length}`,
				`volumen_total_eur: ${fmt(volumen)}`,
				"aggregat_base: shared",
				`generated: ${today}`,
				"projektbezug:",
				`  - ${quoteScalar(`[[${ctx.notesPrefix}/${ctx.projectNote}]]`)}`,
			],
			owned: { tx_count: String(betraege.length), volumen_total_eur: fmt(volumen), generated: today },
			auto: sektionen.join("\n\n"),
			userDefault:
				"## 📌 Notizen\n\n_Eigene Anmerkungen zu dieser Tx-Typ-Klasse — wird bei Re-Run NICHT überschrieben._\n",
		},
		existing,
		today,
	);
}
