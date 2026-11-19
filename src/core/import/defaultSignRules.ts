/**
 * Vorzeichenabhängige Sonderregeln — Vorbelegung.
 *
 * Diese Werte standen bis zum Port als Klarnamen im Quelltext des Categorizers.
 * Sie hier als Konfiguration zu führen ist die direkte Lehre aus dem
 * Visa-Defekt: nutzerspezifische Werte im Code werden vom Privacy-Scrub
 * ersetzt, funktionieren danach nicht mehr, und niemand merkt es — der Code
 * läuft ja weiter.
 *
 * Die Namen unten sind Persona-Platzhalter aus dem öffentlichen Stand. Wer
 * echte Beteiligte abbilden will, hinterlegt sie in der Konfiguration; die
 * Vorbelegung greift dann schlicht nicht.
 *
 * Offen für eine spätere Etappe: vorzeichenabhängige Regeln als Vault-Notizen
 * abbildbar machen (heute können Regel-Notizen nur den Suchbegriff, nicht die
 * Richtung). Dann entfällt diese Liste ganz.
 */

import { ausgabenKonto, type KategorieOrdner, STANDARD_ORDNER } from "../accounts/kategorienOrdner";
import { DEUTSCHE_WURZELN, type KontoWurzeln } from "../accounts/wurzeln";
import type { SignDependentRule } from "./categorize";

/** Die Vorbelegung unter den gewählten Wurzeln und Kategorien-Ordnern. */
export function defaultSignRules(w: KontoWurzeln, o: Readonly<KategorieOrdner> = STANDARD_ORDNER): readonly SignDependentRule[] {
	return [
	{
		// Doppelrolle: zahlt Krankengeld aus und zieht Beiträge ein.
		match: "krankenkasse muster",
		positive: {
			account: `${w.income}:Krankengeld:KK_Muster`,
			tags: ["recurring"],
			ruleName: "kk-eingang",
		},
		negative: {
			account: ausgabenKonto(w, o, "versicherung", "Krankenversicherung", "KK_Muster_Beitrag"),
			tags: ["recurring", "tbc"],
			ruleName: "kk-ausgang",
		},
	},
	{
		// Mieterin und Angehörige zugleich; rechtlich zählt der Mietvertrag.
		// Eingang ist Mieteinnahme, der seltene Ausgang bleibt zur Prüfung offen.
		match: "erika muster",
		positive: {
			account: `${w.income}:Mieteinnahmen:Mieter_Erika`,
			tags: ["recurring"],
			ruleName: "erika-eingang",
		},
		negative: {
			account: ausgabenKonto(w, o, "privat_transfers", "Familie", "Erika"),
			tags: ["tbc"],
			ruleName: "erika-ausgang",
		},
	},
	];
}

/** Die Vorbelegung mit den deutschen Wurzeln. */
export const DEFAULT_SIGN_RULES: readonly SignDependentRule[] = defaultSignRules(DEUTSCHE_WURZELN);

/** Alle Konten, die diese Regeln erzeugen können — für den Kontenplan. */
export function signRuleAccounts(
	rules: readonly SignDependentRule[],
): string[] {
	return rules.flatMap((r) => [r.positive.account, r.negative.account]);
}
