/**
 * GUI-Smoke-Treiber — fährt die Checkliste aus `docs/SMOKE.md` gegen ein **laufendes**
 * Obsidian statt von Hand (CORE-TEST-02 b).
 *
 * Warum getrackt: Die Zusage von E3 ist eine Grenze — der Importer darf seine eigenen
 * Frontmatter-Felder überschreiben und muss alles andere unberührt lassen. Gegen erfundene
 * Notizen ist das trivial grün; interessant wird es an Notizen mit deutscher Komma-Schreibweise,
 * eigenen Feldern und einem gewachsenen „📌 Notizen"-Abschnitt (das getrackte Fixture trägt
 * sie). Der Treiber misst deshalb **Vorher gegen Nachher am selben Vault** statt gegen
 * eingetragene Sollwerte: so muss niemand diese Datei nachziehen, wenn sich die Daten ändern.
 *
 * Dazu die drei Pfade, die seit 0.3.0 ohne Node-API laufen (Konten-Quelle im Import-Modal,
 * CSV-Vorschau, Schnappschuss mit Rotation vor einem Regel-Schreibvorgang). Sie waren bis dahin
 * nur einmal von Hand belegt; jeder dieser Prüfpunkte hat eine Gegenprobe, die ihn rot macht,
 * wenn der Pfad bricht.
 *
 * Bilanz in vier Zuständen (CORE-TEST-19): grün · rot · übersprungen · nichts gemessen. Nenner ist
 * `PUNKTE`; ein Punkt, der nie aufgezeichnet wurde, zählt als „nichts gemessen". Exit 0 grün,
 * 1 rot oder nichts gemessen, 2 Abbruch.
 *
 * ## Lauf (Zweitinstanz, eigenes Profil, eigener Port; die reguläre Instanz wird nie angefasst)
 *
 * ```bash
 * echo "$STAGING_VAULTS_DIR"                       # muss gesetzt sein (~/.zshenv)
 * npm run build
 * npm run smoke:gui -- --setup                      # Vault aus docs/images/fixture bauen + Plugin deployen
 * UD=/tmp/obs-test-finance-ledger; mkdir -p "$UD"   # Profil je Repo; lebt dort eine fremde Instanz: $UD-w19
 * cp ~/Library/Application\ Support/obsidian/obsidian-*.asar "$UD"/   # aktuelle Version, sonst 1.12.4
 * # $UD/obsidian.json: {"vaults":{"<id>":{"path":"<STAGING_VAULTS_DIR>/finance-ledger","ts":0,"open":true}},"language":"en"}
 * lsof -nP -iTCP:<port> -sTCP:LISTEN                # Port frei?
 * /Applications/Obsidian.app/Contents/MacOS/Obsidian --user-data-dir="$UD" --remote-debugging-port=<port> &
 * python3 ~/.claude/hooks/obsidian-cdp-lock.py acquire --label finance-ledger --intent "GUI-Smoke :<port>" --exclusive focus --port <port> --ttl 300
 * npm run smoke:gui -- --port <port>
 * python3 ~/.claude/hooks/obsidian-cdp-lock.py release
 * ```
 *
 * Der erste Lauf nach der Profilanlage ist ein Aufwärmlauf und zählt nicht; je Messlauf ein
 * frischer Prozess. Den Vertrauensdialog und den Restricted Mode erledigt `bereiteInstanzVor`.
 * Der Treiber setzt den Finanzordner selbst, falls `--setup` (das `data.json` löscht) davor lief.
 * Beendet wird nur der eigene Prozess über seine PID. `--port` ist Pflicht (kein Standardport:
 * 9222 gehört der regulären Instanz).
 *
 * ## Fenster-Sichtbarkeit
 *
 * Bis 2026-10-12 stand hier „bewusst kein `requireVisible`": der Smoke las nur Dateien und
 * Meldungstexte, und ein harter Abbruch bei `hidden` hätte den Lauf davon abhängig gemacht, ob
 * jemand am Rechner sitzt. Das trug, solange es keine Maus gab. Die Prüfpunkte für das Import-Modal
 * und das Regel-Modal brauchen einen echten Mausklick (`clickReal`; ein `.click()` auf den
 * „Klassifizieren“-Knopf öffnet nichts), und der setzt ein sichtbares Fenster voraus. Seit Welle 4b
 * ist `requireVisible` auf den Space-Fall verengt und kämpft nicht mehr um den Vordergrund; es
 * läuft deshalb jetzt als erste Anweisung nach dem Verbinden.
 *
 * Der Import der Brücke geht zwei Ebenen hoch wie in den anderen Plugins.
 */

import { execFileSync } from "node:child_process";
import { join } from "node:path";
import { cwd } from "node:process";

import { Vorbedingung, createBilanz, parseArgs, runDriver } from "../../tools/obsidian-cdp/bilanz.js";
import {
  attachTo,
  beimAbbruch,
  bereiteInstanzVor,
  clearNotices,
  clickReal,
  istAbgebrochen,
  notices,
  pollUntil,
  requireVisible,
  type Cdp,
} from "../../tools/obsidian-cdp/cdp.js";
import { buildVault, requireEigenerBuild, stagingVaultDir } from "../../tools/obsidian-cdp/vault.js";

const REPO_NAME = "finance-ledger";
const PLUGIN_ID = "finance-ledger";
const COMMAND_ID = `${PLUGIN_ID}:finance-rebuild-journal`;
const IMPORT_COMMAND_ID = `${PLUGIN_ID}:finance-import-csv`;
const TBC_COMMAND_ID = `${PLUGIN_ID}:open-tbc-triage`;
/** Finanzordner des getrackten Fixtures (`docs/images/fixture/notes/Finance`). */
const FINANZORDNER = "Finance";
/** Konto-`id` aus `konten.yaml` des Fixtures, zu dem die CSV `…ME00000001…` gehört. */
const KONTO_ID = "checking";
/** Zeile, die der Treiber in einen Nutzer-Abschnitt schreibt, um ihn prüfbar zu machen.
 *  Sie geht im `finally` wieder heraus. */
const SPUR = "<!-- gui-smoke: diese Zeile muss den Import überleben -->";
/** Konto der Regel, die der Schnappschuss-Punkt anlegt — daran erkennt das Aufräumen Reste. */
const SMOKE_KONTO = "Ausgaben:GuiSmoke:Test";
const KONTEN_NAME = "konten.yaml";
const KONTEN_WEG = "konten.yaml.gui-smoke";
/** Ordner und Notiz-Art der Berichte (E5). Der Treiber leert sie vor dem Lauf, damit „entstehen“ nichts Altes liest. */
const BERICHT_ORDNER = [
  { ordner: "40-Monatsberichte", art: "monatsbericht" },
  { ordner: "70-Quartalsberichte", art: "quartalsbericht" },
  { ordner: "80-Jahresberichte", art: "jahresbericht" },
] as const;

/** Alle Prüfpunkte (Nenner der Bilanz). Zweig-Alternativen tragen einen Namen, nie zwei. */
const PUNKTE = [
  "Plugin ist geladen",
  "Befehl ist registriert",
  "Konto-Notizen gefunden",
  "Keine liegen gebliebene Pruef-Spur aus einem abgebrochenen frueheren Lauf",
  "Vorzustand aufgenommen",
  "Prüf-Spur im eigenen Abschnitt gesetzt",
  "Import lief ohne Fehlermeldung",
  "Meldung nennt eine Buchungszahl",
  "Meldung nennt nachgezogene Notizen",
  "anfangssaldo_eur unverändert — samt Komma-Schreibweise",
  "created unverändert (Sperrliste)",
  "Eigener Abschnitt überlebt zeichengenau (samt gesetzter Spur)",
  "Fremde Frontmatter-Felder überleben",
  "Alle Konto-Notizen tragen den Marker-Block",
  "journal.ledger ist da und nicht leer",
  "opening_balances.ledger trägt Eröffnungsbuchungen",
  "…und keine „fehlt\"-Zeilen (Komma-Schreibweise gelesen)",
  "Vertrags-Notiz hat Stichprobe und Vertragsdaten",
  "…mit escaptem Alias-Trenner in der Tabelle",
  "Berichte entstehen im Import: ein Monat, Quartal und Jahr je Periode mit Buchungen",
  "Zweiter Lauf lässt Konto-Notizen byte-gleich",
  "…und die Eröffnungsbilanz ebenso",
  "…und die Berichte ebenso",
  "Import-Modal liest die Konten aus konten.yaml",
  "CSV-Vorschau zählt neu und Duplikate",
  "Regel-Schreibvorgang legt Schnappschuss mit Vorzustand an und rotiert",
  "Kategorien — Zeitrahmen schränkt ein und reist in den Ledger-Filter",
  "Neuaufbau fragt vorher; „Abbrechen“ schreibt nichts",
] as const;

