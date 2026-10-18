/**
 * Der Importlauf: CSVs lesen, entdoppeln, kategorisieren, Journal schreiben.
 *
 * Port von `cli.process_csv_files` + `output/ledger.write_outputs`. Alles läuft
 * über Ports — kein Vault, kein `fs`, kein Subprozess. Genau das macht den Lauf
 * in Node vollständig testbar, und genau daran scheiterten vier der fünf
 * Import-Defekte vom 2026-08-01.
 */

import type { ImporterContext } from "../config/context";
import type { VertragSpec } from "../config/vertraege";
import { InputFormatError } from "../errors";
import { alleBerichtePerioden, berichtPath, planBerichte } from "../notes/berichtNotes";
import { dimensionPaths, planDimensionNotes } from "../notes/dimensionNotes";
import { mandatPaths, planMandatNotes, type VertragNotiz } from "../notes/mandatNotes";
import type { SparzielSpec } from "../config/sparziele";
import { REPORT_FILENAME, renderReport } from "../notes/reportNotes";
import { planSparziele } from "../notes/sparzielNotes";
import { planRuleBodies, type RegelNotiz } from "../notes/ruleBodies";
import { kontoNotePath, planKontoNotes, type NotePlan } from "../notes/kontoNotes";
import { planVertragNotes } from "../notes/vertragNotes";
import { formatOpeningBalances } from "./openingBalances";
import { silentLog, type LogPort, type VaultPort } from "../ports";
import { decodeLatin1, decodeUtf8OrLatin1 } from "../text/decode";
import type { CategorizationResult, SignDependentRule } from "./categorize";
import { txHash } from "./dedupe";
import { DEFAULT_SIGN_RULES, signRuleAccounts } from "./defaultSignRules";
import { detectSchema, SCHEMA_VISA } from "./detectSchema";
import {
	categorizeAll,
	formatAccounts,
	formatJournal,
	type CategorizedTx,
} from "./journal";
import { parseCamt52 } from "./parsers/camt52";
import { parseVisa } from "./parsers/visa";
import type { CategorizerRules } from "./rules";
import type { BankTransaction } from "./transaction";

/** Endung, an der Umsatzdateien erkannt werden — Sparkasse liefert Großschreibung. */
const CSV_PATTERN = /\.csv$/i;

export const JOURNAL_FILENAME = "journal.ledger";
export const ACCOUNTS_FILENAME = "accounts.ledger";
export const OPENING_BALANCES_FILENAME = "opening_balances.ledger";

export interface ImportOptions {
	vault: VaultPort;
	ctx: ImporterContext;
	rules: CategorizerRules;
	ownerNames: readonly string[];
	/** Verzeichnis mit den Bank-CSVs. */
	umsatzDir: string;
	/** Zielverzeichnis für journal.ledger und accounts.ledger. */
	outDir: string;
	signRules?: readonly SignDependentRule[];
	/**
	 * Stammdaten-Notizen mitschreiben (E3). Fehlt das Feld, entstehen nur die
	 * Ledger-Dateien — der Alltagsimport soll nicht unangekündigt anfangen,
	 * Dutzende Notizen anzufassen.
	 */
	stammdaten?: { vertraege: readonly VertragSpec[] };
	/**
	 * Monats-, Quartals- und Jahresberichte mitschreiben (E5). Wie die Stammdaten opt-in: ein Lauf, der nur das
	 * Journal erneuern soll, legt nicht unangekündigt Dutzende Notizen an.
	 */
	berichte?: boolean;
	/**
	 * Kategorie-, Empfänger- und Tx-Typ-Notizen mitschreiben (E6). Opt-in aus demselben Grund wie die Berichte:
	 * bei einem Bestand mit hunderten Empfängern sind das hunderte Notizen.
	 */
	dimensionen?: boolean;
	/** Mandats-Notizen mitschreiben (E7). Opt-in wie die übrigen Notizen. */
	mandate?: boolean;
	/**
	 * Rümpfe der Regel-Notizen im angegebenen Vault-Ordner mitschreiben (E7): Regel-Übersicht und Beispiel-Buchungen
	 * unter dem Marker-Block. Der Ordner kommt von außen, weil die Regel-Verwaltung ihn frei wählen lässt.
	 */
	regelRuempfe?: { folder: string };
	/** Sparziel-Notizen aus `sparziele.yaml` mitschreiben (E7). Fehlt das Feld, entstehen keine. */
	sparziele?: readonly SparzielSpec[];
	/** `import_report.md` neben dem Journal mitschreiben (E7). */
	report?: boolean;
	log?: LogPort;
}

