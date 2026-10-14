import { createImporterContext, fixedClock, type ImporterContext } from "../../../src/core/config/context";
import { parseKontenConfig } from "../../../src/core/config/konten";

/** Ein Importer-Kontext mit festem Datum und einem Konto — mehr brauchen die Wikilinks der Tabellen nicht. */
export function fixedContext(): ImporterContext {
	return createImporterContext({
		konten: parseKontenConfig({
			konten: [
				{
					id: "hauptkonto", iban: "DE1", ledger_account: "Aktiva:Bank:Sparkasse:Hauptkonto", bank: "Sparkasse", bic: "X",
					konto_typ: "giro", konto_rolle: "hauptkonto", csv_schema: "camt52", inhaber: "Max", filename: "Konto 01.md",
					sticker: "🏦", rolle_beschreibung: "", aliases: [],
				},
			],
		}),
		notesPrefix: "Finanzplan",
		clock: fixedClock("2026-08-14"),
	});
}
