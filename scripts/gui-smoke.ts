/**
 * GUI-Smoke-Treiber — fährt die Checkliste aus `docs/SMOKE.md` gegen ein **laufendes**
 * Obsidian statt von Hand.
 *
 * Warum getrackt (CORE-TEST-02 b): Die Zusage von E3 ist eine Grenze — der Importer darf
 * seine eigenen Frontmatter-Felder überschreiben und muss alles andere unberührt lassen.
 * Gegen erfundene Notizen ist das trivial grün; interessant wird es an echten, über
 * Monate von Hand gepflegten Notizen mit deutscher Komma-Schreibweise, eigenen Feldern
 * und einem gewachsenen „📌 Notizen"-Abschnitt.
 *
 * Der Treiber misst deshalb **Vorher gegen Nachher am selben echten Vault** statt gegen
 * eingetragene Sollwerte: so muss niemand diese Datei nachziehen, wenn sich die Daten
 * ändern, und der Prüfpunkt bleibt derselbe.
 *
 * ## Voraussetzung
 *
 * ```bash
 * osascript -e 'quit app "Obsidian"'
 * open -a Obsidian --args --remote-debugging-port=9222
 * OBSIDIAN_PLUGIN_DIR="<vault>/.obsidian/plugins/finance-ledger" npm run deploy
 * npm run smoke:gui -- --vault <VaultName>
 * ```
 *
 * ⚠️ Der Import der Brücke geht hier **drei** Ebenen hoch, nicht zwei wie in den anderen
 * Plugins: dieses Repo liegt unter dem Container `finance-ledger-plugin/`, nicht direkt
 * unter `obsidian-plugins/`.
 */

import { execFileSync } from "node:child_process";

import { Cdp, pollUntil } from "../../../tools/obsidian-cdp/cdp.js";

const PLUGIN_ID = "finance-ledger";
/** Zeile, die der Treiber in einen Nutzer-Abschnitt schreibt, um ihn prüfbar zu machen.
 *  Sie geht im `finally` wieder heraus. */
const SPUR = "<!-- gui-smoke: diese Zeile muss den Import überleben -->";
const COMMAND_ID = `${PLUGIN_ID}:finance-rebuild-journal`;

interface Check {
  name: string;
  passed: boolean;
  detail: string;
}

const results: Check[] = [];

function record(name: string, passed: boolean, detail: string): void {
  results.push({ name, passed, detail });
  console.log(`${passed ? "  ✓" : "  ✗"} ${name}${detail ? ` — ${detail}` : ""}`);
}

/** Was der Lauf bewusst nicht misst — sonst liest sich eine Lücke wie Abdeckung. */
function skipped(name: string, reason: string): void {
  console.log(`  – ${name} — übersprungen: ${reason}`);
}

