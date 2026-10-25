---
title: Import-Report Finanzplan
type: 📋 Referenz
kategorie: report
tags:
  - 🏗_Finanzplan
  - finanzen/report
bereich: 💰 Finanzen
projektbezug:
  - "[[Finanzplan/Finanzplan]]"
status: 🌿 Evergreen
created: 2026-10-18
updated: 2026-10-18
sticker: lucide//file-bar-chart
---

<!-- BEGIN: AUTO-GENERATED -->
# Import-Report — Finanzplan

> [!info] Auto-generiert am 2026-10-18
> 293 Buchungen aus den Sparkasse-CSVs in den Ledger-Output importiert. Per Konto Cent-genau validiert. Output: [[Finanzplan/Ledger/journal.ledger|journal.ledger]] (siehe Sektion 7+8 für die Vertrags- und Konto-Notes).

## 1. Zusammenfassung

| Konto | Buchungen | Eingang € | Ausgang € | Net € |
|---|---:|---:|---:|---:|
| `Aktiva:Bank:Everyday Checking` | 183 | 43100.00 | -22523.73 | +20576.27 |
| `Aktiva:Bank:Household Pool` | 32 | 2600.00 | -704.31 | +1895.69 |
| `Aktiva:Bank:Rental` | 39 | 10140.00 | -1863.52 | +8276.48 |
| `Passiva:Credit Card:Everyday Visa` | 39 | 0.00 | -1096.46 | -1096.46 |
| **TOTAL** | **293** | **55840.00** | **-26188.02** | **+29651.98** |

## 2. Validierung

✓ Alle Konten Cent-genau validiert.

| Konto | Sum Original CSV | Sum Journal | Δ | Status |
|---|---:|---:|---:|---|
| `Aktiva:Bank:Everyday Checking` | 20576.27 EUR | 20576.27 EUR | 0.00 | ✓ OK |
| `Aktiva:Bank:Household Pool` | 1895.69 EUR | 1895.69 EUR | 0.00 | ✓ OK |
| `Aktiva:Bank:Rental` | 8276.48 EUR | 8276.48 EUR | 0.00 | ✓ OK |
| `Passiva:Credit Card:Everyday Visa` | -1096.46 EUR | -1096.46 EUR | 0.00 | ✓ OK |

## 3. TBC-Buchungen (best-guess kategorisiert, manuell prüfen)

| Ledger-Account | Anzahl | Volumen € | Beispiel-Counterparty |
|---|---:|---:|---|
| `Ausgaben:Unkategorisiert:2026_10_31_ME00000001_camt52v8` | 13 | 618.58 | Zufallsfirma 9 |

## 4. Unkategorisiert (Top 25 nach Volumen)

**Quote:** 0.75% des EUR-Volumens unkategorisiert (618.58 von 82028.02 EUR). Acceptance: ≤ 5%.

| Counterparty (top 25) | Anzahl | Volumen € |
|---|---:|---:|
| `Zufallsfirma 9` | 3 | 197.16 |
| `Zufallsfirma 6` | 3 | 102.27 |
| `Zufallsfirma 1` | 1 | 88.98 |
| `Zufallsfirma 5` | 2 | 80.28 |
| `Zufallsfirma 7` | 1 | 50.42 |
| `Zufallsfirma 2` | 1 | 48.30 |
| `Zufallsfirma 3` | 1 | 44.09 |
| `Zufallsfirma 4` | 1 | 7.08 |

## 5. PayPal-Aufschlüsselung

_Keine PayPal-Buchungen._

## 6. Self-Transfer-Detektionen

| Posting (Quelle) | Gegen (Ziel) | Anzahl | Volumen € |
|---|---|---:|---:|
| `Aktiva:Bank:Everyday Checking` | `Aktiva:Sonstige_Selbst-Bewegung` | 13 | 2600.00 |
| `Aktiva:Bank:Household Pool` | `Aktiva:Sonstige_Selbst-Bewegung` | 13 | 2600.00 |

## 7. Generierte Vertrags-Notes (2 Specs)

_Existierende Notes wurden NICHT überschrieben (idempotent). Eine Note wird übersprungen, wenn 0 Buchungen für das Pattern gefunden werden._

| # | Vertrag (Wikilink) | Ledger-Kategorie | Konto |
|---:|---|---|---|
| 1 | [[Finanzplan/20-Verträge/Acme Power – Strom|Acme Power – Strom]] | `Ausgaben:Wohnen:Strom` | Everyday Checking |
| 2 | [[Finanzplan/20-Verträge/Insure AG – Haftpflicht|Insure AG – Haftpflicht]] | `Ausgaben:Versicherung:Haftpflicht` | Household Pool |

## 8. Generierte/aktualisierte Konto-Notes

| # | Konto-Note | IBAN | Ledger-Account |
|---:|---|---|---|
| 1 | [[Finanzplan/10-Konten/Konto 01 – Everyday Checking|Konto 01 – Everyday Checking]] | `GB00ACME00000001` | `Aktiva:Bank:Everyday Checking` |
| 2 | [[Finanzplan/10-Konten/Konto 02 – Household Pool|Konto 02 – Household Pool]] | `GB00ACME00000002` | `Aktiva:Bank:Household Pool` |
| 3 | [[Finanzplan/10-Konten/Konto 03 – Everyday Visa|Konto 03 – Everyday Visa]] | `GB00ACME00000003` | `Passiva:Credit Card:Everyday Visa` |
| 4 | [[Finanzplan/10-Konten/Konto 04 – Rental|Konto 04 – Rental]] | `GB00ACME00000004` | `Aktiva:Bank:Rental` |

## 11. Datenqualitäts-Issues

- **Anfangssalden fehlen:** `opening_balances.ledger` setzt alle 5 Konten (K1-4 + Bargeld) auf 0,00 EUR mit `:tbc:anfangssaldo:`-Tag. Aus Bank die echten Salden vom 2025-07-01 nachziehen (Foundation §8.8).
- **Visa-Daten-Lücke:** Visa-Buchungen sind erst ab 2026-01 vorhanden (252 Tx Jan-Mai 2026). Ältere Visa-Abrechnungen für 2025-07–2025-12 fehlen — Foundation §8.9 nachverfolgen.
<!-- END: AUTO-GENERATED -->

## 📌 User-Notizen

_Eigene Anmerkungen zum Import-Report — wird bei Re-Run NICHT überschrieben._
