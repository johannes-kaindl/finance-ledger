/**
 * Mandats-Notizen (Etappe E7 des Importer-Ports, portiert aus `output/mandate.py`): je eindeutiger
 * `mandatsreferenz` eine Notiz unter `50-Mandate/<slug>.md` mit Übersicht, den zehn jüngsten Buchungen und dem
 * Verweis auf die Vertrags-Notiz, deren `mandats_id` passt.
 *
 * Rein: keine Dateien, kein Vault, keine Uhr. Die Vertrags-Notizen kommen als Text herein.
 *
 * Gegenüber Python bewusst anders: eine bestehende Notiz bekommt nur die Felder nachgezogen, die der Import besitzt
 * (siehe `dimensionNotes.ts`), und der Verweis `vertrag_link` wird mit nachgezogen, wenn er sich geändert hat. Der Verweis
 * steht gequotet (`- "[[…]]"`), bei der Neuanlage wie beim Nachziehen: Python schrieb ihn roh, Obsidian liest `- [[X]]` aber als
 * verschachtelte Liste und damit nicht als Link (gemessen 2026-10-25, Obsidian 1.12.4: kein Eintrag in `frontmatterLinks` und
 * `resolvedLinks`; gequotet beide da). Das Kit quotet beim Nachziehen von sich aus; die Neuanlage zieht mit, sonst änderte der
 * zweite Lauf die Notiz.
 */

import type { ImporterContext } from "../config/context";
import { daysBetween } from "../dates";
import { zweiStellen, type Categorizer } from "../aggregate/aggregate";
import type { BankTransaction } from "../import/transaction";
import { ZERO, formatGermanEuro, type MoneyValue } from "../money";
import { neutralizeCellText } from "../../vendor/kit/markdown-table";
import { parseFrontmatter, quoteScalar } from "../../vendor/kit/frontmatter";
import { renderNote } from "./dimensionNotes";
import type { NotePlan } from "./kontoNotes";
import { empfaengerWikilink, monatsberichtWikilink } from "./wikilinks";
import { canonicalFromAccount, mandatsSlug } from "./slug";

export const TOP_N_TX = 10;
/** Ein Mandat gilt als aktiv, wenn die letzte Buchung höchstens so viele Tage zurückliegt (Monatsrhythmus plus Puffer). */
export const AKTIV_SCHWELLE_TAGE = 35;

const FOUNDATION = "_Foundation – Konten-Plan und Kategorien";

/**
 * Mandats- und Gläubiger-ID stammen aus Bankdaten Dritter und landen in Frontmatter, Titel, Callout und
 * Tabellenzellen. Erlaubt ist der Zeichensatz der SEPA-Referenzen (Buchstaben, Ziffern und `+?/-:().,' `); alles andere
 * wird zum Unterstrich. Gewöhnliche Referenzen bleiben dabei unverändert.
 */
