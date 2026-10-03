import { describe, it, expect } from "vitest";

import {
	snapshotRules,
	rotateSnapshots,
	RULES_SNAPSHOT_PREFIX,
	type RuleSnapshot,
} from "../../../src/core/snapshot/ruleSnapshot";
import { snapshotFileName } from "../../../src/core/snapshot/snapshotName";
import type { VaultPort } from "../../../src/core/ports";

const RULES = "Finanzplan/55-Categorizer-Rules";
const SNAPS = "Finanzplan/.fl-snapshots";

/** Vault im Speicher — nur Text, mehr braucht der Schnappschuss nicht. */
function fakeVault(initial: Record<string, string> = {}) {
	const files = new Map<string, string>(Object.entries(initial));
	const mkdirs: string[] = [];
	const port: VaultPort = {
		read: async (p) => {
			const v = files.get(p);
			if (v === undefined) throw new Error(`nicht gefunden: ${p}`);
			return v;
		},
		readBinary: async () => new ArrayBuffer(0),
		write: async (p, content) => {
			files.set(p, content);
		},
		writeBinary: async () => undefined,
		exists: async (p) => files.has(p),
		mkdir: async (p) => {
			mkdirs.push(p);
		},
		list: async (folder) =>
			[...files.keys()].filter((p) => p.startsWith(`${folder}/`)).sort(),
		remove: async (p) => {
			if (!files.has(p)) throw new Error(`nicht gefunden: ${p}`);
			files.delete(p);
		},
		stat: async (p) => (files.has(p) ? { mtime: 1000 } : null),
	};
	return { port, files, mkdirs };
}

const NOW = new Date(2026, 9, 3, 15, 0, 0, 0).getTime();

describe("snapshotRules", () => {
	it("schreibt den Stand aller Regel-Notizen in eine Datei", async () => {
		const { port, files } = fakeVault({
			[`${RULES}/telekom.md`]: "---\npattern: Telekom\n---\n",
			[`${RULES}/rewe.md`]: "---\npattern: REWE\n---\n",
			[`${RULES}/notiz.txt`]: "keine Regel",
		});

		const result = await snapshotRules({
			vault: port,
			rulesFolder: RULES,
			snapshotsFolder: SNAPS,
			reason: "vor Regel-Schreibvorgang: edeka",
			now: NOW,
		});

		expect(result.written).toBe(`${SNAPS}/${snapshotFileName(RULES_SNAPSHOT_PREFIX, NOW)}`);
		expect(result.fileCount).toBe(2); // nur .md, nicht die .txt

		const snapshot = JSON.parse(files.get(result.written ?? "") ?? "{}") as RuleSnapshot;
		expect(snapshot.folder).toBe(RULES);
		expect(snapshot.reason).toBe("vor Regel-Schreibvorgang: edeka");
		expect(snapshot.created).toBe(new Date(NOW).toISOString());
		expect(snapshot.files.map((f) => f.path)).toEqual([
			`${RULES}/rewe.md`,
			`${RULES}/telekom.md`,
		]);
		expect(snapshot.files[1].content).toContain("pattern: Telekom");
	});

	it("legt keinen Schnappschuss an, wenn es keine Regeln gibt", async () => {
		const { port, files } = fakeVault();

		const result = await snapshotRules({
			vault: port,
			rulesFolder: RULES,
			snapshotsFolder: SNAPS,
			reason: "erste Regel",
			now: NOW,
		});

		expect(result).toEqual({ written: null, fileCount: 0, removed: [] });
		expect(files.size).toBe(0);
	});

	it("rotiert den Bestand nach GFS und meldet, was entfernt wurde", async () => {
		// 40 Schnappschüsse, einer pro Tag um 12:00 Ortszeit.
		const initial: Record<string, string> = {
			[`${RULES}/telekom.md`]: "regel",
		};
		const namen: string[] = [];
		for (let i = 39; i >= 1; i--) {
			const day = new Date(2026, 9, 3 - i, 12, 0, 0, 0).getTime();
			const name = snapshotFileName(RULES_SNAPSHOT_PREFIX, day);
			namen.push(name);
			initial[`${SNAPS}/${name}`] = "{}";
		}
		const { port, files } = fakeVault(initial);

		const result = await snapshotRules({
			vault: port,
			rulesFolder: RULES,
			snapshotsFolder: SNAPS,
			reason: "noch eine Regel",
			now: NOW,
		});

		// Der neue bleibt, und es bleiben insgesamt höchstens 23.
		const verbleibend = [...files.keys()].filter((p) => p.startsWith(`${SNAPS}/`));
		expect(verbleibend).toContain(result.written);
		expect(verbleibend.length).toBeLessThanOrEqual(23);
		expect(result.removed.length).toBe(40 - verbleibend.length);
	});

	it("lässt Fremddateien im Schnappschuss-Ordner unangetastet", async () => {
		const { port, files } = fakeVault({
			[`${RULES}/telekom.md`]: "regel",
			[`${SNAPS}/README.md`]: "Hier liegen Schnappschüsse.",
			[`${SNAPS}/rules-ohne-zeitstempel.json`]: "{}",
		});

		const result = await snapshotRules({
			vault: port,
			rulesFolder: RULES,
			snapshotsFolder: SNAPS,
			reason: "x",
			now: NOW,
		});

		expect(result.removed).toEqual([]);
		expect(files.has(`${SNAPS}/README.md`)).toBe(true);
		expect(files.has(`${SNAPS}/rules-ohne-zeitstempel.json`)).toBe(true);
	});
});

describe("rotateSnapshots", () => {
	it("entfernt nichts, wenn es den Ordner nicht gibt", async () => {
		const { port } = fakeVault();

		await expect(
			rotateSnapshots({ vault: port, snapshotsFolder: SNAPS, now: NOW }),
		).resolves.toEqual([]);
	});

	it("scheitert nicht an einer Datei, die sich nicht löschen lässt", async () => {
		const alt = snapshotFileName(RULES_SNAPSHOT_PREFIX, new Date(2026, 0, 5, 12).getTime());
		const { port } = fakeVault({ [`${SNAPS}/${alt}`]: "{}" });
		const stur: VaultPort = {
			...port,
			remove: async () => {
				throw new Error("read-only");
			},
		};

		await expect(
			rotateSnapshots({ vault: stur, snapshotsFolder: SNAPS, now: NOW }),
		).resolves.toEqual([]);
	});
});
