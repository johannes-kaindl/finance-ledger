import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { createImporterContext, fixedClock, type ImporterContext } from "../../../src/core/config/context";
import { parseKontenConfig } from "../../../src/core/config/konten";
import { deriveOwnerNames } from "../../../src/core/import/categorize";
import { runImport, type ImportOptions } from "../../../src/core/import/pipeline";
import { buildRules, type RuleNote } from "../../../src/core/import/rules";
import type { VaultPort } from "../../../src/core/ports";

/**
 * Synthetische Eingaben der Python-Goldmuster (`fixtures/berichte/`, erzeugt von `gen.py`, alles erfunden) und ein
 * Vault im Speicher, in dem der Import läuft. Gemeinsam für die Berichte (E5) und die Dimensions-Notizen (E6).
 */
export const FIX = join(__dirname, "fixtures", "berichte");

const config = JSON.parse(readFileSync(join(FIX, "config.json"), "utf-8")) as { konten: unknown; notes: RuleNote[] };
export { config };

export function makeCtx(today: string): ImporterContext {
	return createImporterContext({
		konten: parseKontenConfig(config.konten),
		notesPrefix: "Finanzplan",
		clock: fixedClock(today),
	});
}

/** Vault im Speicher mit den CSVs der Goldmuster-Eingaben. */
export function vaultMitCsvs(): { port: VaultPort; files: Map<string, string> } {
	const csvs = new Map<string, Buffer>();
	for (const name of readdirSync(join(FIX, "umsaetze"))) {
		csvs.set(`Finanzplan/Umsätze/${name}`, readFileSync(join(FIX, "umsaetze", name)));
	}
	const files = new Map<string, string>();
	const port: VaultPort = {
		read: async (p) => {
			const v = files.get(p);
			if (v === undefined) throw new Error(`nicht gefunden: ${p}`);
			return v;
		},
		readBinary: async (p) => {
			const b = csvs.get(p);
			if (!b) throw new Error(`nicht gefunden: ${p}`);
			return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer;
		},
		write: async (p, c) => void files.set(p, c),
		writeBinary: async () => undefined,
		exists: async (p) => files.has(p) || csvs.has(p),
		mkdir: async () => undefined,
		list: async (f) => [...csvs.keys(), ...files.keys()].filter((p) => p.startsWith(`${f}/`)).sort(),
		remove: async (p) => void files.delete(p),
		stat: async (p) => (csvs.has(p) ? { mtime: 1 } : files.has(p) ? { mtime: 2 } : null),
	};
	return { port, files };
}

export async function importMit(
	ctx: ImporterContext,
	extra: Pick<ImportOptions, "berichte" | "dimensionen" | "mandate" | "regelRuempfe" | "sparziele">,
	vault = vaultMitCsvs(),
) {
	const result = await runImport({
		vault: vault.port,
		ctx,
		rules: buildRules(config.notes),
		ownerNames: deriveOwnerNames(ctx),
		umsatzDir: "Finanzplan/Umsätze",
		outDir: "Finanzplan/Ledger",
		...extra,
	});
	return { result, ...vault };
}