/** Momentaufnahme einer Konto-Notiz: genau die Teile, die der Import NICHT anfassen darf. */
interface NoteSnapshot {
  path: string;
  saldo: string | null;
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
    saldo: FM_FIELD(full, "saldo_eur"),
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
 */
async function financeRoot(cdp: Cdp): Promise<string> {
  const root = await cdp.evaluate<string>(`
    const plugin = app.plugins.plugins[${JSON.stringify(PLUGIN_ID)}];
    return plugin?.pluginData?.financeRoot ?? plugin?.settings?.financeRoot ?? "";
  `);
  if (!root) {
    const felder = await cdp.evaluate<string>(`
      const plugin = app.plugins.plugins[${JSON.stringify(PLUGIN_ID)}];
      return Object.keys(plugin ?? {}).join(", ");
    `);
    throw new Error(
      `Kein financeRoot gefunden. Felder der Plugin-Instanz: ${felder}`,
    );
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
      execFileSync("cp", ["-R", `${vaultBase}/${root}/${ordner}`, ziel]);
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
async function runImport(cdp: Cdp): Promise<string> {
  await cdp.evaluate(`
    [...document.querySelectorAll(".notice")].forEach((n) => n.remove());
    app.commands.executeCommandById(${JSON.stringify(COMMAND_ID)});
    return true;
  `);
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

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  const flag = (name: string): string | undefined => {
    const index = argv.indexOf(`--${name}`);
    return index === -1 ? undefined : argv[index + 1];
  };
  const port = Number(flag("port") ?? 9222);
  const vault = flag("vault");
  const keepBackup = argv.includes("--keep-backup");

  console.log(`GUI-Smoke finance-ledger — Obsidian auf Port ${port}\n`);
  const cdp = await Cdp.attach(port, vault);
  let rettung: string | null = null;
  // Außerhalb des `try`, damit das `finally` die Spur auch nach einem Abbruch entfernt.
  let markierteNotiz: string | null = null;
  let markierungVorher: string | null = null;

  try {
    await cdp.mitschnitt((zeile: string) => console.log(`    [renderer] ${zeile}`));

    // Bewusst KEIN `requireVisible` (die Brücke bietet es an, und für die meisten
    // Treiber ist es richtig): dieser Smoke misst keine Pixel. Er liest Dateien über
    // `app.vault.read` und den Text der Meldungen — beides läuft auch im gedrosselten
    // Hintergrund. Ein harter Abbruch bei `hidden` würde den Lauf davon abhängig machen,
    // ob gerade jemand am Rechner sitzt, ohne dass es die Messung besser macht.
    // Gemeldet wird der Zustand trotzdem: läuft etwas in eine Zeitgrenze, ist das die
    // erste Spur.
    await cdp.send("Page.bringToFront").catch(() => undefined);
    const sichtbar = await cdp.evaluate<string>(`return document.visibilityState;`);
    if (sichtbar !== "visible") {
      console.log(`    Hinweis: Fenster ist "${sichtbar}" — Rendering gedrosselt, Messung unberührt.`);
    }

    console.log("── Fundament");
    const aktiv = await cdp.evaluate<boolean>(
      `return !!app.plugins.plugins[${JSON.stringify(PLUGIN_ID)}];`,
    );
    record("Plugin ist geladen", aktiv, aktiv ? PLUGIN_ID : "nicht in app.plugins");
    if (!aktiv) throw new Error("Ohne geladenes Plugin misst der Rest nichts.");

    const befehl = await cdp.evaluate<boolean>(
      `return !!app.commands.commands[${JSON.stringify(COMMAND_ID)}];`,
    );
    record("Befehl ist registriert", befehl, COMMAND_ID);

    const root = await financeRoot(cdp);
    const vaultBase = await cdp.evaluate<string>(`return app.vault.adapter.basePath;`);
    console.log(`    Finanzordner: ${root}`);

    const kontenOrdner = `${root}/10-Konten`;
    const kontoPfade = await cdp.evaluate<string[]>(`
      return app.vault.getMarkdownFiles()
        .map((f) => f.path)
        .filter((p) => p.startsWith(${JSON.stringify(kontenOrdner + "/")}) && /Konto \\d/.test(p))
        .sort();
    `);
    record(
      "Konto-Notizen gefunden",
      kontoPfade.length > 0,
      `${kontoPfade.length} unter ${kontenOrdner}`,
    );
    if (kontoPfade.length === 0) throw new Error("Ohne Konto-Notizen ist die Grenze nicht prüfbar.");

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

    // Der Punkt „eigener Abschnitt überlebt" braucht einen Gegenstand. Alle vier
    // Notizen trugen den unveränderten Vorgabetext — ein Prüfpunkt, der Gleiches mit
    // Gleichem vergleicht, ist auch bei totaler Regeneration grün. Die Gegenprobe vom
    // 2026-08-17 hat genau das gezeigt: 15/20 rot, dieser Punkt fälschlich grün.
    // Deshalb schreibt der Treiber hier selbst eine Spur hinein — und nimmt sie im
    // `finally` wieder heraus.
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

    const saldoAbw = abw("saldo");
    record(
      "saldo_eur unverändert (dieselben CSVs, dasselbe Ergebnis)",
      saldoAbw.length === 0,
      saldoAbw.length === 0 ? `${vorher.size} Konten geprüft` : saldoAbw.join(" · "),
    );

    const anfangAbw = abw("anfangssaldo");
    record(
      "anfangssaldo_eur unverändert — samt Komma-Schreibweise",
      anfangAbw.length === 0,
      anfangAbw.length === 0 ? `${mitKomma} mit Komma` : anfangAbw.join(" · "),
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
      fremdAbw.length === 0,
      fremdAbw.length === 0 ? `${fremdAnzahl} Felder geprüft` : fremdAbw.join(" · "),
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
      skipped("Vertrags-Notiz geprüft", "keine Notiz mit Stichprobe gefunden");
    } else {
      const vertrag = (await readNote(cdp, vertragPfad)) ?? "";
      record(
        "Vertrags-Notiz hat Stichprobe und Diagramm",
        vertrag.includes("Tx-Stichprobe") && vertrag.includes("xychart-beta"),
        vertragPfad.split("/").pop() ?? "",
      );
      record(
        "…mit escaptem Alias-Trenner in der Tabelle",
        vertrag.includes("\\|"),
        "Tabellenzelle bleibt heil",
      );
    }
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
  } finally {
    // Die Spur geht immer wieder heraus — auch nach einem Abbruch mitten im Lauf.
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
    cdp.close();
  }

  const failed = results.filter((c) => !c.passed);
  console.log(`\n${results.length - failed.length}/${results.length} grün`);
  if (failed.length > 0) {
    console.log("Rot:");
    for (const c of failed) console.log(`  - ${c.name}: ${c.detail}`);
    if (rettung) console.log(`\nRettungskopie steht: ${rettung}`);
    process.exitCode = 1;
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

main().catch((error: unknown) => {
  console.error(`\nAbbruch: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});
