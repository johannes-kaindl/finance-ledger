/**
 * Die Anti-Duplikat-Vorschau des Import-Dialogs — „12 neu, 95 bereits vorhanden".
 *
 * Bis 2026-10-03 lieferte sie der Python-Importer über `check-csv`. Das kostete
 * zweierlei: eine Temp-Kopie der gewählten Datei **außerhalb** des Vaults (der
 * Prozess braucht einen echten Pfad) und damit den Node-`fs`-Zugriff, der im
 * Store-Review als `[medium] Direct Filesystem Access` steht. Die Vorschau
 * braucht aber keinen Pfad, nur den Inhalt — und den hält das `File`-Objekt aus
 * dem Datei-Dialog schon.
 *
 * Dieses Modul ist obsidian-frei und berührt die Außenwelt nur über `VaultPort`.
 */

import { parseKontenConfig, type KontenConfig, type KontoSpec } from "../config/konten";
import type { VaultPort } from "../ports";
import { decodeUtf8OrLatin1 } from "../text/decode";
import { detectSchema, SCHEMA_VISA } from "./detectSchema";
import { parseCamt52 } from "./parsers/camt52";
import { parseVisa } from "./parsers/visa";
import type { BankTransaction } from "./transaction";
import { countAgainstExisting } from "./pipeline";

const CSV_PATTERN = /\.csv$/i;

export interface CsvPreviewOptions {
	vault: VaultPort;
	/** Ordner mit den bereits abgelegten Bank-CSVs. */
	umsatzDir: string;
	/** Die gewählte, noch nicht abgelegte Datei. */
	incoming: { name: string; bytes: ArrayBuffer };
	/** Das im Dialog zugeordnete Konto — es bestimmt den Parser. */
	konto: KontoSpec;
	konten: KontenConfig;
}

export interface CsvPreviewResult {
	neu: number;
	duplikate: number;
	dateRange: { first: string; last: string } | null;
	/** Das zugeordnete Konto, wie es die Zusammenfassung anzeigt. */
	kontoMatch: string;
	/** Alles, was der Nutzer wissen sollte, ohne dass es den Lauf verhindert. */
	warnings: string[];
}

/**
 * Parser nach Schema. Ein unbekanntes Schema ist kein Absturz, sondern ein
 * leeres Ergebnis mit Warnung — die Konfiguration kann ein Schema nennen, für
 * das es (noch) keinen Parser gibt.
 */
function parseBySchema(
	text: string,
	filename: string,
	schema: string,
): { transactions: BankTransaction[]; skippedVorgemerkt: number } | null {
	if (schema === SCHEMA_VISA) {
		return { transactions: parseVisa(text, filename), skippedVorgemerkt: 0 };
	}
	const result = parseCamt52(text, filename);
	return {
		transactions: result.transactions,
		skippedVorgemerkt: result.skippedVorgemerkt,
	};
}

function basename(path: string): string {
	const cut = path.lastIndexOf("/");
	return cut === -1 ? path : path.slice(cut + 1);
}

function rangeOf(
	transactions: readonly BankTransaction[],
): { first: string; last: string } | null {
	if (transactions.length === 0) return null;
	let first = transactions[0].buchungstag;
	let last = first;
	for (const tx of transactions) {
		if (tx.buchungstag < first) first = tx.buchungstag;
		if (tx.buchungstag > last) last = tx.buchungstag;
	}
	return { first, last };
}

/**
 * Zählt die Buchungen der gewählten Datei gegen den Bestand im Umsatzordner.
 *
 * Die gleichnamige Datei bleibt aus dem Vergleich: wer eine bereits abgelegte
 * CSV erneut auswählt, soll nicht „alles Doppelungen" lesen, sondern sehen, was
 * die Datei enthält. Eine unlesbare Bestandsdatei bricht die Vorschau nicht ab
 * — sie wird gemeldet; der Bestand ist Vergleichsmaterial, nicht der Prüfling.
 */
export async function previewCsv(
	options: CsvPreviewOptions,
): Promise<CsvPreviewResult> {
	const { vault, umsatzDir, incoming, konto, konten } = options;
	const warnings: string[] = [];

	const incomingText = decodeUtf8OrLatin1(incoming.bytes);
	const parsed = parseBySchema(incomingText, incoming.name, konto.csvSchema);
	const incomingTx = parsed?.transactions ?? [];
	if (parsed === null) {
		warnings.push(`Kein Parser für Schema ${konto.csvSchema}.`);
	}
	if (parsed && parsed.skippedVorgemerkt > 0) {
		warnings.push(
			`${parsed.skippedVorgemerkt} vorgemerkte Buchung(en) übersprungen.`,
		);
	}

	// Der Dateiname ist die einzige Zuordnung, die der Nutzer selbst steuert —
	// weicht sie vom gewählten Konto ab, ist das ein Hinweis wert, aber kein Fehler:
	// gewählt hat der Nutzer, und der Import liest die Konten ohnehin aus dem Inhalt.
	const schemaAusName = detectSchemaSafe(incoming.name, konten);
	if (schemaAusName !== null && schemaAusName !== konto.csvSchema) {
		warnings.push(
			`Dateiname deutet auf Schema ${schemaAusName}, gewählt ist ${konto.id} (${konto.csvSchema}).`,
		);
	}

	const existing: BankTransaction[] = [];
	const incomingBase = basename(incoming.name);
	let bestandsDateien: string[] = [];
	try {
		bestandsDateien = (await vault.list(umsatzDir)).filter((p) =>
			CSV_PATTERN.test(p),
		);
	} catch {
		// Kein Umsatzordner: dann ist alles neu. Das ist der Zustand beim ersten Import.
		bestandsDateien = [];
	}

	for (const path of bestandsDateien) {
		if (basename(path) === incomingBase) continue;
		try {
			const bytes = await vault.readBinary(path);
			const text = decodeUtf8OrLatin1(bytes);
			const schema = detectSchemaSafe(path, konten) ?? konto.csvSchema;
			const result = parseBySchema(text, basename(path), schema);
			if (result) existing.push(...result.transactions);
		} catch (err) {
			warnings.push(
				`${basename(path)} nicht vergleichbar: ${err instanceof Error ? err.message : String(err)}`,
			);
		}
	}

	const { neu, duplikate } = countAgainstExisting(incomingTx, existing);
	return {
		neu,
		duplikate,
		dateRange: rangeOf(incomingTx),
		kontoMatch: konto.id,
		warnings,
	};
}

/**
 * `detectSchema` wirft, wenn es nichts erkennt — für die Vorschau ist das kein
 * Abbruchgrund, sondern eine fehlende Information.
 */
function detectSchemaSafe(
	filename: string,
	konten: KontenConfig,
): string | null {
	try {
		return detectSchema(basename(filename), konten);
	} catch {
		return null;
	}
}

/** Re-Export, damit Aufrufer die Konfiguration nicht aus zwei Modulen holen müssen. */
export { parseKontenConfig };
