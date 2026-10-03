/**
 * `konten.yaml` aus dem Vault lesen — die eine Quelle für beide Nutzer.
 *
 * Der Importlauf (`nativeImport`) und die Konto-Auswahl im CSV-Modal brauchen
 * dieselbe Konfiguration. Bis 2026-10-03 holte das Modal sie über
 * `list-konten` aus dem Python-Importer, also über einen Subprozess; seither
 * liest sie beide hier. Das war nicht nur Dopplung: der Subprozess-Weg kostete
 * die Store-Bestnote (`[medium] Shell Execution`) und machte das Modal
 * desktop-only.
 *
 * Obsidian-Berührung bleibt auf diese Datei begrenzt — `parseKontenConfig`
 * selbst ist obsidian-frei und in Node testbar.
 */

import { parseYaml, type App } from "obsidian";
import { parseKontenConfig, type KontenConfig } from "../core/config/konten";
import { ConfigError } from "../core/errors";
import { ObsidianVaultPort } from "./vault-port";

export interface KontenFileReader {
	exists(path: string): Promise<boolean>;
	read(path: string): Promise<string>;
}

/**
 * Liest und prüft `konten.yaml`.
 *
 * Wirft `ConfigError` mit einer Meldung, die für sich steht — der Aufrufer
 * zeigt sie unverändert an.
 */
export async function loadKontenFromVault(
	vault: KontenFileReader,
	kontenFile: string,
): Promise<KontenConfig> {
	if (!(await vault.exists(kontenFile))) {
		throw new ConfigError(
			`Konten-Konfiguration nicht gefunden: ${kontenFile}\n` +
				"Lege die Datei im Vault an (oder kopiere deine bestehende konten.yaml dorthin).",
		);
	}
	const text = await vault.read(kontenFile);
	let data: unknown;
	try {
		data = parseYaml(text);
	} catch (e) {
		throw new ConfigError(
			`${kontenFile} ist kein gültiges YAML: ${(e as Error).message}`,
		);
	}
	return parseKontenConfig(data);
}

/** Bequemer Einstieg für Aufrufer, die nur die `App` haben (Views, Modals). */
export function kontenSourceFor(
	app: App,
	kontenFile: string,
): () => Promise<KontenConfig> {
	return () => loadKontenFromVault(new ObsidianVaultPort(app), kontenFile);
}
