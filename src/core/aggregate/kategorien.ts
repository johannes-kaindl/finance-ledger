/**
 * Kategorie-Vokabular der Berichte: welche Ausgaben-Konten zu welcher Kategorie gehören, welche davon „fix“
 * sind, wie Kategorien zu Lebensbereichen gruppiert werden und wie eine Buchung nach ihrem Buchungstext
 * einem Typ zugeordnet wird.
 *
 * Portiert aus `output/aggregat_base.py` (Etappe E4 des Importer-Ports). Die Reihenfolge von
 * `KATEGORIE_MAPPING` ist Teil des Vertrags: sie bestimmt die Reihenfolge der Frontmatter-Felder und bei
 * gleichem Betrag die Reihenfolge der Tabellenzeilen.
 */

import { DEUTSCHE_WURZELN, type KontoWurzeln, } from "../accounts/wurzeln";

/** (Kategorie-Suffix, Ordnername unter der Ausgaben-Wurzel). Die Namen sind Kategorien, keine Wurzeln. */
const KATEGORIE_ORDNER: ReadonlyArray<readonly [string, string]> = [
	["wohnen", "Wohnen"],
	["tech_abos", "Tech_Abos"],
	["versicherung", "Versicherung"],
	["lebensmittel", "Lebensmittel"],
	["essen_auswaerts", "Essen_Auswaerts"],
	["kommunikation", "Kommunikation"],
	["mobilitaet", "Mobilitaet"],
	["steuern", "Steuern"],
	["gesundheit", "Gesundheit"],
	["freizeit", "Freizeit"],
	["sonstiges", "Sonstiges"],
	["online_shopping", "Online_Shopping"],
	["spende", "Spende"],
	["mitgliedschaft", "Mitgliedschaft"],
	["privat_transfers", "Privat_Transfers"],
	["bankgebuehren", "Bankgebuehren"],
	["unkategorisiert", "Unkategorisiert"],
];

/** (Kategorie-Suffix, Ausgaben-Account-Präfix) unter der gewählten Ausgaben-Wurzel. */
export function kategorieMapping(wurzeln: KontoWurzeln = DEUTSCHE_WURZELN): ReadonlyArray<readonly [string, string]> {
	return KATEGORIE_ORDNER.map(([suffix, ordner]) => [suffix, `${wurzeln.expense}:${ordner}:`] as const);
}

/** Präfix der Einmal-Ausgaben unter der gewählten Ausgaben-Wurzel. */
export function einmaligPrefix(wurzeln: KontoWurzeln = DEUTSCHE_WURZELN): string {
	return `${wurzeln.expense}:Sonstiges:Einmalig:`;
}

/** Präfix des Auffangkontos unter der gewählten Ausgaben-Wurzel. */
export function unkategorisiertPrefix(wurzeln: KontoWurzeln = DEUTSCHE_WURZELN): string {
	return `${wurzeln.expense}:Unkategorisiert:`;
}

/** Die Fassung mit den deutschen Wurzeln; Reihenfolge und Inhalt wie im Python-Original. */
export const KATEGORIE_MAPPING: ReadonlyArray<readonly [string, string]> = kategorieMapping();

export const EINMALIG_PREFIX = einmaligPrefix();

/** Kategorien, die zu den festen Kosten zählen (Rest ist variabel). */
export const FIX_FELDER: ReadonlySet<string> = new Set(["wohnen", "versicherung", "kommunikation"]);

export const MONAT_NAMEN_DE: Readonly<Record<number, string>> = {
	1: "Januar", 2: "Februar", 3: "März", 4: "April", 5: "Mai", 6: "Juni",
	7: "Juli", 8: "August", 9: "September", 10: "Oktober", 11: "November", 12: "Dezember",
};

export type LebensbereichSlug =
	| "wohnen"
	| "mobilitaet"
	| "lebenshaltung"
	| "freizeit"
	| "versicherung_vorsorge"
	| "kommunikation_tech"
	| "sonstiges";

export const LEBENSBEREICH_SLUGS: readonly LebensbereichSlug[] = [
	"wohnen", "mobilitaet", "lebenshaltung", "freizeit", "versicherung_vorsorge", "kommunikation_tech", "sonstiges",
];

const KATEGORIE_LEBENSBEREICH: Readonly<Record<string, LebensbereichSlug>> = {
	wohnen: "wohnen",
	mobilitaet: "mobilitaet",
	lebensmittel: "lebenshaltung",
	essen_auswaerts: "lebenshaltung",
	online_shopping: "lebenshaltung",
	freizeit: "freizeit",
	mitgliedschaft: "freizeit",
	spende: "freizeit",
	versicherung: "versicherung_vorsorge",
	steuern: "versicherung_vorsorge",
	gesundheit: "versicherung_vorsorge",
	kommunikation: "kommunikation_tech",
	tech_abos: "kommunikation_tech",
	sonstiges: "sonstiges",
	bankgebuehren: "sonstiges",
	privat_transfers: "sonstiges",
	unkategorisiert: "sonstiges",
};

/** Lebensbereich einer Kategorie; unbekannte Kategorien fallen auf `sonstiges` (kein Wurf bei neuen Kategorien). */
export function lebensbereichFor(kategorieSuffix: string): LebensbereichSlug {
	// Eigener Schlüssel, nicht der Prototyp: „constructor“ ist keine Kategorie.
	return Object.prototype.hasOwnProperty.call(KATEGORIE_LEBENSBEREICH, kategorieSuffix)
		? KATEGORIE_LEBENSBEREICH[kategorieSuffix]
		: "sonstiges";
}

export type TxTyp = "lastschrift" | "ueberweisung_ein" | "ueberweisung_aus" | "karte" | "bank_intern" | "sonstiges";

export const TX_TYP_KLASSEN: readonly TxTyp[] = [
	"lastschrift", "ueberweisung_ein", "ueberweisung_aus", "karte", "bank_intern", "sonstiges",
];

export const TX_TYP_DISPLAY: Readonly<Record<TxTyp, string>> = {
	lastschrift: "Lastschrift",
	ueberweisung_ein: "Überweisung-Eingang",
	ueberweisung_aus: "Überweisung-Ausgang",
	karte: "Karte",
	bank_intern: "Bank-intern",
	sonstiges: "Sonstiges",
};

/**
 * Typ einer Buchung nach ihrem `buchungstext`. Priorisiert, die erste passende Heuristik gewinnt: die
 * spezifischeren Muster stehen vor den allgemeineren (eine Eigene-Kreditkarten-Abrechnung ist
 * `bank_intern`, nicht `karte`).
 */
export function detectTxTyp(buchungstext: string): TxTyp {
	const bt = (buchungstext ?? "").toUpperCase();
	if (bt === "") return "sonstiges";
	if (bt.includes("ABSCHLUSS") || bt.startsWith("ENTGELT") || bt.startsWith("EIGENE ")) return "bank_intern";
	if (bt.includes("DIGITALE KARTE") || bt.includes("KARTENZAHLUNG") || bt.includes("KARTE")) return "karte";
	if (bt.includes("LASTSCHRIFT")) return "lastschrift";
	if (bt.includes("GUTSCHRIFT")) return "ueberweisung_ein";
	if (bt.includes("UEBERWEISUNG")) return "ueberweisung_aus";
	return "sonstiges";
}
