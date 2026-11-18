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
| `triage.png` | feature | `README.md`, `README.de.md` | Reiter **Triage** mit den vier `:tbc:`-Buchungen des Fixtures, der Aktion, die daraus eine Regel macht, und der Summenzeile darunter (das Fenster bleibt bis zur Aufnahme klein, sonst rutscht die Summenzeile aus der Box). Das ist der Arbeitsablauf, den das Plugin eigentlich verkauft |
| `settings.png` | feature | `README.md`, `README.de.md` | Der Einstellungen-Tab, beginnend mit **Amount display**: die Live-Vorschau (Einnahme grün, Ausgabe rot), das Auswahlfeld für die Vorzeichen-Konvention und die drei Farbschema-Kacheln mit der aktiven sichtbar markiert. Das ist der visuell aussagekräftigste Teil der Einstellungen; darunter reicht das Bild bis zum vollständig sichtbaren Pfad-Feld. **Klasse `feature`, nicht `detail`** — gemessen ist das Bild quadratisch (Verhältnis 0,98), nicht hoch |

## Was die Bilder NICHT zeigen dürfen

- **Keine echten Daten.** Alles kommt aus `fixture/` — erfundene Firmen (*Acme Power*,
  *Northwind Grocers*, *Globex*), erfundene IBANs, *Jane Doe* als Inhaberin.
- **Kein zweites Plugin.** Die Fixture-Vault-Konfiguration aktiviert nur `finance-ledger`;
  sonst malen fremde Ribbon-Icons in jedes Bild.
- **Keine deutsche Oberfläche.** Die Plugin-UI folgt Obsidians Spracheinstellung; für die
  Aufnahme steht sie auf Englisch, weil `README.md` die kanonische Fassung ist.

## Kontonamen im Fixture

Das Fixture trägt **englische Wurzeln** (`Assets:`, `Liabilities:`, `Income:`, `Expenses:`, `Equity:`), damit die englischen Bilder keine deutschen Kontonamen zeigen. Der Kontotyp kommt aus dem Kontenplan: `make-ledger.mjs` schreibt wie der Importer die `type:`-Tags in die `accounts.ledger`, und `konten.yaml` setzt `kontowurzeln`, damit der Import des GUI-Smokes dieselben Wurzeln anlegt.

Bis 2026-11-18 standen hier deutsche Wurzeln (`Ausgaben:Groceries:Northwind`), weil das Plugin den Typ am Namen erkannte; das war ein offener Befund und ist erledigt. Wer die Wurzeln im Fixture wieder ändert, ändert `kontowurzeln` in `konten.yaml`, die Tags im Generator und die Wurzeln in `scripts/gui-smoke.ts` (`FIXTURE_WURZELN`) zusammen.

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
