/**
 * Aufnahme-Treiber für die README-Bilder — fährt den Vertrag aus `docs/images/README.md`
 * gegen ein **laufendes** Obsidian, statt die Bilder von Hand zu klicken.
 *
 * Brücke, Aufnahme-Primitive und Fixture→Vault liegen zentral im Dach
 * (`obsidian-plugins/tools/obsidian-cdp/`); hier steht nur das Rezept. ⚠️ Der Import geht
 * **drei** Ebenen hoch, nicht zwei wie in den anderen Plugins: dieses Repo liegt unter dem
 * Container `finance-ledger-plugin/`.
 *
 * ## Ablauf
 *
 * ```bash
 * export STAGING_VAULTS_DIR="$HOME/StagingVaults"   # einmalig
 * npm run build && npm run shots -- --setup
 *
 * osascript -e 'quit app "Obsidian"'
 * open -a Obsidian --args --remote-debugging-port=9222
 * #   ... den Aufnahme-Vault öffnen und einmalig als vertrauenswürdig markieren
 *
 * npm run shots
 * npm run shots -- --only hero.png
 * ```
 *
 * ## Was hier anders ist als im Referenz-Rezept
 *
 * Der Finance-Hub lebt in der **rechten Sidebar** (`getRightLeaf`), nicht im Hauptbereich.
 * Alle Panel-Bilder brauchen deshalb eine verbreiterte Sidebar — und `setSize` wirkt
 * asynchron: eine Box, die während der Layout-Animation gemessen wird, hat die richtige
 * Größe an der falschen Stelle. Deshalb wartet `sidebarBreit` auf **Ruhe** (zwei gleiche
 * Messungen), nicht auf eine Sekundenzahl.
 */

import { existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { argv, cwd, env } from "node:process";

import { attachTo, Cdp, pollUntil } from "../../../tools/obsidian-cdp/cdp.js";
import {
  capture,
  setWindowSize,
  writeShot,
  type Rect,
  type ShotOptions,
} from "../../../tools/obsidian-cdp/shot.js";
import { buildVault, stagingVaultDir } from "../../../tools/obsidian-cdp/vault.js";

const PLUGIN_ID = "finance-ledger";
const REPO_NAME = "finance-ledger";
const OUT_DIR = "docs/images";
const CAPTURE_WIDTH = 1200;
const THUMB_WIDTH = 380;
const FENSTER_BREITE = 1440;
const FENSTER_HOEHE = 900;
/** Breite der rechten Sidebar für die Panel-Bilder. */
const PANEL_BREITE = 760;
/** Container des Hub-Blatts — Obsidian-Standard, unabhängig von eigenen CSS-Klassen. */
const HUB = '.workspace-leaf-content[data-type="finance-hub"]';

interface Shot {
  name: string;
  klasse: "hero" | "feature" | "detail";
  run(cdp: Cdp): Promise<Rect | null>;
}

/**
 * Den Finanzordner einstellen — ohne ihn zeigt jedes Panel nur den Hinweis
 * „Configure your finance project folder".
 *
 * `buildVault` löscht `data.json` bewusst, um den Auslieferungszustand herzustellen. Für
 * ein Plugin, das ohne Konfiguration gar nichts anzeigen **kann**, ist das der falsche
 * Ausgangspunkt: der erste Lauf lieferte sechs Bilder, die zu 92 % aus leerer Fläche
 * bestanden und trotzdem als Erfolg gemeldet wurden. Der Treiber richtet deshalb ein,
 * was der Nutzer auch einrichten müsste — und lädt das Plugin danach neu, damit die
 * Views wirklich neu bauen (ein gesetzter Wert ist kein hergestellter Zustand).
 *
 * `pluginData` statt `settings`: so heißt das Feld in diesem Plugin (`src/main.ts`).
 */
async function finanzordnerEinstellen(cdp: Cdp, ordner: string): Promise<void> {
  await cdp.evaluate(`
    const plugin = app.plugins.plugins[${JSON.stringify(PLUGIN_ID)}];
    const alt = (await plugin.loadData()) ?? {};
    await plugin.saveData({ ...alt, financeRoot: ${JSON.stringify(ordner)} });
    await app.plugins.disablePlugin(${JSON.stringify(PLUGIN_ID)});
    await app.plugins.enablePlugin(${JSON.stringify(PLUGIN_ID)});
    return true;
  `);
  const steht = await pollUntil<string>(
    cdp,
    `
      const plugin = app.plugins.plugins[${JSON.stringify(PLUGIN_ID)}];
      return plugin?.pluginData?.financeRoot || null;
    `,
    15_000,
  );
  if (steht === null) {
    throw new Error(
      "Finanzordner ließ sich nicht einstellen — jedes Panel bliebe leer. " +
        "Läuft das Plugin im Aufnahme-Vault?",
    );
  }
}

/**
 * Obsidians Statusleiste schwebt über der rechten Sidebar und klebt sonst in jeder
 * Panel-Aufnahme in der Ecke. Sie gehört dem Wirt, nicht dem Plugin.
 */
async function statusleisteAus(cdp: Cdp): Promise<void> {
  await cdp.evaluate(`
    if (!document.getElementById("shots-style")) {
      const s = document.createElement("style");
      s.id = "shots-style";
      s.textContent = ".status-bar { display: none !important; }";
      document.head.appendChild(s);
    }
    return true;
  `);
}

/** Hub öffnen und den gewünschten Reiter zeigen. */
async function hubTab(cdp: Cdp, tab: string): Promise<void> {
  await cdp.send("Page.bringToFront");
  await cdp.evaluate(`
    app.commands.executeCommandById(${JSON.stringify(`${PLUGIN_ID}:${tab}`)});
    return true;
  `);
  await pollUntil<boolean>(
    cdp,
    `return !!document.querySelector(${JSON.stringify(HUB)});`,
    15_000,
  );
}

/**
 * Rechte Sidebar verbreitern und auf Layout-Ruhe warten.
 *
 * `setSize` wirkt asynchron; wer sofort misst, bekommt die Box der alten Breite. Zwei
 * gleiche Messungen hintereinander sind das Signal, dass die Animation durch ist.
 */
async function sidebarBreit(cdp: Cdp, breite: number): Promise<void> {
  await cdp.evaluate(`
    app.workspace.rightSplit.setSize(${breite});
    return true;
  `);
  await pollUntil<boolean>(
    cdp,
    `
      const el = document.querySelector(${JSON.stringify(HUB)});
      if (!el) return null;
      const jetzt = Math.round(el.getBoundingClientRect().width);
      const vorher = window.__shotsBreite;
      window.__shotsBreite = jetzt;
      return vorher === jetzt && jetzt > 100 ? true : null;
    `,
    10_000,
    250,
  );
}

/**
 * Ausschnitt des Hub-Panels: **Breite vom Blatt, Höhe vom Inhalt.**
 *
 * Der Blatt-Container ist so hoch wie das Fenster — mit ihm allein besteht die untere
 * Hälfte jedes Panel-Bildes aus toter Fläche (gemessen: 92 % identische Zeilen). Der
 * Inhalt allein wiederum ist schmaler als das Blatt und liefert einen Ausschnitt mit
 * Fremdrand. Deshalb zwei Quellen, je für die Achse, die sie richtig kennen.
 */
async function panelBox(cdp: Cdp): Promise<Rect | null> {
  await statusleisteAus(cdp);
  return cdp.evaluate<Rect | null>(`
    const blatt = document.querySelector(${JSON.stringify(HUB)});
    if (!blatt) return null;
    const r = blatt.getBoundingClientRect();
    // Unterkante des letzten Elements, das WIRKLICH etwas zeigt. Über alle Kinder zu
    // gehen half nicht: leere Wrapper reichen bis zum Blattende, und die Messung ergab
    // wieder die volle Fensterhöhe (75–84 % tote Fläche im zweiten Lauf). Blattknoten
    // mit Text sind das ehrliche Maß.
    const zeigtEtwas = (el) => {
      const b = el.getBoundingClientRect();
      if (b.width < 2 || b.height < 2 || b.bottom > r.bottom + 1) return false;
      return el.children.length === 0 && el.textContent.trim().length > 0;
    };
    const unten = [...blatt.querySelectorAll("*")]
      .filter(zeigtEtwas)
      .reduce((max, el) => Math.max(max, el.getBoundingClientRect().bottom), r.top);
    const hoehe = Math.max(120, Math.min(unten + 12, r.bottom) - r.top);
    return { x: r.x, y: r.y, width: r.width, height: hoehe };
  `);
}

const SHOTS: Shot[] = [
  {
    name: "hero.png",
    klasse: "hero",
    async run(cdp) {
      // Das ganze Fenster: der Hub allein erklärt nicht, dass das in Obsidian lebt.
      // Links eine echte Notiz statt des leeren „New tab" — sonst zeigt das Hauptbild
      // zur Hälfte Obsidians Startbildschirm.
      await cdp.evaluate(`
        const datei = app.vault.getMarkdownFiles().find((f) => f.path.includes("10-Konten"));
        if (datei) await app.workspace.getLeaf(false).openFile(datei, { state: { mode: "preview" } });
        return true;
      `);
      await hubTab(cdp, "open-ledger-viewer");
      await sidebarBreit(cdp, 820);
      await statusleisteAus(cdp);
      return null;
    },
  },
  {
    name: "dashboard.png",
    klasse: "feature",
    async run(cdp) {
      await hubTab(cdp, "open-finance-dashboard");
      await sidebarBreit(cdp, PANEL_BREITE);
      return panelBox(cdp);
    },
  },
  {
    name: "balances.png",
    klasse: "feature",
    async run(cdp) {
      await hubTab(cdp, "open-saldo-overview");
      await sidebarBreit(cdp, PANEL_BREITE);
      return panelBox(cdp);
    },
  },
  {
    name: "categories.png",
    klasse: "feature",
    async run(cdp) {
      await hubTab(cdp, "open-category-overview");
      await sidebarBreit(cdp, PANEL_BREITE);
      return panelBox(cdp);
    },
  },
  {
    name: "triage.png",
    klasse: "feature",
    /**
     * Eigene Fensterhöhe: Die Summenzeile dieses Panels klebt am **unteren** Rand. Bei
     * voller Fensterhöhe misst jede Inhaltsmessung bis zu ihr — und dazwischen steht
     * Leere (gemessen: 64 % des Bildes). Ein Randscan findet das nicht, weil unten etwas
     * steht. Also das Fenster so hoch machen, wie der Inhalt ist.
     */
    async run(cdp) {
      await hubTab(cdp, "open-tbc-triage");
      await sidebarBreit(cdp, PANEL_BREITE);
      await setWindowSize(cdp, FENSTER_BREITE, 430);
      await new Promise((r) => setTimeout(r, 800));
      const box = await panelBox(cdp);
      await setWindowSize(cdp, FENSTER_BREITE, FENSTER_HOEHE);
      return box;
    },
  },
];

function flag(name: string): string | undefined {
  const i = argv.indexOf(name);
  return i === -1 ? undefined : argv[i + 1];
}

/**
 * Aufnahmesprache setzen und den Vorwert zurückmelden.
 *
 * `localStorage["language"]` gilt **app-weit**, nicht pro Vault — bleibt sie stehen,
 * startet auch der Arbeits-Vault in der Aufnahmesprache.
 */
async function spracheSetzen(cdp: Cdp, wert: string): Promise<string> {
  return cdp.evaluate<string>(`
    const vorher = window.localStorage.getItem("language") ?? "";
    window.localStorage.setItem("language", ${JSON.stringify(wert)});
    return vorher;
  `);
}

async function main(): Promise<void> {
  const repoRoot = cwd();
  const outDir = join(repoRoot, OUT_DIR);

  if (argv.includes("--list")) {
    for (const s of SHOTS) console.log(`  ${s.klasse.padEnd(8)} ${s.name}`);
    return;
  }

  if (argv.includes("--setup")) {
    const vaultDir = stagingVaultDir(REPO_NAME);
    console.log(`Aufnahme-Vault: ${vaultDir}`);
    for (const zeile of buildVault({
      repoRoot,
      vaultDir,
      fixtureDir: join(repoRoot, "docs/images/fixture"),
      // Erzeugt das Journal relativ zu heute — mit festen Daten wäre die
      // Dashboard-Karte „current month" ab dem Folgemonat leer.
      generator: "make-ledger.mjs",
      pluginId: PLUGIN_ID,
    })) {
      console.log(`  ${zeile}`);
    }
    console.log(
      "\n⚠️  Lief Obsidian während dieses Setups, muss es JETZT neu starten.\n" +
        "\n  osascript -e 'quit app \"Obsidian\"'\n" +
        "  open -a Obsidian --args --remote-debugging-port=9222\n" +
        `\nDann diesen Vault öffnen: ${vaultDir}\n` +
        "Beim ersten Mal fragt Obsidian nach Vertrauen — bestätigen, sonst läuft das\n" +
        "Plugin nicht und jedes Bild zeigt eine leere Seitenleiste.",
    );
    return;
  }

  const port = Number(flag("--port") ?? env.SHOTS_PORT ?? 9222);
  const nur = flag("--only");
  if (!existsSync(outDir)) mkdirSync(outDir, { recursive: true });

  const cdp = await attachTo("workspace", port, REPO_NAME);
  if (!cdp) {
    throw new Error(
      `Kein Obsidian-Fenster mit dem Vault "${REPO_NAME}" auf Port ${port}.\n` +
        `Den Aufnahme-Vault öffnen: ${stagingVaultDir(REPO_NAME)}`,
    );
  }
  console.log(`Verbunden auf Port ${port}.`);

  // Außerhalb des try: die Sprache muss auch nach einem Abbruch zurück.
  let spracheVorher: string | null = null;

  try {
    const gefunden = await spracheSetzen(cdp, "en");
    // Nur merken, was NICHT schon die Aufnahmesprache ist. Beim zweiten Lauf steht dort
    // sonst „en" — der Treiber stellt dann auf seinen eigenen Eingriff zurück und meldet
    // das auch noch als Erfolg. Gemessen am 2026-08-17: danach startete der Arbeits-Vault
    // englisch, und die Ursache lag zwei Läufe zurück.
    spracheVorher = gefunden === "en" ? null : gefunden;
    if (spracheVorher !== null) {
      console.log(
        `Aufnahmesprache auf "en" gestellt (vorher: "${spracheVorher || "(leer)"}").\n` +
          "⚠️ Das wirkt erst nach einem Obsidian-Neustart. Steht die Oberfläche noch\n" +
          "   deutsch, jetzt neu starten und den Lauf wiederholen.",
      );
    }

    await finanzordnerEinstellen(cdp, "Finance");
    await setWindowSize(cdp, FENSTER_BREITE, FENSTER_HOEHE);
    const opts: ShotOptions = {
      outDir,
      captureWidth: CAPTURE_WIDTH,
      thumbWidth: THUMB_WIDTH,
    };

    for (const shot of SHOTS) {
      if (nur && shot.name !== nur) continue;
      process.stdout.write(`  ${shot.name} … `);
      const box = await shot.run(cdp);
      const png = await capture(cdp, box ?? undefined);
      const hinweis = await writeShot(cdp, shot.name, png, {
        ...opts,
        thumb: shot.klasse === "detail",
      });
      console.log(hinweis);
    }
  } finally {
    if (spracheVorher !== null) {
      await spracheSetzen(cdp, spracheVorher).catch(() => undefined);
      console.log(`\nSprache zurückgestellt auf "${spracheVorher || "(leer)"}".`);
    } else {
      console.log(
        "\n⚠️ Sprache steht weiter auf \"en\" — beim Start war sie das bereits, ein Vorwert\n" +
          "   war also nicht zu ermitteln. Sie gilt app-weit: vor dem nächsten Arbeitstag\n" +
          "   in einem beliebigen Vault zurückstellen (localStorage \"language\").",
      );
    }
    await cdp
      .evaluate(`document.getElementById("shots-style")?.remove(); return true;`)
      .catch(() => undefined);
    cdp.close();
  }
}

main().catch((error: unknown) => {
  console.error(`\nAbbruch: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});
