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
 *   2. Der Python-Importer läuft mit `FINANCE_VAULT=<referenz-vault>`, bei E5 zusätzlich mit
 *      `--all-aggregates --all-kategorie-notes --all-empfaenger-notes --all-tx-typ-notes --all-mandate-notes --all-categorizer-rule-bodies --no-vertraege --no-konten --no-report --vault-dir <referenz-vault>`.
 *   3. Dieses Skript läuft über denselben Umsatzordner.
 *   4. Vergleich der erzeugten `.ledger`-Dateien und, seit E5, aller Berichte (`40-Monatsberichte`,
 *      `70-Quartalsberichte`, `80-Jahresberichte`), seit E6 der Dimensions-Notizen (`45-Kategorien`, `60-Empfänger`,
 *      `50-Tx-Typen`), seit E7 der Mandate (`50-Mandate`) und der Regel-Rümpfe (`55-Categorizer-Rules`): gleiche Dateimenge, gleicher Inhalt Byte für Byte.
 *
 * Aufruf:
 *   npm run parity -- <config.json> <ziel-vault> [referenz-vault]
 *
 * Ohne `referenz-vault` wird nur geschrieben, nicht verglichen.
 */

import { existsSync } from "node:fs";
import { mkdir, readFile, readdir, stat, writeFile, rm } from "node:fs/promises";
import { dirname, isAbsolute, join } from "node:path";
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

/** Vault-relative Pfade (die Berichte) liegen unter dem Ziel-Vault, absolute (Journal, Umsätze) bleiben. */
const abs = (path: string): string => (isAbsolute(path) ? path : join(targetVault, path));

/** VaultPort über das Dateisystem — der Kern merkt vom Unterschied nichts. */
const fsVault: VaultPort = {
	read: (path) => readFile(abs(path), "utf-8"),
	readBinary: async (path) => {
		const buf = await readFile(abs(path));
		return buf.buffer.slice(
			buf.byteOffset,
			buf.byteOffset + buf.byteLength,
		) as ArrayBuffer;
	},
	write: async (path, content) => {
		await mkdir(dirname(abs(path)), { recursive: true });
		await writeFile(abs(path), content, "utf-8");
	},
	writeBinary: async () => undefined,
	exists: async (path) => existsSync(abs(path)),
	mkdir: async (path) => {
		await mkdir(abs(path), { recursive: true });
	},
	remove: async (path) => {
		await rm(abs(path), { force: true });
	},
	list: async (folder) => {
		if (!existsSync(abs(folder))) return [];
		return (await readdir(abs(folder))).map((name) => join(folder, name)).sort();
	},
	stat: async (path) =>
		existsSync(abs(path)) ? { mtime: (await stat(abs(path))).mtimeMs } : null,
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
	berichte: true,
	dimensionen: true,
	mandate: true,
	regelRuempfe: { folder: "55-Categorizer-Rules" },
	log: { info: () => undefined, warn: (m) => console.error(`WARN ${m}`) },
});

console.log("TypeScript-Lauf:", JSON.stringify(result, null, 1));

if (!referenceVault) {
	process.exit(0);
}

/**
 * Konten, die der TS-Lauf deklariert und der Python-Importer nicht, obwohl sein Categorizer darauf bucht
 * (`categorizer.py:139`; `ledger.py:156` führt nur `Partnerin:Erika`). Das TS-Ergebnis ist das richtigere:
 * hledger kennt das gebuchte Konto sonst nicht. Der Python-Importer bleibt unverändert (Archiv-Repo, wird
 * nach E7 gelöscht).
 */
const KNOWN_EXTRA_ACCOUNTS = ["Ausgaben:Privat_Transfers:Familie:Erika"];

