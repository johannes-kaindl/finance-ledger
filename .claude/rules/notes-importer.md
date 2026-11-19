---
paths:
  - "src/core/notes/**"
  - "src/core/import/**"
  - "src/core/accounts/**"
  - "src/aggregator/**"
  - "scripts/parity-*"
  - "tests/core/notes/**"
---

# Importer-Port (Stand Welle 24: E0–E7 fertig)

`src/core/notes/` schreibt alle Notiz-Arten (Berichte, `dimensionNotes`, `mandatNotes`, `sparzielNotes` mit `sparziele.yaml`, `ruleBodies`, `reportNotes`); `runImport` verdrahtet sie über opt-in-Optionen, `nativeImport.ts` setzt alle. Bestehende Notizen zieht `autoNote.ts` nach (nur Felder des Imports und der Marker-Block; `created` und Eigenes bleiben). `npm run parity -- <config.json> <ziel> <referenz>` vergleicht alle Ordner und den Report mit dem Python-Importer (lokal unter `~/Archive/repos/26-011-finanzplan-importer`; `parity-export.py` nimmt `sparziele.yaml` und `vertraege.yaml` als Parameter 4 und 5); bekannte Unterschiede stehen im Kopf von `parity-check.ts`. Goldmuster: `tests/core/notes/fixtures/` (Eingaben `berichte/gen.py`). Fremdtext aus Bankdaten geht nur über `neutralizeCellText` (code-kit) in Tabellenzellen.

## Kontotyp kommt aus dem Kontenplan, nicht aus dem Namen (seit 2026-11-18)

`kontoTyp(konto, plan)` in `src/core/accounts/kontoTyp.ts` ist die einzige Stelle, die entscheidet, ob ein Konto Vermögen, Schuld, Einnahme, Ausgabe oder Eigenkapital ist; ein neues `startsWith("Ausgaben:")` (oder `Aktiva:`, `Einnahmen:`, `Passiva:`, `Eigenkapital:`) im Quelltext ist ein Fehler. Der Plan ist `parseKontenplan(accounts.ledger)`: `type:`-Tags der `account`-Zeilen (hledger: `A L E R X C` oder Langform), das genauere Konto gewinnt vor dem Vorfahren; ohne Eintrag gilt die Wurzel des Namens (deutsch wie bisher, dazu `Assets`, `Liabilities`, `Income`, `Revenues`, `Expenses`, `Equity`), und der Doppelpunkt hinter der Wurzel bleibt Pflicht (`Aktiva` allein hat keinen Typ). Die Ansichten laden den Plan mit `loadKontenplan` (`src/views/kontenplan.ts`) und reichen ihn weiter.

Der Importer legt eigene Konten (Auffangkonto, Bankgebühren, Zinsen, Eröffnungsbilanz, Durchlaufkonto) unter `ctx.wurzeln` an (`src/core/accounts/wurzeln.ts`, Konfiguration `kontowurzeln` in `konten.yaml`, Standard deutsch). Für abweichende Wurzeln schreibt `formatAccounts` `account <Wurzel>  ; type: <Kürzel>`-Zeilen (`wurzelDirektiven`), beim Standard nichts: `accounts.ledger` bleibt für bestehende Kontenpläne byte-gleich, und `npm run parity` gegen den Python-Importer bleibt gültig. Die Ordner der 17 Berichts-Kategorien unter der Ausgaben-Wurzel (Suffix `lebensmittel` → Ordner `Lebensmittel`) sind Konfiguration (`kategorien` in `konten.yaml`, `src/core/accounts/kategorienOrdner.ts`, im Kontext `ctx.ordner`, Standard deutsch); der Suffix ist der Frontmatter-Schlüssel und der Vertrag mit der Python-Referenz und bleibt fest, neue Kategorien kennt die Konfiguration nicht. Alles, was ein Konto unter einer Kategorie anlegt, geht über `ausgabenKonto(wurzeln, ordner, suffix, …)`, die Auswertung über `kategorieMapping(wurzeln, ordner)`; wer eine Funktion mit `wurzeln` erweitert, reicht `ordner` mit. `tests/core/import/englischerKontenplan.test.ts` fährt den ganzen Weg (Import → `journal.ledger` und `accounts.ledger` → Saldo und Kategorien) mit englischen und mit frei benannten Wurzeln samt Gegenprobe ohne Plan.

