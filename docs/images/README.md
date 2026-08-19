# Aufnahme-Vertrag — README-Bilder

Was jedes Bild zeigen **muss**, damit eine Neuaufnahme dieselbe Aussage trifft. Der
Bild-Standard (Klassen, Breiten, Budgets) liegt zentral in
`_docs/readme/readme-spec.json`; geprüft wird mit `npm run shots:check`.

Aufnahme: `npm run shots -- --setup`, Obsidian neu starten, dann `npm run shots`.

## Bilder

| Datei | Klasse | referenziert von | muss zeigen |
|---|---|---|---|
| `hero.png` | hero | `README.md`, `README.de.md` | Das ganze Fenster: Notizbaum links, der Finance-Hub rechts auf dem Reiter **Ledger** — die filterbare Buchungstabelle mit Datum, Empfänger, Konto und Betrag. Das Bild muss auf einen Blick sagen: „ein Kontoauszug, den man filtern kann, in Obsidian" |
| `dashboard.png` | feature | `README.md`, `README.de.md` | Reiter **Dashboard** mit den Karten (Salden, offene Zuordnungen, wiederkehrende Zahlungen, größte Ausgabenkategorien). Mindestens drei Karten mit echten Zahlen aus dem Fixture |
| `balances.png` | feature | `README.md`, `README.de.md` | Reiter **Balances**: die drei Konten mit Anfangssaldo, Bewegung und Endstand. Zeigt die Stand-Am-Logik — deshalb muss das Anfangssaldo-Datum sichtbar sein |
| `categories.png` | feature | `README.md`, `README.de.md` | Reiter **Categories**: die Kategorie-Hierarchie mit Beträgen und Anteil in Prozent, mindestens eine aufgeklappte Ebene |
| `triage.png` | feature | `README.md`, `README.de.md` | Reiter **Triage** mit den vier `:tbc:`-Buchungen des Fixtures und der Aktion, die daraus eine Regel macht. Das ist der Arbeitsablauf, den das Plugin eigentlich verkauft |

## Offen

| Datei | Warum es (noch) nicht existiert |
|---|---|
| `settings.png` | Die Einstellungen sind seit **Obsidian 1.13 ein eigenes Fenster**. Im Workspace-Fenster findet `.modal.mod-settings` nichts; der Ausschnitt bleibt leer, und `capture` nimmt dann klaglos das **ganze Fenster** auf — ein Bild, das jede Größenprüfung besteht und das Falsche zeigt (so geschehen im zweiten Lauf am 2026-08-17). Der Weg dorthin ist `attachTo("settings", port)`, also ein zweites CDP-Ziel im selben Rezept. Bis das gebaut ist, steht hier eine Lücke statt eines irreführenden Bildes |

## Was die Bilder NICHT zeigen dürfen

- **Keine echten Daten.** Alles kommt aus `fixture/` — erfundene Firmen (*Acme Power*,
  *Northwind Grocers*, *Globex*), erfundene IBANs, *Jane Doe* als Inhaberin.
- **Kein zweites Plugin.** Die Fixture-Vault-Konfiguration aktiviert nur `finance-ledger`;
  sonst malen fremde Ribbon-Icons in jedes Bild.
- **Keine deutsche Oberfläche.** Die Plugin-UI folgt Obsidians Spracheinstellung; für die
  Aufnahme steht sie auf Englisch, weil `README.md` die kanonische Fassung ist.

## Eine Eigenheit, die man im Bild sieht — und die ein Befund ist

Die Kontopräfixe **`Aktiva:`, `Passiva:`, `Einnahmen:`, `Ausgaben:` sind hart verdrahtet**
(`src/views/helpers.ts` → `accountType`, `src/aggregator/saldo.ts`). Sie sind keine
Anzeigetexte, sondern Datenlogik: an ihnen entscheidet das Plugin, ob ein Konto Vermögen,
Schuld, Einnahme oder Ausgabe ist.

Folge für die Bilder: In einer **englischen** Oberfläche stehen **deutsche** Kontonamen —
`Ausgaben:Groceries:Northwind`. Das Fixture bildet das ehrlich ab, statt es zu kaschieren.

Das ist kein Aufnahme-Problem, sondern eine offene Frage am Produkt: ein englischsprachiger
Nutzer müsste seine Konten deutsch präfixieren. Solange das so ist, gehört es in die README
und nicht in eine Fußnote — die Bebilderung hat es sichtbar gemacht.

## Fixture

`fixture/notes/` — drei Konten, 40 Buchungen über drei Monate, davon vier ohne Zuordnung
(`:tbc:`, für die Triage-Ansicht) und mehrere mit `:recurring:`. Dazu drei
Categorizer-Regeln, `konten.yaml`, `journal.ledger`, `accounts.ledger` und
`opening_balances.ledger`.

`fixture/obsidian/` — Vault-Konfiguration: nur dieses Plugin aktiv, keine Inline-Titel,
Eigenschaften-Tabelle ausgeblendet (`propertiesInDocument: hidden`, seit Obsidian 1.13 der
richtige Schlüssel).

## Was der Lauf voraussetzt

- Obsidian mit `--remote-debugging-port=9222`.
- Den Aufnahme-Vault (`npm run shots -- --setup` legt ihn an) **einmal in Obsidian öffnen**
  und dem Vault vertrauen.
- Die Aufnahmesprache ist **app-weit** (`localStorage["language"]`): der Treiber stellt sie
  auf Englisch und **danach auf den Vorwert zurück** — sonst startet der Arbeits-Vault des
  Maintainers in der Aufnahmesprache.