export interface ImportResult {
	/** Buchungen im geschriebenen Journal. */
	transactionCount: number;
	/** Eingelesene Dateien, in Verarbeitungsreihenfolge. */
	files: string[];
	/** Über Dateigrenzen hinweg verworfene Doppelungen. */
	duplicatesSkipped: number;
	/** Übersprungene vorgemerkte Buchungen. */
	vorgemerktSkipped: number;
	/** Buchungen ohne Zuordnung (`:tbc:`) — die Arbeitsliste der Triage. */
	unkategorisiert: number;
	writtenFiles: string[];
	/** Angelegte oder nachgezogene Stammdaten-Notizen. */
	notesWritten: number;
	/** Neu angelegte oder geänderte Berichte; unveränderte werden nicht angefasst und zählen nicht. */
	reportsWritten: number;
	/** Neu angelegte oder geänderte Dimensions-Notizen (Kategorie, Empfänger, Tx-Typ); unveränderte zählen nicht. */
	dimensionNotesWritten: number;
	/** Neu angelegte oder geänderte Mandats-Notizen und Regel-Rümpfe (E7); unveränderte zählen nicht. */
	mandatNotesWritten: number;
	ruleBodiesWritten: number;
	/** Angelegte oder geänderte Sparziel-Notizen und die, die unangetastet blieben (Nutzer-Notiz ohne Marker-Block). */
	sparzielNotesWritten: number;
	sparzielSkipped: string[];
	/** `true`, wenn der Import-Report neu entstand oder sich änderte. */
	importReportWritten: boolean;
	/** Frühester und spätester Buchungstag, `null` bei leerem Ergebnis. */
	dateRange: { first: string; last: string } | null;
}

/**
 * Eine eingelesene Datei mit ihren Buchungen.
 *
 * Der Hash wird einmal je Buchung berechnet und mitgeführt — er wird beim
 * Entdoppeln zweimal gebraucht und ist die teuerste Einzeloperation im Lauf.
 */
interface ParsedFile {
	name: string;
	mtime: number;
	entries: { hash: string; tx: BankTransaction }[];
	vorgemerkt: number;
}

