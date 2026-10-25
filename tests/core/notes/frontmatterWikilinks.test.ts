import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Obsidian liest `- [[X]]` (ungequotet) in einer Frontmatter-Liste als verschachtelte Liste und damit nicht als Link; gequotet,
 * `- "[[X]]"`, ist es einer (gemessen 2026-10-25, Obsidian 1.12.4: `frontmatterLinks` und `resolvedLinks`). Die Schreiber quoten
 * deshalb über `quoteScalar` des Kits. Dieser Test findet jede rohe Schreibweise im Quelltext der Notiz-Schreiber; die
 * Ausgabe selbst halten die Goldmuster (Berichte, Dimensionen, Mandate, Sparziele, Report) und die Konto- und Vertrags-Tests.
 */
const ROH = /(?:^|[`"'])  - \[\[/m;
const DIR = join(__dirname, "../../../src/core/notes");

describe("Wikilinks in Frontmatter-Listen stehen gequotet", () => {
	it("Gegenprobe: das Muster trifft die rohe Form, aber weder die gequotete noch ein Body-Bullet", () => {
		expect(ROH.test("projektbezug:\n  - [[A/B]]\n")).toBe(true);
		expect(ROH.test("`  - [[${x}]]`")).toBe(true);
		expect(ROH.test("`  - ${quoteScalar(`[[${x}]]`)}`")).toBe(false);
		expect(ROH.test("`- [[${p}/Foundation|Foundation]]`")).toBe(false);
	});

	it("kein Schreiber unter src/core/notes schreibt einen Wikilink roh in eine Frontmatter-Liste", () => {
		const dateien = readdirSync(DIR).filter((f) => f.endsWith(".ts"));
		expect(dateien.length, "das Verzeichnis muss die Schreiber enthalten, sonst misst der Test nichts").toBeGreaterThan(10);
		const roh = dateien.filter((f) => ROH.test(readFileSync(join(DIR, f), "utf8")));
		expect(roh).toEqual([]);
	});
});
