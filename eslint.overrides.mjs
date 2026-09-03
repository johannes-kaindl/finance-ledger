// Repo-eigene ESLint-Abweichungen — der EINZIGE Ort dafuer. Der Kern
// (eslint.config.mjs) ist template-verwaltet, Inline-disables blockt das Lint-Gate.
// Jeder Override braucht eine Begruendung im Kommentar.
//
// Zwei Klassen, zwei Preise (Details: _docs/docs/obsidian-plugin-publishing.md):
// - Kosmetik-/Benennungsregeln (z. B. ui/sentence-case bei Eigennamen/API-Namen):
//   Override ist die richtige Antwort und kostet nichts — der Scanner hat keinen
//   Mangel gefunden, sondern eine Konvention falsch angelegt.
// - Faehigkeitsregeln (z. B. settings-tab/prefer-setting-definitions): der Scanner
//   bewertet den Mangel, nicht die Begruendung — ein Override hier ist gestundete
//   Schuld und kostet die Store-Wertung ("Satisfactory" statt "Passed").
//   Marker fuer solche Faelle: `// STORE-SCHULD:` + wo die Abloesung geplant ist.
export default [
  {
    files: ["src/**/*.ts"],
    languageOptions: {
      parserOptions: {
        project: ["./tsconfig.json"],
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      // no-undef ist auf TypeScript-Projekten redundant (der TS-Compiler prüft
      // undefinierte Bezeichner; typecheck ist Commit-Gate) und meldet sonst
      // Node-Globals wie `process`/`Buffer` falsch-positiv. Empfehlung von
      // typescript-eslint: für .ts ausschalten.
      "no-undef": "off",
      // sentence-case mit projekt-spezifischen Akronymen. `acronyms` ersetzt die
      // Defaults der Regel, daher die komplette Default-Liste + TBC (= To Be
      // Categorized; Domänenbegriff, der auch am Satzanfang als Akronym erhalten
      // bleiben muss). PATH (Env-Var) NICHT als Akronym (das Matching ist
      // case-insensitiv und würde jedes Wort "path" großschreiben) — stattdessen
      // als case-sensitiver ignoreWord, der nur das echte "PATH" schützt.
      "obsidianmd/ui/sentence-case": ["error", {
        acronyms: [
          "API", "HTTP", "HTTPS", "URL", "DNS", "TCP", "IP", "SSH", "TLS", "SSL",
          "FTP", "SFTP", "SMTP", "JSON", "XML", "HTML", "CSS", "PDF", "CSV", "YAML",
          "SQL", "PNG", "JPG", "JPEG", "GIF", "SVG", "MFA", "OAuth", "JWT", "LDAP",
          "SAML", "SDK", "IDE", "CLI", "GUI", "CRUD", "REST", "SOAP", "CPU", "GPU",
          "RAM", "SSD", "USB", "UI", "OK", "RSS", "ID", "UUID", "GUID", "SHA",
          "ASCII", "DOM", "CDN", "FAQ", "AI", "ML", "LLM",
          "TBC",
        ],
        ignoreWords: ["PATH"],
      }],
    },
  },
  {
    // Optionales Desktop-Integrations-Feature (Zwei-Modi-Architektur): Importer-
    // Subprozess, Git-Backup, CSV-Copy. Alle Node-Builtin-Zugriffe sind
    // dynamische import()s hinter `Platform.isDesktop`-Guards — der Kern bleibt
    // mobile-fähig (isDesktopOnly:false), diese Module werfen/skippen auf Mobile.
    // Die generische import/no-nodejs-modules-Regel kennt den Obsidian-Guard-
    // Pattern nicht; daher hier die tatsächlich genutzten Builtins explizit
    // erlauben (restlicher Code bleibt voll durch die Regel geschützt).
    files: [
      "src/categorizer-rules/spawnImporter.ts",
      "src/categorizer-rules/gitBackup.ts",
      "src/ui/importCSVModal.ts",
      "src/ui/settingsTab.ts",
    ],
    rules: {
      // `os` kam 2026-08-01 dazu: die Import-Vorschau legt die CSV in einer Temp-Kopie
      // ab (os.tmpdir), weil `File.path` seit Electron 32 nicht mehr existiert.
      "import/no-nodejs-modules": ["error", { allow: ["child_process", "fs", "fs/promises", "os", "path"] }],
      // Dieselbe Ausnahme fuer die gleichnamige Regel des Store-Scanners, die mit
      // eslint-plugin-obsidianmd 0.4.x dazukam (andere Regel-ID, gleiche Sache).
      //
      // KEINE gestundete Schuld, sondern ein False Positive: die Regel empfiehlt in ihrer
      // eigenen Meldung "use a dynamic import() ... guarded by Platform.isDesktop" — und
      // genau das steht im Code (`const { mkdtemp } = await import('fs/promises')`,
      // importCSVModal.ts:40). Sie sieht den Modulnamen, nicht die Importform.
      // Anders als die generische Regel nimmt sie keine `allow`-Liste (Schema: 0 Optionen),
      // deshalb "off" statt einer Einschraenkung. Der Schutz fuer den uebrigen Code bleibt:
      // dieser Block gilt nur fuer die vier Desktop-Integrations-Dateien oben.
      "obsidianmd/no-nodejs-modules": "off",
    },
  },
  {
    files: ["src/ui/settingsTab.ts"],
    rules: {
      // STORE-SCHULD: Der Settings-Tab ist imperativ (`new Setting(containerEl)`) statt
      // deklarativ ueber `getSettingDefinitions()`. Folge fuer Nutzer ab Obsidian 1.13:
      // die Einstellungen dieses Plugins erscheinen NICHT in Obsidians Settings-Suche.
      // Das ist ein echter Faehigkeitsmangel, keine Konventionsfrage — deshalb dieser
      // Marker und kein stilles Abschalten.
      //
      // Abloesung ist vorgezeichnet, nicht offen: der Kit-Baustein
      // `kit-obsidian/settings_walker.ts` loest genau das und laeuft bereits in
      // 3d-codeblocks und anysource-sideloader. Uebernahme ist ein eigener Posten
      // (Task "Settings-Tab auf getSettingDefinitions umstellen"), kein Nebenher-Umbau
      // in einem Patch-Release.
      //
      // gilt-solange: der Settings-Tab imperativ bleibt. Faellt mit der Kit-Uebernahme.
      "obsidianmd/settings-tab/prefer-setting-definitions": "off",
    },
  },
];
