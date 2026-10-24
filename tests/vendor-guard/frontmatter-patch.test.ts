// Liegt in tests/vendor-guard/, nicht in tests/vendor/kit/: dieses Verzeichnis gehört dem Vendoring (kit-sync --check).
// Wächter über vendorten Code: das Kit testet patchFrontmatter selbst (obsidian-kit/tests/frontmatter-patch.test.ts).
// Diese Fälle halten die Eigenschaften fest, auf die finance-ledger sich verlässt — `src/core/notes/frontmatter.ts`
// reicht fertige Skalare (`Money.toFixed(2)`, `null`, gequotetes `glaeubiger_id`) als `{ literal }` durch. Ändert ein
// Kit-Update eine davon, fasst jeder Import jede Notiz neu an oder kippt den Datentyp im Vault; hier fällt es zuerst auf.
import { describe, expect, it } from "vitest";
import { isFmLiteralText, patchFrontmatter } from "../../src/vendor/kit/frontmatter-patch";

const lit = (literal: string) => ({ literal });

function geschrieben(text: string, spec: Parameters<typeof patchFrontmatter>[1]): string {
	const r = patchFrontmatter(text, spec);
	if (!r.ok) throw new Error(`patchFrontmatter: ${r.reason}`);
	return r.content;
}

describe("patchFrontmatter — Literale", () => {
	it("schreibt Dezimalzahl und null ohne Anführungszeichen", () => {
		const out = geschrieben("---\na: 1\n---\n", {
			set: { saldo_eur: lit("240.00") },
			ensure: { anfangssaldo_eur: lit("null") },
		});
		expect(out).toBe("---\na: 1\nsaldo_eur: 240.00\nanfangssaldo_eur: null\n---\n");
	});

	it("behält die endenden Nullen von 53240.00", () => {
		expect(geschrieben("---\nvolumen_total_eur: 1.00\n---\n", { set: { volumen_total_eur: lit("53240.00") } })).toBe(
			"---\nvolumen_total_eur: 53240.00\n---\n",
		);
	});

	it("ist idempotent: dasselbe Literal ein zweites Mal ändert nichts", () => {
		const einmal = patchFrontmatter("---\na: 1\n---\nText\n", { set: { saldo_eur: lit("53240.00") }, ensure: { stand: lit("null") } });
		if (!einmal.ok) throw new Error(einmal.reason);
		expect(einmal.changed).toBe(true);
		const zweimal = patchFrontmatter(einmal.content, { set: { saldo_eur: lit("53240.00") }, ensure: { stand: lit("null") } });
		expect(zweimal).toEqual({ ok: true, content: einmal.content, changed: false });
	});

	it("schreibt einen einzeiligen gequoteten Text unverändert (glaeubiger_id)", () => {
		expect(geschrieben("---\na: 1\n---\n", { set: { glaeubiger_id: lit('"DE98ZZZ00000000001"') } })).toBe(
			'---\na: 1\nglaeubiger_id: "DE98ZZZ00000000001"\n---\n',
		);
	});

	it("verweigert `-.5` als invalid-value", () => {
		expect(patchFrontmatter("---\na: 1\n---\n", { set: { x: lit("-.5") } })).toEqual({ ok: false, reason: "invalid-value", key: "x" });
	});

	it("hängt an einen CRLF-Block durchgehend mit CRLF an", () => {
		const out = geschrieben("---\r\na: 1\r\nb: 2\r\n---\r\nText\r\n", { set: { neu: "x" } });
		expect(out).toBe("---\r\na: 1\r\nb: 2\r\nneu: x\r\n---\r\nText\r\n");
		expect(out.replace(/\r\n/g, "")).not.toMatch(/[\r\n]/);
	});

	it("`ensure` auf einen vorhandenen Schlüssel ändert nichts", () => {
		const text = "---\nanfangssaldo_eur: 1234,50\n---\n";
		expect(patchFrontmatter(text, { ensure: { anfangssaldo_eur: lit("null") } })).toEqual({ ok: true, content: text, changed: false });
	});

	it("verweigert `created` im `set` (protected)", () => {
		expect(patchFrontmatter("---\ncreated: 2026-01-01\n---\n", { set: { created: "2026-10-25" } })).toEqual({
			ok: false,
			reason: "protected",
			key: "created",
		});
	});
});

describe("isFmLiteralText — gleiche Antwort wie patchFrontmatter", () => {
	const auswahl: ReadonlyArray<[string, boolean]> = [
		["-.5", false],
		["+.5", false],
		["-0.00", true],
		["5.", true],
		["null", true],
		['"DE98ZZZ00000000001"', true],
		["abc", false],
	];

	it.each(auswahl)("%s → %s", (text, erwartet) => {
		expect(isFmLiteralText(text)).toBe(erwartet);
		const r = patchFrontmatter("---\na: 1\n---\n", { set: { x: lit(text) } });
		expect(r.ok).toBe(erwartet);
		if (!erwartet && !r.ok) expect(r.reason).toBe("invalid-value");
	});
});
