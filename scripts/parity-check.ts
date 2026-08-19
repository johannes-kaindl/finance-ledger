/**
 * Abnahmelauf des Importer-Ports: derselbe Umsatzordner, beide Implementierungen,
 * Ausgaben byte-weise verglichen.
 *
 * Solange der Python-Importer existiert, ist das der stärkste verfügbare Beleg
 * für Verhaltensgleichheit — und er kostet nichts. Das Skript importiert den
 * **Produktionscode** aus `src/core/`, spiegelt ihn also nicht (Muster aus
 * `obsidian-transmute/scripts/diagnose-lab.ts`).
 *
 * Ablauf:
 *   1. `python3 scripts/parity-export.py <konten.yaml> <rules-dir> <config.json>`
 *      schreibt Konten und Regel-Frontmatter als JSON heraus.
 *   2. Der Python-Importer läuft mit `FINANCE_VAULT=<referenz-vault>`.
 *   3. Dieses Skript läuft über denselben Umsatzordner.
 *   4. `diff` über die erzeugten `.ledger`-Dateien.
 *
 * Aufruf:
 *   npm run parity -- <config.json> <ziel-vault> [referenz-vault]
 *
 * Ohne `referenz-vault` wird nur geschrieben, nicht verglichen.
 */

import { existsSync } from "node:fs";
import { mkdir, readFile, readdir, stat, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { createImporterContext } from "../src/core/config/context";
import { parseKontenConfig } from "../src/core/config/konten";
import { deriveOwnerNames } from "../src/core/import/categorize";
import { runImport } from "../src/core/import/pipeline";
import { buildRules, type RuleNote } from "../src/core/import/rules";
import type { VaultPort } from "../src/core/ports";

const [configPath, targetVault, referenceVault] = process.argv.slice(2);

if (!configPath || !targetVault) {
	console.error(
		"Aufruf: npm run parity -- <config.json> <ziel-vault> [referenz-vault]",
	);
	process.exit(2);
}

/** VaultPort über das Dateisystem — der Kern merkt vom Unterschied nichts. */
const fsVault: VaultPort = {
	read: (path) => readFile(path, "utf-8"),
	readBinary: async (path) => {
		const buf = await readFile(path);
		return buf.buffer.slice(
			buf.byteOffset,
			buf.byteOffset + buf.byteLength,
		) as ArrayBuffer;
	},
	write: async (path, content) => {
		await mkdir(dirname(path), { recursive: true });
		await writeFile(path, content, "utf-8");
	},
	writeBinary: async () => undefined,
	exists: async (path) => existsSync(path),
	mkdir: async (path) => {
		await mkdir(path, { recursive: true });
	},
	list: async (folder) => {
		if (!existsSync(folder)) return [];
		return (await readdir(folder)).map((name) => join(folder, name)).sort();
	},
	stat: async (path) =>
		existsSync(path) ? { mtime: (await stat(path)).mtimeMs } : null,
};

const raw = JSON.parse(await readFile(configPath, "utf-8")) as {
	konten: unknown;
	notes: RuleNote[];
};

const ctx = createImporterContext({
	konten: parseKontenConfig(raw.konten),
	notesPrefix: "Finanzplan",
});

const result = await runImport({
	vault: fsVault,
	ctx,
	rules: buildRules(raw.notes),
	ownerNames: deriveOwnerNames(ctx),
	umsatzDir: join(targetVault, "Umsätze"),
	outDir: join(targetVault, "Ledger"),
	log: { info: () => undefined, warn: (m) => console.error(`WARN ${m}`) },
});

console.log("TypeScript-Lauf:", JSON.stringify(result, null, 1));

if (!referenceVault) {
	process.exit(0);
}

let differences = 0;
for (const name of ["journal.ledger", "accounts.ledger"]) {
	const mine = await readFile(join(targetVault, "Ledger", name), "utf-8");
	const theirs = await readFile(join(referenceVault, "Ledger", name), "utf-8");
	if (mine === theirs) {
		console.log(`✓ ${name}: byte-gleich (${mine.length} Zeichen)`);
		continue;
	}
	differences++;
	console.log(`✗ ${name}: unterschiedlich`);
	reportFirstDifferences(mine, theirs);
}

process.exit(differences === 0 ? 0 : 1);

/** Zeigt die ersten abweichenden Zeilen — mehr braucht die Fehlersuche selten. */
function reportFirstDifferences(mine: string, theirs: string): void {
	const a = mine.split("\n");
	const b = theirs.split("\n");
	console.log(`  Zeilen: TS ${a.length}, Python ${b.length}`);
	let shown = 0;
	for (let i = 0; i < Math.max(a.length, b.length) && shown < 10; i++) {
		if (a[i] !== b[i]) {
			console.log(`  Zeile ${i + 1}:`);
			console.log(`    TS     : ${JSON.stringify(a[i])}`);
			console.log(`    Python : ${JSON.stringify(b[i])}`);
			shown++;
		}
	}
}
