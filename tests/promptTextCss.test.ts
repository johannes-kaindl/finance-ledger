import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { PROMPT_TEXT_CSS } from "../src/vendor/kit-obsidian/prompt-text";

// Das Kit liefert das CSS des Texteingabe-Dialogs als Konstante; die styles.css muss es wortgleich tragen,
// sonst ist das Feld nur etwa ein Drittel so breit wie die Zeile und der Fehlerrand grau (MIGRATION.md § 0.80.0).
describe("promptText: styles.css trägt PROMPT_TEXT_CSS", () => {
	it("jede Regelzeile der Kit-Konstante steht in der styles.css", () => {
		const css = readFileSync("styles.css", "utf-8");
		const zeilen = PROMPT_TEXT_CSS.split("\n").filter((z) => z.trim() !== "");
		expect(zeilen.length).toBeGreaterThan(4);
		for (const z of zeilen) expect(css, z).toContain(z);
	});
});
