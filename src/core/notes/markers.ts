/**
 * Marker-System für generierte Notizen — das Idempotenz-Fundament.
 *
 * Eine Importer-Notiz hat drei Zonen: einen Kopf, den der Nutzer schreiben darf,
 * einen Block zwischen zwei HTML-Kommentaren, den jeder Lauf komplett ersetzt,
 * und alles danach, das wieder dem Nutzer gehört. Ohne diese Trennung ist jeder
 * Re-Import entweder ein Datenverlust oder ein Duplikat.
 *
 * Portiert aus `output/body_template.py` des Python-Importers (roundtrip-stabil,
 * über ~10 Notiz-Typen erprobt). Bewusst ohne jeden Finanz-Bezug geschnitten:
 * das Problem „generierter Abschnitt in einer vom Nutzer editierbaren Notiz"
 * hat kein Nachbar-Plugin gelöst, und bei zehn Notiz-Typen ist das ein
 * Kit-Kandidat (REGISTRY).
 */

import { MarkerError } from "../errors";

export const AUTO_BEGIN = "<!-- BEGIN: AUTO-GENERATED -->";
export const AUTO_END = "<!-- END: AUTO-GENERATED -->";

export interface SplitBody {
	/** Alles vor dem BEGIN-Marker. Bei markerloser Notiz der ganze Text. */
	header: string;
	/**
	 * Inhalt zwischen den Markern, ohne die Marker selbst — `null`, wenn die
	 * Notiz noch keine hat. `null` und `""` sind verschiedene Aussagen:
	 * „nie generiert" gegen „generiert, aber leer".
	 */
	auto: string | null;
	/** Alles nach dem END-Marker. */
	user: string;
}

/**
 * Zerlegt einen Notiz-Körper in seine drei Zonen.
 *
 * Wirft `MarkerError`, wenn nur einer der beiden Marker dasteht oder sie
 * verdreht sind — siehe die Begründung an der Fehlerklasse.
 */
export function splitBody(text: string): SplitBody {
	const beginIdx = text.indexOf(AUTO_BEGIN);
	const endIdx = text.indexOf(AUTO_END);

	if (beginIdx === -1 && endIdx === -1) {
		return { header: text, auto: null, user: "" };
	}
	if (beginIdx === -1 || endIdx === -1) {
		throw new MarkerError(
			`Marker-Asymmetrie: BEGIN=${beginIdx === -1 ? "fehlt" : "gefunden"}, ` +
				`END=${endIdx === -1 ? "fehlt" : "gefunden"}`,
		);
	}
	if (endIdx < beginIdx) {
		throw new MarkerError("Der END-Marker steht vor dem BEGIN-Marker");
	}

	return {
		header: text.slice(0, beginIdx),
		auto: text.slice(beginIdx + AUTO_BEGIN.length, endIdx),
		user: text.slice(endIdx + AUTO_END.length),
	};
}

/**
 * Baut aus den drei Zonen wieder einen Körper.
 *
 * Der Weißraum wird dabei normalisiert (Kopf rechts beschnitten, Block-Inhalt
 * von umschließenden Leerzeilen befreit, genau ein abschließendes `\n`) — genau
 * das macht den Roundtrip byte-stabil: ohne Normalisierung wüchse bei jedem Lauf
 * eine Leerzeile nach, und jeder Import schriebe eine unveränderte Notiz neu.
 */
export function assembleBody(
	header: string,
	auto: string,
	user: string,
): string {
	const parts = [
		header.replace(/\s+$/, ""),
		"",
		AUTO_BEGIN,
		trimBlankLines(auto),
		AUTO_END,
	];
	if (user.trim() !== "") {
		parts.push("", trimBlankLines(user));
	}
	return `${parts.join("\n")}\n`;
}

/**
 * Ersetzt den Auto-Block und lässt Kopf und Benutzerteil stehen — der Hauptweg
 * jedes Notiz-Schreibers.
 *
 * Eine markerlose Notiz wird dabei einmalig nachgerüstet: ihr bisheriger Inhalt
 * wird zum Kopf, der Block kommt darunter. `userDefault` greift nur, wenn es
 * noch keinen Benutzerteil gibt — sonst überschriebe die Vorgabe genau das, was
 * sie schützen soll.
 */
export function replaceAutoSection(
	existing: string,
	auto: string,
	userDefault = "",
): string {
	const { header, user } = splitBody(existing);
	const keptUser = user.trim() === "" ? userDefault : user;
	return assembleBody(header, auto, keptUser);
}

/** Leerzeilen am Anfang und Ende weg, innere Struktur bleibt. */
function trimBlankLines(text: string): string {
	return text.replace(/^\n+|\n+$/g, "");
}
