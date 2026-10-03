import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * Code-Self-Test für main.ts — verifiziert dass Slice-6-D2-Required-Calls
 * (Ribbon-Icon, View-Registrierung, Command, Detach) im Source-Code präsent sind.
 * Vollständiger Plugin-Lifecycle-Test wäre ein größerer Mock-Aufwand und liefert
 * für diese strukturellen Zusagen wenig Mehrwert.
 */
describe('main.ts — hub wiring (§1 one frontend)', () => {
  const src = readFileSync(resolve(__dirname, '../src/main.ts'), 'utf8');

  it('importiert die Panels + FinanceHubView/VIEW_TYPE_HUB', () => {
    expect(src).toMatch(/from ['"]\.\/views\/DashboardPanel['"]/);
    expect(src).toMatch(/from ['"]\.\/views\/hub\/FinanceHubView['"]/);
    expect(src).toContain('VIEW_TYPE_HUB');
  });

  it('ruft addRibbonIcon mit chart-pie für Hub-Aktivierung', () => {
    expect(src).toMatch(/addRibbonIcon\(\s*['"]chart-pie['"]/);
    expect(src).toMatch(/t\(['"]ribbon\.openHub['"]\)/);
  });

  it('registriert genau EINEN View (VIEW_TYPE_HUB) mit Panel-Factory', () => {
    expect(src).toMatch(/registerView\(\s*VIEW_TYPE_HUB/);
    expect(src).toContain('new FinanceHubView(');
    // The §1 "one frontend per plugin" invariant: exactly one registerView call.
    expect((src.match(/registerView\(/g) ?? []).length).toBe(1);
  });

  it('addCommand id "open-finance-dashboard" existiert', () => {
    expect(src).toContain("'open-finance-dashboard'");
  });

  it('onunload detacht keine Leaves (Obsidian-Guideline detach-leaves)', () => {
    // Obsidian-Vorgabe: Plugins dürfen ihre Leaves nicht im onunload detachen
    // (das würde das User-Layout zurücksetzen). Siehe ESLint obsidianmd/detach-leaves.
    expect(src).not.toMatch(/detachLeavesOfType/);
  });
});

describe('main.ts — Slice-7-C CSV-Import-Modal wiring', () => {
  const src = readFileSync(resolve(__dirname, '../src/main.ts'), 'utf8');

  it('importiert ImportCSVModal + invalidateKonten', () => {
    expect(src).toMatch(/from ['"]\.\/ui\/importCSVModal['"]/);
    expect(src).toMatch(/from ['"]\.\/state\/konten['"]/);
    expect(src).toContain('ImportCSVModal');
    expect(src).toContain('invalidateKonten');
  });

  it('ruft addRibbonIcon mit file-up für CSV-Import', () => {
    expect(src).toMatch(/addRibbonIcon\(\s*['"]file-up['"]/);
    expect(src).toMatch(/t\(['"]action\.importCsv['"]\)/);
  });

  it('addCommand id "finance-import-csv" existiert', () => {
    expect(src).toContain("'finance-import-csv'");
  });

  it('ruft invalidateKonten() in onload für Cache-Reset', () => {
    expect(src).toMatch(/invalidateKonten\(\)/);
  });
});

describe('main.ts — CSV-Import ist plattformübergreifend', () => {
  const src = readFileSync(resolve(__dirname, '../src/main.ts'), 'utf8');

  /**
   * Umgekehrte Erwartung seit 2026-10-03: hier stand, dass Ribbon-Icon, Kommando
   * und Modal des CSV-Imports hinter `isMobile()`-Guards liegen MÜSSEN. Der Grund
   * dafür war der Importer-Subprozess (`child_process`), und den gibt es nicht
   * mehr — Dateiauswahl, Ablage über den Vault-Adapter und der Importlauf selbst
   * sind node-frei. Ein Guard wäre jetzt eine grundlose Sperre, und drei grüne
   * Tests hätten sie festgehalten.
   */
  it('registriert das Ribbon-Icon ohne Plattform-Guard', () => {
    expect(src).toMatch(/addRibbonIcon\(\s*['"]file-up['"]/);
    expect(src).not.toMatch(
      /if\s*\(\s*!isMobile\(\)\s*\)\s*\{[\s\S]{0,300}addRibbonIcon\(\s*['"]file-up['"]/,
    );
  });

  it('registriert das Kommando ohne Plattform-Guard', () => {
    expect(src).toContain("'finance-import-csv'");
    expect(src).not.toMatch(
      /if\s*\(\s*!isMobile\(\)\s*\)\s*\{[\s\S]{0,500}'finance-import-csv'/,
    );
  });

  it('öffnet das Modal ohne Mobile-Abweisung', () => {
    expect(src).not.toMatch(
      /openImportCSVModal[\s\S]{0,200}if\s*\(\s*isMobile\(\)\s*\)\s*\{[\s\S]{0,200}new Notice/,
    );
  });

  it('lädt kein Node-Modul mehr — auch nicht dynamisch und geguardet', () => {
    // Die Quelle prüfen ist hier die richtige Ebene: `tests/bundle.test.ts` prüft
    // das Ergebnis, dieser Test die Absicht. Beide braucht es (Dach-Befund
    // 2026-10-03: die Quelle kann sauber aussehen, während das Bundle lädt).
    expect(src).not.toMatch(/import\(\s*['"](node:)?(child_process|fs|path|os)['"]/);
  });
});