export async function runImport(options: ImportOptions): Promise<ImportResult> {
	const log = options.log ?? silentLog;
	const signRules = options.signRules ?? DEFAULT_SIGN_RULES;

	const parsed = await readCsvFiles(options, log);
	const { transactions, duplicatesSkipped } = dedupeAcrossFiles(parsed, log);

	const categorized = categorizeAll(transactions, {
		ctx: options.ctx,
		rules: options.rules,
		ownerNames: options.ownerNames,
		signRules,
	});

	const journalPath = join(options.outDir, JOURNAL_FILENAME);
	const accountsPath = join(options.outDir, ACCOUNTS_FILENAME);
	await options.vault.write(journalPath, formatJournal(categorized));
	await options.vault.write(
		accountsPath,
		formatAccounts(options.ctx, options.rules, signRuleAccounts(signRules)),
	);
	const writtenFiles = [journalPath, accountsPath];

	// Erst die Notizen, dann die Eröffnungsbilanz: sie liest `anfangssaldo_*` aus
	// den Konto-Notizen, und beim allerersten Lauf entstehen die gerade eben.
	const notes = options.stammdaten
		? await writeStammdaten(options, categorized, transactions, log)
		: [];

	const berichte = options.berichte ? await writeBerichte(options, categorized, transactions) : [];
	const dimensionen = options.dimensionen ? await writeDimensionen(options, categorized, transactions) : [];
	const mandate = options.mandate ? await writeMandate(options, categorized, transactions) : [];
	const sparziele = options.sparziele ? await writeSparziele(options, options.sparziele, log) : { written: [], skipped: [] };
	const importReport = options.report ? await writeImportReport(options, categorized) : [];
	const regeln = options.regelRuempfe ? await writeRegelRuempfe(options, transactions, options.regelRuempfe.folder) : [];

	const kontenNotes = await readKontoNotes(options);
	const openingPath = join(options.outDir, OPENING_BALANCES_FILENAME);
	await options.vault.write(
		openingPath,
		formatOpeningBalances(options.ctx, kontenNotes),
	);
	writtenFiles.push(openingPath);

	return {
		transactionCount: transactions.length,
		files: parsed.map((p) => p.name),
		duplicatesSkipped,
		vorgemerktSkipped: parsed.reduce((sum, p) => sum + p.vorgemerkt, 0),
		unkategorisiert: countUnkategorisiert(categorized),
		writtenFiles: [...writtenFiles, ...notes, ...berichte, ...dimensionen, ...mandate, ...regeln, ...sparziele.written, ...importReport],
		notesWritten: notes.length,
		reportsWritten: berichte.length,
		dimensionNotesWritten: dimensionen.length,
		mandatNotesWritten: mandate.length,
		ruleBodiesWritten: regeln.length,
		sparzielNotesWritten: sparziele.written.length,
		sparzielSkipped: sparziele.skipped,
		importReportWritten: importReport.length > 0,
		dateRange: dateRange(transactions),
	};
}

/**
 * Liest alle CSVs des Umsatzverzeichnisses.
 *
 * Reihenfolge: Änderungszeit aufsteigend, bei Gleichstand Dateiname. Sie
 * entscheidet beim Entdoppeln, welche Datei eine Buchung „besitzt".
 */
async function readCsvFiles(
	options: ImportOptions,
	log: LogPort,
): Promise<ParsedFile[]> {
	const paths = (await options.vault.list(options.umsatzDir)).filter((p) =>
		CSV_PATTERN.test(p),
	);

	const withTime = await Promise.all(
		paths.map(async (path) => ({
			path,
			mtime: (await options.vault.stat(path))?.mtime ?? 0,
		})),
	);
	withTime.sort(
		(a, b) => a.mtime - b.mtime || basename(a.path).localeCompare(basename(b.path)),
	);

	const parsed: ParsedFile[] = [];
	for (const entry of withTime) {
		const name = basename(entry.path);
		const bytes = await options.vault.readBinary(entry.path);
		const schema = detectSchema(name, options.ctx.konten);
		const { transactions, vorgemerkt } = parseOne(bytes, name, schema);

		if (vorgemerkt > 0) {
			log.info(
				`${name}: ${vorgemerkt} vorgemerkte Buchung(en) übersprungen — ` +
					"sie erscheinen beim nächsten Import als gebucht.",
			);
		}
		parsed.push({
			name,
			mtime: entry.mtime,
			entries: transactions.map((tx) => ({ hash: txHash(tx), tx })),
			vorgemerkt,
		});
	}
	return parsed;
}

function parseOne(
	bytes: ArrayBuffer,
	filename: string,
	schema: string,
): { transactions: BankTransaction[]; vorgemerkt: number } {
	if (schema === SCHEMA_VISA) {
		// Die Visa-Exporte kommen mal als UTF-8, mal als Latin-1.
		return {
			transactions: parseVisa(decodeUtf8OrLatin1(bytes), filename),
			vorgemerkt: 0,
		};
	}
	// CAMT.52 ist laut Spezifikation Latin-1.
	const result = parseCamt52(decodeLatin1(bytes), filename);
	return {
		transactions: result.transactions,
		vorgemerkt: result.skippedVorgemerkt,
	};
}

