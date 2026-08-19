import { describe, it, expect } from 'vitest';
import { makeFakeEl } from '../__mocks__/obsidian';
import { renderDiagnosticsBanner } from '../../src/views/diagnosticsBanner';
import type { LedgerDiagnostics } from '../../src/parser/ledger';

type FakeEl = ReturnType<typeof makeFakeEl>;

const clean: LedgerDiagnostics = { skippedLines: [], unbalanced: [], suspiciousAmounts: [] };

describe('renderDiagnosticsBanner', () => {
  it('renders nothing and returns null for clean diagnostics', () => {
    const parent = makeFakeEl('div');
    const banner = renderDiagnosticsBanner(parent as unknown as HTMLElement, clean);
    expect(banner).toBeNull();
    expect(parent.children).toHaveLength(0);
  });

  it('renders a warning banner listing the issues', () => {
    const parent = makeFakeEl('div');
    renderDiagnosticsBanner(parent as unknown as HTMLElement, {
      skippedLines: ['Ausgaben:X 10,00 EUR'],
      unbalanced: [{ date: '2025-01-01', counterparty: 'Foo', residualEur: -10 }],
      suspiciousAmounts: [],
    });
    const banner = (parent.children as FakeEl[]).find(
      c => typeof c.cls === 'string' && c.cls.includes('fl-diagnostics-banner'),
    );
    expect(banner).toBeDefined();
    expect(banner!.text).toMatch(/ignored/i);
    expect(banner!.text).toMatch(/unbalanced/i);
  });
});
