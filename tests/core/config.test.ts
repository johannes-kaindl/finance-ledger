import { describe, expect, it } from "vitest";
import {
	createImporterContext,
	fixedClock,
	systemClock,
} from "../../src/core/config/context";
import {
	defaultFilename,
	parseKontenConfig,
} from "../../src/core/config/konten";
import { ConfigError } from "../../src/core/errors";

function konto(overrides: Record<string, unknown> = {}) {
	return {
		id: "hauptkonto",
		iban: "DE00123456780000000001",
		ledger_account: "Aktiva:Bank:Sparkasse:Hauptkonto",
		bank: "Sparkasse Musterstadt",
		konto_typ: "giro",
		konto_rolle: "hauptkonto",
		csv_schema: "camt52",
		inhaber: "Max Mustermann",
		...overrides,
	};
}

describe("parseKontenConfig", () => {
	it("liest ein vollständiges Konto", () => {
		const cfg = parseKontenConfig({ konten: [konto()] });
		expect(cfg.konten).toHaveLength(1);
		expect(cfg.konten[0].ledgerAccount).toBe("Aktiva:Bank:Sparkasse:Hauptkonto");
		expect(cfg.konten[0].aktiv).toBe(true);
		expect(cfg.konten[0].filename).toBeNull();
	});

	it("füllt optionale Felder mit leeren Werten statt undefined", () => {
		const spec = parseKontenConfig({ konten: [konto()] }).konten[0];
		expect(spec.bic).toBe("");
		expect(spec.aliases).toEqual([]);
		expect(spec.sticker).toBe("");
	});

	it("nimmt aktiv:false ernst, alles andere gilt als aktiv", () => {
		const cfg = parseKontenConfig({
			konten: [
				konto({ id: "a", aktiv: false }),
				konto({ id: "b", iban: "DE2", aktiv: true }),
				konto({ id: "c", iban: "DE3" }),
			],
		});
		expect(cfg.konten.map((k) => k.aktiv)).toEqual([false, true, true]);
	});

	// Der Python-Importer stirbt hier mit KeyError beim Modul-Import. Im Plugin
	// muss daraus eine Meldung werden, die man lesen und befolgen kann.
	it("meldet fehlende Pflichtfelder mit Feldnamen und Konto-Id", () => {
		let error: unknown;
		try {
			parseKontenConfig({
				konten: [{ id: "kaputt", iban: "DE1", bank: "Sparkasse" }],
			});
		} catch (e) {
			error = e;
		}
		expect(error).toBeInstanceOf(ConfigError);
		const message = (error as Error).message;
		expect(message).toContain("kaputt");
		expect(message).toContain("ledger_account");
		expect(message).toContain("konto_rolle");
	});

	it("sammelt alle Mängel statt beim ersten abzubrechen", () => {
		try {
			parseKontenConfig({
				konten: [{ id: "a" }, { id: "b" }, konto({ id: "ok", iban: "DE9" })],
			});
			expect.unreachable("hätte werfen müssen");
		} catch (e) {
			const message = (e as Error).message;
			expect(message).toContain("konten[0]");
			expect(message).toContain("konten[1]");
			expect(message).not.toContain("konten[2]");
		}
	});

	it("meldet eine fehlende oder leere Konfiguration verständlich", () => {
		expect(() => parseKontenConfig(null)).toThrow(/erwartet wird eine Zuordnung/);
		expect(() => parseKontenConfig({})).toThrow(/'konten' fehlt/);
		expect(() => parseKontenConfig({ konten: [] })).toThrow(/kein einziges Konto/);
	});
});

describe("ImporterContext", () => {
	const cfg = parseKontenConfig({
		konten: [
			konto({ id: "haupt", iban: "DE1", konto_rolle: "hauptkonto" }),
			konto({
				id: "visa",
				iban: "4000 **** **** 0000",
				konto_rolle: "kreditkarte",
				ledger_account: "Passiva:Kreditkarte:Visa",
				csv_schema: "sparkasse_visa",
				filename: "Konto 04 – Visa.md",
			}),
			konto({
				id: "alt",
				iban: "DE9",
				konto_rolle: "altkonto",
				ledger_account: "Aktiva:Bank:Alt",
				aktiv: false,
			}),
		],
	});
	const ctx = createImporterContext({
		konten: cfg,
		notesPrefix: "20_Projekte/Finanzplan",
		clock: fixedClock("2026-08-03"),
	});

	it("leitet die Nachschlagetabellen aus den aktiven Konten ab", () => {
		expect(ctx.activeKonten).toHaveLength(2);
		expect(ctx.ibanToLedger.get("DE1")).toBe("Aktiva:Bank:Sparkasse:Hauptkonto");
		expect(ctx.ledgerByRolle.get("kreditkarte")).toBe("Passiva:Kreditkarte:Visa");
		expect(ctx.ibanByRolle.get("hauptkonto")).toBe("DE1");
		expect(ctx.ibanById.get("visa")).toBe("4000 **** **** 0000");
	});

	it("lässt inaktive Konten aus jeder Ableitung heraus", () => {
		expect(ctx.ibanToLedger.has("DE9")).toBe(false);
		expect(ctx.importedLedgerAccounts.has("Aktiva:Bank:Alt")).toBe(false);
	});

	// Genau diese Menge entscheidet, ob eine Umbuchung übers Verrechnungskonto
	// laufen darf — zu breit gefasst blieb der Betrag im Durchlaufkonto liegen.
	it("kennt die Konten, für die wirklich eine CSV importiert wird", () => {
		expect([...ctx.importedLedgerAccounts].sort()).toEqual([
			"Aktiva:Bank:Sparkasse:Hauptkonto",
			"Passiva:Kreditkarte:Visa",
		]);
	});

	it("nimmt den Notiz-Dateinamen aus der Konfiguration, sonst aus Index + Bank", () => {
		expect(ctx.ibanToFilename.get("4000 **** **** 0000")).toBe("Konto 04 – Visa");
		expect(ctx.ibanToFilename.get("DE1")).toBe("Konto 01 – Sparkasse");
		expect(defaultFilename(2, "Sparkasse Musterstadt")).toBe(
			"Konto 03 – Sparkasse.md",
		);
	});

	it("leitet die Projekt-Ordnernotiz aus dem Prefix ab", () => {
		expect(ctx.projectNote).toBe("Finanzplan");
	});

	it("normalisiert den Prefix, damit keine [[/x]]-Links entstehen", () => {
		const messy = createImporterContext({
			konten: cfg,
			notesPrefix: "  /Projekte/Finanzplan/  ",
		});
		expect(messy.notesPrefix).toBe("Projekte/Finanzplan");
	});

	it("fällt bei leerem Prefix auf den Default zurück", () => {
		const empty = createImporterContext({ konten: cfg, notesPrefix: "" });
		expect(empty.notesPrefix).toBe("Finanzplan");
	});
});

describe("ClockPort", () => {
	it("liefert in Tests ein festes Datum", () => {
		expect(fixedClock("2026-08-03").today()).toBe("2026-08-03");
	});

	it("liefert lokal formatierte ISO-Daten", () => {
		expect(systemClock().today()).toMatch(/^\d{4}-\d{2}-\d{2}$/);
	});
});
