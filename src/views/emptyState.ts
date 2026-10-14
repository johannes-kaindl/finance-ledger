import type { App } from 'obsidian';
import { t } from '../i18n/strings';

const PLUGIN_ID = 'finance-ledger';
const IMPORT_COMMAND = `${PLUGIN_ID}:finance-import-csv`;

export interface EmptyStateAction {
  label: string;
  onClick: () => void;
}

/**
 * Leerzustand nach UI-STANDARD §8: `fl-empty` plus kurzer Text, optional genau ein `mod-cta` als Einstieg.
 * Ein Absatz „Konfiguriere …" ohne Knopf lässt den Nutzer stehen; mit dem Knopf ist der nächste Schritt
 * ein Klick.
 */
export function renderEmptyState(parent: HTMLElement, message: string, action?: EmptyStateAction): HTMLElement {
  const box = parent.createDiv({ cls: 'fl-empty' });
  box.createEl('p', { text: message });
  if (action) {
    const btn = box.createEl('button', { text: action.label, cls: 'mod-cta' });
    btn.onclick = action.onClick;
  }
  return box;
}

/** Öffnet die Einstellungen dieses Plugins. Die Settings-API (`app.setting`) ist intern und
 *  undokumentiert, deshalb defensiv: fehlt sie, passiert nichts statt eines Fehlers. */
export function openPluginSettings(app: App): void {
  const setting = (app as unknown as { setting?: { open?: () => void; openTabById?: (id: string) => void } }).setting;
  try {
    setting?.open?.();
    setting?.openTabById?.(PLUGIN_ID);
  } catch {
    // Die Einstellungen sind kein Muss; ein Fehler hier darf den Leerzustand nicht zerstören.
  }
}

/** Der Leerzustand „Plugin nicht eingerichtet": Hinweis plus Knopf auf die Einstellungen. */
export function renderNotConfigured(parent: HTMLElement, app: App, message: string): HTMLElement {
  return renderEmptyState(parent, message, { label: t('empty.openSettings'), onClick: () => { openPluginSettings(app); } });
}

/** Der Leerzustand „kein Journal": Hinweis plus Knopf auf den CSV-Import, der erste Schritt zu einem Journal. */
export function renderNoJournal(parent: HTMLElement, app: App, message: string): HTMLElement {
  return renderEmptyState(parent, message, {
    label: t('dashboard.action.importCsv'),
    onClick: () => {
      const commands = (app as unknown as { commands?: { executeCommandById?: (id: string) => boolean } }).commands;
      commands?.executeCommandById?.(IMPORT_COMMAND);
    },
  });
}
