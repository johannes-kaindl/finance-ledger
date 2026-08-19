import { describe, expect, it } from "vitest";
import { Money } from "../../../src/core/money";
import { wrapCallout } from "../../../src/core/notes/callout";
import {
	renderBasesEmbed,
	renderMermaidBar,
	renderMermaidPie,
	renderMermaidXyLine,
} from "../../../src/core/notes/render";

describe("renderMermaidPie", () => {
	it("baut einen Tortenblock mit zwei Nachkommastellen", () => {
		expect(renderMermaidPie("Test", { A: 100, B: 200 })).toBe(
			['```mermaid', "pie showData", "    title Test", '    "A" : 100.00', '    "B" : 200.00', '```'].join(
				"\n",
			),
		);
	});

	it("lässt Nullen und negative Werte weg, die Mermaid ohnehin verwürfe", () => {
		const out = renderMermaidPie("Test", { A: 100, B: 0, C: -5 });
		expect(out).toContain('"A"');
		expect(out).not.toContain('"B"');
		expect(out).not.toContain('"C"');
	});

	it("nimmt Geldbeträge und rundet kaufmännisch", () => {
		expect(renderMermaidPie("T", { A: new Money("10.005") })).toContain(
			'"A" : 10.01',
		);
	});

	it("ersetzt Anführungszeichen im Etikett, die den Block zerbrächen", () => {
		expect(renderMermaidPie("T", { 'A"B': 5 })).toContain("\"A'B\" : 5.00");
	});
});

describe("renderMermaidBar", () => {
	it("baut ein Balkendiagramm mit Achsenbeschriftung", () => {
		expect(
			renderMermaidBar("BarTest", [
				["Jan", 100],
				["Feb", 200],
			], "EUR"),
		).toBe(
			[
				'```mermaid',
				"xychart-beta",
				'    title "BarTest"',
				'    x-axis ["Jan", "Feb"]',
				'    y-axis "EUR"',
				"    bar [100.00, 200.00]",
				'```',
			].join("\n"),
		);
	});

	it("lässt die Achsenbeschriftung weg, wenn keine angegeben ist", () => {
		expect(renderMermaidBar("T", [["Jan", 1]])).toContain("\n    y-axis\n");
	});

	it("gibt bei leeren Daten nichts aus", () => {
		expect(renderMermaidBar("Leer", [])).toBe("");
	});

	it("kürzt überlange Etiketten auf 30 Zeichen", () => {
		const out = renderMermaidBar("T", [["x".repeat(40), 1]]);
		expect(out).toContain(`"${"x".repeat(30)}"`);
		expect(out).not.toContain("x".repeat(31));
	});
});

describe("renderMermaidXyLine", () => {
	it("baut eine Zeitreihe mit Vorgabe-Achsenbeschriftung", () => {
		expect(
			renderMermaidXyLine("Trend", [
				["2025-01", 1000],
				["2025-02", 1100],
			]),
		).toBe(
			[
				'```mermaid',
				"xychart-beta",
				'    title "Trend"',
				'    x-axis ["2025-01", "2025-02"]',
				'    y-axis "EUR"',
				"    line [1000.00, 1100.00]",
				'```',
			].join("\n"),
		);
	});

	it("gibt bei leeren Punkten nichts aus", () => {
		expect(renderMermaidXyLine("Leer", [])).toBe("");
	});
});

describe("renderBasesEmbed", () => {
	it("hängt den Ansichtsnamen als Anker an", () => {
		expect(renderBasesEmbed("Finanzplan/05-Bases/empfaenger", "📊 Übersicht")).toBe(
			"![[Finanzplan/05-Bases/empfaenger#📊 Übersicht]]",
		);
	});

	it("bettet ohne Ansichtsnamen die ganze Base ein", () => {
		expect(renderBasesEmbed("pfad/zur/base")).toBe("![[pfad/zur/base]]");
	});
});

describe("wrapCallout", () => {
	it("zitiert jede Zeile des Rumpfs", () => {
		expect(wrapCallout("Titel", "zeile1\nzeile2", "quote", false)).toBe(
			"> [!quote]- Titel\n> zeile1\n> zeile2",
		);
	});

	it("lässt in Leerzeilen das nachlaufende Leerzeichen weg", () => {
		expect(wrapCallout("T", "a\n\nb", "quote", false)).toBe(
			"> [!quote]- T\n> a\n>\n> b",
		);
	});

	it("nimmt eine andere Callout-Art", () => {
		expect(wrapCallout("T", "x", "info", false)).toContain("> [!info]- T");
	});

	it("öffnet den Callout mit einem Plus", () => {
		expect(wrapCallout("T", "x", "quote", true)).toContain("> [!quote]+ T");
	});

	it("lässt bei leerem Titel kein Leerzeichen am Kopf stehen", () => {
		expect(wrapCallout("", "x", "quote", false)).toBe("> [!quote]-\n> x");
	});
});
