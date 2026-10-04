import { readFile } from 'node:fs/promises';

import { test, expect } from 'vitest';

import { parseDataset } from '../src/evaluation/dataset';

const valid = {
  version: 1,
  provenance: 'synthetic',
  cases: [{ id: 'example', text: 'Hello.', expectedCategories: [], meaning: 'A greeting.' }],
};
test('evaluation datasets require explicit provenance, labels, and unique safe IDs', () => {
  expect(parseDataset(valid)).toEqual(valid);

  for (const value of [
    null,
    { ...valid, provenance: 'personal' },
    { ...valid, cases: [] },
    { ...valid, cases: [...valid.cases, ...valid.cases] },
    { ...valid, cases: [{ ...valid.cases[0], text: 'a'.repeat(6001) }] },
  ]) {
    expect(() => parseDataset(value)).toThrow();
  }
});

test.each(['synthetic', 'foundation-regressions'])(
  'checked-in %s dataset satisfies the evaluation contract',
  async (datasetName) => {
    const source = await readFile(new URL(`../evals/${datasetName}.json`, import.meta.url), 'utf8');
    const dataset = parseDataset(JSON.parse(source) as unknown);

    expect(dataset.provenance).toBe('synthetic');
  },
);

test.each([
  { label: 'case record', value: null },
  { label: 'id type', value: { ...valid.cases[0], id: 1 } },
  { label: 'id characters', value: { ...valid.cases[0], id: 'Unsafe ID' } },
  { label: 'text type', value: { ...valid.cases[0], text: null } },
  { label: 'blank text', value: { ...valid.cases[0], text: '  ' } },
  { label: 'category array', value: { ...valid.cases[0], expectedCategories: 'grammar' } },
  { label: 'category value', value: { ...valid.cases[0], expectedCategories: ['unknown'] } },
  { label: 'meaning type', value: { ...valid.cases[0], meaning: null } },
  { label: 'blank meaning', value: { ...valid.cases[0], meaning: '  ' } },
])('evaluation rejects invalid $label', ({ value }) => {
  expect(() => parseDataset({ ...valid, cases: [value] })).toThrow('Invalid evaluation case.');
});

test('evaluation preserves inclusive limits and explicit category labels', () => {
  const evaluationCase = {
    id: 'a'.repeat(80),
    text: 'x'.repeat(6000),
    expectedCategories: ['grammar', 'tone'],
    meaning: 'Preserve the facts.',
  };
  const dataset = { ...valid, provenance: 'user-approved', cases: [evaluationCase] };
  expect(parseDataset(dataset)).toEqual(dataset);
});