const bilanz = createBilanz({ punkte: PUNKTE });
const { record, unmeasured } = bilanz;

/**
 * Momentaufnahme einer Konto-Notiz: genau die Teile, die der Import NICHT anfassen darf.
 *
 * `saldo_eur` gehört bewusst NICHT hierher: es ist das eine importer-verwaltete Feld
 * (`kontoNotes.ts` schreibt es bei jedem Lauf aus den Buchungen neu), kein
 * Nutzer-Besitz. Vorher/Nachher dieses EINEN Laufs zu vergleichen hätte bei
 * funktionierenden CSVs immer rot gemeldet — ein Fixture, das den CSV-Import
 * überhaupt erst prüfbar machte, deckte genau das auf (2026-09-16). Seine
 * Stabilität über zwei IDENTISCHE Läufe prüft stattdessen der Byte-Vergleich im
 * Idempotenz-Abschnitt unten mit.
 */
interface NoteSnapshot {
  path: string;
  anfangssaldo: string | null;
  created: string | null;
  /** Alles ab „## 📌 Notizen" — der Bereich, der dem Nutzer gehört. */
  userSection: string | null;
  /** Frontmatter-Schlüssel, die weder Importer- noch Standardfelder sind. */
  fremdeFelder: Record<string, string>;
  full: string;
}

const FM_FIELD = (text: string, key: string): string | null => {
  const match = new RegExp(`^${key}:[ \\t]*(.*)$`, "m").exec(text);
  return match?.[1]?.trim() ?? null;
};

/** Der Teil unterhalb des END-Markers; `null`, wenn es keinen gibt. */
function userSectionOf(text: string): string | null {
  const cut = text.indexOf("<!-- END: AUTO-GENERATED -->");
  return cut === -1 ? null : text.slice(cut);
}

/** Frontmatter-Felder, die der Importer nicht kennt — die müssen alle überleben. */
function fremdeFelderOf(text: string): Record<string, string> {
  const bekannt = new Set([
    "saldo_eur", "saldo_stand_am", "updated", "anfangssaldo_eur",
    "anfangssaldo_stand_am", "created",
  ]);
  const block = /^---\r?\n([\s\S]*?)\r?\n---/.exec(text)?.[1] ?? "";
  const out: Record<string, string> = {};
  for (const line of block.split("\n")) {
    const kv = /^([A-Za-z0-9_][\w .-]*?):[ \t](.+)$/.exec(line);
    if (kv?.[1] && kv[2] && !bekannt.has(kv[1])) out[kv[1]] = kv[2];
  }
  return out;
}

async function readNote(cdp: Cdp, path: string): Promise<string | null> {
  return cdp.evaluate<string | null>(`
    const file = app.vault.getAbstractFileByPath(${JSON.stringify(path)});
    if (!file) return null;
    return await app.vault.read(file);
  `);
}

async function snapshot(cdp: Cdp, path: string): Promise<NoteSnapshot | null> {
  const full = await readNote(cdp, path);
  if (full === null) return null;
  return {
    path,
    anfangssaldo: FM_FIELD(full, "anfangssaldo_eur"),
    created: FM_FIELD(full, "created"),
    userSection: userSectionOf(full),
    fremdeFelder: fremdeFelderOf(full),
    full,
  };
}

/**
 * Vault-relativer Pfad des Finanzordners, aus den Plugin-Einstellungen.
 *
 * Das Feld heißt im Plugin `pluginData`; `settings` ist der verbreitetere Name und bleibt
 * als zweiter Versuch stehen. Ein Treiber, der nur einen Namen kennt, meldet bei einer
 * Umbenennung „nicht konfiguriert" statt „Feld heißt jetzt anders" — und schickt die
 * Suche in die Einstellungen statt in den Quelltext.
 *
 * Ist keiner gesetzt (frisch gebauter Vault: `buildVault` löscht `data.json` für den
 * Auslieferungszustand), stellt der Treiber den Ordner des Fixtures ein und lädt das Plugin
 * neu — ein gesetzter Wert ist kein hergestellter Zustand.
 */
async function financeRoot(cdp: Cdp): Promise<string> {
  const lesen = (): Promise<string> =>
    cdp.evaluate<string>(`
      const plugin = app.plugins.plugins[${JSON.stringify(PLUGIN_ID)}];
      return plugin?.pluginData?.financeRoot ?? plugin?.settings?.financeRoot ?? "";
    `);
  let root = await lesen();
  if (!root) {
    await cdp.evaluate(`
      const plugin = app.plugins.plugins[${JSON.stringify(PLUGIN_ID)}];
      const alt = (await plugin.loadData()) ?? {};
      await plugin.saveData({ ...alt, financeRoot: ${JSON.stringify(FINANZORDNER)} });
      await app.plugins.disablePlugin(${JSON.stringify(PLUGIN_ID)});
      await app.plugins.enablePlugin(${JSON.stringify(PLUGIN_ID)});
      return true;
    `);
    root = (await pollUntil<string>(cdp, `
      const plugin = app.plugins.plugins[${JSON.stringify(PLUGIN_ID)}];
      return plugin?.pluginData?.financeRoot || null;
    `, 15_000)) ?? "";
  }
  if (!root) {
    const felder = await cdp.evaluate<string>(`
      const plugin = app.plugins.plugins[${JSON.stringify(PLUGIN_ID)}];
      return Object.keys(plugin ?? {}).join(", ");
    `);
    throw new Error(`Kein financeRoot gefunden. Felder der Plugin-Instanz: ${felder}`);
  }
  return root;
}

/** Rettungskopie neben den Vault legen. Das `finally` läuft bei Ctrl-C nicht mehr. */
function backup(vaultBase: string, root: string): string {
  const stamp = execFileSync("date", ["+%Y%m%d-%H%M%S"]).toString().trim();
  const ziel = `${vaultBase}/${root}/.smoke-backup-${stamp}`;
  execFileSync("mkdir", ["-p", ziel]);
  for (const ordner of ["10-Konten", "20-Verträge", "Ledger"]) {
    try {
      execFileSync("cp", ["-R", `${vaultBase}/${root}/${ordner}`, ziel], { stdio: "ignore" });
    } catch {
      // Ordner fehlt — kein Grund, den Lauf abzubrechen.
    }
  }
  return ziel;
}

/**
 * Den Import über die Befehlspalette auslösen und auf die Meldung warten.
 *
 * Die alten Meldungen werden vorher entfernt: sonst liest der zweite Lauf die Meldung des
 * ersten und der Idempotenz-Punkt wäre grün, ohne je gemessen zu haben.
 */
/** Klickt in der Rückfrage (Kit-Baustein confirm) auf „Bestätigen“ (rechts) oder „Abbrechen“ (links). */
async function antworteRueckfrage(cdp: Cdp, bestaetigen: boolean): Promise<boolean> {
  const da = await pollUntil<boolean>(cdp, `return document.querySelector(".modal-container .modal-button-container button") ? true : null;`, 10_000, 200);
  if (!da) return false;
  await cdp.evaluate(`
    const knoepfe = document.querySelectorAll(".modal-container .modal-button-container button");
    knoepfe[${bestaetigen ? "knoepfe.length - 1" : "0"}].click();
    return true;
  `);
  return true;
}

async function runImport(cdp: Cdp): Promise<string> {
  await clearNotices(cdp);
  await cdp.evaluate(`
    app.commands.executeCommandById(${JSON.stringify(COMMAND_ID)});
    return true;
  `);
  // Seit Welle 22 fragt der Neuaufbau vorher (Überschreiben ohne Rückfrage war der Inventur-Befund).
  if (!(await antworteRueckfrage(cdp, true))) throw new Error("Die Rückfrage vor dem Neuaufbau erschien nicht.");
  const meldung = await pollUntil<string>(
    cdp,
    `
      const text = [...document.querySelectorAll(".notice")]
        .map((n) => n.textContent.trim())
        .join(" | ");
      return /Buchungen|transactions|fehlgeschlagen|failed|CSVs/i.test(text) ? text : null;
    `,
    120_000,
  );
  if (meldung === null) {
    throw new Error("Import meldete sich binnen 120 s nicht — lief er überhaupt?");
  }
  return meldung;
}

