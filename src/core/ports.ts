/**
 * Ports des Importer-Kerns — die einzige Art, wie er die Außenwelt berührt.
 *
 * Der Kern kennt weder `App` noch `TFile` noch `fs`. Er beschreibt hier, was er
 * braucht; die Adapter dazu liegen unter `src/obsidian/`. Das ist die Lehre aus
 * den fünf Import-Defekten vom 2026-08-01: vier davon existierten nur, weil ein
 * *fremder Prozess* die Dateien anfasste. Ein Port lässt sich in Node ohne
 * Obsidian-Mock end-to-end testen — ein Subprozess nicht.
 *
 * Muster übernommen aus `vault-crews/src/obsidian/vault-port.ts` (Kit-first,
 * 2. Exemplar), erweitert um `readBinary`: `Vault#read()` erzwingt UTF-8 und
 * zerstört damit jeden Latin-1-Umlaut der Bank-CSVs.
 */

/** Lesender und schreibender Zugriff auf Vault-Dateien. */
export interface VaultPort {
	/** Textdatei lesen (UTF-8). Wirft, wenn es sie nicht gibt. */
	read(path: string): Promise<string>;
	/**
	 * Datei als Bytes lesen — der einzige korrekte Weg für Bank-CSVs.
	 * Die Dekodierung entscheidet der Aufrufer (`core/text/decode`).
	 */
	readBinary(path: string): Promise<ArrayBuffer>;
	/** Datei schreiben, Verzeichnisse werden bei Bedarf angelegt. */
	write(path: string, content: string): Promise<void>;
	writeBinary(path: string, data: ArrayBuffer): Promise<void>;
	exists(path: string): Promise<boolean>;
	/** Verzeichnis rekursiv anlegen; idempotent. */
	mkdir(path: string): Promise<void>;
	/** Dateien direkt in einem Verzeichnis, sortiert. Kein Rekursionsabstieg. */
	list(folder: string): Promise<string[]>;
	/**
	 * Änderungszeitpunkt in Millisekunden, oder `null`, wenn es die Datei nicht
	 * gibt. Der Cross-CSV-Dedupe entscheidet damit, welche von zwei gleichen
	 * Buchungen gewinnt: die aus der zuletzt abgelegten Datei.
	 */
	stat(path: string): Promise<{ mtime: number } | null>;
}

/** Meldungen aus dem Kern nach draußen — Fortschritt und Diagnose. */
export interface LogPort {
	info(message: string): void;
	warn(message: string): void;
}

/** Log, das nichts tut — Default in Tests. */
export const silentLog: LogPort = {
	info: () => undefined,
	warn: () => undefined,
};

/** Log, das alles sammelt — für Import-Reports und Testzusicherungen. */
export function collectingLog(): LogPort & { messages: string[] } {
	const messages: string[] = [];
	return {
		messages,
		info: (m) => messages.push(`INFO ${m}`),
		warn: (m) => messages.push(`WARN ${m}`),
	};
}
