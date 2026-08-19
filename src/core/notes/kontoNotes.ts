/**
 * Konto-Notizen — je aktivem Konto eine Notiz im Vault.
 *
 * Portiert aus `output/konten.py`. Zwei Dinge sind dabei geradegezogen worden:
 *
 * - Python liest das Frontmatter mit `text.split("---", 2)` und schreibt es mit
 *   Zeilen-Regexen. Das bricht, sobald `---` im Wert oder eine horizontale Linie
 *   im Rumpf steht. Hier läuft beides über `notes/frontmatter`.
 * - Beträge werden mit fester Skala ausgegeben. Python verlässt sich auf die
 *   Skala, die `Decimal` durch die Rechnung trägt — bei einem Konto ohne
 *   Buchungen steht dort `0` statt `0.00`. `decimal.js` kennt diese
 *   nachlaufenden Nullen nicht, die Abweichung wäre also ohnehin nicht
 *   nachbaubar; fest zwei Stellen ist die vorhersagbare Variante.
 */

import type { ImporterContext } from "../config/context";
import type { KontoSpec } from "../config/konten";
import type { IsoDate } from "../dates";
import type { BankTransaction } from "../import/transaction";
import { Money, ZERO, type MoneyValue } from "../money";
import { replaceAutoSection } from "./markers";
import { patchFrontmatter } from "./frontmatter";

/** Was der Import über ein Konto weiß. */
export interface KontoKennzahlen {
	eingang: MoneyValue;
	ausgang: MoneyValue;
	netto: MoneyValue;
	anzahl: number;
	erstesDatum: IsoDate;
	letztesDatum: IsoDate;
}

/** Eine zu schreibende Notiz. */
export interface NotePlan {
	path: string;
	content: string;
	/** Ob die Notiz schon da war — für die Meldung „N angelegt, M aktualisiert". */
	existed: boolean;
}

/** Der Text, der unter dem Marker-Block steht, solange der Nutzer nichts schreibt. */
const USER_DEFAULT =
	"## 📌 Notizen\n\n" +
	"_Eigene Anmerkungen zu diesem Konto — wird bei Re-Run NICHT überschrieben._\n";

/** Summiert Eingang, Ausgang, Netto, Anzahl und Zeitspanne je IBAN. */
export function kennzahlenProKonto(
	transactions: readonly BankTransaction[],
): Map<string, KontoKennzahlen> {
	const agg = new Map<string, KontoKennzahlen>();
	for (const tx of transactions) {
		const k = agg.get(tx.accountIban) ?? {
			eingang: ZERO,
			ausgang: ZERO,
			netto: ZERO,
			anzahl: 0,
			erstesDatum: tx.buchungstag,
			letztesDatum: tx.buchungstag,
		};
		k.anzahl += 1;
		k.netto = k.netto.plus(tx.betrag);
		if (tx.betrag.greaterThan(0)) {
			k.eingang = k.eingang.plus(tx.betrag);
		} else {
			k.ausgang = k.ausgang.plus(tx.betrag);
		}
		if (tx.buchungstag < k.erstesDatum) {
			k.erstesDatum = tx.buchungstag;
		}
		if (tx.buchungstag > k.letztesDatum) {
			k.letztesDatum = tx.buchungstag;
		}
		agg.set(tx.accountIban, k);
	}
	return agg;
}

/** Baut für jedes aktive Konto den zu schreibenden Text. */
export function planKontoNotes(
	ctx: ImporterContext,
	transactions: readonly BankTransaction[],
	existing: Readonly<Record<string, string>>,
): NotePlan[] {
	const kennzahlen = kennzahlenProKonto(transactions);
	return ctx.activeKonten.map((spec) => {
		const path = kontoNotePath(ctx, spec);
		const k = kennzahlen.get(spec.iban);
		const vorhanden = existing[path];
		return {
			path,
			existed: vorhanden !== undefined,
			content:
				vorhanden === undefined
					? renderKontoNote(ctx, spec, k)
					: updateKontoNote(ctx, spec, k, vorhanden),
		};
	});
}

/** Vault-Pfad der Konto-Notiz. */
export function kontoNotePath(
	ctx: ImporterContext,
	spec: KontoSpec,
): string {
	return `${ctx.notesPrefix}/${ctx.folders.konten}/${kontoNoteName(ctx, spec)}.md`;
}