// ---------------------------------------------------------------------------------------------
// Aufräumen: Zustand, den der Treiber anlegt, geht VOR dem Lauf zurück (ein `finally` erreicht
// einen Abbruch nicht — Dach-Befund 2026-10-01).
// ---------------------------------------------------------------------------------------------

/** Alle Dateien eines Vault-Ordners (nicht rekursiv) per Adapter, damit auch Punktordner sichtbar sind. */
async function listeDateien(cdp: Cdp, ordner: string): Promise<string[]> {
  return cdp.evaluate<string[]>(`
    const dir = ${JSON.stringify(ordner)};
    if (!(await app.vault.adapter.exists(dir))) return [];
    return (await app.vault.adapter.list(dir)).files.sort();
  `);
}

/** Regel-Notizen mit dem Smoke-Konto — Reste eines abgebrochenen Laufs oder der eigenen Anlage. */
async function smokeRegeln(cdp: Cdp, root: string): Promise<string[]> {
  const dateien = await listeDateien(cdp, `${root}/55-Categorizer-Rules`);
  const treffer: string[] = [];
  for (const pfad of dateien) {
    const text = await cdp.evaluate<string>(
      `return await app.vault.adapter.read(${JSON.stringify(pfad)});`,
    );
    if (text.includes(SMOKE_KONTO)) treffer.push(pfad);
  }
  return treffer;
}

async function raeumeSchnappschuesse(cdp: Cdp, root: string): Promise<void> {
  await cdp.evaluate(`
    const dir = ${JSON.stringify(`${root}/.fl-snapshots`)};
    if (await app.vault.adapter.exists(dir)) {
      for (const f of (await app.vault.adapter.list(dir)).files) await app.vault.adapter.remove(f);
    }
    return true;
  `);
}

/** `konten.yaml` zurückstellen, falls die Gegenprobe des Modal-Punkts abgebrochen wurde. */
async function stelleKontenWiederHer(cdp: Cdp, root: string): Promise<void> {
  await cdp.evaluate(`
    const a = app.vault.adapter;
    const weg = ${JSON.stringify(`${root}/${KONTEN_WEG}`)};
    const da = ${JSON.stringify(`${root}/${KONTEN_NAME}`)};
    if ((await a.exists(weg)) && !(await a.exists(da))) await a.rename(weg, da);
    return true;
  `);
}

async function schliesseModale(cdp: Cdp): Promise<void> {
  await cdp.evaluate(`
    for (const b of document.querySelectorAll(".modal-container .modal-header-button, .modal-container .modal-close-button")) b.click();
    return true;
  `);
  const zu = await pollUntil(cdp, `return document.querySelector(".modal-container") ? null : true;`, 5000, 200);
  // Ein Modal, das sich nicht schließen lässt, würde jeden folgenden Prüfpunkt auf seinen Inhalt
  // lesen lassen — also lieber laut abbrechen als aus dem falschen Modal messen.
  if (!zu) throw new Error("Ein Modal ließ sich nicht schließen (.modal-header-button).");
}

/** Berichte, die der Import angelegt hat, entfernen — sie sind erzeugt, nie Nutzer-Besitz dieses Vaults. */
async function raeumeBerichte(cdp: Cdp, root: string): Promise<number> {
  let n = 0;
  for (const { ordner } of BERICHT_ORDNER) {
    for (const pfad of (await listeDateien(cdp, `${root}/${ordner}`)).filter((f) => f.endsWith(".md"))) {
      await cdp.evaluate(`await app.vault.adapter.remove(${JSON.stringify(pfad)}); return true;`);
      n++;
    }
  }
  return n;
}

/** Alle Berichte samt Text, nach Pfad. */
async function leseBerichte(cdp: Cdp, root: string): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  for (const { ordner } of BERICHT_ORDNER) {
    for (const pfad of (await listeDateien(cdp, `${root}/${ordner}`)).filter((f) => f.endsWith(".md"))) {
      out.set(pfad, (await cdp.evaluate<string>(`return await app.vault.adapter.read(${JSON.stringify(pfad)});`)));
    }
  }
  return out;
}

async function raeumeAuf(cdp: Cdp, root: string): Promise<string[]> {
  const log: string[] = [];
  await schliesseModale(cdp);
  await stelleKontenWiederHer(cdp, root);
  const berichte = await raeumeBerichte(cdp, root);
  if (berichte > 0) log.push(`${berichte} Bericht(e) entfernt`);
  const regeln = await smokeRegeln(cdp, root);
  for (const pfad of regeln) {
    await cdp.evaluate(`await app.vault.adapter.remove(${JSON.stringify(pfad)}); return true;`);
    log.push(`Smoke-Regel entfernt: ${pfad}`);
  }
  const snaps = await listeDateien(cdp, `${root}/.fl-snapshots`);
  if (snaps.length > 0) log.push(`${snaps.length} Schnappschuss-Datei(en) entfernt`);
  await raeumeSchnappschuesse(cdp, root);
  return log;
}

// ---------------------------------------------------------------------------------------------
// Prüfpunkte der drei node-freien Pfade
// ---------------------------------------------------------------------------------------------

/** Öffnet das Import-Modal und meldet, was es zeigt: Formular, Fehlertext oder (nach Frist) nichts. */
async function oeffneImportModal(cdp: Cdp): Promise<"formular" | "fehler" | null> {
  await schliesseModale(cdp);
  await cdp.evaluate(`app.commands.executeCommandById(${JSON.stringify(IMPORT_COMMAND_ID)}); return true;`);
  return pollUntil<"formular" | "fehler">(
    cdp,
    `
      const m = document.querySelector(".finance-import-csv-modal");
      if (!m) return null;
      if (m.querySelector("input[type=file]")) return "formular";
      if (m.querySelector(".fl-error")) return "fehler";
      return null;
    `,
    15_000,
    300,
  );
}

/** Legt eine CSV (Inhalt, Name) ins Datei-Feld des offenen Modals, wählt das Konto und fährt die Vorschau. */
async function vorschau(cdp: Cdp, name: string, text: string): Promise<{ neu: number; dup: number } | null> {
  await cdp.evaluate(`
    const m = document.querySelector(".finance-import-csv-modal");
    const input = m.querySelector("input[type=file]");
    const dt = new DataTransfer();
    dt.items.add(new File([${JSON.stringify(text)}], ${JSON.stringify(name)}, { type: "text/csv" }));
    input.files = dt.files;
    input.dispatchEvent(new Event("change", { bubbles: true }));
    return true;
  `);
  const dropdown = await pollUntil<boolean>(
    cdp,
    `return document.querySelector(".finance-import-csv-files select") ? true : null;`,
    5000,
    200,
  );
  if (!dropdown) return null;
  await cdp.evaluate(`
    const sel = document.querySelector(".finance-import-csv-files select");
    sel.value = ${JSON.stringify(KONTO_ID)};
    sel.dispatchEvent(new Event("change", { bubbles: true }));
    return true;
  `);
  await clearNotices(cdp);
  const geklickt = await clickReal(
    cdp,
    `[...document.querySelectorAll(".finance-import-csv-modal button")].find((b) => /anti-dup|Anti-Duplikat/i.test(b.textContent))`,
  );
  if (!geklickt) return null;
  const zeile = await pollUntil<string>(
    cdp,
    `
      const t = document.querySelector(".finance-import-csv-preview")?.textContent ?? "";
      return /\\d+ (new|neu) \\/ \\d+ (dup|Duplikate)/.test(t) ? t : null;
    `,
    20_000,
    300,
  );
  if (zeile === null) return null;
  const m = /(\d+) (?:new|neu) \/ (\d+) (?:dup|Duplikate)/.exec(zeile);
  return m ? { neu: Number(m[1]), dup: Number(m[2]) } : null;
}

/**
 * Plugin aus- und einschalten. `state/konten.ts` hält die gelesene Konfiguration im Modulspeicher
 * („einmal gelesen und gemerkt"); erst `onload` verwirft sie. Wer `konten.yaml` ändert und das
 * Modal öffnet, ohne neu zu laden, liest den Speicher statt der Datei — und die Gegenprobe wäre
 * grün, ohne je gemessen zu haben.
 */
