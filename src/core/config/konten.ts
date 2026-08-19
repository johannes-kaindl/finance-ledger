/**
 * Konten-Konfiguration — Validierung und abgeleitete Nachschlagetabellen.
 *
 * Die YAML bleibt (Entscheidung 2026-08-03) die Wahrheit und liegt im Vault:
 * editierbar und per git nachvollziehbar. Das hat sich bewährt — die
 * Anfangssaldo-Korrekturen vom 2026-08-01 waren nur deshalb reversibel.
 *
 * Dieses Modul ist obsidian-frei: es bekommt das **bereits geparste** Objekt
 * (aus `parseYaml` der Obsidian-Schicht) und prüft es. So braucht der Kern
 * keinen YAML-Parser als Abhängigkeit und bleibt in Node testbar.
 *
 * Ersetzt die Pydantic-Modelle in `mapping/konten_loader.py`.
 */

import { ConfigError } from "../errors";

export interface KontoSpec {
	id: string;
	iban: string;
	ledgerAccount: string;
	bank: string;
	bic: string;
	kontoTyp: string;
	kontoRolle: string;
	csvSchema: string;
	inhaber: string;
	aliases: string[];
	sticker: string;
	rolleBeschreibung: string;
	/** Dateiname der Konto-Notiz; fehlt er, wird er aus Index + Bank gebildet. */
	filename: string | null;
	aktiv: boolean;
}

export interface KontenConfig {
	konten: KontoSpec[];
}

/** Pflichtfelder je Konto — fehlt eines, ist die Konfiguration unbrauchbar. */
const REQUIRED_FIELDS = [
	"id",
	"iban",
	"ledger_account",
	"bank",
	"konto_typ",
	"konto_rolle",
	"csv_schema",
	"inhaber",
] as const;

/**
 * Geparstes YAML → geprüfte Konten-Konfiguration.
 *
 * Meldet **alle** Mängel auf einmal statt beim ersten abzubrechen: wer eine
 * Konfiguration von Hand pflegt, will nicht sieben Läufe für sieben Tippfehler.
 */
export function parseKontenConfig(data: unknown): KontenConfig {
	if (!isRecord(data)) {
		throw new ConfigError(
			"konten.yaml: erwartet wird eine Zuordnung mit dem Schlüssel 'konten'.",
		);
	}
	const raw = data.konten;
	if (!Array.isArray(raw)) {
		throw new ConfigError(
			"konten.yaml: der Schlüssel 'konten' fehlt oder ist keine Liste.",
		);
	}

	const problems: string[] = [];
	const konten: KontoSpec[] = [];

	raw.forEach((entry, index) => {
		const label = `konten[${index}]`;
		if (!isRecord(entry)) {
			problems.push(`${label}: erwartet wird eine Zuordnung.`);
			return;
		}
		const missing = REQUIRED_FIELDS.filter(
			(field) => typeof entry[field] !== "string" || entry[field] === "",
		);
		if (missing.length > 0) {
			const name = typeof entry.id === "string" ? ` (id: ${entry.id})` : "";
			problems.push(
				`${label}${name}: Pflichtfeld(er) fehlen oder sind leer: ${missing.join(", ")}.`,
			);
			return;
		}
		konten.push({
			id: String(entry.id),
			iban: String(entry.iban),
			ledgerAccount: String(entry.ledger_account),
			bank: String(entry.bank),
			bic: optionalString(entry.bic),
			kontoTyp: String(entry.konto_typ),
			kontoRolle: String(entry.konto_rolle),
			csvSchema: String(entry.csv_schema),
			inhaber: String(entry.inhaber),
			aliases: stringList(entry.aliases),
			sticker: optionalString(entry.sticker),
			rolleBeschreibung: optionalString(entry.rolle_beschreibung),
			filename:
				typeof entry.filename === "string" && entry.filename !== ""
					? entry.filename
					: null,
			aktiv: entry.aktiv === undefined ? true : entry.aktiv !== false,
		});
	});

	if (problems.length > 0) {
		throw new ConfigError(`konten.yaml ist fehlerhaft:\n- ${problems.join("\n- ")}`);
	}
	if (konten.length === 0) {
		throw new ConfigError("konten.yaml enthält kein einziges Konto.");
	}
	return { konten };
}

/** Nur die aktiven Konten — jede Ableitung unten baut darauf auf. */
export function activeKonten(cfg: KontenConfig): KontoSpec[] {
	return cfg.konten.filter((k) => k.aktiv);
}

export function ibanToLedger(cfg: KontenConfig): Map<string, string> {
	return new Map(activeKonten(cfg).map((k) => [k.iban, k.ledgerAccount]));
}

export function ledgerByRolle(cfg: KontenConfig): Map<string, string> {
	return new Map(activeKonten(cfg).map((k) => [k.kontoRolle, k.ledgerAccount]));
}

export function ibanByRolle(cfg: KontenConfig): Map<string, string> {
	return new Map(activeKonten(cfg).map((k) => [k.kontoRolle, k.iban]));
}

export function ibanById(cfg: KontenConfig): Map<string, string> {
	return new Map(activeKonten(cfg).map((k) => [k.id, k.iban]));
}

/** IBAN → Dateiname der Konto-Notiz (ohne `.md`). */
export function ibanToFilename(cfg: KontenConfig): Map<string, string> {
	return new Map(
		activeKonten(cfg).map((k, idx) => [
			k.iban,
			stripMd(k.filename ?? defaultFilename(idx, k.bank)),
		]),
	);
}

/**
 * Ledger-Konten, für die eine eigene CSV importiert wird.
 *
 * Genau diese Menge entscheidet, ob eine Umbuchung übers Verrechnungskonto
 * laufen darf: hat die Gegenseite keine eigene CSV, kommt nie eine zweite
 * Zeile, und der Betrag bliebe im Durchlaufkonto liegen (Defekt vom 2026-08-01).
 */
export function importedLedgerAccounts(cfg: KontenConfig): Set<string> {
	return new Set(activeKonten(cfg).map((k) => k.ledgerAccount));
}

export function defaultFilename(index: number, bank: string): string {
	const bankShort = bank.split(/\s+/)[0] || "Bank";
	return `Konto ${String(index + 1).padStart(2, "0")} – ${bankShort}.md`;
}

function stripMd(name: string): string {
	return name.endsWith(".md") ? name.slice(0, -3) : name;
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
