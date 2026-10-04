import { randomUUID, createHash } from 'node:crypto';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { cpus, platform, arch } from 'node:os';
import { parseArgs } from 'node:util';

import { LocalOllama, MalformedModelOutput } from '../adapters/ollama';
import { REVIEW_TIMEOUT_MS } from '../application/review';
import { policy } from '../domain/policy';
import { completedText, emptyMemory, inspectReview } from '../domain/review';
import { parseDataset } from './dataset';
import { readModelDigest } from './model-digest';

const { values } = parseArgs({
  args: process.argv.slice(2).filter((argument) => argument !== '--'),
  options: {
    model: { type: 'string' },
    dataset: { type: 'string', default: 'evals/synthetic.json' },
    inspect: { type: 'boolean' },
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
  const modelDigest = await readModelDigest(model);

  for (const item of dataset.cases) {
    const started = performance.now();
    const text = completedText(item.text);

    if (!text.trim()) {
      results.push({
        id: item.id,
        completed: false,
        outcome: 'not-reviewed',
        schemaValid: false,
        actionable: item.expectedCategories.length > 0,
        latencyMs: 0,
      });
      continue;
    }

    try {
      const raw = await port.review(
        text,
        emptyMemory(),
        model,
        AbortSignal.timeout(REVIEW_TIMEOUT_MS),
      );

      if (values.inspect) {
        console.log(`Case ${item.id}: ${JSON.stringify(raw)}`);
      }

      let inspection;

      try {
        inspection = inspectReview(raw, text, emptyMemory());
      } catch {
        throw new MalformedModelOutput('Invalid review shape.');
      }

      const { suggestions, schemaValid, rawCount, rejections } = inspection;

      const observed = [...new Set(suggestions.map((suggestion) => suggestion.category))].sort();
      results.push({
        id: item.id,
        completed: true,
        outcome: schemaValid ? 'valid' : 'malformed-output',
        schemaValid,
        rawCount,
        rejections,
        actionable: item.expectedCategories.length > 0,
        latencyMs: Math.round(performance.now() - started),
        suggestions: suggestions.length,
        expectedCategoriesMatch:
          JSON.stringify(observed) === JSON.stringify([...new Set(item.expectedCategories)].sort()),
      });
    } catch (error) {
      // Transport/model error text can contain arbitrary data. Only store a fixed outcome.
      results.push({
        id: item.id,
        completed: error instanceof MalformedModelOutput,
        outcome: error instanceof MalformedModelOutput ? 'malformed-output' : 'transport-error',
        schemaValid: false,
        actionable: item.expectedCategories.length > 0,
        latencyMs: Math.round(performance.now() - started),
      });
    }
  }

  const hash = (text: string) => createHash('sha256').update(text).digest('hex');
  const report = {
    version: 2,
    runId: randomUUID(),
    modelDigest,
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
