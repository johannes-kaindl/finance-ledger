/**
 * Die Ordnernamen der Berichts-Kategorien unter der Ausgaben-Wurzel (`Ausgaben:Lebensmittel:…`).
 *
 * Die 17 Kategorien der Berichte haben einen festen Suffix (`lebensmittel`): er ist der Frontmatter-Schlüssel der
 * Berichte, Budgets und Dimensions-Notizen und der Vertrag mit der Python-Referenz. Wie der Ordner im Kontenbaum
 * heißt, ist Konfiguration (`kategorien` in `konten.yaml`, Suffix → Ordnername), Standard bleibt die deutsche Liste.
 * Ein englischer Kontenplan (`Expenses:Groceries`) landet damit unter `lebensmittel` statt unter `sonstiges`.
 *
 * obsidian-frei.
 */

import { ConfigError } from "../errors";
import { istWurzelName, type KontoWurzeln } from "./wurzeln";

/** Kategorie-Suffix → Ordnername unter der Ausgaben-Wurzel; die Reihenfolge der Schlüssel ist Teil des Vertrags. */
export type KategorieOrdner = Record<string, string>;

/** Die deutsche Liste in der Reihenfolge des Python-Originals. */
export const STANDARD_ORDNER: Readonly<KategorieOrdner> = {
	wohnen: "Wohnen",
	tech_abos: "Tech_Abos",
	versicherung: "Versicherung",
	lebensmittel: "Lebensmittel",
	essen_auswaerts: "Essen_Auswaerts",
	kommunikation: "Kommunikation",
	mobilitaet: "Mobilitaet",
	steuern: "Steuern",
	gesundheit: "Gesundheit",
	freizeit: "Freizeit",
	sonstiges: "Sonstiges",
	online_shopping: "Online_Shopping",
	spende: "Spende",
	mitgliedschaft: "Mitgliedschaft",
	privat_transfers: "Privat_Transfers",
	bankgebuehren: "Bankgebuehren",
	unkategorisiert: "Unkategorisiert",
};

export const KATEGORIE_SUFFIXE: readonly string[] = Object.keys(STANDARD_ORDNER);

/** Teilangaben auf die vollständige Liste ergänzen; Unbrauchbares und Unbekanntes fällt auf den Standard zurück. */
export function normalizeOrdner(teil?: Readonly<Record<string, unknown>>): KategorieOrdner {
	const out: KategorieOrdner = { ...STANDARD_ORDNER };
	if (!teil) return out;
	for (const suffix of KATEGORIE_SUFFIXE) {
		const wert = Object.prototype.hasOwnProperty.call(teil, suffix) ? teil[suffix] : undefined;
		if (istWurzelName(wert)) out[suffix] = wert;
	}
	return out;
}

/**
 * `kategorien:` aus `konten.yaml` (bereits geparst). Ein unbekannter Suffix, ein unbrauchbarer Name oder ein Ordner,
 * den zwei Kategorien tragen würden, ist ein Fehler mit allen Mängeln auf einmal, kein stiller Rückfall.
 */
export function leseKategorien(raw: unknown): Partial<KategorieOrdner> | undefined {
	if (raw === undefined || raw === null) return undefined;
	if (typeof raw !== "object" || Array.isArray(raw)) {
		throw new ConfigError("konten.yaml: 'kategorien' muss eine Zuordnung sein.");
	}
	const problems: string[] = [];
	const out: Partial<KategorieOrdner> = {};
	for (const [key, value] of Object.entries(raw)) {
		if (!KATEGORIE_SUFFIXE.includes(key)) {
			problems.push(`kategorien.${key}: unbekannter Schlüssel (erlaubt: ${KATEGORIE_SUFFIXE.join(", ")}).`);
		} else if (!istWurzelName(value)) {
			problems.push(`kategorien.${key}: erwartet wird ein einzelner Ordnername ohne Doppelpunkt.`);
		} else {
			out[key] = value;
		}
	}
	if (problems.length === 0) {
		const voll = normalizeOrdner(out);
		const vergeben = new Map<string, string>();
		for (const [suffix, ordner] of Object.entries(voll)) {
			const bisher = vergeben.get(ordner);
			if (bisher !== undefined) problems.push(`kategorien: der Ordner '${ordner}' gehört mehrfach vor (${bisher}, ${suffix}).`);
			else vergeben.set(ordner, suffix);
		}
	}
	if (problems.length > 0) {
		throw new ConfigError(`konten.yaml ist fehlerhaft:\n- ${problems.join("\n- ")}`);
	}
	return Object.keys(out).length > 0 ? out : undefined;
}

/** Konto einer Kategorie unter der Ausgaben-Wurzel, optional mit Unterkonten: `Expenses:Groceries:Markt`. */
export function ausgabenKonto(w: KontoWurzeln, ordner: Readonly<KategorieOrdner>, suffix: string, ...rest: string[]): string {
	return [w.expense, ordner[suffix] ?? suffix, ...rest].join(":");
}
