/**
 * Der durchgereichte Konfigurations-Kontext.
 *
 * Der Python-Importer lädt seine Konfiguration beim **Modul-Import** in Globals
 * (`_KONTEN`, `IBAN_TO_LEDGER`, `KONTO_SPECS`, `OWNER_NAMES`, …). In einem
 * Plugin geht das nicht: `loadData()` ist async, zur Ladezeit ist noch nichts da,
 * und eine Settings-Änderung muss beim nächsten Lauf greifen — ein Modul-Global
 * würde den alten Stand konservieren, bis Obsidian neu startet.
 *
 * Deshalb hält **kein** Modul des Kerns Konfiguration; jede Funktion, die sie
 * braucht, bekommt diesen Kontext als Parameter. Das ist der Umbau, der laut
 * Roadmap „praktisch jede Funktionssignatur betrifft" — er passiert hier einmal,
 * am Fundament, damit ihn keine spätere Etappe nachziehen muss.
 */

import type { IsoDate } from "../dates";
import {
	activeKonten,
	ibanById,
	ibanByRolle,
	ibanToFilename,
	ibanToLedger,
	importedLedgerAccounts,
	ledgerByRolle,
	type KontenConfig,
	type KontoSpec,
} from "./konten";

/**
 * Zeitquelle. Als Port, damit Perioden-Logik („aktueller Monat") testbar bleibt —
 * ein Test, der vom echten Datum abhängt, wird irgendwann von selbst rot.
 */
export interface ClockPort {
	/** Heutiges Datum als `YYYY-MM-DD` in lokaler Zeit. */
	today(): IsoDate;
}

/** Uhr, die ein festes Datum liefert — der Default in Tests. */
export function fixedClock(date: IsoDate): ClockPort {
	return { today: () => date };
}

/** Uhr auf Basis der Systemzeit. Bewusst lokal, nicht UTC: Buchungstage sind lokal. */
export function systemClock(): ClockPort {
	return {
		today: () => {
			const now = new Date();
			const year = String(now.getFullYear()).padStart(4, "0");
			const month = String(now.getMonth() + 1).padStart(2, "0");
			const day = String(now.getDate()).padStart(2, "0");
			return `${year}-${month}-${day}`;
		},
	};
}

export interface ImporterContextInput {
	konten: KontenConfig;
	/**
	 * Vault-relativer Projektordner, unter dem die generierten Notizen liegen —
	 * Basis aller Wikilinks (Python: `FINANCE_VAULT_PREFIX`).
	 */
	notesPrefix: string;
	/** Abweichende Ordnernamen; nicht Genanntes bleibt auf der Vorgabe. */
	folders?: Partial<NoteFolders>;
	clock?: ClockPort;
}

/**
 * Ordnernamen der generierten Notiz-Gattungen, jeweils unter `notesPrefix`.
 *
 * Im Python-Importer stehen diese Namen als Literale in jedem Wikilink-Bauer.
 * Hier gehören sie in den Kontext, weil das Plugin drei davon bereits über
 * Einstellungen führt (`state/financePaths.ts`): verlinkt der Importer nach
 * `45-Kategorien`, während die Ansicht `Kategorien` liest, zeigen die Links
 * ins Leere — und zwar still.
 */
export interface NoteFolders {
	kategorien: string;
	empfaenger: string;
	rules: string;
	konten: string;
	vertraege: string;
	mandate: string;
	monatsberichte: string;
	quartalsberichte: string;
	jahresberichte: string;
}

/** Die Namen, die der Python-Importer fest verdrahtet hat. */
export const DEFAULT_NOTE_FOLDERS: NoteFolders = {
	kategorien: "45-Kategorien",
	empfaenger: "60-Empfänger",
	rules: "55-Categorizer-Rules",
	konten: "10-Konten",
	vertraege: "20-Verträge",
	mandate: "50-Mandate",
	monatsberichte: "40-Monatsberichte",
	quartalsberichte: "70-Quartalsberichte",
	jahresberichte: "80-Jahresberichte",
};

/**
 * Konfiguration plus die daraus abgeleiteten Nachschlagetabellen.
 *
 * Die Ableitungen werden einmal beim Bauen berechnet, nicht bei jedem Zugriff:
 * sie werden pro Import über tausende Buchungen befragt.
 */
export interface ImporterContext {
	readonly konten: KontenConfig;
	/** Nur aktive Konten, in Konfigurationsreihenfolge. */
	readonly activeKonten: readonly KontoSpec[];
	readonly notesPrefix: string;
	/** Letztes Segment des Prefix = Name der Projekt-Ordnernotiz. */
	readonly projectNote: string;
	readonly folders: NoteFolders;
	readonly clock: ClockPort;

	readonly ibanToLedger: ReadonlyMap<string, string>;
	readonly ledgerByRolle: ReadonlyMap<string, string>;
	readonly ibanByRolle: ReadonlyMap<string, string>;
	readonly ibanById: ReadonlyMap<string, string>;
	readonly ibanToFilename: ReadonlyMap<string, string>;
	readonly importedLedgerAccounts: ReadonlySet<string>;
}

export const DEFAULT_NOTES_PREFIX = "Finanzplan";

export function createImporterContext(
	input: ImporterContextInput,
): ImporterContext {
	const notesPrefix = normalizePrefix(input.notesPrefix);
	return {
		konten: input.konten,
		activeKonten: activeKonten(input.konten),
		notesPrefix,
		projectNote: notesPrefix.split("/").filter(Boolean).at(-1) ?? notesPrefix,
		folders: { ...DEFAULT_NOTE_FOLDERS, ...input.folders },
		clock: input.clock ?? systemClock(),
		ibanToLedger: ibanToLedger(input.konten),
		ledgerByRolle: ledgerByRolle(input.konten),
		ibanByRolle: ibanByRolle(input.konten),
		ibanById: ibanById(input.konten),
		ibanToFilename: ibanToFilename(input.konten),
		importedLedgerAccounts: importedLedgerAccounts(input.konten),
	};
}

/** Führende/abschließende Schrägstriche weg — sonst entstehen `[[/x/y]]`-Links. */
function normalizePrefix(prefix: string): string {
	const trimmed = prefix.trim().replace(/^\/+|\/+$/g, "");
	return trimmed === "" ? DEFAULT_NOTES_PREFIX : trimmed;
}
