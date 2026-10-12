# GUI-Smoke — Checkliste

Was gegen einen Mock geprüft ist, ist spezifiziert, nicht getestet (CORE-TEST-02). Diese Liste läuft gegen ein **laufendes** Obsidian mit einem getrackten Fixture-Vault.

⚠️ **Der Smoke läuft auf einer Zweitinstanz mit eigenem Profil und eigenem Port, nie auf der regulären Instanz.** Ein `quit` dort trifft die Sitzung einer fremden Session; die Sperre hängt am `--user-data-dir`, nicht am Rechner. `--port` ist Pflicht, es gibt keinen Standardport. Das vollständige Rezept steht im Kopf von `scripts/gui-smoke.ts`; in Kürze:

```bash
npm run build
npm run smoke:gui -- --setup                      # Staging-Vault aus docs/images/fixture bauen, Plugin deployen
UD=/tmp/obs-test-finance-ledger; mkdir -p "$UD"
cp ~/Library/Application\ Support/obsidian/obsidian-*.asar "$UD"/
# $UD/obsidian.json mit dem Vault und "language":"en" schreiben, dann starten:
/Applications/Obsidian.app/Contents/MacOS/Obsidian --user-data-dir="$UD" --remote-debugging-port=<port> &
python3 ~/.claude/hooks/obsidian-cdp-lock.py acquire --label finance-ledger --intent "GUI-Smoke" --exclusive focus --port <port> --ttl 300
npm run smoke:gui -- --port <port>
python3 ~/.claude/hooks/obsidian-cdp-lock.py release
```

Vertrauensdialog und Restricted Mode hebt der Treiber selbst auf (`bereiteInstanzVor`), den Finanzordner stellt er ein, falls `--setup` die Einstellungen gelöscht hat. Je Messlauf ein frischer Prozess; der erste Lauf nach der Profilanlage ist ein Aufwärmlauf.

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
| 10 | Eine Vertrags-Notiz hat Stichprobe und Vertragsdaten (das Diagramm braucht zwei Monate, das Fixture hat einen) | Rendering-nahe Struktur |
| 11 | **Zweiter Lauf erzeugt byte-gleiche Dateien** | Idempotenz ist die Kernzusage von E3 — und der Grund, warum dieser Smoke schreiben darf |
| 12 | Das Import-Modal liest die Konten aus `konten.yaml` — Gegenprobe: ohne die Datei zeigt es den Ladefehler | Die Konten-Quelle ist ein Vault-Lesevorgang im echten Modal |
| 13 | Die CSV-Vorschau zählt neu und Duplikate — Gegenprobe: dieselbe CSV unter anderem Namen ist komplett Duplikat | Datei-Feld, `DataTransfer` und Vergleich gegen den Umsatzordner |
| 14 | Ein Regel-Schreibvorgang legt einen Schnappschuss mit dem Stand **vorher** an und rotiert den Bestand; Dateien mit fremdem Namen bleiben liegen | echter Mausklick im Regel-Modal, GFS-Aufbewahrung über die Vault-API |

## Was er bewusst nicht prüft

- Ob die Zahlen *fachlich* richtig sind — das kann nur der Abgleich mit dem Online-Banking.
- Das Mermaid-Diagramm der Vertrags-Notiz („Betrags-Verlauf“): es entsteht erst ab Buchungen aus zwei Monaten, das Fixture hat nur August. Die Notiz selbst (Stichprobe, Vertragsdaten) wird geprüft.