const SEPA_UNERLAUBT = /[^A-Za-z0-9+?/\-:().,' ]/g;

/** Eine Vertrags-Notiz, wie sie im Vault liegt. */
export interface VertragNotiz {
	/** Dateiname mit `.md`. */
	filename: string;
	text: string;
}

interface MandatAggregat {
	mandatsId: string;
	glaeubigerId: string;
	erstes: string;
	letztes: string;
	anzahl: number;
	volumen: MoneyValue;
	txs: BankTransaction[];
}

export function mandatPath(ctx: ImporterContext, mandatsId: string): string {
	return `${ctx.notesPrefix}/${ctx.folders.mandate}/${mandatsSlug(mandatsId)}.md`;
}

/** Je Mandatsreferenz die Kennzahlen, in der Reihenfolge des ersten Auftretens. Buchungen ohne Referenz zählen nicht. */
function aggregiere(transactions: readonly BankTransaction[]): MandatAggregat[] {
	const agg = new Map<string, MandatAggregat>();
	for (const tx of transactions) {
		const ref = (tx.mandatsreferenz ?? "").trim().replace(SEPA_UNERLAUBT, "_");
		if (ref === "") continue;
		let m = agg.get(ref);
		if (m === undefined) {
			m = { mandatsId: ref, glaeubigerId: "", erstes: tx.buchungstag, letztes: tx.buchungstag, anzahl: 0, volumen: ZERO, txs: [] };
			agg.set(ref, m);
		}
		if (m.glaeubigerId === "" && tx.glaeubigerId) m.glaeubigerId = tx.glaeubigerId.replace(SEPA_UNERLAUBT, "_");
		m.anzahl += 1;
		m.volumen = m.volumen.plus(zweiStellen(tx.betrag.abs()));
		if (tx.buchungstag < m.erstes) m.erstes = tx.buchungstag;
		if (tx.buchungstag > m.letztes) m.letztes = tx.buchungstag;
		m.txs.push(tx);
	}
	for (const m of agg.values()) m.volumen = zweiStellen(m.volumen);
	return [...agg.values()];
}

/** Erste Vertrags-Notiz (nach Dateiname) mit passender `mandats_id` in der Frontmatter. */
function findeVertrag(mandatsId: string, vertraege: readonly VertragNotiz[]): string | null {
	for (const v of [...vertraege].sort((a, b) => (a.filename < b.filename ? -1 : a.filename > b.filename ? 1 : 0))) {
		const wert = parseFrontmatter(v.text).data["mandats_id"];
		if (wert !== undefined && String(wert) === mandatsId) return v.filename;
	}
	return null;
}

export function mandatPaths(ctx: ImporterContext, transactions: readonly BankTransaction[]): string[] {
	return aggregiere(transactions).map((m) => mandatPath(ctx, m.mandatsId));
}

/** Alle Mandats-Notizen eines Bestands. `existing` ist nach Pfad geschlüsselt; Vorhandenes wird nachgezogen. */
export function planMandatNotes(
	ctx: ImporterContext,
	transactions: readonly BankTransaction[],
	categorizer: Categorizer,
	vertraege: readonly VertragNotiz[],
	existing: Readonly<Record<string, string>>,
): NotePlan[] {
	return aggregiere(transactions).map((m) => {
		const path = mandatPath(ctx, m.mandatsId);
		const vorhanden = existing[path];
		return { path, existed: vorhanden !== undefined, content: renderMandat(ctx, m, categorizer, vertraege, vorhanden) };
	});
}

function renderMandat(
	ctx: ImporterContext,
	m: MandatAggregat,
	categorizer: Categorizer,
	vertraege: readonly VertragNotiz[],
	existing: string | undefined,
): string {
	const today = ctx.clock.today();
	const aktiv = daysBetween(m.letztes, today) <= AKTIV_SCHWELLE_TAGE;
	const aktivText = aktiv ? "✅ aktiv" : "⚠️ inaktiv";
	const vertrag = findeVertrag(m.mandatsId, vertraege);
	const vertragStem = vertrag === null ? null : vertrag.replace(/\.md$/, "");
	const vertragLink = vertragStem === null ? [] : [`[[${ctx.notesPrefix}/${ctx.folders.vertraege}/${vertragStem}]]`];
	const volumen = m.volumen.toFixed(2);

	const sektionen: string[] = [
		`> [!info] Mandat ${m.mandatsId} — ${aktivText}\n` +
			`> Aggregiert aus ${m.anzahl} Tx mit \`mandatsreferenz == ${m.mandatsId}\`. ` +
			`Aktiv-Schwelle: ≤ ${AKTIV_SCHWELLE_TAGE} Tage seit letzter Tx (Decision D3).`,
		"## 📋 Mandate-Übersicht\n\n| Feld | Wert |\n|---|---|\n" +
			`| Mandats-ID | \`${m.mandatsId}\` |\n` +
			`| Gläubiger-ID | \`${m.glaeubigerId || "—"}\` |\n` +
			`| Erste Tx | ${m.erstes} |\n` +
			`| Letzte Tx | ${m.letztes} |\n` +
			`| Tx-Count | ${m.anzahl} |\n` +
			`| Volumen | ${formatGermanEuro(m.volumen)} |\n` +
			`| Aktiv | ${aktivText} |`,
	];

	// Jüngste zuerst; bei gleichem Tag bleibt die Reihenfolge der Eingabe (stabile Sortierung).
	const jung = [...m.txs].sort((a, b) => (a.buchungstag < b.buchungstag ? 1 : a.buchungstag > b.buchungstag ? -1 : 0)).slice(0, TOP_N_TX);
	if (jung.length > 0) {
		const rows = ["| Datum | Betrag | Empfänger | Verwendungszweck |", "|---|---:|---|---|"];
		for (const tx of jung) {
			const datum = monatsberichtWikilink(ctx, Number(tx.buchungstag.slice(0, 4)), Number(tx.buchungstag.slice(5, 7)), {
				display: tx.buchungstag,
				forTable: true,
			});
			const gegen = categorizer(tx).gegenAccount;
			const empf = empfaengerWikilink(ctx, gegen, { display: canonicalFromAccount(gegen), forTable: true });
			const zweck = neutralizeCellText((tx.verwendungszweck ?? "").trim().slice(0, 60));
			rows.push(`| ${datum} | ${tx.betrag.abs().toFixed(2)} € | ${empf} | ${zweck || "—"} |`);
		}
		sektionen.push(`## 🔍 Top-${Math.min(TOP_N_TX, jung.length)}-Tx\n\n` + rows.join("\n"));
	}

	if (vertragStem !== null) {
		sektionen.push(
			"## 🔗 Zugehöriger Vertrag\n\n" +
				`- [[${ctx.notesPrefix}/${ctx.folders.vertraege}/${vertragStem}|${vertragStem}]]\n\n` +
				"> [!note] Cross-Link auto-detected\n" +
				"> Match via `vertrag.frontmatter.mandats_id == mandats_id`.",
		);
	} else {
		sektionen.push(
			"## 🔗 Zugehöriger Vertrag\n\n" +
				`_Kein Match in \`${ctx.folders.vertraege}/\`-Notes via \`mandats_id\`-Frontmatter gefunden. Optional: in einer Vertrag-Note \`mandats_id: "${m.mandatsId}"\` setzen, dann beim nächsten Re-Run wird hier der Wikilink eingefügt._`,
		);
	}
	sektionen.push(
		"## 🔗 Verbindungen\n\n" +
			`- Mandate-Hub: [[${ctx.notesPrefix}/${ctx.folders.mandate}/${ctx.folders.mandate}|${ctx.folders.mandate}]]\n` +
			`- Verträge-Index: [[${ctx.notesPrefix}/${ctx.folders.vertraege}/${ctx.folders.vertraege}|${ctx.folders.vertraege}]]\n` +
			`- Foundation: [[${ctx.notesPrefix}/${FOUNDATION}|Foundation]]`,
	);

	return renderNote(
		{
			frontmatter: [
				`title: Mandat ${m.mandatsId}`,
				"type: 📋 Referenz",
				"tags:",
				"  - 🏗_Finanzplan",
				"  - finanzen/mandat",
				"bereich: 💰 Finanzen",
				"status: ✏️ In-Arbeit",
				`created: ${today}`,
				`updated: ${today}`,
				"note_type: mandat-note",
				`mandats_id: "${m.mandatsId}"`,
				`glaeubiger_id: "${m.glaeubigerId}"`,
				`erstes_datum: ${m.erstes}`,
				`letztes_datum: ${m.letztes}`,
				`tx_count: ${m.anzahl}`,
				`volumen_eur: ${volumen}`,
				`aktiv: ${aktiv ? "true" : "false"}`,
				...(vertragStem === null ? ["vertrag_link: null"] : ["vertrag_link:", ...vertragLink.map((l) => `  - ${quoteScalar(l)}`)]),
				"aggregat_base: shared",
				`generated: ${today}`,
				`${ctx.projektKey}:`,
				`  - ${quoteScalar(`[[${ctx.notesPrefix}/${ctx.projectNote}]]`)}`,
			],
			owned: {
				glaeubiger_id: `"${m.glaeubigerId}"`,
				erstes_datum: m.erstes,
				letztes_datum: m.letztes,
				tx_count: String(m.anzahl),
				volumen_eur: volumen,
				aktiv: aktiv ? "true" : "false",
				generated: today,
			},
			lists: { vertrag_link: vertragLink },
			auto: sektionen.join("\n\n"),
			userDefault:
				"## 📌 Notizen\n\n_Eigene Anmerkungen zu diesem Mandat (Vertragsprüfung, Kündigung, etc.) — wird bei Re-Run NICHT überschrieben._\n",
		},
		existing,
		today,
	);
}
