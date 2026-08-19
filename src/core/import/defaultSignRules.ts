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

import type { SignDependentRule } from "./categorize";

export const DEFAULT_SIGN_RULES: readonly SignDependentRule[] = [
	{
		// Doppelrolle: zahlt Krankengeld aus und zieht Beiträge ein.
		match: "krankenkasse muster",
		positive: {
			account: "Einnahmen:Krankengeld:KK_Muster",
			tags: ["recurring"],
			ruleName: "kk-eingang",
		},
		negative: {
			account: "Ausgaben:Versicherung:Krankenversicherung:KK_Muster_Beitrag",
			tags: ["recurring", "tbc"],
			ruleName: "kk-ausgang",
		},
	},
	{
		// Mieterin und Angehörige zugleich; rechtlich zählt der Mietvertrag.
		// Eingang ist Mieteinnahme, der seltene Ausgang bleibt zur Prüfung offen.
		match: "erika muster",
		positive: {
			account: "Einnahmen:Mieteinnahmen:Mieter_Erika",
			tags: ["recurring"],
			ruleName: "erika-eingang",
		},
		negative: {
			account: "Ausgaben:Privat_Transfers:Familie:Erika",
			tags: ["tbc"],
			ruleName: "erika-ausgang",
		},
	},
];

/** Alle Konten, die diese Regeln erzeugen können — für den Kontenplan. */
export function signRuleAccounts(
	rules: readonly SignDependentRule[],
): string[] {
	return rules.flatMap((r) => [r.positive.account, r.negative.account]);
}
