import { describe, expect, it } from "vitest";
import { createImporterContext, fixedClock } from "../../../src/core/config/context";
import { parseKontenConfig } from "../../../src/core/config/konten";
import { parseVertraegeConfig } from "../../../src/core/config/vertraege";
import type { CategorizedTx } from "../../../src/core/import/journal";
import { Money } from "../../../src/core/money";
import { AUTO_BEGIN, AUTO_END } from "../../../src/core/notes/markers";
import {
	detectRhythmus,
	extractVertragsnummer,
	median,
	naechsteZahlung,
	planVertragNotes,
} from "../../../src/core/notes/vertragNotes";
import { makeTx } from "../import/factory";

const ctx = createImporterContext({
	konten: parseKontenConfig({
		konten: [
			{
				id: "hauptkonto",
				iban: "DE1",
				ledger_account: "Aktiva:Bank:Sparkasse:Hauptkonto",
				bank: "Sparkasse",
				konto_typ: "giro",
				konto_rolle: "hauptkonto",
				csv_schema: "camt52",
				inhaber: "Max Mustermann",
				filename: "Konto 01 – Hauptkonto.md",
			},
		],
	}),
	notesPrefix: "Finanzplan",
	clock: fixedClock("2026-08-14"),
});

const vertraege = parseVertraegeConfig({
	vertraege: [
		{
			filename: "ACME Telecom – Festnetz.md",
			ledger_kategorie: "Ausgaben:Kommunikation:Festnetz:ACME",
			vertragspartner: "ACME Telecom GmbH",
			vertrag_kategorie: "kommunikation",
			vertrag_subkategorie: "festnetz",
			abbucht_von_konto: "hauptkonto",
			aliases: ["ACME Festnetz"],
			sticker: "lucide//phone",
		},
	],
}).vertraege;

function cat(betrag: string, tag: string, extra: Record<string, unknown> = {}): CategorizedTx {
	return {
		tx: makeTx({ accountIban: "DE1", betrag: new Money(betrag), buchungstag: tag, ...extra }),
		posting: "Aktiva:Bank:Sparkasse:Hauptkonto",
		result: {
			gegenAccount: "Ausgaben:Kommunikation:Festnetz:ACME",
			tags: [],
			ruleName: "acme",
		},
	};
}

const drei = [
	cat("-39.95", "2026-05-06", { mandatsreferenz: "ACME-123" }),
	cat("-39.95", "2026-06-06", { mandatsreferenz: "ACME-123" }),
	cat("-41.95", "2026-07-06", { mandatsreferenz: "ACME-123" }),
];

describe("median", () => {
	it("nimmt bei ungerader Anzahl den mittleren Wert", () => {
		expect(median([new Money("1"), new Money("5"), new Money("3")]).toString()).toBe("3");
	});

	it("mittelt bei gerader Anzahl und rundet kaufmännisch auf Cent", () => {
		expect(median([new Money("1.00"), new Money("2.01")]).toFixed(2)).toBe("1.51");
	});

	it("liefert null-Betrag bei leerer Liste", () => {
		expect(median([]).toString()).toBe("0");
	});
});

describe("detectRhythmus", () => {
	it("erkennt monatlich an der Frequenz", () => {
		expect(detectRhythmus(3, 61)).toBe("monatlich");
	});

	it("erkennt quartalsweise", () => {
		expect(detectRhythmus(4, 365)).toBe("quartalsweise");
	});

	it("erkennt halbjährlich", () => {
		expect(detectRhythmus(2, 365)).toBe("halbjährlich");
	});

	it("erkennt jährlich erst bei wirklich seltener Frequenz", () => {
		// 2 Buchungen auf 730 Tage sind rechnerisch noch halbjährlich (2/23.9 = 0.08).
		expect(detectRhythmus(2, 730)).toBe("halbjährlich");
		expect(detectRhythmus(2, 1000)).toBe("jährlich");
	});

	it("nimmt bei einer einzigen Buchung die Zeitspanne als Hinweis", () => {
		expect(detectRhythmus(1, 400)).toBe("jährlich");
		expect(detectRhythmus(1, 200)).toBe("halbjährlich");
		expect(detectRhythmus(1, 10)).toBe("monatlich");
	});

	it("hält eine kurze Spanne für monatlich", () => {
		expect(detectRhythmus(2, 20)).toBe("monatlich");
	});
});

