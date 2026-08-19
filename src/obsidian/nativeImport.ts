/**
 * Der Importlauf im Plugin — ohne Python, ohne Subprozess.
 *
 * Diese Schicht besorgt, was der Kern braucht (Konten-Konfiguration, Regeln,
 * Pfade), und ruft dann `runImport`. Sie ist der einzige Ort, der Obsidian
 * kennt; der Lauf selbst ist in Node testbar.
 *
 * Läuft auch auf Mobilgeräten: der Kern berührt kein einziges Node-Modul. Der
 * Weg über den Python-Prozess war der Grund, warum der Import bisher
 * Desktop-only war.
 */

import { parseYaml, type App } from "obsidian";
import { loadCategorizerRules } from "../categorizer-rules/loader";
import { createImporterContext } from "../core/config/context";
import { parseKontenConfig } from "../core/config/konten";
import { parseVertraegeConfig, type VertragSpec } from "../core/config/vertraege";
import { ConfigError } from "../core/errors";
import { deriveOwnerNames } from "../core/import/categorize";
import { runImport, type ImportResult } from "../core/import/pipeline";
export type { ImportResult };
import { buildRules, type RuleNote } from "../core/import/rules";
import type { LogPort } from "../core/ports";
import type { ResolvedFinancePaths } from "../state/financePaths";
import { ObsidianVaultPort } from "./vault-port";

export interface NativeImportOptions {
	app: App;
	paths: ResolvedFinancePaths;
	log?: LogPort;
}

/**
 * Führt den Import aus.
 *
 * Wirft `ConfigError` mit einer Meldung, die für sich steht — der Aufrufer
 * zeigt sie unverändert an, statt einen Stacktrace weiterzureichen.
 */
export async function runNativeImport(
	options: NativeImportOptions,
): Promise<NativeImportResult> {
	const { app, paths } = options;
	if (!paths.isConfigured) {
		throw new ConfigError(
			"Kein Finanzordner konfiguriert — bitte in den Einstellungen setzen.",
		);
	}

	const vault = new ObsidianVaultPort(app);
	const konten = await loadKontenFromVault(vault, paths.kontenFile);
	const ctx = createImporterContext({
		konten,
		// Die Wikilinks der generierten Notizen hängen am Projektordner selbst.
		notesPrefix: paths.root,
	});

	const { notes, incomplete } = collectRuleNotes(app);
	const result = await runImport({
		vault,
		ctx,
		rules: buildRules(notes),
		ownerNames: deriveOwnerNames(ctx),
		umsatzDir: paths.umsatzDir,
		outDir: dirnameOf(paths.journal),
		stammdaten: {
			vertraege: await loadVertraegeFromVault(vault, paths.vertraegeFile),
		},
		log: options.log,
	});
	return { ...result, incompleteRules: incomplete };
}

export interface NativeImportResult extends ImportResult {
	/** Regel-Notizen mit fehlendem Pflichtfeld — verworfen, aber gemeldet. */
	incompleteRules: string[];
}

/**
 * Liest `konten.yaml` aus dem Vault.
 *
 * Die Datei bleibt bewusst YAML im Vault statt in den Plugin-Einstellungen:
 * so ist sie editierbar und per git nachvollziehbar — genau das machte die
 * Anfangssaldo-Korrekturen vom 2026-08-01 reversibel.
 */
async function loadKontenFromVault(
	vault: ObsidianVaultPort,
	kontenFile: string,
) {
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

/**
 * Liest `vertraege.yaml`, wenn es sie gibt.
 *
 * Anders als `konten.yaml` ist die Datei optional: wer keine Verträge pflegt,
 * bekommt keine Vertrags-Notizen und keinen Fehler. Ein **kaputtes** YAML wird
 * dagegen gemeldet — das ist ein Tippfehler, kein Verzicht.
 */
async function loadVertraegeFromVault(
	vault: ObsidianVaultPort,
	vertraegeFile: string,
): Promise<VertragSpec[]> {
	if (vertraegeFile === "" || !(await vault.exists(vertraegeFile))) {
		return [];
	}
	const text = await vault.read(vertraegeFile);
	let data: unknown;
	try {
		data = parseYaml(text);
	} catch (e) {
		throw new ConfigError(
			`${vertraegeFile} ist kein gültiges YAML: ${(e as Error).message}`,
		);
	}
	return parseVertraegeConfig(data).vertraege;
}

/**
 * Regel-Notizen des Vaults in die Form, die der Kern erwartet.
 *
 * Der bestehende Loader wird weiterverwendet — er liest denselben
 * Frontmatter-Vertrag, den auch die Regelverwaltung schreibt. Sortiert wird
 * erst im Kern (`buildRules`), damit beide Wege dieselbe Reihenfolge ergeben.
 */
function collectRuleNotes(app: App): {
	notes: RuleNote[];
	incomplete: string[];
} {
	const { counterpartyRules, paypalRules, incomplete } =
		loadCategorizerRules(app);
	return {
		notes: [...counterpartyRules, ...paypalRules].map((rule) => ({
			pattern: rule.pattern,
			patternType: rule.patternType,
			ledgerAccount: rule.ledgerAccount,
			priority: rule.priority,
			tags: rule.tags,
			aliases: rule.aliases,
			sourceFile: rule.noteFile,
		})),
		incomplete,
	};
}

function dirnameOf(path: string): string {
	const cut = path.lastIndexOf("/");
	return cut === -1 ? "" : path.slice(0, cut);
}