async function ladePluginNeu(cdp: Cdp): Promise<void> {
  await cdp.evaluate(`
    await app.plugins.disablePlugin(${JSON.stringify(PLUGIN_ID)});
    await app.plugins.enablePlugin(${JSON.stringify(PLUGIN_ID)});
    return true;
  `);
  const da = await pollUntil<boolean>(
    cdp,
    `return app.plugins.plugins[${JSON.stringify(PLUGIN_ID)}] && app.commands.commands[${JSON.stringify(IMPORT_COMMAND_ID)}] ? true : null;`,
    15_000,
    300,
  );
  if (!da) throw new Error("Plugin ließ sich nicht neu laden.");
}

async function pruefeKontenModal(cdp: Cdp, root: string): Promise<void> {
  await ladePluginNeu(cdp);
  const mitKonten = await oeffneImportModal(cdp);
  if (mitKonten === null) throw new Vorbedingung("Import-Modal öffnet sich nicht (Befehl finance-import-csv)");
  // Gegenprobe: ohne konten.yaml MUSS das Modal den Ladefehler zeigen — sonst läse es die Konten
  // nicht aus der Datei und der grüne Fall belegte nichts.
  await schliesseModale(cdp);
  await cdp.evaluate(`
    await app.vault.adapter.rename(${JSON.stringify(`${root}/${KONTEN_NAME}`)}, ${JSON.stringify(`${root}/${KONTEN_WEG}`)});
    return true;
  `);
  let ohneKonten: "formular" | "fehler" | null;
  try {
    await ladePluginNeu(cdp);
    ohneKonten = await oeffneImportModal(cdp);
  } finally {
    await schliesseModale(cdp);
    await stelleKontenWiederHer(cdp, root);
    await ladePluginNeu(cdp);
  }
  const ok = mitKonten === "formular" && ohneKonten === "fehler";
  record(
    "Import-Modal liest die Konten aus konten.yaml",
    ok,
    ok
      ? "mit Datei: Formular · ohne Datei: Ladefehler (Gegenprobe)"
      : `mit Datei: ${mitKonten} · ohne Datei: ${ohneKonten ?? "nichts"}`,
  );
}

async function pruefeVorschau(cdp: Cdp, root: string): Promise<void> {
  const csvName = "2026-08-31-ME00000001-camt52v8.CSV";
  const csv = await readNote(cdp, `${root}/Umsätze/${csvName}`);
  if (csv === null) throw new Vorbedingung(`Fixture-CSV fehlt: ${root}/Umsätze/${csvName}`);
  const zeilen = csv.split(/\r?\n/).filter((z) => z.trim() !== "").length - 1;
  if (zeilen < 2) throw new Vorbedingung("Fixture-CSV trägt weniger als zwei Buchungen");

  const modal = await oeffneImportModal(cdp);
  if (modal !== "formular") throw new Vorbedingung(`Import-Modal zeigt kein Formular (${modal ?? "nichts"})`);
  try {
    // Gleichnamige Datei: sie bleibt aus dem Vergleich, also alles neu, keine Duplikate.
    const gleich = await vorschau(cdp, csvName, csv);
    // Gegenprobe: derselbe Inhalt unter anderem Namen MUSS als Duplikat erkannt werden.
    const kopie = await vorschau(cdp, `Kopie-${csvName}`, csv);
    if (gleich === null || kopie === null) {
      throw new Vorbedingung("Vorschau lieferte keine Zahlen (Zeile fehlt im Modal)");
    }
    const ok = gleich.neu === zeilen && gleich.dup === 0 && kopie.neu === 0 && kopie.dup === zeilen;
    record(
      "CSV-Vorschau zählt neu und Duplikate",
      ok,
      `gleichnamig ${gleich.neu} neu / ${gleich.dup} Dup · Kopie ${kopie.neu} neu / ${kopie.dup} Dup · Soll ${zeilen} Buchungen`,
    );
  } finally {
    await schliesseModale(cdp);
  }
}

/**
 * Kategorien-Tab: der Zeitrahmen. Gemessen wird an den Beträgen im DOM, nicht am Vorhandensein der
 * Felder: (1) ein leerer Zeitrahmen zeigt keine Beträge mehr, (2) der Tag der ersten Buchung zeigt einen
 * kleineren oder gleich großen Betrag als „Gesamter Zeitraum“ und mindestens eine Zeile, (3) der Klick auf
 * eine Kategorie nimmt den Zeitrahmen in den Ledger-Filter mit.
 */
async function pruefeKategorien(cdp: Cdp, root: string): Promise<void> {
  const NAME = "Kategorien — Zeitrahmen schränkt ein und reist in den Ledger-Filter";
  const journal = await readNote(cdp, `${root}/Ledger/journal.ledger`);
  const ersterTag = journal === null ? null : /^(\d{4}-\d{2}-\d{2})/m.exec(journal)?.[1] ?? null;
  if (ersterTag === null) throw new Vorbedingung("Kein Datum im journal.ledger gefunden");

  await cdp.evaluate(`await app.commands.executeCommandById(${JSON.stringify(`${PLUGIN_ID}:open-category-overview`)}); return true;`);
  const da = await pollUntil<boolean>(cdp, `return !!document.querySelector(".fl-range-bar select") && document.querySelectorAll(".fl-table tbody tr").length > 0;`, 10_000);
  if (!da) throw new Vorbedingung("Kategorien-Tab mit Zeitrahmen-Leiste nicht erreicht");

  const messung = await cdp.evaluate<{ alle: number[]; leer: number; tag: number[]; zeilenTag: number; ledgerVon: string; ledgerBis: string } | null>(`
    // Der Hub hält alle Tabs gemountet: nur die Tabelle des Kategorien-Panels zählt (das Panel, das die Leiste trägt).
    const panel = document.querySelector(".fl-range-bar")?.closest(".fl-view");
    if (!panel) return null;
    // Die Buchungszahl der obersten Zeile (3. Spalte, ganze Zahl) statt des Betrags: Betragsformat und
    // Tausendertrennzeichen hängen an der Sprache, die Zahl der Buchungen nicht.
    const geld = () => {
      const erste = panel.querySelector(".fl-table tbody tr");
      const zelle = erste ? erste.querySelectorAll("td")[2] : null;
      return zelle ? [Number((zelle.textContent ?? "").replace(/\\D/g, "")) || 0] : [];
    };
    const warte = (ms) => new Promise((r) => setTimeout(r, ms));
    const von = panel.querySelector(".fl-range-bar input[type=date]");
    const bis = panel.querySelectorAll(".fl-range-bar input[type=date]")[1];
    if (!von || !bis) return null;
    const setze = async (v, b) => {
      for (const [el, x] of [[von, v], [bis, b]]) { el.value = x; el.dispatchEvent(new Event("input", { bubbles: true })); }
      await warte(300);
    };
    const alle = geld();
    await setze("2000-01-01", "2000-01-02");
    const leer = geld().length;
    await setze(${JSON.stringify(ersterTag)}, ${JSON.stringify(ersterTag)});
    const tag = geld();
    const zeilenTag = panel.querySelectorAll(".fl-table tbody tr").length;
    const link = panel.querySelector(".fl-table .fl-link-affordance");
    if (!link) return null;
    link.click();
    await warte(800);
    const felder = Array.from(document.querySelectorAll(".ledger-filter-bar input[type=date]"));
    return { alle, leer, tag, zeilenTag, ledgerVon: felder[0]?.value ?? "", ledgerBis: felder[1]?.value ?? "" };
  `);
  if (messung === null) throw new Vorbedingung("Zeitrahmen-Felder oder Kategoriezeile nicht im DOM");
  // Der Klick hat im localStorage des Profils einen Datumsfilter hinterlassen — zurücksetzen, sonst erbt ihn
  // der nächste Lauf (das Hero der README-Bilder zeigte danach eine leere Tabelle).
  await cdp.evaluate(`
    app.saveLocalStorage("finance:filterState", JSON.stringify({ dateFrom: "", dateTo: "", counterparty: "", account: "", tags: "" }));
    return true;
  `);
  const summe = (xs: number[]): number => xs.reduce((a, b) => a + b, 0);
  const ok =
    messung.leer === 0 &&
    messung.zeilenTag > 0 &&
    summe(messung.tag) > 0 &&
    summe(messung.tag) <= summe(messung.alle) &&
    messung.ledgerVon === ersterTag &&
    messung.ledgerBis === ersterTag;
  record(
    NAME,
    ok,
    `leer: ${messung.leer} Zeilen mit Zahl; Tag ${ersterTag}: ${messung.zeilenTag} Zeilen, ${summe(messung.tag)} von ${summe(messung.alle)} Buchungen in der obersten Zeile; Ledger-Filter ${messung.ledgerVon}…${messung.ledgerBis}`,
  );
}

