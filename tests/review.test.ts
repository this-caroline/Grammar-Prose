import assert from 'node:assert/strict';

import { test } from 'vitest';

import { reviewWriting } from '../src/application/review';
import {
  canApply,
  completedText,
  emptyMemory,
  feedback,
  validateMemory,
  validateSuggestions,
} from '../src/domain/review';

const draft = 'The tests is failing. Please fix this today.';
const valid = {
  category: 'grammar',
  pattern: 'agreement',
  original: 'The tests is failing.',
  replacement: 'The tests are failing.',
  explanation: 'Use plural agreement.',
};
test('only completed sentences are submitted', () => {
  assert.equal(completedText('Please fix this. Also the'), 'Please fix this.');
  assert.equal(completedText('An unfinished thought'), '');
  assert.equal(completedText('The tests is failing. unfinished'), 'The tests is failing.');
  assert.equal(completedText('Ask Dr. Smith about version 2.4'), '');
  assert.equal(completedText('Is this ready? “Yes!”'), 'Is this ready? “Yes!”');
});
test('validated suggestions anchor to an exact unique passage', () => {
  const [suggestion] = validateSuggestions({ suggestions: [valid] }, draft, emptyMemory());
  assert.deepEqual(suggestion, { ...valid, id: '0', start: 0, end: valid.original.length });
  assert.ok(canApply(draft, draft, suggestion));
  assert.equal(canApply(draft + ' Changed.', draft, suggestion), false);
  assert.equal(
    validateSuggestions({ suggestions: [valid] }, `${draft} ${draft}`, emptyMemory()).length,
    0,
  );
});
test('reject malformed, fabricated, mismatched, duplicate and fact-changing suggestions', () => {
  assert.throws(() => validateSuggestions({}, draft, emptyMemory()));
  assert.deepEqual(
    validateSuggestions(
      {
        suggestions: [
          null,
          { ...valid, original: 'Absent' },
          { ...valid, pattern: 'harsh' },
          { ...valid, explanation: '' },
          { ...valid, original: 1 },
          { ...valid, replacement: null },
          { ...valid, explanation: {} },
          { ...valid, category: 'unknown' },
          { ...valid, pattern: 'unknown' },
          { ...valid, replacement: '   ' },
          { ...valid, explanation: 'x'.repeat(6001) },
          { ...valid, replacement: valid.original },
        ],
      },
      draft,
      emptyMemory(),
    ),
    [],
  );
  assert.equal(
    validateSuggestions({ suggestions: [valid, valid] }, draft, emptyMemory()).length,
    1,
  );
  assert.deepEqual(
    validateSuggestions(
      { suggestions: [{ ...valid, original: 'Fix 3 bugs.', replacement: 'Fix 2 bugs.' }] },
      'Fix 3 bugs.',
      emptyMemory(),
    ),
    [],
  );
});
test('protected technical terms cannot be removed', () => {
  const memory = emptyMemory();
  memory.terms = ['GitLab'];
  assert.equal(
    validateSuggestions(
      {
        suggestions: [
          { ...valid, original: 'GitLab is broken.', replacement: 'The site is broken.' },
        ],
      },
      'GitLab is broken.',
      memory,
    ).length,
    0,
  );
});
test('feedback stores counts without passages and does not mutate prior memory', () => {
  const initial = emptyMemory();
  const accepted = feedback(initial, 'agreement', 'accepted');
  const rejected = feedback(accepted, 'harsh', 'too-soft');
  assert.deepEqual(initial.patterns, {});
  assert.equal(rejected.tooSoft, 1);
  assert.deepEqual(rejected.patterns.agreement, { accepted: 1, rejected: 0 });
  assert.deepEqual(rejected.patterns.harsh, { accepted: 0, rejected: 1 });
  assert.deepEqual(validateMemory(rejected), rejected);
  assert.throws(() =>
    validateMemory({ ...initial, patterns: { arbitraryDraft: { accepted: 1, rejected: 0 } } }),
  );
});
test('application avoids incomplete drafts and rejects cancellation and oversized fields', async () => {
  let modelRequestCount = 0;
  const controller = new AbortController();
  const memory = emptyMemory();
  const port = {
    review: async (
      text: string,
      receivedMemory: typeof memory,
      model: string,
      signal: AbortSignal,
    ) => {
      modelRequestCount++;
      assert.equal(text, 'The tests is failing.');
      assert.equal(receivedMemory, memory);
      assert.equal(model, 'test');
      assert.equal(signal, controller.signal);

      return { suggestions: [valid] };
    },
  };
  assert.deepEqual(await reviewWriting(port, 'unfinished', memory, 'test', controller.signal), []);
  assert.equal(modelRequestCount, 0);
  assert.deepEqual(
    await reviewWriting(
      port,
      'The tests is failing. unfinished',
      memory,
      'test',
      controller.signal,
    ),
    [{ ...valid, id: '0', start: 0, end: valid.original.length }],
  );
  controller.abort();
  await assert.rejects(
    () => reviewWriting(port, 'The tests is failing.', memory, 'test', controller.signal),
    /cancelled/,
  );
  await assert.rejects(
    () => reviewWriting(port, 'a'.repeat(6001), memory, 'test', new AbortController().signal),
    /6,000/,
  );
  assert.equal(modelRequestCount, 1);
});
test('late responses are discarded even when a port ignores cancellation', async () => {
  const controller = new AbortController();
  const port = {
    review: async () => {
      controller.abort();

      return { suggestions: [valid] };
    },
  };
  await assert.rejects(
    () => reviewWriting(port, draft, emptyMemory(), 'test', controller.signal),
    /cancelled/,
  );
});

const patternCategories = [
  { category: 'grammar', pattern: 'agreement' },
  { category: 'grammar', pattern: 'tense' },
  { category: 'grammar', pattern: 'articles' },
  { category: 'grammar', pattern: 'punctuation' },
  { category: 'grammar', pattern: 'word-choice' },
  { category: 'clarity', pattern: 'wordiness' },
  { category: 'clarity', pattern: 'ambiguity' },
  { category: 'tone', pattern: 'passive-aggressive' },
  { category: 'tone', pattern: 'dismissive' },
  { category: 'tone', pattern: 'harsh' },
  { category: 'tone', pattern: 'unprofessional' },
];

test.each(patternCategories)('$pattern accepts only $category', ({ category, pattern }) => {
  for (const candidateCategory of ['grammar', 'clarity', 'tone']) {
    const suggestions = validateSuggestions(
      { suggestions: [{ ...valid, pattern, category: candidateCategory }] },
      draft,
      emptyMemory(),
    );
    assert.deepEqual(
      suggestions,
      candidateCategory === category
        ? [{ ...valid, pattern, category, id: '0', start: 0, end: valid.original.length }]
        : [],
    );
  }
});

test('review processes at most twenty model passages', () => {
  const suggestions = [...Array.from({ length: 21 }).keys()].map((index) => ({
    ...valid,
    original: `Sentence ${index} is broken.`,
    replacement: `Sentence ${index} works.`,
  }));
  const text = suggestions.map((suggestion) => suggestion.original).join(' ');
  const validated = validateSuggestions({ suggestions }, text, emptyMemory());
  assert.equal(validated.length, 20);
  assert.equal(validated.at(-1)?.original, 'Sentence 19 is broken.');
});
