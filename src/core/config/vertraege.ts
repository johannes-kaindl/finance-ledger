/**
 * `vertraege.yaml` — welche wiederkehrenden Zahlungen eine eigene Notiz bekommen.
 *
 * Anders als `konten.yaml` ist diese Datei **optional**: wer keine Verträge
 * pflegt, bekommt keine Vertrags-Notizen und keinen Fehler. Deshalb ist eine
 * fehlende oder leere Datei hier gültig, während eine leere `konten.yaml` den
 * Import sinnlos machte.
 *
 * Portiert aus `output/vertraege.py` (§ load_vertraege). `abbucht_von_konto`
 * bleibt die Konto-`id` und wird erst beim Zuordnen über den Kontext auf eine
 * IBAN aufgelöst — in der Konfiguration soll ein Name stehen, keine IBAN.
 */

import { ConfigError } from "../errors";

export interface VertragSpec {
	/** Dateiname der Notiz, mit `.md`. */
	filename: string;
	ledgerKategorie: string;
	vertragspartner: string;
	vertragKategorie: string;
	vertragSubkategorie: string;
	/** `id` eines Kontos aus `konten.yaml`. */
	abbuchtVonKonto: string;
	aliases: string[];
	sticker: string;
	/** Zusätzlicher Warnhinweis im Kopf der erzeugten Notiz. */
	noteExtraWarning: string;
}

export interface VertraegeConfig {
	vertraege: VertragSpec[];
}

const REQUIRED_FIELDS = [
	"filename",
	"ledger_kategorie",
	"vertragspartner",
	"vertrag_kategorie",
	"vertrag_subkategorie",
	"abbucht_von_konto",
];

/**
 * Liest die Vertrags-Konfiguration.
 *
 * Alle Mängel werden gesammelt und zusammen gemeldet — wer eine Datei von Hand
 * pflegt, will nicht sieben Läufe für sieben Tippfehler (dieselbe Begründung
 * wie bei `parseKontenConfig`).
 */
export function parseVertraegeConfig(data: unknown): VertraegeConfig {
	if (data === null || data === undefined) {
		return { vertraege: [] };
	}
	if (!isRecord(data)) {
		throw new ConfigError(
			"vertraege.yaml: erwartet wird eine Zuordnung mit dem Schlüssel 'vertraege'.",
		);
	}
	const raw = data.vertraege;
	if (raw === undefined || raw === null) {
		return { vertraege: [] };
	}
	if (!Array.isArray(raw)) {
		throw new ConfigError(
			"vertraege.yaml: der Schlüssel 'vertraege' ist keine Liste.",
		);
	}

	const problems: string[] = [];
	const vertraege: VertragSpec[] = [];
	const seen = new Set<string>();

	raw.forEach((entry, index) => {
		const label = `vertraege[${index}]`;
		if (!isRecord(entry)) {
			problems.push(`${label}: erwartet wird eine Zuordnung.`);
			return;
		}
		const missing = REQUIRED_FIELDS.filter(
			(field) => typeof entry[field] !== "string" || entry[field] === "",
		);
		if (missing.length > 0) {
			problems.push(
				`${label}: Pflichtfeld(er) fehlen oder sind leer: ${missing.join(", ")}.`,
			);
			return;
		}
		const filename = String(entry.filename);
		if (seen.has(filename)) {
			// Zwei Verträge auf dieselbe Datei hieße: der zweite überschreibt den
			// ersten bei jedem Lauf, und keiner der beiden ist je vollständig.
			problems.push(`${label}: Dateiname doppelt vergeben: ${filename}.`);
			return;
		}
		seen.add(filename);
		vertraege.push({
			filename,
			ledgerKategorie: String(entry.ledger_kategorie),
			vertragspartner: String(entry.vertragspartner),
			vertragKategorie: String(entry.vertrag_kategorie),
			vertragSubkategorie: String(entry.vertrag_subkategorie),
			abbuchtVonKonto: String(entry.abbucht_von_konto),
			aliases: stringList(entry.aliases),
			sticker: optionalString(entry.sticker),
			noteExtraWarning: optionalString(entry.note_extra_warning),
		});
	});

	if (problems.length > 0) {
		throw new ConfigError(
			`vertraege.yaml ist fehlerhaft:\n- ${problems.join("\n- ")}`,
		);
	}
	return { vertraege };
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function optionalString(value: unknown): string {
	return typeof value === "string" ? value : "";
}

function stringList(value: unknown): string[] {
	return Array.isArray(value)
		? value.filter((v): v is string => typeof v === "string")
		: [];
}
