import { describe, it, expect } from "vitest";

import {
	snapshotFileName,
	snapshotTimeFromName,
} from "../../../src/core/snapshot/snapshotName";

describe("snapshotFileName / snapshotTimeFromName", () => {
	it("schreibt UTC und liest denselben Zeitpunkt zurück", () => {
		const t = Date.UTC(2026, 9, 3, 13, 56, 2, 123);

		const name = snapshotFileName("rules", t);

		expect(name).toBe("rules-2026-10-03T13-56-02-123Z.json");
		expect(snapshotTimeFromName(name)).toBe(t);
	});

	it("sortiert chronologisch, wenn man die Namen alphabetisch sortiert", () => {
		const namen = [
			snapshotFileName("rules", Date.UTC(2026, 9, 3, 9, 0)),
			snapshotFileName("rules", Date.UTC(2026, 8, 30, 23, 59)),
			snapshotFileName("rules", Date.UTC(2026, 9, 3, 10, 0)),
		];

		expect([...namen].sort()).toEqual([namen[1], namen[0], namen[2]]);
	});

	it("gibt null für Namen ohne Zeitstempel — unbekannt heißt erhalten", () => {
		expect(snapshotTimeFromName("README.md")).toBeNull();
		expect(snapshotTimeFromName("rules-ohne-zeitstempel.json")).toBeNull();
		expect(snapshotTimeFromName("rules-2026-10-03.json")).toBeNull();
		// Richtige Form, aber kein JSON: die Aufbewahrung fasst nur ihre eigenen Dateien an.
		expect(snapshotTimeFromName("rules-2026-10-03T13-56-02-123Z.txt")).toBeNull();
	});

	it("verträgt ein beliebiges Präfix", () => {
		const t = Date.UTC(2027, 0, 1, 0, 0, 0, 0);

		expect(snapshotTimeFromName(snapshotFileName("journal", t))).toBe(t);
	});
});
