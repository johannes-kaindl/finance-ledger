import { DEFAULT_PATH_SETTINGS, type FinancePathSettings } from '../state/financePaths';
import type { SignMode, ColorScheme } from '../views/helpers';

export interface PluginData extends FinancePathSettings {
  lastReimportTimestamp: string | null;
  rulesAddedSinceReimport: number;
  /**
   * Pfad zum Importer-Repo — nur noch für den kopierbaren CLI-Befehl.
   *
   * Der Importlauf selbst findet im Plugin statt (`runNativeImport`); das CLI
   * braucht es für die Berichte und Dimensions-Notizen (Port-Etappen E4–E7).
   */
  importerCwd: string;
  // F1 — Vorzeichen- & Farb-Darstellung (Default intuitiv/klassisch dreht die
  // rohe hledger-Optik auf Einnahmen +/grün, Ausgaben −/rot).
  signMode: SignMode;
  colorScheme: ColorScheme;
}

export const DEFAULT_PLUGIN_DATA: PluginData = {
  ...DEFAULT_PATH_SETTINGS,
  lastReimportTimestamp: null,
  rulesAddedSinceReimport: 0,
  importerCwd: '',
  signMode: 'intuitive',
  colorScheme: 'classic',
};
