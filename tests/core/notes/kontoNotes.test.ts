import { describe, expect, it } from "vitest";
import { createImporterContext, fixedClock } from "../../../src/core/config/context";
import { parseKontenConfig } from "../../../src/core/config/konten";
import { Money } from "../../../src/core/money";
import { AUTO_BEGIN, AUTO_END } from "../../../src/core/notes/markers";
import {
	kennzahlenProKonto,
	planKontoNotes,
	renderKontoNote,
	updateKontoNote,
} from "../../../src/core/notes/kontoNotes";
import { makeTx } from "../import/factory";

function konto(overrides: Record<string, unknown> = {}) {
	return {
		id: "hauptkonto",
		iban: "DE1",
		ledger_account: "Aktiva:Bank:Sparkasse:Hauptkonto",
		bank: "Sparkasse Musterstadt",
		bic: "MUSTDE01",
		konto_typ: "giro",
		konto_rolle: "hauptkonto",
		csv_schema: "camt52",
		inhaber: "Max Mustermann",
		filename: "Konto 01 – Hauptkonto.md",
		sticker: "🏦",
		rolle_beschreibung: "Laufende Kosten",
		aliases: ["Hauptkonto"],
		...overrides,
	};
}

const ctx = createImporterContext({
	konten: parseKontenConfig({ konten: [konto()] }),
	notesPrefix: "Finanzplan",
	clock: fixedClock("2026-08-14"),
});

const txs = [
	makeTx({ accountIban: "DE1", betrag: new Money("-10.00"), buchungstag: "2026-05-02" }),
	makeTx({ accountIban: "DE1", betrag: new Money("250.00"), buchungstag: "2026-06-15" }),
	makeTx({ accountIban: "DE9", betrag: new Money("-5.00"), buchungstag: "2026-06-20" }),
];

describe("kennzahlenProKonto", () => {
	it("trennt Eingang, Ausgang und Netto je IBAN", () => {
		const k = kennzahlenProKonto(txs).get("DE1");

		expect(k?.eingang.toFixed(2)).toBe("250.00");
		expect(k?.ausgang.toFixed(2)).toBe("-10.00");
		expect(k?.netto.toFixed(2)).toBe("240.00");
		expect(k?.anzahl).toBe(2);
	});

	it("merkt sich erste und letzte Buchung", () => {
		const k = kennzahlenProKonto(txs).get("DE1");
		expect(k?.erstesDatum).toBe("2026-05-02");
		expect(k?.letztesDatum).toBe("2026-06-15");
	});

	it("kennt ein Konto ohne Buchungen nicht", () => {
		expect(kennzahlenProKonto([]).get("DE1")).toBeUndefined();
	});
});

describe("renderKontoNote", () => {
	const note = renderKontoNote(ctx, ctx.activeKonten[0], kennzahlenProKonto(txs).get("DE1"));

	it("setzt den Saldo und den Stand aus der letzten Buchung", () => {
		expect(note).toContain("saldo_eur: 240.00");
		expect(note).toContain("saldo_stand_am: 2026-06-15");
	});

	it("legt die Anfangssaldo-Felder leer an, damit der Nutzer sie füllt", () => {
		expect(note).toContain("anfangssaldo_eur: null");
		expect(note).toContain("anfangssaldo_stand_am: null");
	});

	it("schreibt Listen als Blocklisten, wie Obsidian sie erwartet", () => {
		expect(note).toContain("tags:\n  - 🏗_Finanzplan\n  - finanzen/konto");
		expect(note).toContain("aliases:\n  - Hauptkonto");
	});

	it("umschließt den erzeugten Teil mit den Markern", () => {
		expect(note).toContain(AUTO_BEGIN);
		expect(note).toContain(AUTO_END);
		expect(note.indexOf(AUTO_BEGIN)).toBeLessThan(note.indexOf(AUTO_END));
	});

	it("nennt die Beleg-Statistik der Buchungen", () => {
		expect(note).toContain("| Buchungen | 2 |");
		expect(note).toContain("| Beleg-Spanne | 2026-05-02 – 2026-06-15 |");
	});

	it("kommt ohne Buchungen aus", () => {
		const leer = renderKontoNote(ctx, ctx.activeKonten[0], undefined);
		expect(leer).toContain("saldo_eur: 0.00");
		expect(leer).toContain("saldo_stand_am: 2026-08-14");
		expect(leer).toContain("| Buchungen | 0 |");
	});
});

