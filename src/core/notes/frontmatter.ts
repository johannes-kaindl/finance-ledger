/**
 * Frontmatter lesen und **chirurgisch** schreiben.
 *
 * Die Eigentumsgrenze: der Importer besitzt genau die Felder, die er selbst
 * erzeugt, und fasst kein anderes an. Was der Nutzer ergänzt hat — eigene Tags,
 * Status, Notizfelder — überlebt jeden Lauf. Das ist dieselbe Grenze wie beim
 * Marker-System, nur eine Etage höher im Dokument.
 *
 * Geschrieben wird zeilenweise vom Kit (`frontmatter-patch`, obsidian-kit 0.69.0), nicht über einen
 * Round-Trip: der Kit-Serializer emittiert Listen in Flow-Form (`tags: [a, b]`), Obsidians
 * Properties-Editor und bestehende Notizen schreiben Blocklisten, und ein Parse-Serialize-Zyklus
 * formatierte bei *jedem* Import den halben Vault um. Diese Datei ist nur der Adapter: sie behält
 * die Form des Aufrufs (Werte sind fertige Skalare als string, Fehler werfen) und bildet jeden Wert
 * auf den Kit-Wert ab.
 */

import {
	parseFrontmatter,
	type ParsedFrontmatter,
} from "../../vendor/kit/frontmatter";
import {
	isFmLiteralText,
	patchFrontmatter as patchKit,
	type FmLiteral,
} from "../../vendor/kit/frontmatter-patch";

export interface FrontmatterPatch {
	/** Felder des Importers — werden gesetzt, angelegt, wenn sie fehlen. */
	set?: Record<string, string>;
	/** Felder, die nur beim ersten Mal entstehen und danach dem Nutzer gehören. */
	ensure?: Record<string, string>;
}

/** Frontmatter lesen. Dünne Hülle über den Kit-Parser. */
export function readFrontmatter(text: string): ParsedFrontmatter {
	return parseFrontmatter(text);
}

/**
 * Setzt Felder im Frontmatter, ohne den Rest anzufassen.
 *
 * Eine Notiz ohne Frontmatter bleibt unverändert: ihr eines fehlt, ist ein
 * Zaunpaar, und das rät der Importer nicht dazu — bei einer fremden Notiz wäre
 * das ein Eingriff, den niemand verlangt hat. Dasselbe gilt für einen Zaun, der
 * nie schließt: der Text kommt unverändert zurück.
 *
 * `created` wird nie überschrieben (das Kit schützt es von sich aus): der
 * Python-Importer setzte es bei jedem Lauf auf heute und machte das Feld damit
 * bedeutungslos. Ein Versehen hier soll kein stiller Datenverlust sein, sondern
 * ein Fehler.
 */
export function patchFrontmatter(
	text: string,
	patch: FrontmatterPatch,
): string {
	for (const [key, value] of [
		...Object.entries(patch.set ?? {}),
		...Object.entries(patch.ensure ?? {}),
	]) {
		assertScalar(key, value);
	}

	const result = patchKit(text, {
		set: toKit(patch.set),
		ensure: toKit(patch.ensure),
	});
	if (result.ok) return result.content;
	if (result.reason === "unparseable") return text;
	if (result.reason === "protected") {
		throw new Error(`Feld \`${result.key}\` wird nie überschrieben`);
	}
	throw new Error(`Feld \`${result.key ?? "?"}\`: ${result.reason}`);
}

/**
 * Die Werte sind fertige Skalare. Was das Kit als Literal kennt (`null`, `true`, `false`, Dezimalzahl,
 * doppelt gequoteter Einzeiler), geht unverändert in die Zeile: ein Text bekäme Anführungszeichen
 * (`"null"`, `"53240.00"`) und kippte den Datentyp im Vault. Alles andere (Datum, Name) gibt das Kit
 * als Text aus und quotet nur, wo YAML es verlangt. Die Erkennung kommt aus dem Kit, nicht aus einer
 * Kopie ihrer Regex.
 */
function toKit(
	werte: Record<string, string> | undefined,
): Record<string, string | FmLiteral> | undefined {
	if (werte === undefined) return undefined;
	return Object.fromEntries(
		Object.entries(werte).map(([key, wert]) => [
			key,
			isFmLiteralText(wert) ? { literal: wert } : wert,
		]),
	);
}

function assertScalar(key: string, value: unknown): void {
	if (Array.isArray(value)) {
		throw new Error(
			`Feld \`${key}\`: der Importer setzt nur Skalare, keine Liste — ` +
				"eine Blockliste zeilenweise zu ersetzen hieße, ihre Länge zu raten",
		);
	}
	if (typeof value !== "string") {
		throw new Error(`Feld \`${key}\`: Wert muss eine Zeichenkette sein`);
	}
}
