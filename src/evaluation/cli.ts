import { createHash } from 'node:crypto';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { cpus, platform, arch } from 'node:os';
import { parseArgs } from 'node:util';

import { LocalOllama } from '../adapters/ollama';
import { REVIEW_TIMEOUT_MS, reviewWriting } from '../application/review';
import { policy } from '../domain/policy';
import { emptyMemory } from '../domain/review';
import { parseDataset } from './dataset';

const { values } = parseArgs({
  args: process.argv.slice(2).filter((argument) => argument !== '--'),
  options: {
    model: { type: 'string' },
    dataset: { type: 'string', default: 'evals/synthetic.json' },
    'dry-run': { type: 'boolean' },
  },
});
const source = await readFile(values.dataset, 'utf8');
const dataset = parseDataset(JSON.parse(source) as unknown);

if (values['dry-run']) {
  console.log(
    `Validated ${dataset.cases.length} ${dataset.provenance} cases. No inference requested.`,
  );
} else {
  if (!values.model?.trim()) {
    throw new Error(
      'Provide --model with an installed local model, or use --dry-run. See docs/evaluation.md.',
    );
  }

  const model = values.model;
  const port = new LocalOllama();
  const results = [];

  for (const item of dataset.cases) {
    const started = performance.now();

    try {
      const suggestions = await reviewWriting(
        port,
        item.text,
        emptyMemory(),
        model,
        AbortSignal.timeout(REVIEW_TIMEOUT_MS),
      );
      const observed = [...new Set(suggestions.map((suggestion) => suggestion.category))].sort();
      results.push({
        id: item.id,
        completed: true,
        latencyMs: Math.round(performance.now() - started),
        suggestions: suggestions.length,
        expectedCategoriesMatch:
          JSON.stringify(observed) === JSON.stringify([...new Set(item.expectedCategories)].sort()),
      });
    } catch {
      // Transport/model error text can contain arbitrary data. Only store a fixed outcome.
      results.push({
        id: item.id,
        completed: false,
        latencyMs: Math.round(performance.now() - started),
      });
    }
  }

  const hash = (text: string) => createHash('sha256').update(text).digest('hex');
  const report = {
    version: 1,
    createdAt: new Date().toISOString(),
    model,
    promptHash: hash(policy),
    datasetHash: hash(source),
    provenance: dataset.provenance,
    hardware: { platform: platform(), architecture: arch(), cpu: cpus()[0]?.model },
    options: { temperature: 0, think: false },
    semanticAssessment: 'requires-human-review',
    results,
  };
  await mkdir('artifacts', { recursive: true });
  const output = `artifacts/evaluation-${Date.now()}.json`;
  await writeFile(output, JSON.stringify(report, null, 2) + '\n');
  console.log(
    `Wrote ${output}. ${results.filter((result) => result.completed).length}/${results.length} requests completed. Meaning preservation needs human review.`,
  );
}