/** Der Neuaufbau fragt, und „Abbrechen“ lässt Journal und Meldungen unberührt. */
async function pruefeRueckfrage(cdp: Cdp, root: string): Promise<void> {
  const journalVorher = await readNote(cdp, `${root}/Ledger/journal.ledger`);
  await clearNotices(cdp);
  await cdp.evaluate(`app.commands.executeCommandById(${JSON.stringify(COMMAND_ID)}); return true;`);
  const frage = await cdp.evaluate<{ da: boolean; titel: string }>(`
    await new Promise((r) => setTimeout(r, 800));
    const modal = document.querySelector(".modal-container");
    return { da: !!modal, titel: modal?.querySelector(".modal-title")?.textContent ?? "" };
  `);
  const geklickt = frage.da ? await antworteRueckfrage(cdp, false) : false;
  await cdp.evaluate(`await new Promise((r) => setTimeout(r, 1500)); return true;`);
  const danach = await cdp.evaluate<{ modal: boolean; meldungen: string }>(`
    return {
      modal: !!document.querySelector(".modal-container"),
      meldungen: [...document.querySelectorAll(".notice")].map((n) => n.textContent.trim()).join(" | "),
    };
  `);
  const journalNachher = await readNote(cdp, `${root}/Ledger/journal.ledger`);
  record(
    "Neuaufbau fragt vorher; „Abbrechen“ schreibt nichts",
    frage.da && geklickt && !danach.modal && !/Buchungen|transactions|Rebuilding|neu aufgebaut/i.test(danach.meldungen) && journalNachher === journalVorher,
    `Frage „${frage.titel}“, nach Abbrechen: Modal ${danach.modal ? "noch offen" : "zu"}, Meldungen „${danach.meldungen.slice(0, 80)}“, Journal ${journalNachher === journalVorher ? "byte-gleich" : "GEÄNDERT"}`,
  );
}

