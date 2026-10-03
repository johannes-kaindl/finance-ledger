import { describe, it, expect } from "vitest";

import {
	selectGfsRetention,
	selectGfsRetentionDetailed,
	DEFAULT_GFS,
	type GfsEntry,
} from "../../../src/core/snapshot/gfs-retention";

/**
 * Die Erwartungswerte unten sind **nicht** mit dieser Implementierung erzeugt,
 * sondern mit einer unabhängigen Referenzrechnung in CPython
 * (`datetime` + `zoneinfo` + `date.isocalendar()`). Eine Golden-Tabelle, die
 * der Prüfling selbst erzeugt hat, prüft nur, dass er sich treu bleibt.
 *
 * Zeitzone ist Europe/Berlin (in `vitest.config.ts` festgenagelt) — die
 * Kalendergrenzen sind laut Vertrag Ortszeit.
 */

/** Ein Schnappschuss je Tag, 12:00 Ortszeit, Name trägt das Datum. */
function taeglich(von: string, tage: number): GfsEntry[] {
	const out: GfsEntry[] = [];
	const [y, m, d] = von.split("-").map(Number);
	for (let i = 0; i < tage; i++) {
		const day = new Date(y, m - 1, d + i, 12, 0, 0, 0);
		const name = `snap-${day.getFullYear()}-${String(day.getMonth() + 1).padStart(2, "0")}-${String(day.getDate()).padStart(2, "0")}`;
		out.push({ name, time: day.getTime() });
	}
	return out;
}

describe("selectGfsRetention — Golden-Tabelle über 60 Tage", () => {
	const NOW = new Date(2026, 9, 3, 15, 0, 0, 0).getTime(); // 2026-10-03 15:00
	const entries = taeglich("2026-08-05", 60);

	it("behält genau die zwölf Stände, die die vier Staffeln verlangen", () => {
		const { keep, remove } = selectGfsRetention(entries, NOW);

		expect(keep).toEqual([
			"snap-2026-08-05", // ältester im Monat August
			"snap-2026-09-01", // ältester im Monat September
			"snap-2026-09-07", // ältester in ISO-Woche 37
			"snap-2026-09-14", // ältester in ISO-Woche 38
			"snap-2026-09-21", // ältester in ISO-Woche 39
			"snap-2026-09-27", // ältester der letzten sieben Kalendertage
			"snap-2026-09-28", // ältester in ISO-Woche 40 (laufende)
			"snap-2026-09-29",
			"snap-2026-09-30",
			"snap-2026-10-01", // ältester im Monat Oktober (laufender)
			"snap-2026-10-02",
			"snap-2026-10-03", // heute
		]);
		expect(remove).toHaveLength(48);
		expect(remove[0]).toBe("snap-2026-08-06");
		expect(remove[remove.length - 1]).toBe("snap-2026-09-26");
	});

	it("verliert keinen Eintrag und erfindet keinen — keep + remove ist die Eingabe", () => {
		const { keep, remove } = selectGfsRetention(entries, NOW);

		expect(keep.length + remove.length).toBe(entries.length);
		expect([...keep, ...remove].sort()).toEqual(entries.map((e) => e.name).sort());
	});

	it("bleibt unter der Obergrenze der Policy (6+7+4+6)", () => {
		const { keep } = selectGfsRetention(entries, NOW);
		const max = DEFAULT_GFS.today + DEFAULT_GFS.days + DEFAULT_GFS.weeks + DEFAULT_GFS.months;

		expect(keep.length).toBeLessThanOrEqual(max);
	});
});

