import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Die Notizen des Imports folgen dem Schema der Vault-Typen (`dokument`, `referenz`): `status` ist ein Enum-Wert
 * (`evergreen`, `in-arbeit`), nicht die Anzeigeform mit Emoji; `priority`, `sticker`, `aggregat_base`, `sicht`,
 * `abgeschlossen_am` und `vertragsnummer` (heute `aktenzeichen`) haben keinen Verbraucher und stehen nicht im Schema
 * (Welle 33, Entscheidung Johannes 2026-11-11). Dieser Test findet jede Schreibweise im Quelltext der Schreiber; die Ausgabe
 * selbst halten die Goldmuster. Die Rang-Zahl der Categorizer-Regeln (`priority`) lebt in `ruleBodies.ts` und `rules.ts`
 * und ist etwas anderes.
 */
const VERBOTEN = /(?:^|["'`])(?:priority|sticker|aggregat_base|sicht|abgeschlossen_am|vertragsnummer): |Evergreen|In-Arbeit|this\.vertragsnummer/m;
const DIR = join(__dirname, "../../../src/core/notes");

describe("Frontmatter der Import-Notizen folgt dem Vault-Schema", () => {
	it("Gegenprobe: das Muster trifft die alten Schreibweisen, nicht die neuen", () => {
		for (const alt of ['"priority: 🟡 Mittel"', "`sticker: ${s}`", '"aggregat_base: shared"', '"sicht: gesamt"', "\nabgeschlossen_am: null", "`vertragsnummer: x`", '"status: ✏️ In-Arbeit"', "status: 🌿 Evergreen", "=this.vertragsnummer"]) {
			expect(VERBOTEN.test("`" + alt), alt).toBe(true);
		}
		for (const neu of ['"status: in-arbeit"', "status: evergreen", "`aktenzeichen: x`", "`=this.aktenzeichen`", "const priority = fm.data"]) {
			expect(VERBOTEN.test(neu), neu).toBe(false);
		}
	});

	it("kein Schreiber unter src/core/notes schreibt ein Feld ohne Verbraucher oder einen Status in Anzeigeform", () => {
		const dateien = readdirSync(DIR).filter((f) => f.endsWith(".ts"));
		expect(dateien.length, "das Verzeichnis muss die Schreiber enthalten, sonst misst der Test nichts").toBeGreaterThan(10);
		const treffer = dateien.filter((f) => VERBOTEN.test(readFileSync(join(DIR, f), "utf8")));
		expect(treffer).toEqual([]);
	});
});
