# Aufnahme-Vertrag — README-Bilder

Was jedes Bild zeigen **muss**, damit eine Neuaufnahme dieselbe Aussage trifft. Der
Bild-Standard (Klassen, Breiten, Budgets) liegt zentral in
`_docs/readme/readme-spec.json`; geprüft wird mit `npm run shots:check`.

Aufnahme: `npm run shots -- --setup`, **Zweitinstanz** mit eigenem Profil starten
(nicht die laufende App quitten — s. „Was der Lauf voraussetzt“), dann
`npm run shots -- --port <port>`.

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
| `settings.png` | **Rezept steht seit 2026-09-02, die Aufnahme fehlt noch.** `settingsBild()` in `scripts/shots.ts` dockt über `attachTo("settings", …)` an das eigene Einstellungen-Fenster an (Obsidian 1.13; im Workspace-Fenster findet `.modal.mod-settings` nichts, und `capture` nimmt dann klaglos das ganze Fenster auf — ein Bild, das jede Größenprüfung besteht und das Falsche zeigt, so geschehen am 2026-08-17). Was fehlt, ist der Lauf: `npm run shots -- --port <zweitinstanz> --only settings.png`. Am 2026-09-02 kam er nicht zustande, weil der CDP-Lock über Stunden von drei anderen Sessions gehalten wurde — kein Befund am Rezept |

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

- **Eine Zweitinstanz mit eigenem Profil**, nicht die reguläre App. Dieses Rezept braucht
  einen frischen Start je Bild; auf der regulären Instanz wäre das ein Quit, der die Sitzung
  einer fremden Session zerstört, während der eigene Lauf sauber grün bleibt. Die Sperre
  hängt am **Profil**, nicht am Rechner (gemessen 2026-09-02): eigenes `--user-data-dir`,
  eigener Debug-Port. Das Rezept in `scripts/shots.ts` nennt die vier Schritte im Kopf.
- **Den CDP-Lock nehmen** (`~/.claude/hooks/obsidian-cdp-lock.py acquire --exclusive focus`).
  Er sieht den Port nicht, sondern den Kommandotext — ohne Halter blockt er genauso wie bei
  fremdem Halter, die Zweitinstanz entbindet also nicht davon.
- Den Aufnahme-Vault (`npm run shots -- --setup` legt ihn an) **in der Zweitinstanz öffnen**
  und ihm vertrauen. ⚠️ **Nicht über einen `obsidian://`-Link** — der geht an die *reguläre*
  Instanz, die den Protokoll-Handler hält. Ein frisches Profil erfährt seinen Vault über die
  **eigene `obsidian.json`** (`{"vaults":{"<id>":{"path":"…","ts":…,"open":true}}}`), und die
  liest Obsidian **nur beim Start**: erst schreiben, dann starten. Das Rezept in
  `scripts/shots.ts` zeigt den Dreizeiler.
- **Den eigenen Build im Aufnahme-Vault** (`npm run deploy` mit `OBSIDIAN_PLUGIN_DIR` auf
  dessen Plugin-Ordner). `npm run shots` baut und deployt nicht selbst: es fotografiert, was
  installiert ist, nicht was im Arbeitsbaum liegt — und meldet dabei Erfolg.
- Die Aufnahmesprache ist **app-weit** (`localStorage["language"]`): der Treiber stellt sie
  auf Englisch und **danach auf den Vorwert zurück** — sonst startet der Arbeits-Vault des
  Maintainers in der Aufnahmesprache.
