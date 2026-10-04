import { readFile, writeFile } from 'node:fs/promises';
import { parseArgs } from 'node:util';

import { scoreRun } from './scoring';

const { values } = parseArgs({
  args: process.argv.slice(2).filter((argument) => argument !== '--'),
  options: { run: { type: 'string' }, scores: { type: 'string' }, output: { type: 'string' } },
});

if (!values.run || !values.scores || !values.output) {
  throw new Error('Provide --run, --scores, and --output.');
}

const run: unknown = JSON.parse(await readFile(values.run, 'utf8'));
const scores: unknown = JSON.parse(await readFile(values.scores, 'utf8'));
const report = scoreRun(run, scores);
await writeFile(values.output, JSON.stringify(report, null, 2) + '\n');
console.log(`Quality decision: ${report.decision}. Other release gates remain separate.`);