describe("naechsteZahlung", () => {
	it("rechnet den Rhythmus auf die letzte Zahlung", () => {
		expect(naechsteZahlung("2026-07-06", "monatlich")).toBe("2026-08-05");
		expect(naechsteZahlung("2026-07-06", "quartalsweise")).toBe("2026-10-05");
		expect(naechsteZahlung("2026-07-06", "jährlich")).toBe("2027-07-06");
	});
});

describe("extractVertragsnummer", () => {
	it("nimmt die Mandatsreferenz, wenn es eine gibt", () => {
		expect(extractVertragsnummer(drei)).toBe("ACME-123");
	});

	it("fällt auf ein Muster im Verwendungszweck zurück", () => {
		const ohne = [cat("-1", "2026-05-06", { verwendungszweck: "Vertragskonto 4711 Juni" })];
		expect(extractVertragsnummer(ohne)).toBe("4711");
	});

	it("meldet null, wenn nichts zu finden ist", () => {
		expect(extractVertragsnummer([cat("-1", "2026-05-06")])).toBeNull();
	});
});

describe("planVertragNotes", () => {
	it("legt eine neue Notiz mit den erkannten Werten an", () => {
		const { plans } = planVertragNotes(ctx, vertraege, drei, {});
		const note = plans[0].content;

		expect(plans[0].path).toBe("Finanzplan/20-Verträge/ACME Telecom – Festnetz.md");
		expect(note).toContain("betrag_eur: 39.95");
		expect(note).toContain("rhythmus: monatlich");
		expect(note).toContain("naechste_zahlung: 2026-08-05");
		expect(note).toContain('vertragsnummer: "ACME-123"');
		expect(note).toContain("abbucht_von:\n  - [[Finanzplan/10-Konten/Konto 01 – Hauptkonto]]");
	});

	it("nennt Stichprobe und Betragsverlauf im erzeugten Teil", () => {
		const note = planVertragNotes(ctx, vertraege, drei, {}).plans[0].content;

		expect(note).toContain("## 🔍 Tx-Stichprobe");
		expect(note).toContain("39.95 €");
		expect(note).toContain("## 📈 Betrags-Verlauf pro Monat");
		expect(note).toContain("xychart-beta");
	});

	it("verlinkt die Mandate, damit der Sprung zur Lastschrift ein Klick ist", () => {
		const note = planVertragNotes(ctx, vertraege, drei, {}).plans[0].content;
		expect(note).toContain("## 🔗 Mandate");
		expect(note).toContain("[[Finanzplan/50-Mandate/acme-123|ACME-123]]");
	});

	it("lässt den Mandats-Abschnitt weg, wenn es keine Referenz gibt", () => {
		const ohne = drei.map((c) => ({ ...c, tx: { ...c.tx, mandatsreferenz: "" } }));
		expect(planVertragNotes(ctx, vertraege, ohne, {}).plans[0].content).not.toContain(
			"## 🔗 Mandate",
		);
	});

	it("verlinkt das Datum als Monatsbericht mit escaptem Trenner", () => {
		const note = planVertragNotes(ctx, vertraege, drei, {}).plans[0].content;
		expect(note).toContain("[[Finanzplan/40-Monatsberichte/2026-07 Monatsbericht\\|2026-07-06]]");
	});

	it("prefixt jede Zeile einer mehrzeiligen note_extra_warning", () => {
		// Regression: bis zum Kit-0.27.0-Vendoring wurde der Wert mit genau EINEM "> "
		// vorangestellt ins Template geschoben — alles ab der zweiten Zeile stand als
		// nackter Text NEBEN dem Callout. Kein Typ-, kein Testfehler, nur eine falsch
		// aussehende Notiz. wrapCallout prefixt jede Zeile.
		const mehrzeilig = parseVertraegeConfig({
			vertraege: [
				{
					filename: "ACME Telecom – Festnetz.md",
					ledger_kategorie: "Ausgaben:Kommunikation:Festnetz:ACME",
					vertragspartner: "ACME Telecom GmbH",
					vertrag_kategorie: "kommunikation",
					vertrag_subkategorie: "festnetz",
					abbucht_von_konto: "hauptkonto",
					aliases: ["ACME Festnetz"],
					sticker: "lucide//phone",
					note_extra_warning: "Erste Zeile.\nZweite Zeile.\n\nVierte Zeile.",
				},
			],
		}).vertraege;

		const note = planVertragNotes(ctx, mehrzeilig, drei, {}).plans[0].content;

		expect(note).toContain(
			"> [!warning] Hinweis aus Auto-Generation\n> Erste Zeile.\n> Zweite Zeile.\n>\n> Vierte Zeile.",
		);
	});

	it("haengt an den Info-Callout keine leere >-Schlusszeile", () => {
		// Das trailing "\n" der Body-Zeile darf NICHT in den wrapCallout-Body: es erzeugte
		// dort (korrekterweise) eine zusaetzliche ">"-Zeile, die bei gesetzter Warnung
		// mitten im Dokument staende.
		const mitWarnung = parseVertraegeConfig({
			vertraege: [
				{
					filename: "ACME Telecom – Festnetz.md",
					ledger_kategorie: "Ausgaben:Kommunikation:Festnetz:ACME",
					vertragspartner: "ACME Telecom GmbH",
					vertrag_kategorie: "kommunikation",
					vertrag_subkategorie: "festnetz",
					abbucht_von_konto: "hauptkonto",
					aliases: ["ACME Festnetz"],
					sticker: "lucide//phone",
					note_extra_warning: "Achtung.",
				},
			],
		}).vertraege;

		const note = planVertragNotes(ctx, mitWarnung, drei, {}).plans[0].content;

		expect(note).not.toContain("\n>\n\n> [!warning]");
		expect(note).toContain(".\n\n> [!warning] Hinweis aus Auto-Generation");
	});

	it("überspringt einen Vertrag mit zu wenigen Buchungen und sagt warum", () => {
		const { plans, skipped } = planVertragNotes(ctx, vertraege, [drei[0]], {});

		expect(plans).toHaveLength(0);
		expect(skipped[0]).toContain("ACME Telecom – Festnetz.md");
		expect(skipped[0]).toContain("1");
	});

	it("ordnet nur Buchungen des richtigen Kontos zu", () => {
		const fremd = drei.map((c) => ({ ...c, tx: { ...c.tx, accountIban: "DE9" } }));
		expect(planVertragNotes(ctx, vertraege, fremd, {}).plans).toHaveLength(0);
	});

	it("ersetzt in einer bestehenden Notiz nur den erzeugten Teil", () => {
		const bestehend = [
			"---",
			"vertragspartner: ACME Telecom GmbH",
			"betrag_eur: 1.00",
			"eigenes: bleibt",
			"created: 2026-01-01",
			"---",
			"",
			"# ACME",
			"",
			AUTO_BEGIN,
			"alter Kram",
			AUTO_END,
			"",
			"## 📌 Notizen",
			"",
			"Kündigungsfrist geprüft.",
			"",
		].join("\n");
		const { plans } = planVertragNotes(ctx, vertraege, drei, {
			"Finanzplan/20-Verträge/ACME Telecom – Festnetz.md": bestehend,
		});

		expect(plans[0].existed).toBe(true);
		expect(plans[0].content).toContain("eigenes: bleibt");
		expect(plans[0].content).toContain("created: 2026-01-01");
		expect(plans[0].content).toContain("Kündigungsfrist geprüft.");
		expect(plans[0].content).not.toContain("alter Kram");
	});

	it("lässt betrag_eur einer bestehenden Notiz in Ruhe", () => {
		const bestehend = "---\nbetrag_eur: 1.00\ncreated: 2026-01-01\n---\n\n# ACME\n";
		const { plans } = planVertragNotes(ctx, vertraege, drei, {
			"Finanzplan/20-Verträge/ACME Telecom – Festnetz.md": bestehend,
		});

		expect(plans[0].content).toContain("betrag_eur: 1.00");
	});

	it("ist beim zweiten Lauf byte-stabil", () => {
		const erst = planVertragNotes(ctx, vertraege, drei, {}).plans[0];
		const nochmal = planVertragNotes(ctx, vertraege, drei, {
			[erst.path]: erst.content,
		}).plans[0];

		expect(nochmal.content).toBe(erst.content);
	});
});