## Wikilinks in Frontmatter-Listen stehen gequotet

Ein Wikilink als Eintrag einer Frontmatter-Liste wird mit `quoteScalar` aus dem Kit geschrieben (`- "[[X]]"`), nie roh: Obsidian liest `- [[X]]` als verschachtelte Liste, also ohne Link und ohne Backlink (gemessen 2026-10-25, Obsidian 1.12.4). Das gilt für `projektbezug`, `abbucht_von`, `gespart_auf` und `vertrag_link`; `tests/core/notes/frontmatterWikilinks.test.ts` findet jede rohe Schreibweise im Quelltext. Der Python-Importer schreibt seit seinem Commit `cf2156f` dieselbe Form, sonst bräche die Parität. Bestehende Notizen mit roher Zeile (im Finanzplan-Ordner 176) zieht der Import nicht nach; die Migration ist eine eigene Task.

## Bekannte Grenze: CRLF-Notizen

Eine bestehende Notiz mit Windows-Zeilenenden (CRLF) bekommt im Lauf ein Zeilenende-Gemisch: die Frontmatter bleibt CRLF (das Kit hält das Zeilenende des Blocks), aber hinter dem schließenden Zaun und im Auto-Block stehen LF, der Benutzerteil bleibt CRLF, und der zweite Lauf ändert nichts mehr (idempotent). Ursache: `assembleBody` (`markers.ts`) verbindet mit `\n`, das Kit hätte `wrapZone(block, markers, eol)` mit dem Zeilenende als Parameter. Gemessen 2026-10-25 im echten Finanzplan-Ordner: 0 von 517 `.md` tragen CRLF (388 mit Auto-Block), in den Fixtures 0 von 26; deshalb ist das keine behobene Sache, sondern eine dokumentierte Grenze, festgehalten in `tests/core/notes/autoNoteCrlf.test.ts`. Taucht eine CRLF-Notiz auf, ist der Weg: das Zeilenende in `updateAutoNote` aus dem gepatchten Frontmatter ableiten (nicht aus dem Kopf, der dort `""` ist), über `replaceAutoSection` bis `assembleBody` durchreichen (Kit-Funktion `wrapZone(…, eol)`, keine lokale Zeilenende-Logik), den Test auf "CRLF bleibt durchgehend CRLF" umstellen; direkte Aufrufer von `assembleBody` sind `dimensionNotes`, `berichtNotes`, `reportNotes`, `vertragNotes` und `sparzielNotes`, `replaceAutoSection` rufen `autoNote`, `kontoNotes` und `vertragNotes`.

## Vault-Daten-Schemas (Kurzreferenz)

### journal.ledger-Transaktion

```
2025-08-01 * Telekom Deutschland GmbH
    ; verwendungszweck: Festnetz Vertragskonto …
    ; quelle: <csv-name> row 12
    ; :recurring:
    Aktiva:Bank:Sparkasse:Hauptkonto  -39.95 EUR
    Ausgaben:Kommunikation:Festnetz:Telekom  39.95 EUR
```

### Konto-Note-Frontmatter (Pflichtfelder)

```yaml
kategorie: konto
iban: DE…
ledger_account: "Aktiva:Bank:Sparkasse:Hauptkonto"
saldo_eur: 280.44
```

### Vertrags-Note-Frontmatter (Pflichtfelder)

```yaml
kategorie: vertrag
ledger_kategorie: "Ausgaben:Kommunikation:Festnetz:Telekom"
betrag_eur: 39.95
rhythmus: monatlich
naechste_zahlung: 2026-06-06
```

Pfad-Muster: `<vault>/<financeRoot>/20-Verträge/<Name>.md`.
