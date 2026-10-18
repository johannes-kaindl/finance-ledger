/**
 * `sparziele.yaml` — welche Sparziele eine eigene Notiz bekommen.
 *
 * Wie `vertraege.yaml` optional: ohne Datei entstehen keine Sparziel-Notizen und kein Fehler. Portiert aus
 * `output/sparziel.py` (§ load_sparziele). `gespart_auf_konto` bleibt die Konto-`id` aus `konten.yaml` und wird erst
 * beim Schreiben über den Kontext aufgelöst — in der Konfiguration soll ein Name stehen, keine IBAN.
 */

import { ConfigError } from "../errors";

export interface SparzielSpec {
	/** Dateiname der Notiz, mit `.md`. */
	filename: string;
	title: string;
	sparzielTyp: string;
	/** Wie in der Datei geschrieben (`6500`, `2500.5`): geht unverändert in die Frontmatter. */
	zielbetragEur: number;
	sparrateMonatlichEur: number;
	/** `null`, wenn kein Datum geplant ist. */
	geplantesZielDatum: string | null;
	/** `id` eines Kontos aus `konten.yaml`. */
	gespartAufKonto: string;
	ledgerKategorie: string;
	aliases: string[];
	sticker: string;
}

export interface SparzieleConfig {
	sparziele: SparzielSpec[];
}

const REQUIRED_TEXT = ["filename", "title", "sparziel_typ", "gespart_auf_konto", "ledger_kategorie", "sticker"];
const REQUIRED_NUMBER = ["zielbetrag_eur", "sparrate_monatlich_eur"];

/** Liest die Sparziel-Konfiguration. Alle Mängel werden gesammelt und zusammen gemeldet (wie bei `parseVertraegeConfig`). */
export function parseSparzieleConfig(data: unknown): SparzieleConfig {
	if (data === null || data === undefined) return { sparziele: [] };
	if (!isRecord(data)) {
		throw new ConfigError("sparziele.yaml: erwartet wird eine Zuordnung mit dem Schlüssel 'sparziele'.");
	}
	const raw = data.sparziele;
	if (raw === undefined || raw === null) return { sparziele: [] };
	if (!Array.isArray(raw)) throw new ConfigError("sparziele.yaml: der Schlüssel 'sparziele' ist keine Liste.");

	const problems: string[] = [];
	const sparziele: SparzielSpec[] = [];
	const seen = new Set<string>();

	raw.forEach((entry, index) => {
		const label = `sparziele[${index}]`;
		if (!isRecord(entry)) {
			problems.push(`${label}: erwartet wird eine Zuordnung.`);
			return;
		}
		const missing = [
			...REQUIRED_TEXT.filter((f) => typeof entry[f] !== "string" || entry[f] === ""),
			...REQUIRED_NUMBER.filter((f) => typeof entry[f] !== "number" || !Number.isFinite(entry[f])),
		];
		if (missing.length > 0) {
			problems.push(`${label}: Pflichtfeld(er) fehlen, sind leer oder keine Zahl: ${missing.join(", ")}.`);
			return;
		}
		const sparrate = entry.sparrate_monatlich_eur as number;
		if (sparrate <= 0) {
			problems.push(`${label}: sparrate_monatlich_eur muss größer als 0 sein.`);
			return;
		}
		const filename = String(entry.filename);
		if (seen.has(filename)) {
			problems.push(`${label}: Dateiname doppelt vergeben: ${filename}.`);
			return;
		}
		seen.add(filename);
		const datum = entry.geplantes_ziel_datum;
		sparziele.push({
			filename,
			title: String(entry.title),
			sparzielTyp: String(entry.sparziel_typ),
			zielbetragEur: entry.zielbetrag_eur as number,
			sparrateMonatlichEur: sparrate,
			geplantesZielDatum: typeof datum === "string" && datum !== "" ? datum : null,
			gespartAufKonto: String(entry.gespart_auf_konto),
			ledgerKategorie: String(entry.ledger_kategorie),
			aliases: Array.isArray(entry.aliases) ? entry.aliases.filter((a): a is string => typeof a === "string") : [],
			sticker: String(entry.sticker),
		});
	});

	if (problems.length > 0) throw new ConfigError(`sparziele.yaml ist fehlerhaft:\n- ${problems.join("\n- ")}`);
	return { sparziele };
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}
