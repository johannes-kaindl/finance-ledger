/**
 * Ableitungen aus einem Ledger-Konto: Dateiname und Anzeigename.
 *
 * Im Python-Importer wohnen diese beiden Funktionen in `output/empfaenger_notes`
 * und werden von `output/wikilink` importiert — was einen Zirkelbezug erzeugt,
 * den Python nur durch Lazy-Imports in Funktionsrümpfen entschärft. ESM löst
 * anders auf; deshalb stehen sie hier für sich. Sie gehören ohnehin keinem der
 * beiden Module: sie sind die Namenskonvention selbst.
 */

/** `Ausgaben:Tech_Abos:KI:Anthropic` → `ausgaben-tech-abos-ki-anthropic`. */
export function ledgerToSlug(ledgerAccount: string): string {
	return ledgerAccount.replace(/[:_]/g, "-").toLowerCase();
}

/** `Ausgaben:Lebensmittel:Bio_Markt` → `Bio Markt`. */
export function canonicalFromAccount(ledgerAccount: string): string {
	const last = ledgerAccount.split(":").at(-1) ?? ledgerAccount;
	return last.replace(/_/g, " ");
}

/**
 * Mandatsreferenz → Dateiname der Mandats-Notiz.
 *
 * Bindestriche bleiben, weil echte SEPA-Referenzen daraus bestehen
 * (`EON-000000000-000000000-0`); alles andere wird zum Unterstrich, damit kein
 * Schrägstrich im Namen einen Ordner erfindet.
 */
export function mandatsSlug(mandatsId: string): string {
	return mandatsId.toLowerCase().replace(/[^a-z0-9-]/g, "_");
}
