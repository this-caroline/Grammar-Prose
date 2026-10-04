import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

import { build } from 'esbuild';

await build({
  entryPoints: ['src/evaluation/cli.ts'],
  bundle: true,
  platform: 'node',
  format: 'esm',
  outfile: 'artifacts/evaluate.mjs',
});
await import(pathToFileURL(resolve('artifacts/evaluate.mjs')).href);