/** Eine neue Konto-Notiz von Grund auf. */
export function renderKontoNote(
	ctx: ImporterContext,
	spec: KontoSpec,
	kennzahlen: KontoKennzahlen | undefined,
): string {
	const title = kontoNoteName(ctx, spec);
	const heute = ctx.clock.today();
	const aliases = spec.aliases.map((a) => `  - ${a}`).join("\n");

	return `---
title: ${title}
type: 📋 Referenz
kategorie: konto
tags:
  - 🏗_Finanzplan
  - finanzen/konto
aliases:
${aliases}
bereich: 💰 Finanzen
projektbezug:
  - [[${ctx.notesPrefix}/${ctx.projectNote}]]
status: 🌿 Evergreen
priority: 🔴 Hoch

iban: ${spec.iban}
bank: ${spec.bank}
bic: ${spec.bic}
konto_typ: ${spec.kontoTyp}
konto_rolle: ${spec.kontoRolle}
ledger_account: "${spec.ledgerAccount}"
saldo_eur: ${saldoOf(kennzahlen)}
saldo_stand_am: ${standAmOf(kennzahlen, heute)}
anfangssaldo_eur: null
anfangssaldo_stand_am: null
inhaber: ${spec.inhaber}
mitinhaber:

aktiv: true

created: ${heute}
updated: ${heute}
sticker: ${spec.sticker}
---

# 🏦 ${title}

> [!info] Rolle
> ${spec.rolleBeschreibung}

> [!warning] Saldo ist relativ
> \`saldo_eur\` zeigt nur die kumulierte Summe aller Buchungen aus dem Import.
> Echter Bank-Saldo = \`anfangssaldo_eur\` + dieser Wert. Steht dort \`null\`,
> einmal aus dem Online-Banking nachtragen und \`anfangssaldo_stand_am\` setzen.
> Der Importer überschreibt diese beiden Felder nie.

${replaceAutoSection("", autoSection(ctx, kennzahlen), USER_DEFAULT).trimStart()}`;
}

/** Eine bestehende Konto-Notiz nachziehen, ohne fremde Felder anzufassen. */
export function updateKontoNote(
	ctx: ImporterContext,
	spec: KontoSpec,
	kennzahlen: KontoKennzahlen | undefined,
	existing: string,
): string {
	const heute = ctx.clock.today();
	const patched = patchFrontmatter(existing, {
		set: {
			saldo_eur: saldoOf(kennzahlen),
			saldo_stand_am: standAmOf(kennzahlen, heute),
			updated: heute,
		},
		ensure: { anfangssaldo_eur: "null", anfangssaldo_stand_am: "null" },
	});

	const cut = endOfFrontmatter(patched);
	const head = patched.slice(0, cut);
	const body = patched.slice(cut);
	return head + replaceAutoSection(body, autoSection(ctx, kennzahlen), USER_DEFAULT);
}

/** Der Teil, den jeder Lauf komplett neu schreibt. */
function autoSection(
	ctx: ImporterContext,
	kennzahlen: KontoKennzahlen | undefined,
): string {
	const stats =
		kennzahlen === undefined
			? "| Buchungen | 0 |\n"
			: [
					`| Buchungen | ${kennzahlen.anzahl} |`,
					`| Eingänge | ${kennzahlen.eingang.toFixed(2)} € |`,
					`| Ausgänge | ${kennzahlen.ausgang.toFixed(2)} € |`,
					`| Net (Saldo-Bewegung im Import) | ${kennzahlen.netto.toFixed(2)} € |`,
					`| Beleg-Spanne | ${kennzahlen.erstesDatum} – ${kennzahlen.letztesDatum} |`,
					"",
				].join("\n");

	const kontenOrdner = `${ctx.notesPrefix}/${ctx.folders.konten}`;
	return `## Daten

| Feld | Wert |
|---|---|
| IBAN | \`=this.iban\` |
| Bank | \`=this.bank\` |
| BIC | \`=this.bic\` |
| Typ | \`=this.konto_typ\` |
| Rolle | \`=this.konto_rolle\` |
| Ledger-Account | \`=this.ledger_account\` |
| Saldo (€) | \`=this.saldo_eur\` |
| Stand am | \`=this.saldo_stand_am\` |
| Aktiv | \`=this.aktiv\` |

## Beleg-Statistik

| Metrik | Wert |
|---|---:|
${stats}
## Verbindungen

- Konten-Index: [[${kontenOrdner}/${ctx.folders.konten}|${ctx.folders.konten}]]
- Dashboard: [[${ctx.notesPrefix}/_Dashboard – Finanzen|Dashboard – Finanzen]]
- Konten-Plan: [[${ctx.notesPrefix}/_Foundation – Konten-Plan und Kategorien|Foundation]]
`;
}

/** Dateiname der Konto-Notiz ohne `.md` — dieselbe Ableitung wie im Kontext. */
function kontoNoteName(ctx: ImporterContext, spec: KontoSpec): string {
	return ctx.ibanToFilename.get(spec.iban) ?? spec.iban;
}

function saldoOf(kennzahlen: KontoKennzahlen | undefined): string {
	return (kennzahlen?.netto ?? new Money(0)).toFixed(2);
}

function standAmOf(
	kennzahlen: KontoKennzahlen | undefined,
	heute: IsoDate,
): string {
	return kennzahlen?.letztesDatum ?? heute;
}

/**
 * Index hinter dem schließenden Zaun.
 *
 * Ohne Frontmatter ist das 0 — die ganze Notiz ist dann Rumpf, und der
 * Marker-Block wandert ans Ende, statt einen Zaun zu erfinden.
 */
function endOfFrontmatter(text: string): number {
	const match = /^---\r?\n[\s\S]*?\r?\n---[ \t]*\r?\n?/.exec(text);
	return match === null ? 0 : match[0].length;
}
