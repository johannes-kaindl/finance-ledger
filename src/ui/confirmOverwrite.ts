import type { App } from 'obsidian';
import { confirmAction } from '../vendor/kit-obsidian/confirm';
import { t } from '../i18n/strings';

/** Rückfrage vor dem Neuaufbau (Befehl und beide Re-Import-Knöpfe): er schreibt Journal, Kontenplan und
 *  Eröffnungsbilanz neu und zieht die verwalteten Felder der Konto- und Vertrags-Notizen nach. Das ist
 *  folgenreich genug für eine Frage, aber nicht gefährlich — der eigene Text in den Notizen bleibt. */
export function confirmRebuild(app: App): Promise<boolean> {
  return confirmAction(app, {
    title: t('confirm.rebuild.title'),
    message: [t('confirm.rebuild.message1'), t('confirm.rebuild.message2')],
    confirmLabel: t('confirm.rebuild.confirm'),
    cancelLabel: t('common.cancel'),
    warning: false,
  });
}

/** Rückfrage vor dem Überschreiben gleichnamiger CSVs im Umsatzordner. Die alte Fassung ist danach weg:
 *  die Namen stehen in der Frage, damit man sieht, WAS ersetzt wird. */
export function confirmReplaceCsvs(app: App, names: string[]): Promise<boolean> {
  return confirmAction(app, {
    title: t('confirm.replaceCsv.title'),
    message: [t('confirm.replaceCsv.message', String(names.length)), names.join(', ')],
    confirmLabel: t('confirm.replaceCsv.confirm'),
    cancelLabel: t('common.cancel'),
  });
}
