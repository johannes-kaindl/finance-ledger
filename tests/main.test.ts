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

describe('main.ts — Mobile-Readiness Guards', () => {
  const src = readFileSync(resolve(__dirname, '../src/main.ts'), 'utf8');

  it('importiert isMobile() aus platform-utils', () => {
    expect(src).toMatch(/from ['"]\.\/utils\/platform['"]/);
    expect(src).toContain('isMobile');
  });

  it('umschließt addRibbonIcon("file-up", …) mit if (!isMobile())', () => {
    // Match: if (!isMobile()) { … addRibbonIcon('file-up', … }
    expect(src).toMatch(/if\s*\(\s*!isMobile\(\)\s*\)\s*\{[\s\S]{0,300}addRibbonIcon\(\s*['"]file-up['"]/);
  });

  it('umschließt addCommand "finance-import-csv" mit if (!isMobile())', () => {
    expect(src).toMatch(/if\s*\(\s*!isMobile\(\)\s*\)\s*\{[\s\S]{0,500}'finance-import-csv'/);
  });

  it('openImportCSVModal hat Mobile-Notice-Guard mit Early-Return', () => {
    // Inside openImportCSVModal: if (isMobile()) { new Notice(...); return; }
    expect(src).toMatch(/openImportCSVModal[\s\S]{0,200}if\s*\(\s*isMobile\(\)\s*\)\s*\{[\s\S]{0,200}new Notice/);
  });
});
