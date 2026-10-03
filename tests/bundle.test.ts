import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'fs';
import { builtinModules } from 'module';
import { resolve } from 'path';

/**
 * Wächter über das **gebaute** `main.js` (2026-08-01, neu gefasst 2026-10-03).
 *
 * Erste Fassung: Der CSV-Import war von 2026-05-10 bis 2026-08-01 tot, ohne dass
 * ein Test rot wurde — die Umstellung auf `Platform.isDesktop`-guarded
 * `await import('child_process')` hinterließ den dynamischen Import
 * UNtransformiert im cjs-Bundle, und Electron löste ihn als Browser-ESM auf.
 * Damals prüfte dieser Guard, dass die Builtins als `require` im Bundle stehen.
 *
 * Seit 2026-10-03 ist die Erwartung die umgekehrte: das Plugin lädt **kein**
 * Node-Modul mehr. Der Importer-Subprozess ist weg (der Lauf findet im Plugin
 * statt), die Temp-Kopie der CSV-Vorschau ist weg (der Kern parst den Inhalt),
 * das git-Backup ist weg (Schnappschuss über die Vault-API). Damit fallen im
 * Store-Review beide Behavior-Warnungen — `Direct Filesystem Access` und
 * `Shell Execution` —, und genau das hält dieser Guard fest.
 *
 * Geprüft wird das Bundle, nicht der Quelltext: der Dach-Befund vom 2026-10-03
 * lautet, dass die Quelle sauber aussehen kann, während das Bundle ein
 * `require("fs")` trägt.
 */
describe('main.js bundle', () => {
  const bundlePath = resolve(__dirname, '..', 'main.js');

  /** Jede Ladeform eines Node-Builtins: `require("x")` und `import("x")`, mit und ohne `node:`. */
  function builtinLoadPattern(): RegExp {
    const names = builtinModules
      .filter((m) => !m.startsWith('node:'))
      .map((m) => m.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
      .join('|');
    return new RegExp(`(?:require|import)\\(\\s*(["'\`])(?:node:)?(?:${names})\\1\\s*\\)`, 'g');
  }

  it('existiert (sonst sagt dieser Guard nichts aus)', () => {
    expect(existsSync(bundlePath)).toBe(true);
  });

  it('das Suchmuster würde einen Node-Import FINDEN — Gegenprobe vor dem Befund', () => {
    // Ohne diese Probe ist „keine Treffer" nicht von „Muster kaputt" zu
    // unterscheiden (CORE-TEST-13/16). Die Beispiele sind genau die Formen, die
    // esbuild erzeugt bzw. erzeugte.
    const proben = [
      'const x = require("fs");',
      "const y = require('child_process');",
      'await import("node:fs/promises")',
      'await import( "path" )',
    ];
    for (const probe of proben) {
      expect(probe.match(builtinLoadPattern()), probe).not.toBeNull();
    }
    // Und eine Nicht-Probe: ein Feldname `path` ist kein Modul-Load.
    expect('{ path: "a/b", os: 1 }'.match(builtinLoadPattern())).toBeNull();
  });

  it('lädt kein einziges Node-Builtin — weder per require noch per import', () => {
    const bundle = readFileSync(bundlePath, 'utf8');

    const treffer = bundle.match(builtinLoadPattern());

    // Die Treffer mitausgeben: eine nackte Null-Erwartung sagt nicht, WAS gefunden wurde.
    expect(treffer ? [...new Set(treffer)] : null).toBeNull();
  });

  it('nennt die abgelösten Subprozess-Module nicht mehr', () => {
    const bundle = readFileSync(bundlePath, 'utf8');

    // Kein `spawn`/`execFile`-Aufruf, auch nicht über eine Referenz: beide gab es
    // nur im Importer-Subprozess und im git-Backup.
    expect(bundle).not.toMatch(/\bexecFile\s*\(/);
    expect(bundle).not.toMatch(/\bspawn\s*\(/);
  });
});
