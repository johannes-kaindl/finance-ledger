import { describe, expect, it } from "vitest";
import { CsvTokenizer, isBlankRow, parseCsv } from "../../src/core/csv/reader";

describe("parseCsv", () => {
	it("trennt an Semikolon", () => {
		expect(parseCsv("a;b;c")).toEqual([["a", "b", "c"]]);
	});

	it("behält Leerfelder — Spaltenindizes müssen stabil bleiben", () => {
		expect(parseCsv("a;;c;")).toEqual([["a", "", "c", ""]]);
	});

	it("versteht LF, CRLF und ein einzelnes CR", () => {
		expect(parseCsv("a;b\nc;d")).toEqual([
			["a", "b"],
			["c", "d"],
		]);
		expect(parseCsv("a;b\r\nc;d")).toEqual([
			["a", "b"],
			["c", "d"],
		]);
		expect(parseCsv("a;b\rc;d")).toEqual([
			["a", "b"],
			["c", "d"],
		]);
	});

	it("liefert keine Zeile für einen abschließenden Umbruch", () => {
		expect(parseCsv("a;b\r\n")).toEqual([["a", "b"]]);
		expect(parseCsv("a;b\n\n")).toEqual([["a", "b"]]);
	});

	it("entfernt quotierende Anführungszeichen", () => {
		expect(parseCsv('"a";"b;c";"d"')).toEqual([["a", "b;c", "d"]]);
	});

	it("löst doppelte Anführungszeichen als Escape auf", () => {
		expect(parseCsv('"sagt ""hallo""";x')).toEqual([['sagt "hallo"', "x"]]);
	});

	it("erlaubt Zeilenumbrüche innerhalb quotierter Felder", () => {
		expect(parseCsv('"Zeile1\nZeile2";b')).toEqual([["Zeile1\nZeile2", "b"]]);
	});

	it("behandelt ein Anführungszeichen mitten im Feld als Inhalt", () => {
		// Wie Pythons csv.reader — Bank-Verwendungszwecke enthalten das gelegentlich.
		expect(parseCsv('12" Zoll;b')).toEqual([['12" Zoll', "b"]]);
	});

	it("schluckt ein BOM statt es in die erste Kopfspalte zu schreiben", () => {
		expect(parseCsv("﻿Auftragskonto;Buchungstag")).toEqual([
			["Auftragskonto", "Buchungstag"],
		]);
	});

	it("meldet ein nie geschlossenes Feld", () => {
		expect(() => parseCsv('"offen;b')).toThrow(/quotierten Feld/);
	});
});

describe("CsvTokenizer über Chunk-Grenzen", () => {
	it("liefert dasselbe wie der Einmal-Aufruf, egal wo geschnitten wird", () => {
		const text =
			'Auftragskonto;Betrag\r\nDE123;"1.234,56"\r\n"mehr\nZeilen";-9,99\r\n';
		const expected = parseCsv(text);

		for (let cut = 1; cut < text.length; cut++) {
			const tokenizer = new CsvTokenizer();
			const rows = [
				...tokenizer.push(text.slice(0, cut)),
				...tokenizer.push(text.slice(cut)),
				...tokenizer.flush(),
			];
			expect(rows, `Schnitt bei ${cut}`).toEqual(expected);
		}
	});

	it("überlebt einen Schnitt zwischen CR und LF", () => {
		const tokenizer = new CsvTokenizer();
		const rows = [
			...tokenizer.push("a;b\r"),
			...tokenizer.push("\nc;d"),
			...tokenizer.flush(),
		];
		expect(rows).toEqual([
			["a", "b"],
			["c", "d"],
		]);
	});

	it("überlebt einen Schnitt zwischen zwei Anführungszeichen", () => {
		const tokenizer = new CsvTokenizer();
		const rows = [
			...tokenizer.push('"a"'),
			...tokenizer.push('"b";c'),
			...tokenizer.flush(),
		];
		expect(rows).toEqual([['a"b', "c"]]);
	});
});

describe("isBlankRow", () => {
	it("erkennt Leerzeilen am Dateiende", () => {
		expect(isBlankRow([""])).toBe(true);
		expect(isBlankRow(["", "  ", ""])).toBe(true);
		expect(isBlankRow(["", "x"])).toBe(false);
	});
});
