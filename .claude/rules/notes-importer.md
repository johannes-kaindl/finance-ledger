---
paths:
  - "src/core/notes/**"
  - "src/core/import/**"
  - "scripts/parity-*"
  - "tests/core/notes/**"
---

# Importer-Port (Stand Welle 24: E0–E7 fertig)

`src/core/notes/` schreibt alle Notiz-Arten (Berichte, `dimensionNotes`, `mandatNotes`, `sparzielNotes` mit `sparziele.yaml`, `ruleBodies`, `reportNotes`); `runImport` verdrahtet sie über opt-in-Optionen, `nativeImport.ts` setzt alle. Bestehende Notizen zieht `autoNote.ts` nach (nur Felder des Imports und der Marker-Block; `created` und Eigenes bleiben). `npm run parity -- <config.json> <ziel> <referenz>` vergleicht alle Ordner und den Report mit dem Python-Importer (lokal unter `~/Archive/repos/26-011-finanzplan-importer`; `parity-export.py` nimmt `sparziele.yaml` und `vertraege.yaml` als Parameter 4 und 5); bekannte Unterschiede stehen im Kopf von `parity-check.ts`. Goldmuster: `tests/core/notes/fixtures/` (Eingaben `berichte/gen.py`). Fremdtext aus Bankdaten geht nur über `neutralizeCellText` (code-kit) in Tabellenzellen.

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
