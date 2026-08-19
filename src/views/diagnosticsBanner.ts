import { summarizeDiagnostics } from './helpers';
import type { LedgerDiagnostics } from '../parser/ledger';

/**
 * Render a dezenter, non-blocking warning banner at the top of a view when the
 * journal had non-fatal parse issues, so silent data problems become visible.
 * Returns the banner element, or `null` when the journal parsed cleanly.
 *
 * Shared across views (§1 Hub-Migration will reuse it) — native `createDiv` +
 * `setText`, no innerHTML (§2).
 */
export function renderDiagnosticsBanner(
  parent: HTMLElement,
  diagnostics: LedgerDiagnostics,
): HTMLElement | null {
  const message = summarizeDiagnostics(diagnostics);
  if (!message) return null;
  const banner = parent.createDiv({ cls: 'fl-diagnostics-banner' });
  banner.setAttribute('role', 'status');
  banner.setText(message);
  return banner;
}
