import { DEFAULT_PATH_SETTINGS, type FinancePathSettings } from '../state/financePaths';
import type { SignMode, ColorScheme } from '../views/helpers';

export interface PluginData extends FinancePathSettings {
  lastReimportTimestamp: string | null;
  rulesAddedSinceReimport: number;
  importerCwd: string;
  importerTimeoutMs: number;
  uvBinaryPath: string; // '' = auto-detect
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
  importerTimeoutMs: 120_000,
  uvBinaryPath: '',
  signMode: 'intuitive',
  colorScheme: 'classic',
};
