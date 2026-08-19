# GUI-Smoke — Checkliste

Was gegen einen Mock geprüft ist, ist spezifiziert, nicht getestet (CORE-TEST-02). Diese
Liste läuft gegen ein **laufendes** Obsidian mit echten Daten.

```bash
osascript -e 'quit app "Obsidian"'
open -a Obsidian --args --remote-debugging-port=9222
OBSIDIAN_PLUGIN_DIR="<vault>/.obsidian/plugins/finance-ledger" npm run deploy
npm run smoke:gui -- --vault <VaultName>
```

## Was der Treiber prüft

Der Schwerpunkt liegt auf der **Eigentumsgrenze** aus E3: der Importer darf seine eigenen
Felder überschreiben und muss alles andere in Ruhe lassen. Das ist mit Unit-Tests nur
gegen erfundene Notizen prüfbar — hier läuft es gegen echte, über Monate von Hand
gepflegte.

| # | Prüfpunkt | Warum er nicht in die vitest-Suite gehört |
|---|---|---|
| 1 | Plugin ist geladen, Befehl ist registriert | Registrierung passiert im echten `onload` |
| 2 | Import läuft durch und meldet Buchungs- **und** Notizenzahl | Meldung entsteht erst im echten Notice-DOM |
| 3 | `journal.ledger` ist danach da und nicht leer | echter Vault-Schreibpfad |
| 4 | `saldo_eur` aller Konten stimmt vorher/nachher überein | echte CSVs, echte Konten-Konfiguration |
| 5 | `anfangssaldo_eur` unverändert — **samt deutscher Komma-Schreibweise** | Obsidians Eigenschaften-Editor erzeugt sie; ein Round-Trip würde sie normalisieren |
| 6 | `created` unverändert | Sperrliste im Frontmatter-Patch |
| 7 | Der Abschnitt „📌 Notizen" überlebt zeichengenau | die Marker-Grenze am echten, gewachsenen Notiz-Text |
| 8 | Fremde Frontmatter-Felder überleben | ebenso |
| 9 | `opening_balances.ledger` trägt Eröffnungsbuchungen, keine „fehlt"-Zeilen | beweist, dass die Komma-Schreibweise gelesen wurde |
| 10 | Eine Vertrags-Notiz hat Marker, Stichprobe und Diagramm | Rendering-nahe Struktur |
| 11 | **Zweiter Lauf erzeugt byte-gleiche Dateien** | Idempotenz ist die Kernzusage von E3 — und der Grund, warum dieser Smoke im echten Vault laufen darf |

## Was er bewusst nicht prüft

- Ob die Zahlen *fachlich* richtig sind — das kann nur der Abgleich mit dem Online-Banking.
- Ob das Mermaid-Diagramm hübsch aussieht. Geprüft wird, dass es da ist.
- Den Python-Weg (Import-Knopf mit Subprozess). Der ist nicht Gegenstand des Ports.

## Warum dieser Smoke in den produktiven Vault schreiben darf

Prüfpunkt 11 ist die Begründung: der Import ist idempotent. Der erste Lauf bringt den
Vault auf den Stand, den er ohnehin haben soll; jeder weitere lässt ihn byte-gleich. Ein
Werkzeug, das seinen eigenen Vorzustand wiederherstellen müsste, könnte genau diese
Zusage nicht prüfen.

Trotzdem legt der Treiber vor dem Lauf eine **Rettungskopie** der betroffenen Ordner an
und nennt ihren Pfad im Protokoll — das `finally` läuft bei Ctrl-C nicht mehr.

## Durchläufe

| Datum | Obsidian | Ergebnis | Gegenprobe |
|---|---|---|---|
| 2026-08-17 | 1.13.7 | **21/21 grün** — 1576 Buchungen, 26 Notizen nachgezogen | **15/20 rot** an den erwarteten Punkten |

### Was die Gegenprobe zutage förderte

Ausgebauter Fix: `planKontoNotes` regeneriert die Notiz, statt sie zu patchen — also genau
der Python-Fehler, den die Port-Roadmap als „Verbesserung, die das Remake mitnehmen sollte"
führt. Erwartet rot waren die Grenz-Punkte; eingetreten sind sie mit einer Kausalkette, die
man beim Entwerfen nicht auf dem Zettel hat:

- `anfangssaldo_eur` fiel auf `null` — und **dadurch** meldete `opening_balances.ledger`
  vier „fehlt"-Zeilen statt vier Eröffnungsbuchungen. Ein Frontmatter-Verlust schlägt bis
  in eine ganz andere Datei durch.
- `created` sprang auf heute (Sperrliste umgangen).
- Fremde Frontmatter-Felder verschwanden.

**Zwei Mängel im Treiber selbst — der eigentliche Ertrag des Schritts:**

1. Der Punkt „eigener Abschnitt überlebt" blieb **fälschlich grün**. Alle vier Notizen
   trugen den unveränderten Vorgabetext, und der wird bei Regeneration identisch neu
   erzeugt — der Prüfpunkt verglich Gleiches mit Gleichem (Falle „Prüfpunkt ohne
   Gegenstand"). Der Treiber schreibt jetzt vor dem Lauf selbst eine Spur in den Abschnitt
   und nimmt sie im `finally` wieder heraus.
2. Die Abweichung der fremden Felder wurde als `[object Object] → [object Object]`
   gemeldet — eine Meldung, die einen Defekt bestätigt und nichts über ihn sagt. Sie
   benennt jetzt die verlorenen Schlüssel.

### Bewusste Abweichung vom Skill-Rezept

Der Treiber ruft **kein** `requireVisible`. Dieser Smoke misst keine Pixel, sondern
Dateiinhalte und Meldungstexte; beides läuft auch im gedrosselten Hintergrund. Ein harter
Abbruch bei `hidden` würde den Lauf davon abhängig machen, ob gerade jemand am Rechner
sitzt. Der Zustand wird gemeldet, damit er bei einer Zeitüberschreitung die erste Spur ist.
