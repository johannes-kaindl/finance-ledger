---
paths:
  - "src/core/snapshot/**"
  - "tests/core/snapshot/**"
---

# Schnappschüsse nach Großvater-Vater-Sohn

Vor jedem Schreibvorgang an den Categorizer-Regeln entsteht ein Schnappschuss: eine
JSON-Datei unter `<financeRoot>/.fl-snapshots/` mit dem Stand **vor** dem Schreiben.
Aufbewahrt wird nach GFS (Policy 6 heute / 7 Tage / 4 Wochen / 6 Monate), nicht „die letzten N". Die Auswahl ist `selectGfsRetention` aus dem Kit (code-kit `rotation`, vendort nach `src/vendor/kit/rotation.ts`, seit 2026-10-12; vorher eine lokale Fassung, deren Golden-Tabellen in `tests/core/snapshot/rotation.test.ts` weiterleben). Sie ist eine pure Funktion über Zeitstempel, ohne Dateizugriff; den Zeitpunkt liest der Aufrufer aus dem Dateinamen, nicht aus der mtime: ein Sync oder ein Restore setzt mtimes neu und würde die Rotation verfälschen.

Der Schnitt stammt aus der `settings-assistant`-Spec (Entscheidung Johannes 2026-10-03). **Unbekannt heißt erhalten, und zwar strenger als das Kit:** `timeFromStampedName` findet den Stempel irgendwo im Namen, also bekämen `rules-<Stempel>.txt`, `….json.bak` und Sync-Konfliktkopien wie `… (1).json` eine Zeit und würden gelöscht. `rotationTime` in `ruleSnapshot.ts` nimmt deshalb nur Namen in die Aufbewahrung, die den Rundlauf Name → Zeit → Name bestehen (`stampedName(t, { prefix: "rules-", suffix: ".json" }) === name`); `tests/core/snapshot/ruleSnapshot.test.ts` hält das fest. Ein Stempel, der kein echter Zeitpunkt ist (Monat 13), bleibt ebenfalls liegen.

Vorgänger war ein `git commit` im Vault, der **nie lief** — der einzige Weg dorthin war ein
`options.vaultPath`, das kein Produktiv-Aufrufer setzte. Getestet war die Funktion mit neun
Tests, aufgerufen wurde sie nicht.
