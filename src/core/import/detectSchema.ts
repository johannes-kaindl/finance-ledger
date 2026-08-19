/**
 * Welcher Parser für welche Datei.
 *
 * Port von `cli.detect_schema`. Drei Stufen: IBAN-Suffix im Dateinamen, dann
 * ein strukturelles Dateinamen-Muster pro Schema, zuletzt das Schema des ersten
 * konfigurierten Kontos.
 *
 * Die Muster hängen an der **Struktur** des Dateinamens, nie an konkreten
 * Konto- oder Kartenziffern. Bis 371fd7a stand hier die echte Kartennummer des
 * Maintainers; der Privacy-Scrub ersetzte sie durch Persona-Zahlen, womit das
 * Muster keine reale Datei mehr traf — die Visa-CSV fiel auf das CAMT52-Schema
 * zurück und starb im falschen Parser. Nutzerspezifische Werte gehören in die
 * Konfiguration, nie in den Code.
 */

import type { KontenConfig } from "../config/konten";

export const SCHEMA_CAMT52 = "sparkasse_camt52";
export const SCHEMA_VISA = "sparkasse_visa";

export const SCHEMA_FILENAME_REGEX: Record<string, RegExp> = {
	[SCHEMA_CAMT52]: /camt52v8/,
	// Maskierte Kartennummer: 4 Ziffern, mindestens zwei Masken-/Trennzeichen,
	// 4 Ziffern — deckt "1234________5678" wie "4000-XXXX-XXXX-0000" ab.
	// Mindestens ZWEI Zeichen, damit ein einzelner Bindestrich zwischen zwei
	// Zifferngruppen ("20260506-532013000-…") nicht fälschlich greift.
	[SCHEMA_VISA]: /\d{4}[-_*xX\s]{2,}\d{4}/,
};

/** Anzahl Endziffern der IBAN, die im Dateinamen gesucht werden. */
const IBAN_SUFFIX_LENGTH = 10;

export function detectSchema(filename: string, konten: KontenConfig): string {
	const compact = filename.replace(/ /g, "");

	// 1. Ein Konto, dessen IBAN-Ende im Dateinamen steht, gewinnt immer —
	//    das ist die einzige Zuordnung, die der Nutzer selbst steuern kann.
	for (const konto of konten.konten) {
		const suffix = konto.iban.replace(/ /g, "").slice(-IBAN_SUFFIX_LENGTH);
		if (suffix !== "" && compact.includes(suffix)) {
			return konto.csvSchema;
		}
	}

	// 2. Strukturelles Muster, in der Reihenfolge der Schemata aus der Konfiguration.
	const schemasInOrder: string[] = [];
	for (const konto of konten.konten) {
		if (!schemasInOrder.includes(konto.csvSchema)) {
			schemasInOrder.push(konto.csvSchema);
		}
	}
	for (const schema of schemasInOrder) {
		const regex = SCHEMA_FILENAME_REGEX[schema];
		if (regex?.test(filename)) {
			return schema;
		}
	}

	// 3. Fallback: das erste konfigurierte Schema.
	return konten.konten[0]?.csvSchema ?? SCHEMA_CAMT52;
}