describe("selectGfsRetention — zehn Schnappschüsse an einem Tag", () => {
	const NOW = new Date(2026, 9, 3, 20, 0, 0, 0).getTime();
	// 08:00 bis 12:30, im Halbstundenabstand.
	const entries: GfsEntry[] = Array.from({ length: 10 }, (_, i) => ({
		name: `t-${String(i).padStart(2, "0")}`,
		time: new Date(2026, 9, 3, 8, 0, 0, 0).getTime() + i * 30 * 60 * 1000,
	}));

	it("behält die neuesten sechs UND den ältesten — der ist der Stand vor Tagesbeginn", () => {
		const { keep, remove } = selectGfsRetention(entries, NOW);

		expect(keep).toEqual(["t-00", "t-04", "t-05", "t-06", "t-07", "t-08", "t-09"]);
		expect(remove).toEqual(["t-01", "t-02", "t-03"]);
	});

	it("ohne die today-Staffel bleibt nur der älteste (Policy ist ein Parameter)", () => {
		const { keep } = selectGfsRetention(entries, NOW, {
			...DEFAULT_GFS,
			today: 0,
		});

		expect(keep).toEqual(["t-00"]);
	});
});

describe("selectGfsRetention — Sommerzeit-Wechsel", () => {
	// In Europe/Berlin endet die Sommerzeit am 2026-10-25: der 25. hat 25 Stunden.
	const NOW = new Date(2026, 9, 27, 10, 0, 0, 0).getTime();
	const entries = taeglich("2026-10-18", 10).map((e) => ({
		...e,
		name: e.name.replace("snap-", "dst-"),
	}));

	it("rechnet Tages- und Wochengrenzen über den Wechsel hinweg richtig", () => {
		const { keep, remove } = selectGfsRetention(entries, NOW);

		// Der 20.10. fällt: er liegt außerhalb der sieben Tage, ist nicht der
		// älteste seiner Woche (das ist der 19.) und nicht der des Monats (der 18.).
		expect(remove).toEqual(["dst-2026-10-20"]);
		expect(keep).toEqual([
			"dst-2026-10-18",
			"dst-2026-10-19",
			"dst-2026-10-21",
			"dst-2026-10-22",
			"dst-2026-10-23",
			"dst-2026-10-24",
			"dst-2026-10-25",
			"dst-2026-10-26",
			"dst-2026-10-27",
		]);
	});
});

describe("selectGfsRetention — Randfälle", () => {
	const NOW = new Date(2026, 9, 3, 15, 0, 0, 0).getTime();

	it("leere Liste ergibt leere Listen", () => {
		expect(selectGfsRetention([], NOW)).toEqual({ keep: [], remove: [] });
	});

	it("ein einziger Eintrag bleibt", () => {
		const one: GfsEntry[] = [{ name: "einzig", time: NOW - 1000 }];

		expect(selectGfsRetention(one, NOW)).toEqual({ keep: ["einzig"], remove: [] });
	});

	it("ein Eintrag aus der Zukunft bleibt immer (Uhrversatz)", () => {
		const entries: GfsEntry[] = [
			...taeglich("2026-08-05", 60),
			{ name: "aus-der-zukunft", time: NOW + 86_400_000 },
		];

		expect(selectGfsRetention(entries, NOW).keep).toContain("aus-der-zukunft");
	});

	it("ein Jahreswechsel innerhalb einer ISO-Woche trennt die Wochen nicht", () => {
		// Der 2026-12-31 (Donnerstag) und der 2027-01-01 (Freitag) liegen in
		// derselben ISO-Woche 2026-W53 — es bleibt also EIN Eintrag für sie beide.
		const entries: GfsEntry[] = [
			{ name: "silvester", time: new Date(2026, 11, 31, 12).getTime() },
			{ name: "neujahr", time: new Date(2027, 0, 1, 12).getTime() },
		];
		const now = new Date(2027, 0, 2, 12).getTime();

		const { keep } = selectGfsRetention(entries, now, {
			today: 0,
			days: 1,
			weeks: 1,
			months: 1,
		});

		// Woche: ältester = silvester · Monat Januar: ältester = neujahr ·
		// heute (2.1.): kein Eintrag. Dass silvester über den Jahreswechsel
		// hinweg dieselbe Woche trägt, ist genau die Stelle, an der eine
		// Kalenderjahr-Rechnung zwei Wochen sähe.
		expect(keep).toEqual(["silvester", "neujahr"]);
	});

	it("zwei Einträge mit identischer Zeit werden stabil nach Namen geordnet", () => {
		const t = new Date(2026, 9, 3, 9, 0).getTime();
		const entries: GfsEntry[] = [
			{ name: "b", time: t },
			{ name: "a", time: t },
		];

		const { keep } = selectGfsRetention(entries, NOW, { ...DEFAULT_GFS, today: 1 });

		// "a" ist der älteste (Namensordnung bei Gleichstand), "b" der neueste.
		expect(keep).toEqual(["a", "b"]);
	});
});

