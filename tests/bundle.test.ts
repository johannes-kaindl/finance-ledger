import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'fs';
import { resolve } from 'path';

/**
 * Regression-Guard für den Bundle-Ausgabe-Zustand (2026-08-01).
 *
 * Der CSV-Import war von 2026-05-10 bis 2026-08-01 tot, ohne dass ein Test rot wurde:
 * die Umstellung auf `Platform.isDesktop`-guarded `await import('child_process')`
 * (a13b60c, korrekt für Mobile) hinterließ den dynamischen Import UNtransformiert im
 * cjs-Bundle. Electron löst ihn dann als Browser-ESM auf → "Failed to resolve module
 * specifier 'child_process'", und zwar erst zur Laufzeit im echten Obsidian.
 *
 * Die Source-Form ist richtig so (sie besteht als einzige beide Store-Scan-Regeln) —
 * geprüft wird deshalb hier das Bundle, nicht der Quelltext.
 */
describe('main.js bundle', () => {
  const bundlePath = resolve(__dirname, '..', 'main.js');

  it('existiert (sonst sagt dieser Guard nichts aus)', () => {
    expect(existsSync(bundlePath)).toBe(true);
  });

  it('enthält keinen dynamischen Node-builtin-Import — Electron kann den nicht auflösen', () => {
    const bundle = readFileSync(bundlePath, 'utf8');
    const dynamicBuiltinImports = bundle.match(
      /import\(\s*["'](node:)?(child_process|fs|fs\/promises|path|os|util|stream)["']\s*\)/g,
    );
    expect(dynamicBuiltinImports).toBeNull();
  });

  it('lädt die Node-builtins per require (Electrons CJS-Runtime kann das)', () => {
    const bundle = readFileSync(bundlePath, 'utf8');
    expect(bundle).toContain('require("child_process")');
    expect(bundle).toContain('require("fs")');
  });
});