let differences = 0;
for (const name of ["journal.ledger", "accounts.ledger"]) {
	const mine = await readFile(join(targetVault, "Ledger", name), "utf-8");
	const theirs = await readFile(join(referenceVault, "Ledger", name), "utf-8");
	if (mine === theirs) {
		console.log(`✓ ${name}: byte-gleich (${mine.length} Zeichen)`);
		continue;
	}
	if (name === "accounts.ledger" && onlyKnownExtraAccounts(mine, theirs)) {
		console.log(`✓ ${name}: gleich bis auf bekannte Abweichung (${KNOWN_EXTRA_ACCOUNTS.join(", ")})`);
		continue;
	}
	differences++;
	console.log(`✗ ${name}: unterschiedlich`);
	reportFirstDifferences(mine, theirs);
}

for (const folder of [ctx.folders.monatsberichte, ctx.folders.quartalsberichte, ctx.folders.jahresberichte]) {
	differences += await compareFolder(folder);
}
// Dimensions-Notizen (E6). Pythons Kategorie-Notiz titelt ihren Callout mit dem Namen des letzten Top-Empfängers
// (Variablen-Schatten in `_render_body`); die Überschrift wird deshalb vor dem Vergleich vereinheitlicht.
const calloutTitel = (text: string): string => text.replace(/^> \[!info\] .* — alltime Aggregat$/m, "> [!info] … — alltime Aggregat");
differences += await compareFolder(ctx.folders.kategorien, calloutTitel);
differences += await compareFolder(ctx.folders.empfaenger);
differences += await compareFolder(ctx.folders.txTypen);
// Mandate (E7) und Regel-Rümpfe (E7). Die Regel-Notizen liegen im Ziel-Vault direkt unter dem Ordner, nicht unter dem
// Notizen-Präfix: dort hat der Vergleich sie hineinkopiert.
differences += await compareFolder(ctx.folders.mandate);
differences += await compareFolder(ctx.folders.rules, (t) => t, targetVault);

process.exit(differences === 0 ? 0 : 1);

/** Wahr, wenn `mine` genau `theirs` plus bekannte Zusatzkonten ist; jede andere Abweichung bleibt rot. */
function onlyKnownExtraAccounts(mine: string, theirs: string): boolean {
	const known = (line: string): boolean => KNOWN_EXTRA_ACCOUNTS.some((a) => line.trim() === `account ${a}`);
	return mine.split("\n").filter((l) => !known(l)).join("\n") === theirs;
}

/**
 * Vergleicht die Notizen eines Ordners. Der TS-Lauf schreibt unter `<ziel>/<Präfix>/<Ordner>`, der
 * Python-Lauf unter `<referenz>/<Ordner>`; die Präfix-Ebene ist nur der Projektordner.
 */
async function compareFolder(
	folder: string,
	normalize: (text: string) => string = (t) => t,
	mineBase: string = join(targetVault, ctx.notesPrefix),
): Promise<number> {
	const mineDir = join(mineBase, folder);
	const theirsDir = join(referenceVault, folder);
	const mine = existsSync(mineDir) ? (await readdir(mineDir)).sort() : [];
	const theirs = existsSync(theirsDir) ? (await readdir(theirsDir)).sort() : [];
	let diffs = 0;
	if (JSON.stringify(mine) !== JSON.stringify(theirs)) {
		diffs++;
		console.log(`✗ ${folder}: Dateimenge unterschiedlich — TS ${mine.length}, Python ${theirs.length}`);
		console.log(`  nur TS: ${mine.filter((n) => !theirs.includes(n)).join(", ") || "—"}`);
		console.log(`  nur Python: ${theirs.filter((n) => !mine.includes(n)).join(", ") || "—"}`);
	}
	let gleich = 0;
	for (const name of mine.filter((n) => theirs.includes(n))) {
		const a = normalize(await readFile(join(mineDir, name), "utf-8"));
		const b = normalize(await readFile(join(theirsDir, name), "utf-8"));
		if (a === b) {
			gleich++;
			continue;
		}
		diffs++;
		console.log(`✗ ${folder}/${name}: unterschiedlich`);
		reportFirstDifferences(a, b);
	}
	console.log(`${diffs === 0 ? "✓" : "·"} ${folder}: ${gleich} von ${theirs.length} Notizen byte-gleich`);
	return diffs;
}

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