/**
 * Entdoppelt über Dateigrenzen hinweg.
 *
 * Kommt derselbe Hash in mehreren Dateien vor, gewinnt die zuletzt abgelegte.
 * Doppelungen **innerhalb** einer Datei bleiben bewusst erhalten: ohne
 * Sammlerreferenz kann der zusammengesetzte Hash zwei echte Buchungen gleichen
 * Betrags am selben Tag nicht unterscheiden — und ein erneuter Export enthielte
 * ebenfalls beide.
 */
function dedupeAcrossFiles(
	parsed: readonly ParsedFile[],
	log: LogPort,
): { transactions: BankTransaction[]; duplicatesSkipped: number } {
	const ownerByHash = new Map<string, string>();
	for (const file of parsed) {
		for (const entry of file.entries) {
			ownerByHash.set(entry.hash, file.name);
		}
	}

	const transactions: BankTransaction[] = [];
	let duplicatesSkipped = 0;
	for (const file of parsed) {
		for (const entry of file.entries) {
			if (ownerByHash.get(entry.hash) === file.name) {
				transactions.push(entry.tx);
			} else {
				duplicatesSkipped++;
				log.info(
					`Doppelung übersprungen: ${entry.hash} aus ${file.name} ` +
						`(behalten aus ${ownerByHash.get(entry.hash)})`,
				);
			}
		}
	}
	return { transactions, duplicatesSkipped };
}

/**
 * Zählt neue Buchungen gegen einen bestehenden Bestand.
 *
 * Grundlage der Vorschau im Import-Dialog: „12 neu, 95 bereits vorhanden".
 * Die Vergleichsbasis sind alle **anderen** CSVs — sonst zählte eine bereits
 * abgelegte Datei sich selbst als Doppelung.
 */
export function countAgainstExisting(
	incoming: readonly BankTransaction[],
	existing: readonly BankTransaction[],
): { neu: number; duplikate: number } {
	const existingHashes = new Set(existing.map(txHash));
	let neu = 0;
	let duplikate = 0;
	for (const tx of incoming) {
		if (existingHashes.has(txHash(tx))) {
			duplikate++;
		} else {
			neu++;
		}
	}
	return { neu, duplikate };
}

function countUnkategorisiert(categorized: readonly CategorizedTx[]): number {
	return categorized.filter((item) => item.result.tags.includes("tbc")).length;
}

function dateRange(
	transactions: readonly BankTransaction[],
): { first: string; last: string } | null {
	if (transactions.length === 0) {
		return null;
	}
	let first = transactions[0].buchungstag;
	let last = first;
	for (const tx of transactions) {
		if (tx.buchungstag < first) {
			first = tx.buchungstag;
		}
		if (tx.buchungstag > last) {
			last = tx.buchungstag;
		}
	}
	return { first, last };
}

function basename(path: string): string {
	const cut = path.lastIndexOf("/");
	return cut === -1 ? path : path.slice(cut + 1);
}

function join(folder: string, name: string): string {
	return folder === "" ? name : `${folder.replace(/\/+$/, "")}/${name}`;
}

export { InputFormatError };

/**
 * Schreibt Konto- und Vertrags-Notizen und liefert die berührten Pfade.
 *
 * Bestehende Notizen werden vorher gelesen, weil beide Gattungen nachziehen
 * statt zu ersetzen — was der Nutzer hineingeschrieben hat, überlebt den Lauf.
 */
async function writeStammdaten(
	options: ImportOptions,
	categorized: readonly CategorizedTx[],
	transactions: readonly BankTransaction[],
	log: LogPort,
): Promise<string[]> {
	const vertraege = options.stammdaten?.vertraege ?? [];
	const existing = await readExistingNotes(options, vertraege);

	const kontoPlans = planKontoNotes(options.ctx, transactions, existing);
	const { plans: vertragPlans, skipped } = planVertragNotes(
		options.ctx,
		vertraege,
		categorized,
		existing,
	);
	for (const reason of skipped) {
		log.info(`Vertrag übersprungen: ${reason}`);
	}

	return writePlans(options, [...kontoPlans, ...vertragPlans]);
}

