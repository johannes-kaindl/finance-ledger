/**
 * Bytes → Text für Bank-CSVs.
 *
 * Kritisch: `Vault#read()` erzwingt UTF-8 und ersetzt jeden Latin-1-Umlaut
 * durch U+FFFD — aus „Gebühr" wird „Geb?hr", und der Fehler wandert unbemerkt
 * bis in die Notizen. Die Dateien müssen deshalb **binär** gelesen und hier
 * dekodiert werden.
 *
 * Zwei Formate, zwei Strategien:
 * - CAMT.52 ist laut Spezifikation Latin-1 → fest dekodieren.
 * - Die Visa-Exporte kommen mal als UTF-8, mal als Latin-1 → UTF-8 versuchen,
 *   bei Dekodierfehler auf Latin-1 zurückfallen. `TextDecoder` meldet den
 *   Fehler nur mit `{ fatal: true }`; ohne das Flag ersetzt er still.
 */

export const LATIN1 = "latin1";
export const UTF8 = "utf-8";

/** Latin-1 (ISO-8859-1) — jedes Byte ist ein Zeichen, kann nie fehlschlagen. */
export function decodeLatin1(bytes: ArrayBuffer | Uint8Array): string {
	return new TextDecoder(LATIN1).decode(toView(bytes));
}

/**
 * UTF-8 mit Latin-1-Fallback.
 *
 * Reihenfolge wie im Python-Original: erst UTF-8 (strikt), erst bei echtem
 * Dekodierfehler Latin-1. Umgekehrt ginge nicht — Latin-1 akzeptiert jedes
 * Byte und würde UTF-8-Umlaute klaglos als Mojibake liefern.
 */
export function decodeUtf8OrLatin1(bytes: ArrayBuffer | Uint8Array): string {
	const view = toView(bytes);
	try {
		return new TextDecoder(UTF8, { fatal: true }).decode(view);
	} catch {
		return decodeLatin1(view);
	}
}

function toView(bytes: ArrayBuffer | Uint8Array): Uint8Array {
	return bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
}
