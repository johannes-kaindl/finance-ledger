/**
 * Vertrags-Notizen — je wiederkehrender Zahlung eine Notiz.
 *
 * Portiert aus `output/vertraege.py`. Die Eigentumsgrenze liegt hier anders als
 * bei den Konto-Notizen, und zwar bewusst: der Importer **schätzt** Betrag,
 * Rhythmus und nächste Zahlung aus den Buchungen, aber der Nutzer kennt den
 * echten Vertrag. Deshalb wird das Frontmatter einer bestehenden Notiz gar
 * nicht angefasst — nur der Marker-Block. Wer `betrag_eur` korrigiert, weil die
 * Preiserhöhung schon im Brief steht, soll das nicht beim nächsten Import
 * wieder verlieren. Beim erstmaligen Anlegen sind die Schätzwerte dagegen das
 * Beste, was da ist.
 */

import type { ImporterContext } from "../config/context";
import type { VertragSpec } from "../config/vertraege";
import { addDays, daysBetween, type IsoDate } from "../dates";
import type { CategorizedTx } from "../import/journal";
import { MONEY_SCALE, ZERO, type MoneyValue } from "../money";
import { assembleBody, replaceAutoSection } from "./markers";
import type { NotePlan } from "./kontoNotes";
import { renderMermaidBar } from "./render";
import { mandatsSlug } from "./slug";
import { monatsberichtWikilink } from "./wikilinks";

/** Wie viele Buchungen die Stichprobe höchstens zeigt. */
export const MAX_SAMPLE_TX = 10;

/** Unter zwei Buchungen ist nichts „wiederkehrend" — dann entsteht keine Notiz. */
export const MIN_BUCHUNGEN = 2;

export type Rhythmus =
	| "monatlich"
	| "quartalsweise"
	| "halbjährlich"
	| "jährlich";

/** Tage bis zur nächsten Fälligkeit je Rhythmus. */
const DELTA_DAYS: Record<Rhythmus, number> = {
	monatlich: 30,
	quartalsweise: 91,
	"halbjährlich": 183,
	"jährlich": 365,
};

/** Muster, aus denen sich eine Vertragsnummer im Verwendungszweck lesen lässt. */
const VERTRAGSNUMMER_PATTERNS = [
	/Vertragskonto\s+(\S+)/,
	/Vertragsnummer\s+(\S+)/,
	/Kunden-?Nr\.?\s+(\S+)/,
	/Mandatsref\s+(\S+)/,
];

const USER_DEFAULT =
	"## 📌 Notizen\n\n" +
	"_Eigene Anmerkungen zu diesem Vertrag (Bedingungen / Kündigungs-Workflow / " +
	"Vergleichsangebote) — wird bei Re-Run NICHT überschrieben._\n";

export interface VertragPlan {
	plans: NotePlan[];
	/** Verträge ohne genug Buchungen, mit Begründung. */
	skipped: string[];
}

/**
 * Baut für jeden Vertrag mit genug Buchungen den zu schreibenden Text.
 *
 * Zugeordnet wird über Kategorie **und** Konto: derselbe Anbieter kann von zwei
 * Konten abbuchen, und das sind dann zwei Verträge.
 */
export function planVertragNotes(
	ctx: ImporterContext,
	vertraege: readonly VertragSpec[],
	categorized: readonly CategorizedTx[],
	existing: Readonly<Record<string, string>>,
): VertragPlan {
	const plans: NotePlan[] = [];
	const skipped: string[] = [];

	for (const spec of vertraege) {
		const iban = ctx.ibanById.get(spec.abbuchtVonKonto) ?? spec.abbuchtVonKonto;
		const matching = categorized.filter(
			(c) =>
				c.result.gegenAccount === spec.ledgerKategorie &&
				c.tx.accountIban === iban,
		);
		if (matching.length < MIN_BUCHUNGEN) {
			skipped.push(
				`${spec.filename} (nur ${matching.length} Buchung(en) gefunden)`,
			);
			continue;
		}

		const path = `${ctx.notesPrefix}/${ctx.folders.vertraege}/${spec.filename}`;
		const vorhanden = existing[path];
		plans.push({
			path,
			existed: vorhanden !== undefined,
			content:
				vorhanden === undefined
					? renderVertragNote(ctx, spec, matching)
					: replaceAutoSection(vorhanden, autoSection(ctx, matching), USER_DEFAULT),
		});
	}

	return { plans, skipped };
}

