/**
 * Die Wurzelnamen des Kontenbaums, unter denen der Importer Konten anlegt.
 *
 * Der Importer erzeugt Konten selbst (Auffangkonto, Bankgebühren, Eröffnungsbilanz, Verrechnung). Unter welcher
 * Wurzel das geschieht, ist Konfiguration (`kontowurzeln` in `konten.yaml`), Standard bleibt deutsch. Die Ansicht
 * liest den Typ später aus `accounts.ledger` (`kontoTyp`), nicht aus diesen Namen: für abweichende Wurzeln schreibt
 * der Importer deshalb `type:`-Tags (`wurzelDirektiven`).
 *
 * obsidian-frei.
 */

import { ConfigError } from "../errors";
import type { Kontenplan, KontoTyp } from "./kontoTyp";

export interface KontoWurzeln {
	asset: string;
	liability: string;
	income: string;
	expense: string;
	equity: string;
	/** Durchlaufkonto für Umbuchungen zwischen eigenen Konten; hat keinen Kontotyp. */
	clearing: string;
}

export const DEUTSCHE_WURZELN: Readonly<KontoWurzeln> = {
	asset: "Aktiva",
	liability: "Passiva",
	income: "Einnahmen",
	expense: "Ausgaben",
	equity: "Eigenkapital",
	clearing: "Verrechnung",
};

export const WURZEL_SCHLUESSEL = ["asset", "liability", "income", "expense", "equity", "clearing"] as const;

/** Eine Wurzel ist ein einzelnes Segment: nicht leer, ohne Doppelpunkt, Semikolon oder Zeilenumbruch. */
export function istWurzelName(wert: unknown): wert is string {
	return typeof wert === "string" && wert.trim() !== "" && !/[:;\r\n\t]|\s{2,}/.test(wert) && wert === wert.trim();
}

/** Teilangaben auf die vollständige Tabelle ergänzen; Unbrauchbares fällt auf den deutschen Standard zurück. */
export function normalizeWurzeln(teil?: Partial<Record<keyof KontoWurzeln, unknown>>): KontoWurzeln {
	const out: KontoWurzeln = { ...DEUTSCHE_WURZELN };
	if (!teil) return out;
	for (const key of WURZEL_SCHLUESSEL) {
		const wert = teil[key];
		if (istWurzelName(wert)) out[key] = wert;
	}
	return out;
}

/**
 * `kontowurzeln:` aus `konten.yaml` (bereits geparst). Ein unbrauchbarer Name oder Schlüssel ist ein Fehler mit allen
 * Mängeln auf einmal, kein stiller Rückfall auf den Standard.
 */
export function leseWurzeln(raw: unknown): Partial<KontoWurzeln> | undefined {
	if (raw === undefined || raw === null) return undefined;
	if (typeof raw !== "object" || Array.isArray(raw)) {
		throw new ConfigError("konten.yaml: 'kontowurzeln' muss eine Zuordnung sein.");
	}
	const problems: string[] = [];
	const out: Partial<KontoWurzeln> = {};
	for (const [key, value] of Object.entries(raw)) {
		const schluessel = WURZEL_SCHLUESSEL.find((k) => k === key);
		if (!schluessel) {
			problems.push(`kontowurzeln.${key}: unbekannter Schlüssel (erlaubt: ${WURZEL_SCHLUESSEL.join(", ")}).`);
		} else if (!istWurzelName(value)) {
			problems.push(`kontowurzeln.${key}: erwartet wird ein einzelner Kontoname ohne Doppelpunkt.`);
		} else {
			out[schluessel] = value;
		}
	}
	if (problems.length > 0) {
		throw new ConfigError(`konten.yaml ist fehlerhaft:\n- ${problems.join("\n- ")}`);
	}
	return Object.keys(out).length > 0 ? out : undefined;
}

/** Kontenplan, der jede Wurzel auf ihren Typ abbildet; das Durchlaufkonto hat keinen. */
export function kontenplanAusWurzeln(w: KontoWurzeln): Kontenplan {
	const typen = new Map<string, KontoTyp>([
		[w.asset, "asset"],
		[w.liability, "liability"],
		[w.income, "income"],
		[w.expense, "expense"],
		[w.equity, "equity"],
	]);
	return { typen };
}

const TAG_KUERZEL: ReadonlyArray<readonly [keyof KontoWurzeln, string]> = [
	["asset", "A"],
	["liability", "L"],
	["income", "R"],
	["expense", "X"],
	["equity", "E"],
];

/**
 * `account`-Direktiven mit Typ-Tag für jede Wurzel, die vom deutschen Standard abweicht. Beim Standard bleibt die Liste
 * leer, damit `accounts.ledger` für bestehende Kontenpläne Byte für Byte dieselbe bleibt.
 */
export function wurzelDirektiven(w: KontoWurzeln): string[] {
	return TAG_KUERZEL.filter(([key]) => w[key] !== DEUTSCHE_WURZELN[key]).map(
		([key, kuerzel]) => `account ${w[key]}  ; type: ${kuerzel}`,
	);
}
