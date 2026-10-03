/**
 * Schnappschuss der Categorizer-Regeln vor einem Schreibvorgang.
 *
 * Bis 2026-10-03 sollte das ein `git commit` im Vault leisten
 * (`categorizer-rules/gitBackup.ts`). Gemessen lief er nie: der einzige Weg
 * dorthin war ein `options.vaultPath`, das kein Aufrufer setzte — getestet war
 * die Funktion, aufgerufen wurde sie nicht. Der Weg kostete außerdem
 * `child_process` und `fs`, also im Store-Review beide Behavior-Warnungen.
 *
 * Dieser Ersatz schreibt den Stand VOR dem Schreibvorgang als eine JSON-Datei
 * über die Vault-API und hält den Bestand nach Großvater-Vater-Sohn klein.
 * Ein Schnappschuss ist damit eine Datei — das macht die Aufbewahrung zu einer
 * Namensliste und das Zurückholen zu einem Lesevorgang.
 *
 * Obsidian-frei: die Außenwelt kommt über `VaultPort`.
 */

import type { VaultPort } from "../ports";
import { selectGfsRetention, DEFAULT_GFS, type GfsPolicy } from "./gfs-retention";
import { snapshotFileName, snapshotTimeFromName } from "./snapshotName";

/** Präfix aller Regel-Schnappschüsse. */
export const RULES_SNAPSHOT_PREFIX = "rules";

export interface SnapshotFileEntry {
	/** Vault-relativer Pfad, wie er beim Zurückholen wieder geschrieben würde. */
	path: string;
	content: string;
}

export interface RuleSnapshot {
	/** Zeitpunkt in ISO-Form — die zweite Spur neben dem Dateinamen. */
	created: string;
	/** Der Ordner, dessen Stand gesichert wurde. */
	folder: string;
	/** Was den Schreibvorgang ausgelöst hat, für die Lesbarkeit beim Zurückholen. */
	reason: string;
	files: SnapshotFileEntry[];
}

export interface SnapshotOptions {
	vault: VaultPort;
	/** Ordner mit den Regel-Notizen. */
	rulesFolder: string;
	/** Ablageort der Schnappschüsse. */
	snapshotsFolder: string;
	reason: string;
	/** Zeitpunkt des Schnappschusses; injizierbar, damit Tests nicht an der Uhr hängen. */
	now?: number;
	policy?: GfsPolicy;
}

export interface SnapshotResult {
	/** Geschriebene Schnappschuss-Datei, oder `null`, wenn es nichts zu sichern gab. */
	written: string | null;
	/** Dateien im Schnappschuss. */
	fileCount: number;
	/** Durch die Aufbewahrung entfernte Schnappschüsse. */
	removed: string[];
}

const MD_PATTERN = /\.md$/i;

function basename(path: string): string {
	const cut = path.lastIndexOf("/");
	return cut === -1 ? path : path.slice(cut + 1);
}

/**
 * Sichert den aktuellen Stand des Regel-Ordners und rotiert den Bestand.
 *
 * Ein leerer Regel-Ordner erzeugt **keinen** Schnappschuss: der erste
 * Schreibvorgang hat keinen Stand, auf den man zurückgehen könnte, und eine
 * Datei mit `files: []` würde später einen Rotations-Platz belegen, ohne etwas
 * zu tragen.
 *
 * Die Rotation entfernt nur Dateien, deren Namen einen Zeitstempel tragen —
 * was die Aufbewahrung nicht lesen kann, bleibt liegen.
 */
export async function snapshotRules(
	options: SnapshotOptions,
): Promise<SnapshotResult> {
	const {
		vault,
		rulesFolder,
		snapshotsFolder,
		reason,
		now = Date.now(),
		policy = DEFAULT_GFS,
	} = options;

	let rulePaths: string[] = [];
	try {
		rulePaths = (await vault.list(rulesFolder)).filter((p) => MD_PATTERN.test(p));
	} catch {
		// Kein Regel-Ordner: dann gibt es auch keinen Stand zu sichern.
		return { written: null, fileCount: 0, removed: [] };
	}
	if (rulePaths.length === 0) {
		return { written: null, fileCount: 0, removed: [] };
	}

	const files: SnapshotFileEntry[] = [];
	for (const path of rulePaths) {
		files.push({ path, content: await vault.read(path) });
	}

	const snapshot: RuleSnapshot = {
		created: new Date(now).toISOString(),
		folder: rulesFolder,
		reason,
		files,
	};

	await vault.mkdir(snapshotsFolder);
	const name = snapshotFileName(RULES_SNAPSHOT_PREFIX, now);
	const target = `${snapshotsFolder}/${name}`;
	await vault.write(target, `${JSON.stringify(snapshot, null, 2)}\n`);

	const removed = await rotateSnapshots({
		vault,
		snapshotsFolder,
		now,
		policy,
	});

	return { written: target, fileCount: files.length, removed };
}

export interface RotateOptions {
	vault: VaultPort;
	snapshotsFolder: string;
	now: number;
	policy?: GfsPolicy;
}

/**
 * Hält den Schnappschuss-Ordner nach GFS klein.
 *
 * Eigenständig aufrufbar, damit die Aufbewahrung auch ohne neuen Schreibvorgang
 * laufen kann — und damit sie einzeln prüfbar ist.
 */
export async function rotateSnapshots(
	options: RotateOptions,
): Promise<string[]> {
	const { vault, snapshotsFolder, now, policy = DEFAULT_GFS } = options;

	let paths: string[] = [];
	try {
		paths = await vault.list(snapshotsFolder);
	} catch {
		return [];
	}

	const entries = [];
	for (const path of paths) {
		const time = snapshotTimeFromName(basename(path));
		// Unbekannt heißt erhalten: ohne lesbaren Zeitstempel gar nicht erst hinein.
		if (time !== null) entries.push({ name: path, time });
	}

	const { remove } = selectGfsRetention(entries, now, policy);
	const removed: string[] = [];
	for (const path of remove) {
		try {
			await vault.remove(path);
			removed.push(path);
		} catch {
			// Eine Datei, die sich nicht löschen lässt, ist kein Grund, den
			// Schreibvorgang scheitern zu lassen — sie wird beim nächsten Lauf erneut
			// angeboten. Aufräumen darf nie teurer sein als das, was es schützt.
		}
	}
	return removed;
}