/** Median einer Betragsliste, auf Cent gerundet. */
export function median(amounts: readonly MoneyValue[]): MoneyValue {
	if (amounts.length === 0) {
		return ZERO;
	}
	const sorted = [...amounts].sort((a, b) => a.comparedTo(b));
	const mid = Math.floor(sorted.length / 2);
	if (sorted.length % 2 === 1) {
		return sorted[mid];
	}
	const low = sorted[mid - 1];
	const high = sorted[mid];
	return low.plus(high).div(2).toDecimalPlaces(MONEY_SCALE);
}

/**
 * Schätzt den Rhythmus aus Anzahl und Zeitspanne.
 *
 * Der Teiler 30,5 ist die mittlere Monatslänge — die Schätzung soll robust
 * gegen einen Februar sein, nicht kalendergenau.
 */
export function detectRhythmus(count: number, spanDays: number): Rhythmus {
	if (count <= 1) {
		if (spanDays >= 300) {
			return "jährlich";
		}
		return spanDays >= 150 ? "halbjährlich" : "monatlich";
	}
	if (spanDays < 30) {
		return "monatlich";
	}
	const frequency = count / (spanDays / 30.5);
	if (frequency >= 0.7) {
		return "monatlich";
	}
	if (frequency >= 0.2) {
		return "quartalsweise";
	}
	return frequency >= 0.07 ? "halbjährlich" : "jährlich";
}

/** Letzte Zahlung plus Rhythmus-Abstand. */
export function naechsteZahlung(last: IsoDate, rhythmus: Rhythmus): IsoDate {
	return addDays(last, DELTA_DAYS[rhythmus]);
}

/**
 * Vertragsnummer aus den Buchungen.
 *
 * Die Mandatsreferenz ist die verlässlichste Quelle und hat deshalb Vorrang vor
 * allem, was sich aus dem Verwendungszweck herauslesen lässt.
 */
export function extractVertragsnummer(
	matching: readonly CategorizedTx[],
): string | null {
	for (const { tx } of matching) {
		if (tx.mandatsreferenz !== "") {
			return tx.mandatsreferenz;
		}
	}
	for (const { tx } of matching) {
		for (const pattern of VERTRAGSNUMMER_PATTERNS) {
			const match = pattern.exec(tx.verwendungszweck);
			if (match?.[1] !== undefined) {
				return match[1];
			}
		}
	}
	return null;
}

/** Eine neue Vertrags-Notiz von Grund auf. */
function renderVertragNote(
	ctx: ImporterContext,
	spec: VertragSpec,
	matching: readonly CategorizedTx[],
): string {
	const betraege = matching.map(({ tx }) => tx.betrag.abs());
	const betrag = median(betraege);
	// Min/Max statt Sortieren: `at(-1)` liefert immer `| undefined`, und das hier
	// wegzubehaupten wäre eine Zusicherung ohne Deckung. Leer kann die Liste nicht
	// sein — darunter entsteht gar keine Notiz (MIN_BUCHUNGEN).
	const daten = matching.map(({ tx }) => tx.buchungstag);
	const erste = daten.reduce((a, b) => (b < a ? b : a));
	const letzte = daten.reduce((a, b) => (b > a ? b : a));
	const rhythmus = detectRhythmus(matching.length, daysBetween(erste, letzte));
	const nummer = extractVertragsnummer(matching);
	const title = spec.filename.replace(/\.md$/, "");
	const heute = ctx.clock.today();
	const kontoName =
		ctx.ibanToFilename.get(
			ctx.ibanById.get(spec.abbuchtVonKonto) ?? spec.abbuchtVonKonto,
		) ?? spec.abbuchtVonKonto;
	const aliases = spec.aliases.map((a) => `  - ${a}`).join("\n");

	const frontmatter = `---
title: ${title}
type: 📄 Dokument
kategorie: vertrag
tags:
  - 🏗_Finanzplan
  - finanzen/vertrag
aliases:
${aliases}
bereich: 💰 Finanzen
projektbezug:
  - [[${ctx.notesPrefix}/${ctx.projectNote}]]
status: 🌿 Evergreen
priority: 🟡 Mittel

vertragspartner: ${spec.vertragspartner}
vertragsnummer: ${nummer === null ? "null" : `"${nummer}"`}
vertrag_kategorie: ${spec.vertragKategorie}
vertrag_subkategorie: ${spec.vertragSubkategorie}
ledger_kategorie: "${spec.ledgerKategorie}"
betrag_eur: ${betrag.toFixed(MONEY_SCALE)}
rhythmus: ${rhythmus}
naechste_zahlung: ${naechsteZahlung(letzte, rhythmus)}
abbucht_von:
  - [[${ctx.notesPrefix}/${ctx.folders.konten}/${kontoName}]]
kuendigungsfrist_tage: null
vertrag_ende: null
abgeschlossen_am: null
optimierungspotenzial: null
mandats_id: null

aktiv: true

created: ${heute}
updated: ${heute}
sticker: ${spec.sticker}
---
`;

	const warnung =
		spec.noteExtraWarning === ""
			? ""
			: `\n> [!warning] Hinweis aus Auto-Generation\n> ${spec.noteExtraWarning}\n`;

	const header =
		`# ${title}\n\n` +
		"> [!info] Auto-generierter Vertrag aus Ledger-Import\n" +
		`> ${matching.length} Lastschriften erkannt, Median-Betrag ${betrag.toFixed(MONEY_SCALE)} €, ` +
		`Rhythmus „${rhythmus}". Letzte erkannte Zahlung: ${letzte}.\n` +
		warnung;

	return frontmatter + assembleBody(header, autoSection(ctx, matching), USER_DEFAULT);
}