async function pruefeSchnappschuss(cdp: Cdp, root: string): Promise<void> {
  const regelOrdner = `${root}/55-Categorizer-Rules`;
  const snapOrdner = `${root}/.fl-snapshots`;
  await raeumeSchnappschuesse(cdp, root);

  // Bestand: zehn gültige Schnappschüsse der letzten Minuten (alle am heutigen Tag, mehr als die
  // Staffel „heute" = 6 behält) plus drei Dateien, die einen Stempel im Namen tragen, aber keinen
  // Namen der Form `rules-<Stempel>.json` — die rotiert nichts, sie bleiben liegen.
  const jetzt = Date.now();
  const gueltig: string[] = [];
  const fremd: string[] = [];
  const seed = await cdp.evaluate<{ gueltig: string[]; fremd: string[] }>(`
    const a = app.vault.adapter;
    const dir = ${JSON.stringify(snapOrdner)};
    if (!(await a.exists(dir))) await a.mkdir(dir);
    const stempel = (t) => new Date(t).toISOString().replace(/[:.]/g, "-");
    const gueltig = [];
    for (let k = 1; k <= 10; k++) {
      const name = dir + "/rules-" + stempel(${jetzt} - k * 60000) + ".json";
      await a.write(name, JSON.stringify({ created: new Date(${jetzt} - k * 60000).toISOString(), folder: "seed", reason: "gui-smoke seed", files: [] }));
      gueltig.push(name);
    }
    const s = stempel(${jetzt} - 11 * 60000);
    const fremd = [dir + "/rules-" + s + ".txt", dir + "/rules-" + s + ".json.bak", dir + "/rules-" + s + " (1).json"];
    for (const f of fremd) await a.write(f, "{}");
    return { gueltig, fremd };
  `);
  gueltig.push(...seed.gueltig);
  fremd.push(...seed.fremd);

  const regelnVorher = await listeDateien(cdp, regelOrdner);
  const inhaltVorher: Record<string, string> = {};
  for (const pfad of regelnVorher) {
    inhaltVorher[pfad] = await cdp.evaluate<string>(`return await app.vault.adapter.read(${JSON.stringify(pfad)});`);
  }
  if (regelnVorher.length === 0) throw new Vorbedingung("Keine Regel-Notizen im Fixture — es gäbe keinen Vorzustand zu sichern");

  // Regel über die Oberfläche anlegen: TBC-Tab → erste Gegenpartei → „Klassifizieren" (echter Klick;
  // `/klassifizieren/i` träfe zuerst den Tab „Zu klassifizieren", deshalb exakt auf den Knopftext).
  await schliesseModale(cdp);
  await cdp.evaluate(`app.commands.executeCommandById(${JSON.stringify(TBC_COMMAND_ID)}); return true;`);
  const knopf = `[...document.querySelectorAll("table button")].find((b) => /^(Classify|Klassifizieren)$/.test(b.textContent.trim()))`;
  const da = await pollUntil<boolean>(cdp, `return (${knopf}) ? true : null;`, 30_000, 500);
  if (!da) throw new Vorbedingung("Kein „Klassifizieren“-Knopf im TBC-Tab (nach dem Import gibt es zu klassifizierende Buchungen)");
  if (!(await clickReal(cdp, knopf))) throw new Vorbedingung("Klick auf „Klassifizieren“ erreichte den Knopf nicht");
  const modal = await pollUntil<boolean>(cdp, `return document.querySelector(".modal-container input[list]") ? true : null;`, 10_000, 300);
  if (!modal) throw new Vorbedingung("Regel-Modal öffnet sich nicht");
  await cdp.evaluate(`
    const i = document.querySelector(".modal-container input[list]");
    i.value = ${JSON.stringify(SMOKE_KONTO)};
    i.dispatchEvent(new Event("input", { bubbles: true }));
    return true;
  `);
  await clearNotices(cdp);
  const speichern = `[...document.querySelectorAll(".modal-container button")].find((b) => /^(Save rule|Regel speichern)$/.test(b.textContent.trim()))`;
  if (!(await clickReal(cdp, speichern))) throw new Vorbedingung("„Regel speichern“ ließ sich nicht klicken");
  const meldung = await pollUntil<string>(
    cdp,
    `
      const t = [...document.querySelectorAll(".notice")].map((n) => n.textContent.trim()).join(" | ");
      return /Rule saved|Regel gespeichert|Fehler|error/i.test(t) ? t : null;
    `,
    15_000,
    300,
  );
  if (meldung === null || !/Rule saved|Regel gespeichert/i.test(meldung)) {
    throw new Vorbedingung(`Regel wurde nicht gespeichert: ${meldung ?? "keine Meldung"} (${await notices(cdp)})`);
  }

  const regelnNachher = await listeDateien(cdp, regelOrdner);
  const neueRegeln = regelnNachher.filter((p) => !regelnVorher.includes(p));
  const snapsNachher = await listeDateien(cdp, snapOrdner);
  const neu = snapsNachher.filter((p) => !gueltig.includes(p) && !fremd.includes(p) && /rules-.*\.json$/.test(p));
  const neuerSnap = neu[0];
  let vorzustandOk = false;
  let grund = "";
  if (neuerSnap === undefined) {
    grund = "kein neuer Schnappschuss";
  } else {
    const roh = await cdp.evaluate<string>(`return await app.vault.adapter.read(${JSON.stringify(neuerSnap)});`);
    const snap = JSON.parse(roh) as { files: { path: string; content: string }[] };
    const imSnap = Object.fromEntries(snap.files.map((f) => [f.path, f.content]));
    const gleich =
      Object.keys(imSnap).length === regelnVorher.length &&
      regelnVorher.every((p) => imSnap[p] === inhaltVorher[p]);
    vorzustandOk = gleich && !Object.keys(imSnap).some((p) => neueRegeln.includes(p));
    if (!vorzustandOk) grund = "Inhalt des Schnappschusses weicht vom Vorzustand ab";
  }
  const gueltigDa = snapsNachher.filter((p) => gueltig.includes(p)).length + neu.length;
  const entfernt = gueltig.length - snapsNachher.filter((p) => gueltig.includes(p)).length;
  // Staffel „heute" behält 6; dazu kommt der älteste Eintrag des Tages/der Woche/des Monats (derselbe).
  const rotiert = entfernt >= 1 && gueltigDa <= 7;
  const fremdDa = fremd.filter((p) => snapsNachher.includes(p)).length;
  const ok = vorzustandOk && rotiert && fremdDa === fremd.length && neueRegeln.length === 1;
  record(
    "Regel-Schreibvorgang legt Schnappschuss mit Vorzustand an und rotiert",
    ok,
    ok
      ? `Schnappschuss mit ${regelnVorher.length} Regeln (Vorzustand) · ${entfernt} von ${gueltig.length} Altbestand rotiert, ${gueltigDa} gültige übrig · ${fremdDa}/${fremd.length} Fremdnamen erhalten`
      : [
          grund,
          rotiert ? "" : `Rotation: ${entfernt} entfernt, ${gueltigDa} gültige übrig`,
          fremdDa === fremd.length ? "" : `Fremdnamen: ${fremdDa}/${fremd.length} erhalten`,
          neueRegeln.length === 1 ? "" : `${neueRegeln.length} neue Regel-Notizen (Soll 1)`,
        ].filter(Boolean).join(" · "),
  );
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));

  if (args.has("setup")) {
    const vaultDir = stagingVaultDir(REPO_NAME);
    console.log(`Staging-Vault: ${vaultDir}`);
    for (const zeile of buildVault({
      repoRoot: cwd(),
      vaultDir,
      fixtureDir: join(cwd(), "docs/images/fixture"),
      generator: "make-ledger.mjs",
      pluginId: PLUGIN_ID,
    })) {
      console.log(`  ${zeile}`);
    }
    console.log("\nWeiter laut Kopfkommentar: Zweitinstanz mit eigenem Profil und Port starten, Lock nehmen, dann ohne --setup laufen.");
    return;
  }

  const portText = args.value("port");
  if (portText === undefined) {
    throw new Error("--port <n> fehlt. Es gibt keinen Standardport: 9222 gehört der regulären Instanz (Kopfkommentar: Zweitinstanz).");
  }
  const port = Number(portText);
  const vault = args.value("vault") ?? REPO_NAME;
  const keepBackup = args.has("keep-backup");

  console.log(`GUI-Smoke finance-ledger — Obsidian auf Port ${port}, Vault ${vault}\n`);
  const cdp = await attachTo("workspace", port, vault);
  if (!cdp) {
    throw new Error(`Kein Obsidian-Fenster mit dem Vault "${vault}" auf Port ${port}. Kopfkommentar: Zweitinstanz starten (nach --setup).`);
  }
  let rettung: string | null = null;
  let root = "";
  // Außerhalb des `try`, damit das `finally` die Spur auch nach einem Abbruch entfernt.
  let markierteNotiz: string | null = null;
  let markierungVorher: string | null = null;

  // Alles, was der Lauf an der Konto-Notiz und an konten.yaml ändert, geht als EIN Schritt beim Abbruch-Modul der
  // Brücke wieder zurück (`beimAbbruch`, angemeldet vor der ersten Mutation). Ctrl-C/SIGTERM: das Modul sperrt den
  // Hauptzweig, fährt den Schritt, druckt die Bilanz, Exit 130 — der frühere lokale Handler lief neben dem `finally`
  // her. Die Rettungskopie wird bewusst NICHT gelöscht: ein abgebrochener Lauf ist kein bestätigt grüner, und die
  // Kopie ist genau für den unklaren Fall da. Idempotent (das Zurückschreiben und das Umbenennen prüfen vorher).
  const zustandZurueck = async (): Promise<void> => {
    if (markierteNotiz !== null && markierungVorher !== null) {
      await cdp.evaluate(`
        const file = app.vault.getAbstractFileByPath(${JSON.stringify(markierteNotiz)});
        if (file) await app.vault.modify(file, ${JSON.stringify(markierungVorher)});
        return true;
      `);
    }
    if (root) await stelleKontenWiederHer(cdp, root);
    if (rettung) console.log(`\nRettungskopie steht (Abbruch, nicht gelöscht): ${rettung}`);
  };
  const zustand = beimAbbruch(zustandZurueck, "Konto-Notiz und konten.yaml zurücksetzen");

  try {
    await cdp.mitschnitt((zeile: string) => console.log(`    [renderer] ${zeile}`));
    await requireVisible(cdp);

    // Vertrauensdialog, Restricted Mode und Plugin laden — in dieser Reihenfolge, aus der Brücke.
    const vor = await bereiteInstanzVor(cdp, { pluginIds: [PLUGIN_ID], nurVault: vault, sprache: "en" });

    // Herkunft des Builds: der Lauf misst den gebauten Repo-Stand, nicht den Store-Build im Vault (CORE-TEST-08 a).
    const ort = await cdp.evaluate<{ basePath: string; configDir: string }>(
      `return { basePath: app.vault.adapter.basePath, configDir: app.vault.configDir };`,
    );
    requireEigenerBuild(join(ort.basePath, ort.configDir, "plugins", PLUGIN_ID, "main.js"), join(cwd(), "main.js"));

    console.log("── Fundament");
    const aktiv = await cdp.evaluate<boolean>(
      `return !!app.plugins.plugins[${JSON.stringify(PLUGIN_ID)}];`,
    );
    record("Plugin ist geladen", aktiv, aktiv ? vor.hinweis : `nicht in app.plugins — ${vor.hinweis}`);
    if (!aktiv) throw new Error("Ohne geladenes Plugin misst der Rest nichts.");

    const befehl = await cdp.evaluate<boolean>(
      `return !!app.commands.commands[${JSON.stringify(COMMAND_ID)}];`,
    );
    record("Befehl ist registriert", befehl, COMMAND_ID);

    root = await financeRoot(cdp);
    const vaultBase = await cdp.evaluate<string>(`return app.vault.adapter.basePath;`);
    console.log(`    Finanzordner: ${root}`);
    for (const zeile of await raeumeAuf(cdp, root)) console.log(`    Aufgeräumt: ${zeile}`);

    // Namensschema: `Konto 01 – …` im deutschen Arbeits-Vault, `Account 01 – …` im
    // getrackten Fixture unter docs/images/fixture (dort englisch, weil die README-Bilder
    // englisch sein müssen).
    const kontenOrdner = `${root}/10-Konten`;
    const kontoPfade = await cdp.evaluate<string[]>(`
      return app.vault.getMarkdownFiles()
        .map((f) => f.path)
        .filter((p) => p.startsWith(${JSON.stringify(kontenOrdner + "/")}) && /(Konto|Account) \\d/.test(p))
        .sort();
    `);
    record(
      "Konto-Notizen gefunden",
      kontoPfade.length > 0,
      `${kontoPfade.length} unter ${kontenOrdner}`,
    );
    if (kontoPfade.length === 0) throw new Error("Ohne Konto-Notizen ist die Grenze nicht prüfbar.");

    // Die Spur ist ein fester Text (SPUR) — ein Rest aus einem per SIGINT/SIGTERM
    // abgebrochenen früheren Lauf ist daran erkennbar, BEVOR dieser Lauf selbst eine Spur
    // setzt. Ohne diesen Punkt vergleicht "Prüf-Spur im eigenen Abschnitt gesetzt" gleiches
    // mit gleichem (die Spur war schon vorher drin) und bleibt still grün, egal was das
    // Plugin tut — genau der Fehler, den die Spur laut Kommentar oben verhindern soll.
    const spurRest = await cdp.evaluate<string[]>(`
      const gesucht = ${JSON.stringify(SPUR)};
      const treffer = [];
      for (const p of ${JSON.stringify(kontoPfade)}) {
        const f = app.vault.getAbstractFileByPath(p);
        if (f && (await app.vault.read(f)).includes(gesucht)) treffer.push(p);
      }
      return treffer;
    `);
    record(
      "Keine liegen gebliebene Pruef-Spur aus einem abgebrochenen frueheren Lauf",
      spurRest.length === 0,
      spurRest.length === 0
        ? "kein Rest in den Konto-Notizen"
        : `Spur in ${spurRest.length} Notiz(en) gefunden und entfernt: ${spurRest.join(", ")} — vermutlich Ctrl-C/Crash im vorigen Lauf vor dessen Aufräumen; dieser Lauf fährt normal weiter`,
    );
    if (spurRest.length > 0) {
      await cdp.evaluate(`
        const gesucht = ${JSON.stringify(SPUR)};
        for (const p of ${JSON.stringify(spurRest)}) {
          const f = app.vault.getAbstractFileByPath(p);
          if (f) {
            const text = await app.vault.read(f);
            await app.vault.modify(f, text.split(gesucht + "\\n").join("").split(gesucht).join(""));
          }
        }
        return true;
      `);
    }

    rettung = backup(vaultBase, root);
    console.log(`    Rettungskopie: ${rettung}`);
    console.log("");

    console.log("── Vorher-Aufnahme");
    const vorher = new Map<string, NoteSnapshot>();
    for (const pfad of kontoPfade) {
      const snap = await snapshot(cdp, pfad);
      if (snap) vorher.set(pfad, snap);
    }
    record("Vorzustand aufgenommen", vorher.size === kontoPfade.length, `${vorher.size} Notizen`);

    // Der Punkt „eigener Abschnitt überlebt" braucht einen Gegenstand. Alle Notizen trugen den
    // unveränderten Vorgabetext — ein Prüfpunkt, der Gleiches mit Gleichem vergleicht, ist auch
    // bei totaler Regeneration grün. Die Gegenprobe vom 2026-08-17 hat genau das gezeigt: 15/20
    // rot, dieser Punkt fälschlich grün. Deshalb schreibt der Treiber hier selbst eine Spur
    // hinein — und nimmt sie im `finally` wieder heraus.
    markierteNotiz = kontoPfade[0] ?? null;
    if (markierteNotiz !== null) {
      markierungVorher = (await readNote(cdp, markierteNotiz)) ?? null;
      if (markierungVorher !== null) {
        const markiert = markierungVorher.replace(
          "## 📌 Notizen",
          `## 📌 Notizen\n\n${SPUR}`,
        );
        await cdp.evaluate(`
          const file = app.vault.getAbstractFileByPath(${JSON.stringify(markierteNotiz)});
          await app.vault.modify(file, ${JSON.stringify(markiert)});
          return true;
        `);
        const drin = markiert.includes(SPUR);
        record(
          "Prüf-Spur im eigenen Abschnitt gesetzt",
          drin,
          drin ? markierteNotiz.split("/").pop() ?? "" : "kein „📌 Notizen“ gefunden",
        );
        // Der Vorher-Schnappschuss muss die Spur kennen, sonst meldet der Vergleich
        // gleich die eigene Änderung als Verlust.
        const neu = await snapshot(cdp, markierteNotiz);
        if (neu) vorher.set(markierteNotiz, neu);
      } else {
        unmeasured("Prüf-Spur im eigenen Abschnitt gesetzt", `Notiz ${markierteNotiz} ließ sich nicht lesen`);
      }
    }
    const mitUserSection = [...vorher.values()].filter((s) => s.userSection !== null).length;
    const mitKomma = [...vorher.values()].filter((s) => s.anfangssaldo?.includes(",")).length;
    console.log(`    davon mit Marker-Block: ${mitUserSection}, mit Komma-Anfangssaldo: ${mitKomma}`);
    console.log("");

    console.log("── Import");
    const meldung = await runImport(cdp);
    console.log(`    Meldung: ${meldung.slice(0, 200)}`);
    const fehler = /fehlgeschlagen|failed/i.test(meldung);
    record("Import lief ohne Fehlermeldung", !fehler, fehler ? meldung.slice(0, 120) : "");

    const buchungen = /(\d+)\s+Buchungen|(\d+)\s+transactions/i.exec(meldung);
    const anzahl = Number(buchungen?.[1] ?? buchungen?.[2] ?? 0);
    record("Meldung nennt eine Buchungszahl", anzahl > 0, `${anzahl} Buchungen`);

    const notizMeldung = /(\d+)\s+Konto-\/Vertrags-Notiz|(\d+)\s+account\/contract note/i.exec(meldung);
    const notizen = Number(notizMeldung?.[1] ?? notizMeldung?.[2] ?? 0);
    record(
      "Meldung nennt nachgezogene Notizen",
      notizen > 0,
      notizen > 0 ? `${notizen} Notizen` : "keine Notizen-Zeile in der Meldung",
    );
    console.log("");

    console.log("── Die Grenze: was der Importer NICHT anfassen darf");
    const nachher = new Map<string, NoteSnapshot>();
    for (const pfad of kontoPfade) {
      const snap = await snapshot(cdp, pfad);
      if (snap) nachher.set(pfad, snap);
    }

    /** Abweichungen eines Feldes, lesbar benannt.
     *
     *  `String(obj)` ergibt bei den fremden Feldern `[object Object]` — die Gegenprobe
     *  meldete damit „Abweichung, aber welche?" und war als Diagnose wertlos. Objekte
     *  werden deshalb auf die tatsächlich verlorenen Schlüssel heruntergebrochen. */
    const zeige = (wert: unknown): string =>
      wert !== null && typeof wert === "object"
        ? Object.keys(wert as Record<string, unknown>).join(",") || "(leer)"
        : String(wert);

    const abw = <K extends keyof NoteSnapshot>(feld: K): string[] =>
      [...vorher.entries()]
        .filter(([p, v]) => JSON.stringify(nachher.get(p)?.[feld]) !== JSON.stringify(v[feld]))
        .map(([p, v]) => {
          const name = p.split("/").pop();
          const vorWert = v[feld];
          const nachWert = nachher.get(p)?.[feld];
          if (vorWert !== null && typeof vorWert === "object") {
            const weg = Object.keys(vorWert as Record<string, unknown>).filter(
              (k) => !(k in ((nachWert ?? {}) as Record<string, unknown>)),
            );
            return `${name}: verloren [${weg.join(", ") || "—"}]`;
          }
          return `${name}: ${zeige(vorWert)} → ${zeige(nachWert)}`;
        });

    const anfangAbw = abw("anfangssaldo");
    record(
      "anfangssaldo_eur unverändert — samt Komma-Schreibweise",
      anfangAbw.length === 0 && mitKomma > 0,
      anfangAbw.length === 0
        ? mitKomma > 0
          ? `${mitKomma} mit Komma`
          : "0 Konten mit Komma-Anfangssaldo — Komma-Pfad ungeprüft"
        : anfangAbw.join(" · "),
    );

    const createdAbw = abw("created");
    record("created unverändert (Sperrliste)", createdAbw.length === 0, createdAbw.join(" · "));

    const userAbw = abw("userSection");
    const spurNoch = nachher.get(markierteNotiz ?? "")?.userSection?.includes(SPUR) ?? false;
    record(
      "Eigener Abschnitt überlebt zeichengenau (samt gesetzter Spur)",
      userAbw.length === 0 && spurNoch,
      userAbw.length === 0 && spurNoch
        ? `${mitUserSection} Abschnitte, Spur intakt`
        : [spurNoch ? "" : "Spur verschwunden", ...userAbw].filter(Boolean).join(" · "),
    );

    const fremdAbw = abw("fremdeFelder");
    const fremdAnzahl = [...vorher.values()].reduce((n, s) => n + Object.keys(s.fremdeFelder).length, 0);
    record(
      "Fremde Frontmatter-Felder überleben",
      fremdAbw.length === 0 && fremdAnzahl > 0,
      fremdAbw.length === 0
        ? fremdAnzahl > 0
          ? `${fremdAnzahl} Felder geprüft`
          : "0 fremde Felder im Fixture — Erhaltungspfad ungeprüft"
        : fremdAbw.join(" · "),
    );

    const marker = [...nachher.values()].filter((s) => s.full.includes("<!-- BEGIN: AUTO-GENERATED -->")).length;
    record("Alle Konto-Notizen tragen den Marker-Block", marker === nachher.size, `${marker}/${nachher.size}`);
    console.log("");

    console.log("── Erzeugte Dateien");
    const journal = await readNote(cdp, `${root}/Ledger/journal.ledger`);
    record(
      "journal.ledger ist da und nicht leer",
      journal !== null && journal.length > 1000,
      journal === null ? "fehlt" : `${journal.length} Zeichen`,
    );

    const opening = await readNote(cdp, `${root}/Ledger/opening_balances.ledger`);
    const eroeffnungen = (opening?.match(/^\d{4}-\d{2}-\d{2} \* Eröffnungsbilanz/gm) ?? []).length;
    const fehlt = (opening?.match(/fehlt —/g) ?? []).length;
    record(
      "opening_balances.ledger trägt Eröffnungsbuchungen",
      eroeffnungen > 0,
      `${eroeffnungen} Buchungen`,
    );
    record(
      "…und keine „fehlt\"-Zeilen (Komma-Schreibweise gelesen)",
      fehlt === 0,
      fehlt === 0 ? "alle Anfangssalden gelesen" : `${fehlt} Konten ohne Wert`,
    );

    const vertragOrdner = `${root}/20-Verträge`;
    const vertragPfad = await cdp.evaluate<string | null>(`
      const f = app.vault.getMarkdownFiles()
        .map((x) => x.path)
        .filter((p) => p.startsWith(${JSON.stringify(vertragOrdner + "/")}))
        .sort();
      for (const p of f) {
        const file = app.vault.getAbstractFileByPath(p);
        const text = await app.vault.read(file);
        if (text.includes("Tx-Stichprobe")) return p;
      }
      return null;
    `);
    if (vertragPfad === null) {
      // Das Fixture trägt `vertraege.yaml` mit einem Vertrag; fehlt die Notiz, wurde der Gegenstand
      // nicht erreicht — nicht „nicht anwendbar".
      const grund = "keine Vertrags-Notiz mit Stichprobe nach dem Import (vertraege.yaml im Fixture?)";
      unmeasured("Vertrags-Notiz hat Stichprobe und Vertragsdaten", grund);
      unmeasured("…mit escaptem Alias-Trenner in der Tabelle", grund);
    } else {
      const vertrag = (await readNote(cdp, vertragPfad)) ?? "";
      record(
        "Vertrags-Notiz hat Stichprobe und Vertragsdaten",
        vertrag.includes("Tx-Stichprobe") && vertrag.includes("## Vertragsdaten"),
        // Das Diagramm („Betrags-Verlauf“) braucht Buchungen aus zwei Monaten; das Fixture hat nur August.
        `${vertragPfad.split("/").pop() ?? ""} (Diagramm im Fixture nicht erreichbar: ein Monat)`,
      );
      record(
        "…mit escaptem Alias-Trenner in der Tabelle",
        vertrag.includes("\\|"),
        "Tabellenzelle bleibt heil",
      );
    }
    console.log("");

    // Berichte (E5): eine Notiz je Periode mit Buchungen. Die Soll-Zahl stammt aus dem geschriebenen Journal,
    // nicht aus einer Konstante — das Fixture verschiebt seine Daten mit dem Stichtag.
    const tage = [...(journal ?? "").matchAll(/^(\d{4})-(\d{2})-\d{2} /gm)];
    const monate = new Set(tage.map((m) => `${m[1]}-${m[2]}`));
    const quartale = new Set(tage.map((m) => `${m[1]}-Q${Math.floor((Number(m[2]) - 1) / 3) + 1}`));
    const jahre = new Set(tage.map((m) => m[1]));
    const berichteNach = await leseBerichte(cdp, root);
    const soll = [monate.size, quartale.size, jahre.size];
    const ist = BERICHT_ORDNER.map(({ ordner }) => [...berichteNach.keys()].filter((p) => p.startsWith(`${root}/${ordner}/`)).length);
    const schlecht = [...berichteNach.entries()].filter(([pfad, text]) => {
      const art = BERICHT_ORDNER.find(({ ordner }) => pfad.startsWith(`${root}/${ordner}/`))?.art;
      return !(text.includes(`kategorie: ${art}`) && text.includes("<!-- BEGIN: AUTO-GENERATED -->") && text.includes("## 📊 Gesamt-Sicht"));
    });
    const berichteOk = soll[0] > 0 && ist.every((n, i) => n === soll[i]) && schlecht.length === 0;
    record(
      "Berichte entstehen im Import: ein Monat, Quartal und Jahr je Periode mit Buchungen",
      berichteOk,
      berichteOk
        ? `${ist[0]} Monat(e), ${ist[1]} Quartal(e), ${ist[2]} Jahr(e)`
        : `Soll ${soll.join("/")} (Monate/Quartale/Jahre), ist ${ist.join("/")}${schlecht.length > 0 ? `, ohne Gerüst: ${schlecht.map(([p]) => p.split("/").pop()).join(", ")}` : ""}`,
    );
    console.log("");

    console.log("── Idempotenz (der Grund, warum dieser Smoke schreiben darf)");
    const vorZweitem = new Map<string, string>();
    for (const pfad of kontoPfade) vorZweitem.set(pfad, (await readNote(cdp, pfad)) ?? "");
    const openingVor = opening ?? "";

    await runImport(cdp);

    const drift: string[] = [];
    for (const pfad of kontoPfade) {
      if ((await readNote(cdp, pfad)) !== vorZweitem.get(pfad)) drift.push(pfad.split("/").pop() ?? pfad);
    }
    record(
      "Zweiter Lauf lässt Konto-Notizen byte-gleich",
      drift.length === 0,
      drift.length === 0 ? `${kontoPfade.length} Notizen` : `Drift in: ${drift.join(", ")}`,
    );
    const openingNach = (await readNote(cdp, `${root}/Ledger/opening_balances.ledger`)) ?? "";
    record(
      "…und die Eröffnungsbilanz ebenso",
      openingNach === openingVor,
      openingNach === openingVor ? "byte-gleich" : "ABWEICHUNG",
    );
    const berichteZweiter = await leseBerichte(cdp, root);
    const berichteDrift = [...berichteNach.entries()]
      .filter(([pfad, text]) => berichteZweiter.get(pfad) !== text)
      .map(([pfad]) => pfad.split("/").pop() ?? pfad);
    const berichteIdem = berichteNach.size > 0 && berichteDrift.length === 0 && berichteZweiter.size === berichteNach.size;
    record(
      "…und die Berichte ebenso",
      berichteIdem,
      berichteIdem ? `${berichteNach.size} Berichte byte-gleich` : `Drift in: ${berichteDrift.join(", ") || "Dateimenge"}`,
    );
    console.log("");

    console.log("── Die drei Pfade ohne Node-API (seit 0.3.0)");
    await bilanz.punkt("Import-Modal liest die Konten aus konten.yaml", () => pruefeKontenModal(cdp, root));
    await bilanz.punkt("CSV-Vorschau zählt neu und Duplikate", () => pruefeVorschau(cdp, root));
    await bilanz.punkt(
      "Regel-Schreibvorgang legt Schnappschuss mit Vorzustand an und rotiert",
      () => pruefeSchnappschuss(cdp, root),
    );
    console.log("── Rückfrage vor dem Überschreiben");
    await bilanz.punkt("Neuaufbau fragt vorher; „Abbrechen“ schreibt nichts", () => pruefeRueckfrage(cdp, root));
    console.log("── Kategorien: Zeitrahmen");
    await bilanz.punkt("Kategorien — Zeitrahmen schränkt ein und reist in den Ledger-Filter", () => pruefeKategorien(cdp, root));
  } finally {
    // Nach Ctrl-C räumt das Abbruch-Modul auf, druckt die Bilanz und beendet den Prozess; dieser Zweig darf
    // dann weder ein zweites Mal aufräumen noch die Bilanz ein zweites Mal drucken.
    if (istAbgebrochen()) return;
    // Normalweg: das Byte-gleich-Protokoll bleibt hier, weil es einen erfolgreich DURCHGELAUFENEN Vorher-Wert
    // braucht, den der Abbruchschritt nicht sinnvoll verifizieren kann.
    if (root) await raeumeAuf(cdp, root).catch(() => undefined);
    if (markierteNotiz !== null && markierungVorher !== null) {
      await cdp
        .evaluate(`
          const file = app.vault.getAbstractFileByPath(${JSON.stringify(markierteNotiz)});
          if (file) await app.vault.modify(file, ${JSON.stringify(markierungVorher)});
          return true;
        `)
        .catch(() => undefined);
      const zurueck = await readNote(cdp, markierteNotiz).catch(() => null);
      console.log(
        zurueck === markierungVorher
          ? "\nSpur entfernt: Notiz byte-gleich zum Vorzustand."
          : "\n⚠️ Spur-Rücknahme ABWEICHUNG — Rettungskopie prüfen.",
      );
    }
    zustand();
    cdp.close();
  }

  const ab = bilanz.abschluss();
  if (ab.exitCode !== 0) {
    if (rettung) console.log(`\nRettungskopie steht: ${rettung}`);
  } else if (rettung !== null && !keepBackup) {
    // Bei grünem Lauf weg damit: der Vault ist kein Ablageort für Testfixturen, und
    // eine Kopie pro Lauf summiert sich still. Bei rot bleibt sie stehen — dann ist sie
    // der Rückweg und ihr Pfad steht oben.
    execFileSync("rm", ["-rf", rettung]);
    console.log("Rettungskopie entfernt (Lauf war grün).");
  } else if (rettung !== null) {
    console.log(`Rettungskopie behalten: ${rettung}`);
  }
}

runDriver(main);
