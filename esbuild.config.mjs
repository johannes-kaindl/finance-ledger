import esbuild from 'esbuild';
import builtins from 'builtin-modules';

const watch = process.argv.includes('--watch');

// Node-builtins in beiden Formen abdecken (`fs` UND `node:fs`).
const allBuiltins = [...builtins, ...builtins.map(m => `node:${m}`)];
const escapeRe = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const builtinFilter = new RegExp(`^(node:)?(${builtins.map(escapeRe).join('|')})$`);

/**
 * Die Desktop-Module (spawnImporter, gitBackup, importCSVModal, settingsTab) laden
 * child_process/fs/path über `Platform.isDesktop`-guarded `await import()`. Das ist die
 * einzige Source-Form, die beide Store-Scan-Regeln besteht (statischer Import bricht
 * obsidianmd/no-nodejs-modules, `require()` bricht @typescript-eslint/no-require-imports).
 *
 * Nur: esbuild lässt einen dynamischen `import("child_process")` bei format:'cjs'
 * UNtransformiert im Bundle stehen, und Electron löst ihn dann als Browser-ESM auf →
 * "Failed to resolve module specifier 'child_process'". Genau daran war der CSV-Import
 * seit der Mobile-Load-Umstellung (a13b60c, 2026-05-10) tot.
 *
 * Dieses Plugin schreibt den dynamischen Builtin-Import auf ein CJS-Shim um, das intern
 * `require()` nutzt (require ist in Electrons CJS-Runtime vorhanden, nur import() bricht).
 * Ergebnis: Source store-sauber (import), Bundle runtime-sicher (require).
 *
 * Übernommen aus `vault-rag/esbuild.config.mjs` (`node-builtin-require`, 2026-07-24) —
 * dort für `node:`-präfixierte Importe, hier zusätzlich für die blanke Form.
 */
const nodeBuiltinRequire = {
  name: 'node-builtin-require',
  setup(build) {
    build.onResolve({ filter: builtinFilter }, args => {
      // Nur den dynamic import umleiten; das require IM Shim (kind "require-call") und
      // statische Imports bleiben normal external — sonst Auflösungs-Endlosschleife.
      if (args.kind === 'dynamic-import') return { path: args.path, namespace: 'node-builtin' };
      return { path: args.path, external: true };
    });
    build.onLoad({ filter: /.*/, namespace: 'node-builtin' }, args => ({
      contents: `module.exports = require(${JSON.stringify(args.path)});`,
      loader: 'js',
    }));
  },
};

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
  plugins: [nodeBuiltinRequire],
};

if (watch) {
  const ctx = await esbuild.context(buildOptions);
  await ctx.watch();
  console.log('Watching for changes...');
} else {
  await esbuild.build(buildOptions);
}
