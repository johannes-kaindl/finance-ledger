// Waechter ueber vendorten Code: das Kit testet wrapCallout selbst (obsidian-kit/tests/callout.test.ts,
// 30 Faelle). Diese fuenf Faelle standen bis zum 0.27.0-Vendoring in tests/core/notes/render.test.ts
// und pruefen die lokale Fassung. Sie bleiben, weil sie ein leeres oder halb kopiertes
// src/vendor/kit/callout.ts sofort auffallen lassen — sonst faellt ein kaputtes Re-Vendoring
// erst im Betrieb auf.
import { describe, expect, it } from "vitest";
import { wrapCallout } from "../../../src/vendor/kit/callout";

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

	it("baut ohne fold-Argument einen markerlosen Callout — der Grund fuers Vendoring", () => {
		expect(wrapCallout("Rolle", "x", "info")).toBe("> [!info] Rolle\n> x");
	});
});
