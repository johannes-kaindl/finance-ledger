/**
 * Wikilinks auf die generierten Notizen — die Verdrahtung zwischen den Gattungen.
 *
 * Erst diese Links machen aus den Notizen einen begehbaren Bestand: Bericht →
 * Kategorie → Empfänger → Regel ist ein Klick statt einer Suche. Alle Pfade sind
 * absolut ab `notesPrefix`, damit ein Umbenennen einer Notiz die Links nicht
 * bricht.
 *
 * Portiert aus `output/wikilink.py`. Zwei Abweichungen, beide bewusst:
 *
 * - Der Projektordner kommt aus dem `ImporterContext` statt aus einem
 *   Modul-Global, das seinen Wert beim Import aus der Umgebung zieht.
 * - `counterparty_canonical_from_tx` fehlt hier. In Python ruft es den
 *   Categorizer auf, nur um dessen `gegen_account` an `canonicalFromAccount`
 *   weiterzureichen. Jeder Aufrufer im TS-Kern hält das Ergebnis der
 *   Kategorisierung ohnehin schon in der Hand — die Funktion wäre ein zweiter
 *   Lauf über dieselbe Buchung, nicht bloß ein Umweg.
 */

import type { ImporterContext } from "../config/context";
import { canonicalFromAccount, ledgerToSlug } from "./slug";

export interface LinkOptions {
	/** Angezeigter Text; ohne Angabe je Gattung abgeleitet. */
	display?: string;
	/**
	 * `true`, wenn der Link in einer Markdown-Tabellenzelle steht. Dann wird der
	 * Alias-Trenner escaped — sonst liest Obsidian das Pipe als Spaltengrenze und
	 * die Tabelle zerfällt ab dieser Zeile.
	 */
	forTable?: boolean;
}

/** `[[Finanzplan/45-Kategorien/lebensmittel|Lebensmittel]]` */
export function kategorieWikilink(
	ctx: ImporterContext,
	kategorieSuffix: string,
	opts: LinkOptions = {},
): string {
	const slug = kategorieSuffix.toLowerCase().replace(/ /g, "_");
	const display = opts.display ?? titleCase(kategorieSuffix.replace(/_/g, " "));
	return link(ctx, ctx.folders.kategorien, slug, display, opts);
}

/** `[[Finanzplan/60-Empfänger/ausgaben-essen-auswaerts-restaurant|Restaurant]]` */
export function empfaengerWikilink(
	ctx: ImporterContext,
	ledgerAccount: string,
	opts: LinkOptions = {},
): string {
	return link(
		ctx,
		ctx.folders.empfaenger,
		ledgerToSlug(ledgerAccount),
		opts.display ?? canonicalFromAccount(ledgerAccount),
		opts,
	);
}

/** `[[Finanzplan/55-Categorizer-Rules/anthropic|anthropic]]` */
export function categorizerRuleWikilink(
	ctx: ImporterContext,
	pattern: string,
	opts: LinkOptions = {},
): string {
	const slug = pattern.toLowerCase().replace(/ /g, "-");
	return link(ctx, ctx.folders.rules, slug, opts.display ?? pattern, opts);
}

/** `[[Finanzplan/10-Konten/Konto 01 – Hauptkonto|Konto 01 – Hauptkonto]]` */
export function kontoWikilink(
	ctx: ImporterContext,
	filename: string,
	opts: LinkOptions = {},
): string {
	const stem = filename.replace(/\.md$/, "");
	return link(ctx, ctx.folders.konten, stem, opts.display ?? stem, opts);
}

/** `[[Finanzplan/40-Monatsberichte/2026-04 Monatsbericht|2026-04]]` */
export function monatsberichtWikilink(
	ctx: ImporterContext,
	year: number,
	month: number,
	opts: LinkOptions = {},
): string {
	const label = `${year}-${String(month).padStart(2, "0")}`;
	return link(
		ctx,
		ctx.folders.monatsberichte,
		`${label} Monatsbericht`,
		opts.display ?? label,
		opts,
	);
}

/** `[[Finanzplan/70-Quartalsberichte/2026-Q2 Quartalsbericht|2026-Q2]]` */
export function quartalsberichtWikilink(
	ctx: ImporterContext,
	year: number,
	quarter: number,
	opts: LinkOptions = {},
): string {
	const label = `${year}-Q${quarter}`;
	return link(
		ctx,
		ctx.folders.quartalsberichte,
		`${label} Quartalsbericht`,
		opts.display ?? label,
		opts,
	);
}

/** `[[Finanzplan/80-Jahresberichte/2025 Jahresbericht|2025]]` */
export function jahresberichtWikilink(
	ctx: ImporterContext,
	year: number,
	opts: LinkOptions = {},
): string {
	return link(
		ctx,
		ctx.folders.jahresberichte,
		`${year} Jahresbericht`,
		opts.display ?? String(year),
		opts,
	);
}

/** `2026-04` → Jahr und Monat. */
export function parseMonatsberichtLabel(label: string): {
	year: number;
	month: number;
} {
	const match = /^(\d{4})-(\d{2})$/.exec(label);
	if (!match) {
		throw new Error(`Kein Monats-Etikett: ${JSON.stringify(label)}`);
	}
	return { year: Number(match[1]), month: Number(match[2]) };
}

/** `2026-Q2` → Jahr und Quartal. */
export function parseQuartalsberichtLabel(label: string): {
	year: number;
	quarter: number;
} {
	const match = /^(\d{4})-Q([1-4])$/.exec(label);
	if (!match) {
		throw new Error(`Kein Quartals-Etikett: ${JSON.stringify(label)}`);
	}
	return { year: Number(match[1]), quarter: Number(match[2]) };
}

function link(
	ctx: ImporterContext,
	folder: string,
	name: string,
	display: string,
	opts: LinkOptions,
): string {
	const separator = opts.forTable === true ? "\\|" : "|";
	return `[[${ctx.notesPrefix}/${folder}/${name}${separator}${display}]]`;
}

/** Jedes Wort groß — die Entsprechung zu Pythons `str.title()`. */
function titleCase(text: string): string {
	return text.replace(
		/\S+/g,
		(word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase(),
	);
}
