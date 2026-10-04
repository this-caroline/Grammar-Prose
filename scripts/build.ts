import { mkdir, copyFile, readFile, rm, writeFile } from 'node:fs/promises';

import { build, type Plugin } from 'esbuild';
import { createInstrumenter } from 'istanbul-lib-instrument';

const collectCoverage = process.env.GRAMMAR_PROSE_COVERAGE === '1';
const outputDirectory = collectCoverage ? 'coverage/extension' : 'dist';
const coveragePlugin: Plugin = {
  name: 'typescript-coverage',
  setup(builder) {
    builder.onLoad({ filter: /\.ts$/ }, async ({ path }) => {
      const source = await readFile(path, 'utf8');
      const instrumenter = createInstrumenter({
        parserPlugins: ['typescript'],
        esModules: true,
        coverageGlobalScope: 'globalThis',
        coverageGlobalScopeFunc: false,
      });

      // Instrument before transpiling so Istanbul locations refer to the original TS.
      return { contents: instrumenter.instrumentSync(source, path), loader: 'ts' };
    });
  },
};

await rm(outputDirectory, { recursive: true, force: true });
await mkdir(outputDirectory, { recursive: true });
await build({
  entryPoints: ['src/chrome/background.ts', 'src/chrome/content.ts', 'src/chrome/options.ts'],
  outdir: outputDirectory,
  bundle: true,
  target: 'chrome120',
  format: 'iife',
  plugins: collectCoverage ? [coveragePlugin] : [],
});

for (const file of ['options.html', 'options.css']) {
  await copyFile(`public/${file}`, `${outputDirectory}/${file}`);
}

const packageMetadata = JSON.parse(await readFile('package.json', 'utf8')) as { version: string };
const manifest = JSON.parse(await readFile('public/manifest.json', 'utf8')) as Record<
  string,
  unknown
>;
await writeFile(
  `${outputDirectory}/manifest.json`,
  JSON.stringify({ ...manifest, version: packageMetadata.version }, null, 2) + '\n',
);