describe("selectGfsRetentionDetailed — welches Fenster hält welchen Stand", () => {
	const NOW = new Date(2026, 9, 3, 15, 0, 0, 0).getTime();
	const entries = taeglich("2026-08-05", 60);

	/**
	 * Auch diese Tabelle stammt aus der CPython-Referenzrechnung, nicht aus dem
	 * Prüfling. Sie ist der Beleg für die Überlappung: drei der zwölf erhaltenen
	 * Stände genügen ZWEI Fenstern — deshalb trägt ein Eintrag ein `bucket` für
	 * die Anzeige UND eine Liste `buckets` für die Begründung. Ein einzelner Wert
	 * wäre an diesen drei Stellen eine Entscheidung ohne Grundlage.
	 */
	it("nennt je Stand das Anzeige-Fenster und alle erfüllten Fenster", () => {
		const { keep } = selectGfsRetentionDetailed(entries, NOW);

		expect(keep).toEqual([
			{ name: "snap-2026-08-05", bucket: "month", buckets: ["month"] },
			{ name: "snap-2026-09-01", bucket: "month", buckets: ["month"] },
			{ name: "snap-2026-09-07", bucket: "week", buckets: ["week"] },
			{ name: "snap-2026-09-14", bucket: "week", buckets: ["week"] },
			{ name: "snap-2026-09-21", bucket: "week", buckets: ["week"] },
			{ name: "snap-2026-09-27", bucket: "day", buckets: ["day"] },
			// Montag: ältester seines Tages UND der laufenden ISO-Woche.
			{ name: "snap-2026-09-28", bucket: "day", buckets: ["day", "week"] },
			{ name: "snap-2026-09-29", bucket: "day", buckets: ["day"] },
			{ name: "snap-2026-09-30", bucket: "day", buckets: ["day"] },
			// Monatserster: ältester seines Tages UND des laufenden Monats.
			{ name: "snap-2026-10-01", bucket: "day", buckets: ["day", "month"] },
			{ name: "snap-2026-10-02", bucket: "day", buckets: ["day"] },
			// Heute: in der today-Staffel UND ältester des Tages.
			{ name: "snap-2026-10-03", bucket: "today", buckets: ["today", "day"] },
		]);
	});

	it("gruppiert jeden Stand genau einmal — die Summe der Gruppen ist die Liste", () => {
		const { keep } = selectGfsRetentionDetailed(entries, NOW);

		const gruppen = new Map<string, string[]>();
		for (const eintrag of keep) {
			gruppen.set(eintrag.bucket, [...(gruppen.get(eintrag.bucket) ?? []), eintrag.name]);
		}

		expect([...gruppen.keys()]).toEqual(["month", "week", "day", "today"]);
		expect([...gruppen.values()].flat()).toHaveLength(keep.length);
	});

	it("bleibt deckungsgleich mit selectGfsRetention — eine Rechnung, zwei Sichten", () => {
		const schlicht = selectGfsRetention(entries, NOW);
		const ausfuehrlich = selectGfsRetentionDetailed(entries, NOW);

		expect(ausfuehrlich.keep.map((e) => e.name)).toEqual(schlicht.keep);
		expect(ausfuehrlich.remove).toEqual(schlicht.remove);
	});

	it("markiert einen Stand aus der Zukunft als `future`, nicht als Staffel", () => {
		const mitZukunft: GfsEntry[] = [
			...entries,
			{ name: "aus-der-zukunft", time: NOW + 86_400_000 },
		];

		const { keep } = selectGfsRetentionDetailed(mitZukunft, NOW);
		const zukunft = keep.find((e) => e.name === "aus-der-zukunft");

		expect(zukunft).toEqual({
			name: "aus-der-zukunft",
			bucket: "future",
			buckets: ["future"],
		});
	});
});
