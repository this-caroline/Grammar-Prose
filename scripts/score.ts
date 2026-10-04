import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

import { build } from 'esbuild';

await build({
  entryPoints: ['src/evaluation/score-cli.ts'],
  bundle: true,
  platform: 'node',
  format: 'esm',
  outfile: 'artifacts/score.mjs',
});
await import(pathToFileURL(resolve('artifacts/score.mjs')).href);
