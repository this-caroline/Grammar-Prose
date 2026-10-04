import { test, expect } from 'vitest';

import { emptyMemory, inspectReview } from '../src/domain/review';

const passage = {
  category: 'grammar',
  pattern: 'agreement',
  original: 'The tests is failing.',
  replacement: 'The tests are failing.',
  explanation: 'Plural agreement.',
};

test('raw schema validity is separate from safe display and valid empty reviews', () => {
  expect(inspectReview({ suggestions: [] }, passage.original, emptyMemory()).schemaValid).toBe(
    true,
  );
  const result = inspectReview(
    { suggestions: [{ ...passage, extra: 'unexpected' }, null] },
    passage.original,
    emptyMemory(),
  );
  expect(result.schemaValid).toBe(false);
  expect(result.rawCount).toBe(2);
  expect(result.rejections.malformed).toBe(1);
  expect(result.suggestions).toHaveLength(1);
});

test('diagnostics expose fixed rejection counts without private passages', () => {
  const result = inspectReview(
    {
      suggestions: [
        passage,
        passage,
        { ...passage, original: 'Missing.' },
        { ...passage, replacement: 'The 2 tests are failing.' },
      ],
    },
    passage.original,
    emptyMemory(),
  );
  expect(result.rejections).toEqual({
    malformed: 0,
    passage: 1,
    'protected-term': 0,
    numbers: 1,
    duplicate: 1,
    limit: 0,
  });
  expect(JSON.stringify(result.rejections)).not.toContain(passage.original);
});