describe("updateKontoNote", () => {
	const bestehend = [
		"---",
		"title: Konto 01 – Hauptkonto",
		"tags:",
		"  - 🏗_Finanzplan",
		"eigenes_feld: bleibt",
		"saldo_eur: 1.00",
		"saldo_stand_am: 2026-01-01",
		"anfangssaldo_eur: 443,72",
		"anfangssaldo_stand_am: 10.05.2026",
		"created: 2026-01-01",
		"updated: 2026-01-01",
		"---",
		"",
		"# 🏦 Konto 01",
		"",
		"> [!info] Rolle",
		"> Eigener Text.",
		"",
		AUTO_BEGIN,
		"alter Auto-Kram",
		AUTO_END,
		"",
		"## 📌 Notizen",
		"",
		"Handgeschrieben — muss bleiben.",
		"",
	].join("\n");

	const out = updateKontoNote(ctx, ctx.activeKonten[0], kennzahlenProKonto(txs).get("DE1"), bestehend);

	it("zieht Saldo, Stand und updated nach", () => {
		expect(out).toContain("saldo_eur: 240.00");
		expect(out).toContain("saldo_stand_am: 2026-06-15");
		expect(out).toContain("updated: 2026-08-14");
	});

	it("fasst die von Hand gepflegten Anfangssalden nicht an", () => {
		expect(out).toContain("anfangssaldo_eur: 443,72");
		expect(out).toContain("anfangssaldo_stand_am: 10.05.2026");
	});

	it("lässt fremde Felder und created stehen", () => {
		expect(out).toContain("eigenes_feld: bleibt");
		expect(out).toContain("created: 2026-01-01");
	});

	it("ersetzt den erzeugten Block und behält Kopf und Notizen", () => {
		expect(out).not.toContain("alter Auto-Kram");
		expect(out).toContain("> [!info] Rolle\n> Eigener Text.");
		expect(out).toContain("Handgeschrieben — muss bleiben.");
	});

	it("ist beim zweiten Lauf mit denselben Zahlen byte-stabil", () => {
		const nochmal = updateKontoNote(
			ctx,
			ctx.activeKonten[0],
			kennzahlenProKonto(txs).get("DE1"),
			out,
		);
		expect(nochmal).toBe(out);
	});

	it("rüstet eine markerlose Notiz einmalig nach", () => {
		const legacy = "---\nsaldo_eur: 0\ncreated: 2026-01-01\n---\n\n# Alt\n\nText\n";
		const gerüstet = updateKontoNote(ctx, ctx.activeKonten[0], undefined, legacy);

		expect(gerüstet).toContain(AUTO_BEGIN);
		expect(gerüstet).toContain("# Alt");
		expect(gerüstet).toContain("## 📌 Notizen");
	});
});

describe("planKontoNotes", () => {
	it("nennt für jedes aktive Konto Pfad und Inhalt", () => {
		const plan = planKontoNotes(ctx, txs, {});

		expect(plan).toHaveLength(1);
		expect(plan[0].path).toBe("Finanzplan/10-Konten/Konto 01 – Hauptkonto.md");
		expect(plan[0].content).toContain("saldo_eur: 240.00");
		expect(plan[0].existed).toBe(false);
	});

	it("aktualisiert eine vorhandene Notiz, statt sie zu ersetzen", () => {
		const vorhanden = {
			"Finanzplan/10-Konten/Konto 01 – Hauptkonto.md":
				"---\nsaldo_eur: 1.00\neigenes: da\ncreated: 2026-01-01\n---\n\n# Konto\n",
		};
		const plan = planKontoNotes(ctx, txs, vorhanden);

		expect(plan[0].existed).toBe(true);
		expect(plan[0].content).toContain("eigenes: da");
		expect(plan[0].content).toContain("saldo_eur: 240.00");
	});
});
