import { describe, expect, it } from "vitest";
import { decodeLatin1, decodeUtf8OrLatin1 } from "../../src/core/text/decode";

/** „Gebühr" in Latin-1: das ü ist ein einzelnes Byte 0xFC. */
const LATIN1_GEBUEHR = new Uint8Array([
	0x47, 0x65, 0x62, 0xfc, 0x68, 0x72,
]);
/** Dasselbe Wort in UTF-8: das ü sind zwei Bytes. */
const UTF8_GEBUEHR = new TextEncoder().encode("Gebühr");

describe("decodeLatin1", () => {
	it("liest Umlaute aus Einzelbytes", () => {
		expect(decodeLatin1(LATIN1_GEBUEHR)).toBe("Gebühr");
	});

	it("nimmt auch einen ArrayBuffer", () => {
		expect(decodeLatin1(LATIN1_GEBUEHR.buffer)).toBe("Gebühr");
	});

	it("zerlegt UTF-8-Bytes erwartungsgemäß in Mojibake", () => {
		// Referenz: warum die Reihenfolge in decodeUtf8OrLatin1 nicht umkehrbar ist.
		expect(decodeLatin1(UTF8_GEBUEHR)).toBe("GebÃ¼hr");
	});
});

describe("decodeUtf8OrLatin1", () => {
	it("bevorzugt UTF-8, wenn die Bytes gültig sind", () => {
		expect(decodeUtf8OrLatin1(UTF8_GEBUEHR)).toBe("Gebühr");
	});

	it("fällt bei ungültigem UTF-8 auf Latin-1 zurück", () => {
		expect(decodeUtf8OrLatin1(LATIN1_GEBUEHR)).toBe("Gebühr");
	});

	it("ersetzt nicht still — sonst käme hier U+FFFD heraus", () => {
		const decoded = decodeUtf8OrLatin1(LATIN1_GEBUEHR);
		expect(decoded).not.toContain("�");
	});

	it("lässt reinen ASCII-Text unangetastet", () => {
		const ascii = new TextEncoder().encode("Auftragskonto;Buchungstag");
		expect(decodeUtf8OrLatin1(ascii)).toBe("Auftragskonto;Buchungstag");
	});
});
