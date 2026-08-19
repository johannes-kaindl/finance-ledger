import { createHash, randomBytes } from "node:crypto";
import { describe, expect, it } from "vitest";
import { sha256, sha256Bytes } from "../../src/core/hash/sha256";

/**
 * Der Hash ist die Identität einer Buchung beim Dedupe. Weicht er von Pythons
 * `hashlib.sha256` ab, gilt beim ersten Import nach der Umstellung jede
 * bestehende Buchung als neu — deshalb hier zwei unabhängige Belege:
 * die offiziellen NIST-Vektoren und ein Vergleich gegen Nodes `crypto`.
 */
describe("sha256 gegen die NIST-Vektoren", () => {
	it("hasht den leeren String", () => {
		expect(sha256("")).toBe(
			"e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
		);
	});

	it("hasht 'abc'", () => {
		expect(sha256("abc")).toBe(
			"ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
		);
	});

	it("hasht die 448-Bit-Nachricht", () => {
		expect(sha256("abcdbcdecdefdefgefghfghighijhijkijkljklmklmnlmnomnopnopq")).toBe(
			"248d6a61d20638b8e5c026930c3e6039a33ce45964ff2167f6ecedd419db06c1",
		);
	});

	it("hasht die 896-Bit-Nachricht (zwei Blöcke)", () => {
		expect(
			sha256(
				"abcdefghbcdefghicdefghijdefghijkefghijklfghijklmghijklmnhijklmno" +
					"ijklmnopjklmnopqklmnopqrlmnopqrsmnopqrstnopqrstu",
			),
		).toBe("cf5b16a778af8380036ce59e7b0492370b249b11e8f07a51afac45037afee9d1");
	});

	it("hasht eine Million 'a'", () => {
		expect(sha256("a".repeat(1_000_000))).toBe(
			"cd C7 6e 5c 99 14 fb 92 81 a1 c7 e2 84 d7 3e 67 f1 80 9a 48 a4 97 20 0e 04 6d 39 cc c7 11 2c d0"
				.replace(/\s/g, "")
				.toLowerCase(),
		);
	});
});

describe("sha256 gegen node:crypto", () => {
	it("stimmt an jeder Blockgrenze überein", () => {
		// 55/56 und 63/64 sind die Längen, an denen die Polsterung einen
		// zusätzlichen Block erzwingt — die klassische Fehlerstelle.
		for (const length of [0, 1, 54, 55, 56, 57, 63, 64, 65, 119, 120, 128]) {
			const bytes = randomBytes(length);
			expect(sha256Bytes(new Uint8Array(bytes)), `Länge ${length}`).toBe(
				createHash("sha256").update(bytes).digest("hex"),
			);
		}
	});

	it("stimmt für zufällige Eingaben überein", () => {
		for (let i = 0; i < 50; i++) {
			const bytes = randomBytes(1 + ((i * 37) % 500));
			expect(sha256Bytes(new Uint8Array(bytes))).toBe(
				createHash("sha256").update(bytes).digest("hex"),
			);
		}
	});

	it("kodiert Strings als UTF-8 — Umlaute zählen als zwei Byte", () => {
		for (const text of [
			"Gebühr",
			"comp:DE123|2025-08-01|-39.95|festnetz vertragskonto",
			"sref:2025080100000001",
			"Ärger mit Öl und Übermut — 100 % Straße",
		]) {
			expect(sha256(text)).toBe(
				createHash("sha256").update(text, "utf8").digest("hex"),
			);
		}
	});
});
