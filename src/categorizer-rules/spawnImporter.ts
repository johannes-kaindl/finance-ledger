import { Platform } from 'obsidian';
import { t } from '../i18n/strings';

/**
 * Argumente für einen vollständigen Importlauf.
 *
 * Ohne Flags schreibt der Importer nur Journal, Kontenplan, Eröffnungsbilanz,
 * Konto- und Vertrags-Notizen sowie den Report. Alle Auswertungen — Monats-,
 * Quartals- und Jahresberichte, Kategorie-, Empfänger-, Tx-Typ- und
 * Mandats-Notizen — entstehen ausschließlich auf Anforderung. Das Plugin rief
 * ihn bis 2026-08-01 nackt auf; nach einem Import über die Oberfläche blieben
 * die Berichte deshalb auf altem Stand.
 *
 * Bewusst NICHT enthalten: `--all-sparziele-bodies` und `--all-vertraege-bodies`
 * schreiben Notizen ohne Marker um — das ist eine einmalige Migration, kein
 * Schritt, der bei jedem Import ungefragt laufen darf.
 *
 * Laufzeit gemessen (1.576 Buchungen, 147 berührte Dateien): ~10 s, also weit
 * innerhalb des Standard-Timeouts.
 */
export const FULL_IMPORT_ARGS: readonly string[] = [
  '--all-aggregates',
  '--all-kategorie-notes',
  '--all-empfaenger-notes',
  '--all-tx-typ-notes',
  '--all-mandate-notes',
  '--all-sparziele',
  '--all-categorizer-rule-bodies',
];

export interface ImporterResult {
  exitCode: number;
  stdout: string;
  stderr: string;
  durationMs: number;
}

function getUvFallbackPaths(): string[] {
  const home = (typeof process !== 'undefined' && process.env?.HOME) || '/root';
  return [
    '/usr/local/bin/uv',
    '/opt/homebrew/bin/uv',
    `${home}/.local/bin/uv`,
    `${home}/.cargo/bin/uv`,
  ];
}

async function tryFindUvBinary(): Promise<string> {
  // Desktop-only (Node-Subprozess-API). Guard zugleich Mobile-Safety + macht den
  // dynamischen Node-Import für eslint (no-nodejs-modules) erkennbar erlaubt.
  if (!Platform.isDesktop) {
    throw new Error('uv lookup is available on desktop only.');
  }
  const { spawn } = await import('child_process');
  const { access, constants } = await import('fs/promises');
  const fallbackPaths = getUvFallbackPaths();

  // Try PATH first
  try {
    await new Promise<void>((resolve, reject) => {
      const probe = spawn('uv', ['--version'], { stdio: 'ignore' });
      probe.on('close', (code) => (code === 0 ? resolve() : reject(new Error('non-zero'))));
      probe.on('error', reject);
    });
    return 'uv';
  } catch {
    // fall through to common paths
  }

  for (const candidate of fallbackPaths) {
    try {
      await access(candidate, constants.X_OK);
      return candidate;
    } catch {
      // not found/executable
    }
  }

  throw new Error(
    `uv binary nicht gefunden. Bitte Plugin-Settings öffnen → "uv-Binary-Pfad" eintragen (z.B. /usr/local/bin/uv). ` +
    `Geprüfte Pfade: uv (PATH), ${fallbackPaths.join(', ')}`,
  );
}

export async function runImporter(
  importerCwd: string,
  uvBinaryPath: string | null = null,
  timeoutMs = 120_000,
  onProgress?: (line: string) => void,
  args: string[] = [],
  /**
   * Zusätzliche Umgebung für den Subprozess — insbesondere `FINANCE_VAULT`, damit der
   * Importer im richtigen Vault arbeitet. Fehlt sie, nimmt er still seinen eigenen
   * Fallback-Ordner: Duplikat-Erkennung ohne Vergleichsbasis, Ausgaben außerhalb des
   * Vaults, Exit-Code 0. Siehe `buildImporterEnv` in `state/financePaths.ts`.
   */
  extraEnv: Record<string, string> = {},
): Promise<ImporterResult> {
  if (!Platform.isDesktop) {
    throw new Error(
      'runImporter ist nur auf Desktop verfügbar (Subprozess-API auf Mobile nicht unterstützt). Bitte auf Desktop wechseln.',
    );
  }

  const { spawn } = await import('child_process');

  // Ein toter `importerCwd` (umgezogenes/gelöschtes Repo) meldet sich sonst als
  // "spawn <uv-pfad> ENOENT" — die Meldung zeigt aufs uv-Binary, obwohl das
  // Arbeitsverzeichnis fehlt. Vorher prüfen und die echte Ursache benennen.
  const { existsSync } = await import('fs');
  if (!existsSync(importerCwd)) {
    throw new Error(t('error.importerCwdMissing', importerCwd, t('settings.importerCwd.name')));
  }

  const uvBin = uvBinaryPath && uvBinaryPath.trim()
    ? uvBinaryPath.trim()
    : await tryFindUvBinary();

  const start = Date.now();

  return new Promise((resolve, reject) => {
    const child = spawn(uvBin, ['run', 'python', '-m', 'importer.cli', ...args], {
      cwd: importerCwd,
      // Bestehende Umgebung behalten (uv braucht PATH/HOME), Vault-Variablen ergänzen.
      env: { ...process.env, ...extraEnv },
    });

    let stdout = '';
    let stderr = '';
    let settled = false;

    const timer = window.setTimeout(() => {
      if (settled) return;
      settled = true;
      child.kill('SIGTERM');
      reject(new Error(`Importer timeout nach ${timeoutMs}ms`));
    }, timeoutMs);

    child.stdout.on('data', (chunk: Buffer) => {
      const text = chunk.toString();
      stdout += text;
      if (onProgress) {
        for (const line of text.split('\n')) {
          if (line.trim()) onProgress(line);
        }
      }
    });

    child.stderr.on('data', (chunk: Buffer) => {
      stderr += chunk.toString();
    });

    child.on('close', (code) => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timer);
      resolve({ exitCode: code ?? 1, stdout, stderr, durationMs: Date.now() - start });
    });

    child.on('error', (err) => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timer);
      reject(err);
    });
  });
}
