/**
 * Diagnose für falsch heruntergeladene Bank-Exporte.
 *
 * Die Sparkasse bietet rund zehn Download-Formate an (CSV-CAMT V2/V8, CSV mit
 * Kategorien, MT940 als CSV und als Text, MT942, dazu XML-Varianten) —
 * verarbeitet wird genau eines. Wer daneben greift, bekam früher einen
 * Traceback mit roher Header-Liste; diese Schicht sagt stattdessen, was
 * vorliegt und was zu tun ist.
 *
 * Grundsatz: **nur benennen, was sicher unterscheidbar ist.** Der Aufbau von
 * CAMT V2 oder „CSV mit Kategorien" ist uns nicht bekannt — statt zu raten,
 * zeigen wir bei fremden CSVs die tatsächlichen Spaltennamen.
 */

export const EXPECTED_FORMAT_HINT =
	'Beim Bank-Download „Excel (CSV-CAMT V8)" wählen.';

const MAX_COLUMNS_SHOWN = 4;

// MT940-Feldkennungen stehen am Zeilenanfang (":20:", ":61:"). Die Verankerung
// ist wichtig: ein Verwendungszweck darf ":20:" mitten im Text enthalten, ohne
// deshalb MT940 zu sein.
const MT940_FIELD = /^:\d{2}[A-Z]?:/m;

/**
 * Beschreibt eine Datei, die nicht dem erwarteten CAMT52-CSV entspricht.
 *
 * `head` sind die ersten Zeichen der Datei, `header` die geparste Kopfzeile
 * (oder `null`, wenn sich keine lesen ließ). Rückgabe ist ein vollständiger
 * Satz, der immer mit der Handlungsanweisung endet.
 */
export function describeUnexpectedFormat(
	head: string,
	header: readonly string[] | null,
): string {
	const stripped = head.replace(/^\s+/, "");
	let found: string;

	if (stripped.startsWith("<?xml") || stripped.startsWith("<Document")) {
		found = "eine XML-Datei (CAMT-XML). Verarbeitet wird die CSV-Variante";
	} else if (MT940_FIELD.test(head)) {
		found = "eine MT940/MT942-Textdatei. Verarbeitet wird die CSV-Variante";
	} else if (header && header.length > 0) {
		const shown = header.slice(0, MAX_COLUMNS_SHOWN).join(", ");
		const rest = header.length - MAX_COLUMNS_SHOWN;
		found = `eine CSV mit abweichenden Spalten: ${shown}${
			rest > 0 ? ` … (+${rest} weitere)` : ""
		}`;
	} else {
		found = "ein unbekanntes Format (keine lesbare CSV-Kopfzeile)";
	}

	return `Gefunden wurde ${found}. ${EXPECTED_FORMAT_HINT}`;
}
