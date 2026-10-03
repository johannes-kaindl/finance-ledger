import esbuild from 'esbuild';
import { builtinModules } from 'node:module';

/**
 * Node-Builtins bleiben `external` — als Sicherheitsnetz, nicht als Bedarf.
 *
 * Seit 2026-10-03 lädt der Plugin-Code **kein** Node-Modul mehr: der
 * Importer-Subprozess ist weg, der Importlauf findet im Plugin statt
 * (`runNativeImport`), Schnappschüsse laufen über die Vault-API. Das Bundle ist
 * node-frei, und `tests/bundle.test.ts` wacht darüber.
 *
 * Das frühere Plugin `node-builtin-require` ist damit entfallen: es schrieb
 * dynamische Builtin-Importe auf ein `require`-Shim um, weil esbuild sie bei
 * `format: 'cjs'` untransformiert stehen ließ und Electron sie dann als
 * Browser-ESM auflöste. Ohne solche Importe hat es keinen Gegenstand mehr.
 * Diese Zeilen hier bleiben, damit ein versehentlich wieder eingeführter
 * Builtin-Import als `external` sichtbar scheitert statt mitgebündelt zu werden.
 *
 * `builtin-modules` als Paket wird vom Store-Review beanstandet
 * („should be replaced with an alternative package", Review 0.2.1) — deshalb
 * Nodes eigene Liste.
 */
const builtins = builtinModules.filter(m => !m.startsWith('node:'));
const allBuiltins = [...builtins, ...builtins.map(m => `node:${m}`)];

const watch = process.argv.includes('--watch');

const buildOptions = {
  entryPoints: ['src/main.ts'],
  bundle: true,
  external: ['obsidian', 'electron', ...allBuiltins],
  format: 'cjs',
  target: 'es2020',
  logLevel: 'info',
  sourcemap: watch ? 'inline' : false,
  treeShaking: true,
  outfile: 'main.js',
  minify: !watch,
};

if (watch) {
  const ctx = await esbuild.context(buildOptions);
  await ctx.watch();
  console.log('Watching for changes...');
} else {
  await esbuild.build(buildOptions);
}