/** Der Teil, den jeder Lauf neu schreibt. */
function autoSection(
	ctx: ImporterContext,
	matching: readonly CategorizedTx[],
): string {
	const abschnitte: string[] = [
		"## Vertragsdaten\n\n" +
			"| Feld | Wert |\n" +
			"|---|---|\n" +
			"| Vertragspartner | `=this.vertragspartner` |\n" +
			"| Vertragsnummer | `=this.vertragsnummer` |\n" +
			"| Betrag | `=this.betrag_eur` € |\n" +
			"| Rhythmus | `=this.rhythmus` |\n" +
			"| Nächste Zahlung | `=this.naechste_zahlung` |\n" +
			"| Kündigungsfrist | `=this.kuendigungsfrist_tage` Tage |\n" +
			"| Vertragsende | `=this.vertrag_ende` |\n" +
			"| Abbucht von | `=this.abbucht_von` |\n" +
			"| Ledger | `=this.ledger_kategorie` |\n" +
			"| Optimierung | `=this.optimierungspotenzial` |",
	];

	const sample = [...matching]
		.sort((a, b) => b.tx.buchungstag.localeCompare(a.tx.buchungstag))
		.slice(0, MAX_SAMPLE_TX);
	if (sample.length > 0) {
		const rows = ["| Datum | Betrag | Verwendungszweck |", "|---|---:|---|"];
		for (const { tx } of sample) {
			const [year = "", month = ""] = tx.buchungstag.split("-");
			const datum = monatsberichtWikilink(ctx, Number(year), Number(month), {
				display: tx.buchungstag,
				forTable: true,
			});
			const zweck = tx.verwendungszweck.trim().replace(/\n/g, " ").slice(0, 80);
			rows.push(
				`| ${datum} | ${tx.betrag.abs().toFixed(MONEY_SCALE)} € | ${zweck === "" ? "—" : zweck} |`,
			);
		}
		abschnitte.push(
			`## 🔍 Tx-Stichprobe (letzte ${sample.length} von ${matching.length} Buchungen)\n\n` +
				rows.join("\n"),
		);
	}

	const proMonat = new Map<string, MoneyValue[]>();
	for (const { tx } of matching) {
		const key = tx.buchungstag.slice(0, 7);
		proMonat.set(key, [...(proMonat.get(key) ?? []), tx.betrag.abs()]);
	}
	if (proMonat.size >= 2) {
		const daten = [...proMonat.entries()]
			.sort(([a], [b]) => a.localeCompare(b))
			.map(([label, werte]) => [label, median(werte)] as const);
		abschnitte.push(
			"## 📈 Betrags-Verlauf pro Monat\n\n" +
				renderMermaidBar("Median-Betrag pro Monat (€)", daten, "EUR"),
		);
	}

	const referenzen = [
		...new Set(
			matching.map(({ tx }) => tx.mandatsreferenz).filter((r) => r !== ""),
		),
	].sort();
	if (referenzen.length > 0) {
		abschnitte.push(
			"## 🔗 Mandate\n\n" +
				referenzen
					.map(
						(r) =>
							`- [[${ctx.notesPrefix}/${ctx.folders.mandate}/${mandatsSlug(r)}|${r}]]`,
					)
					.join("\n"),
		);
	}

	const vertraegeOrdner = `${ctx.notesPrefix}/${ctx.folders.vertraege}`;
	abschnitte.push(
		"## 🔗 Verbindungen\n\n" +
			`- Verträge-Index: [[${vertraegeOrdner}/${ctx.folders.vertraege}|${ctx.folders.vertraege}]]\n` +
			`- Konten-Plan: [[${ctx.notesPrefix}/_Foundation – Konten-Plan und Kategorien|Foundation]]`,
	);

	return abschnitte.join("\n\n");
}
