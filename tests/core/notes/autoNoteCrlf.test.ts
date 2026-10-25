import { describe, expect, it } from "vitest";
import { updateAutoNote } from "../../../src/core/notes/autoNote";
import { AUTO_BEGIN, AUTO_END } from "../../../src/core/notes/markers";

/**
 * Charakterisierung (Welle 27): was `updateAutoNote` heute mit einer Notiz macht, deren Zeilenenden CRLF sind.
 *
 * Gemessen 2026-10-25 15:15 im echten Finanzplan-Ordner (Vault Pallas): 0 von 517 `.md` tragen CRLF (388 davon mit Auto-Block),
 * in den Fixtures 0 von 26. Deshalb ist das Gemisch unten eine BEKANNTE GRENZE, kein Fehler, der behoben wird: der Fix ginge durch
 * `assembleBody` (fünf direkte Aufrufer) und `replaceAutoSection` (drei weitere Nutzer) und beträfe heute keine Notiz. Grund und
 * Weg, falls doch eine CRLF-Notiz auftaucht: `.claude/rules/notes-importer.md`. Wird dieser Test rot, weil jemand das Gemisch
 * behoben hat, gehört die Grenze dort gestrichen und dieser Test auf "CRLF bleibt durchgehend CRLF" umgestellt.
 */
describe("updateAutoNote bei einer CRLF-Notiz", () => {
	const update = { set: { updated: "2026-10-25", posting_count: "2" }, auto: "neu", userDefault: "## 📌 Notizen\n" };
	const existing =
		`---\r\nupdated: 2026-01-01\r\nposting_count: 1\r\n---\r\n\r\n${AUTO_BEGIN}\r\nalt\r\n${AUTO_END}\r\n\r\n## 📌 Notizen\r\n\r\nMein Text\r\n`;
	const lone = (s: string): number => (s.match(/(?<!\r)\n/g) ?? []).length;

	it("die Frontmatter bleibt CRLF, auch die gesetzten Felder", () => {
		const out = updateAutoNote(existing, update);
		expect(out.startsWith("---\r\nupdated: 2026-10-25\r\nposting_count: 2\r\n---")).toBe(true);
		expect(lone(out.slice(0, out.indexOf("---", 3)))).toBe(0);
	});

	it("der Benutzerteil bleibt byte-gleich", () => {
		expect(updateAutoNote(existing, update).endsWith("## 📌 Notizen\r\n\r\nMein Text\r\n")).toBe(true);
	});

	it("der zweite Lauf ändert nichts (idempotent)", () => {
		const einmal = updateAutoNote(existing, update);
		expect(updateAutoNote(einmal, update)).toBe(einmal);
	});

	it("BEKANNTE GRENZE: hinter dem schließenden Zaun und im Auto-Block steht ein Gemisch aus LF und CRLF", () => {
		const out = updateAutoNote(existing, update);
		// `assembleBody` verbindet mit "\n"; das Kit hätte `wrapZone(block, markers, eol)` mit dem Zeilenende als Parameter.
		expect(out).toContain(`---\n\n${AUTO_BEGIN}\nneu\n${AUTO_END}\n\n\r\n\r\n## 📌 Notizen`);
		expect(lone(out)).toBeGreaterThan(0);
	});
});
