import { runImporter } from '../categorizer-rules/spawnImporter';
import { isMobile } from '../utils/platform';
import { summarizeStderr } from '../views/helpers';

export interface KontoSpec {
  id: string;
  iban: string;
  ledger_account: string;
  bank: string;
  konto_rolle: string;
  csv_schema: string;
  aliases: string[];
  aktiv: boolean;
}

export interface KontenLoadDeps {
  importerCwd: string;
  uvBinaryPath: string | null;
}

const LIST_KONTEN_TIMEOUT_MS = 5_000;

let cached: KontoSpec[] | null = null;

export async function loadKonten(deps: KontenLoadDeps): Promise<KontoSpec[]> {
  if (cached) return cached;
  if (isMobile()) {
    throw new Error(
      'loadKonten ist nur auf Desktop verfügbar (benötigt Importer-Subprozess). Bitte auf Desktop wechseln.',
    );
  }
  const result = await runImporter(
    deps.importerCwd,
    deps.uvBinaryPath,
    LIST_KONTEN_TIMEOUT_MS,
    undefined,
    ['list-konten', '--aktiv-only'],
  );
  if (result.exitCode !== 0) {
    throw new Error(`list-konten failed (exit ${result.exitCode}): ${summarizeStderr(result.stderr)}`);
  }
  let parsed: KontoSpec[];
  try {
    parsed = JSON.parse(result.stdout) as KontoSpec[];
  } catch (err) {
    throw new Error(`list-konten returned invalid JSON: ${err instanceof Error ? err.message : String(err)}`);
  }
  cached = parsed;
  return parsed;
}

export function invalidateKonten(): void {
  cached = null;
}