async function writePlans(
	options: ImportOptions,
	plans: readonly NotePlan[],
): Promise<string[]> {
	const written: string[] = [];
	for (const plan of plans) {
		await options.vault.write(plan.path, plan.content);
		written.push(plan.path);
	}
	return written;
}

/**
 * Schreibt die Berichte aller Perioden mit Buchungen und liefert die Pfade, die sich geändert haben.
 */
async function writeBerichte(
	options: ImportOptions,
	categorized: readonly CategorizedTx[],
	transactions: readonly BankTransaction[],
): Promise<string[]> {
	const categorizer = ergebnisTabelle(categorized);
	const perioden = alleBerichtePerioden(transactions);
	const existing: Record<string, string> = {};
	for (const periode of perioden) {
		const path = berichtPath(options.ctx, periode);
		if (await options.vault.exists(path)) existing[path] = await options.vault.read(path);
	}
	const plans = planBerichte(options.ctx, transactions, categorizer, perioden, existing);
	return writePlans(
		options,
		plans.filter((plan) => existing[plan.path] !== plan.content),
	);
}

/** Schreibt die Dimensions-Notizen (Kategorie, Empfänger, Tx-Typ) und liefert die Pfade, die sich geändert haben. */
async function writeDimensionen(
	options: ImportOptions,
	categorized: readonly CategorizedTx[],
	transactions: readonly BankTransaction[],
): Promise<string[]> {
	const categorizer = ergebnisTabelle(categorized);
	const existing: Record<string, string> = {};
	for (const path of dimensionPaths(options.ctx, transactions, categorizer)) {
		if (await options.vault.exists(path)) existing[path] = await options.vault.read(path);
	}
	const plans = planDimensionNotes(options.ctx, transactions, categorizer, existing);
	return writePlans(
		options,
		plans.filter((plan) => existing[plan.path] !== plan.content),
	);
}

/** Schreibt die Mandats-Notizen (E7) und liefert die Pfade, die sich geändert haben. */
async function writeMandate(
	options: ImportOptions,
	categorized: readonly CategorizedTx[],
	transactions: readonly BankTransaction[],
): Promise<string[]> {
	const categorizer = ergebnisTabelle(categorized);
	const existing: Record<string, string> = {};
	for (const path of mandatPaths(options.ctx, transactions)) {
		if (await options.vault.exists(path)) existing[path] = await options.vault.read(path);
	}
	const vertraege = await readVertragNotizen(options);
	const plans = planMandatNotes(options.ctx, transactions, categorizer, vertraege, existing);
	return writePlans(
		options,
		plans.filter((plan) => existing[plan.path] !== plan.content),
	);
}

/** Vertrags-Notizen im Vault, für den Verweis von einem Mandat auf seinen Vertrag. */
async function readVertragNotizen(options: ImportOptions): Promise<VertragNotiz[]> {
	const folder = `${options.ctx.notesPrefix}/${options.ctx.folders.vertraege}`;
	const out: VertragNotiz[] = [];
	for (const path of await options.vault.list(folder)) {
		if (!path.endsWith(".md")) continue;
		out.push({ filename: path.slice(path.lastIndexOf("/") + 1), text: await options.vault.read(path) });
	}
	return out;
}

/** Schreibt den Import-Report (E7) und liefert seinen Pfad, wenn er sich geändert hat. */
async function writeImportReport(options: ImportOptions, categorized: readonly CategorizedTx[]): Promise<string[]> {
	const path = `${options.outDir}/${REPORT_FILENAME}`;
	const existing = (await options.vault.exists(path)) ? await options.vault.read(path) : undefined;
	// Der Wikilink auf das Journal braucht einen Vault-Pfad; ein absoluter Ausgabeordner (Vergleichslauf) fällt auf den
	// Standard `<Präfix>/Ledger` zurück.
	const prefix = options.ctx.notesPrefix;
	const journalLinkPath = options.outDir.startsWith(`${prefix}/`) ? options.outDir : `${prefix}/Ledger`;
	const content = renderReport(
		options.ctx,
		{ categorized, vertraege: options.stammdaten?.vertraege ?? [], journalLinkPath },
		existing,
	);
	if (content === existing) return [];
	await options.vault.write(path, content);
	return [path];
}

