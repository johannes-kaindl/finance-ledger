/**
 * Frontmatter lesen und **chirurgisch** schreiben.
 *
 * Die Eigentumsgrenze: der Importer besitzt genau die Felder, die er selbst
 * erzeugt, und fasst kein anderes an. Was der Nutzer ergänzt hat — eigene Tags,
 * Status, Notizfelder — überlebt jeden Lauf. Das ist dieselbe Grenze wie beim
 * Marker-System, nur eine Etage höher im Dokument.
 *
 * **Warum kein Round-Trip über `serializeFrontmatter`:** Kits Serializer emittiert
 * Listen in Flow-Form (`tags: [a, b]`). Obsidians Properties-Editor und Jays
 * bestehende Notizen schreiben Blocklisten. Ein Parse-Serialize-Zyklus wäre
 * gültiges YAML und trotzdem falsch: er formatierte bei *jedem* Import den
 * halben Vault um, und jede so berührte Notiz sähe im Vault-Diff nach einer
 * inhaltlichen Änderung aus. Gelesen wird deshalb mit dem Kit-Parser (der kann
 * beide Formen), geschrieben wird zeilenweise — Verfahren übernommen aus
 * `image-to-markdown/src/fm_migration.ts` (REGISTRY: „Vaultweite
 * Frontmatter-Key-Migration", dort für Key-Umbenennung, hier für Wert-Setzen).
 */

import {
	parseFrontmatter,
	type ParsedFrontmatter,
} from "../../vendor/kit/frontmatter";

/** Öffnender Zaun, Block, schließender Zaun — CRLF-tolerant. */
const BLOCK_RE = /^(---\r?\n)([\s\S]*?)(\r?\n---)/;

/**
 * Felder, die nie überschrieben werden, egal was der Aufrufer verlangt.
 *
 * `created` ist der Fall, der im Python-Importer schiefging: er setzte es bei
 * jedem Lauf auf heute und machte das Feld damit bedeutungslos. Ein Versehen
 * hier soll kein stiller Datenverlust sein, sondern ein Fehler.
 */
const NEVER_OVERWRITE = new Set(["created"]);

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
 * das ein Eingriff, den niemand verlangt hat.
 */
export function patchFrontmatter(
	text: string,
	patch: FrontmatterPatch,
): string {
	for (const [key, value] of Object.entries(patch.set ?? {})) {
		if (NEVER_OVERWRITE.has(key)) {
			throw new Error(`Feld \`${key}\` wird nie überschrieben`);
		}
		assertScalar(key, value);
	}
	for (const [key, value] of Object.entries(patch.ensure ?? {})) {
		assertScalar(key, value);
	}

	const match = BLOCK_RE.exec(text);
	if (!match) {
		return text;
	}
	const [full, open = "", block = "", close = ""] = match;

	const present = presentKeys(block);
	let lines = block.split("\n");
	const appended: string[] = [];

	for (const [key, value] of Object.entries(patch.set ?? {})) {
		if (present.has(key)) {
			lines = replaceFirst(lines, key, value);
		} else {
			appended.push(`${key}: ${value}`);
		}
	}
	for (const [key, value] of Object.entries(patch.ensure ?? {})) {
		if (!present.has(key)) {
			appended.push(`${key}: ${value}`);
		}
	}

	const eol = open.endsWith("\r\n") ? "\r" : "";
	const nextBlock = [...lines, ...appended.map((l) => `${l}${eol}`)].join("\n");
	return open + nextBlock + close + text.slice(full.length);
}

/** Schlüssel, die im Block eine eigene Zeile haben — auch die leer dastehenden. */
function presentKeys(block: string): Set<string> {
	const keys = new Set<string>();
	for (const line of block.split("\n")) {
		const key = keyOf(line);
		if (key !== null) {
			keys.add(key);
		}
	}
	return keys;
}

/**
 * Nur die **erste** Zeile eines Schlüssels wird ersetzt.
 *
 * Ein doppelter Schlüssel ist kaputtes YAML; der Importer räumt ihn nicht auf,
 * sondern verhält sich wie jeder YAML-Leser und nimmt den ersten.
 */
function replaceFirst(lines: string[], key: string, value: string): string[] {
	const idx = lines.findIndex((line) => keyOf(line) === key);
	if (idx === -1) {
		return lines;
	}
	const cr = lines[idx]?.endsWith("\r") === true ? "\r" : "";
	const next = [...lines];
	next[idx] = `${key}: ${value}${cr}`;
	return next;
}

/** Der Schlüssel einer Frontmatter-Zeile, oder `null` bei Listenpunkt/Leerzeile. */
function keyOf(line: string): string | null {
	const match = /^([A-Za-z0-9_][\w .-]*?):(?=[ \t]|\r?$)/.exec(line);
	return match?.[1] ?? null;
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