/** Schreibt die Sparziel-Notizen (E7); Nutzer-Notizen ohne Marker-Block bleiben liegen und werden gemeldet. */
async function writeSparziele(
	options: ImportOptions,
	specs: readonly SparzielSpec[],
	log: LogPort,
): Promise<{ written: string[]; skipped: string[] }> {
	const existing: Record<string, string> = {};
	for (const spec of specs) {
		const path = `${options.ctx.notesPrefix}/${options.ctx.folders.sparziele}/${spec.filename}`;
		if (await options.vault.exists(path)) existing[path] = await options.vault.read(path);
	}
	const { plans, skipped } = planSparziele(options.ctx, specs, existing);
	for (const reason of skipped) log.info(`Sparziel übersprungen: ${reason}`);
	const written = await writePlans(
		options,
		plans.filter((plan) => existing[plan.path] !== plan.content),
	);
	return { written, skipped };
}

/** Schreibt die Rümpfe der Regel-Notizen im Ordner und liefert die Pfade, die sich geändert haben. */
async function writeRegelRuempfe(
	options: ImportOptions,
	transactions: readonly BankTransaction[],
	folder: string,
): Promise<string[]> {
	const notizen: RegelNotiz[] = [];
	for (const path of await options.vault.list(folder)) {
		if (path.endsWith(".md")) notizen.push({ path, text: await options.vault.read(path) });
	}
	const existing = Object.fromEntries(notizen.map((n) => [n.path, n.text]));
	const plans = planRuleBodies(options.ctx, transactions, notizen);
	return writePlans(
		options,
		plans.filter((plan) => existing[plan.path] !== plan.content),
	);
}

/**
 * Der Kategorisierer ist hier eine Nachschlagetabelle über das Ergebnis des Laufs: Python kategorisiert jede
 * Buchung für jeden Bericht und jede Notiz neu, das wären hunderte Läufe über denselben Bestand.
 */
function ergebnisTabelle(categorized: readonly CategorizedTx[]): (tx: BankTransaction) => CategorizationResult {
	const byTx = new Map(categorized.map((c) => [c.tx, c.result]));
	return (tx) => {
		const result = byTx.get(tx);
		if (result === undefined) throw new Error("Buchung ohne Kategorisierung im Notizlauf");
		return result;
	};
}

/** Vorhandene Konto- und Vertrags-Notizen, nach Pfad. */
async function readExistingNotes(
	options: ImportOptions,
	vertraege: readonly VertragSpec[],
): Promise<Record<string, string>> {
	const paths = [
		...options.ctx.activeKonten.map((spec) => kontoNotePath(options.ctx, spec)),
		...vertraege.map(
			(v) =>
				`${options.ctx.notesPrefix}/${options.ctx.folders.vertraege}/${v.filename}`,
		),
	];
	const out: Record<string, string> = {};
	for (const path of paths) {
		if (await options.vault.exists(path)) {
			out[path] = await options.vault.read(path);
		}
	}
	return out;
}

/**
 * Konto-Notizen für die Eröffnungsbilanz, nach Dateiname.
 *
 * `formatOpeningBalances` arbeitet auf Dateinamen, nicht auf Pfaden — es soll
 * nicht wissen müssen, wo die Notizen liegen.
 */
async function readKontoNotes(
	options: ImportOptions,
): Promise<Record<string, string>> {
	const out: Record<string, string> = {};
	for (const spec of options.ctx.activeKonten) {
		const path = kontoNotePath(options.ctx, spec);
		if (await options.vault.exists(path)) {
			const name = path.slice(path.lastIndexOf("/") + 1);
			out[name] = await options.vault.read(path);
		}
	}
	return out;
}
