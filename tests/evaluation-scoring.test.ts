import { test, expect } from 'vitest';

import { scoreRun } from '../src/evaluation/scoring';

const run = {
  version: 2,
  runId: '12345678-1234-1234-1234-123456789abc',
  modelDigest: 'a'.repeat(64),
  datasetHash: 'b'.repeat(64),
  promptHash: 'c'.repeat(64),
  provenance: 'user-approved',
  results: Array.from(Array.from({ length: 20 }).keys(), (index) => ({
    id: `case-${index}`,
    actionable: index < 10,
    outcome: 'valid',
    completed: true,
    schemaValid: true,
  })),
};
const scores = {
  version: 1,
  runId: run.runId,
  assessments: run.results.map((item) => ({
    id: item.id,
    rawInspected: true,
    meaningPreserved: true,
    usefulCorrection: item.actionable,
    unwantedSuggestion: false,
  })),
};

test('quality gate adopts only a complete identified approved run', () => {
  expect(scoreRun(run, scores).decision).toBe('adopt');
  expect(scoreRun(run, { ...scores, assessments: [] }).decision).toBe('pending');
  expect(scoreRun({ ...run, modelDigest: null }, scores).decision).toBe('pending');
  expect(scoreRun({ ...run, provenance: 'synthetic' }, scores).decision).toBe('pending');
});

test('raw meaning failures and malformed requests reject even when filtered output looks empty', () => {
  expect(
    scoreRun(run, {
      ...scores,
      assessments: [{ ...scores.assessments[0], meaningPreserved: false }],
    }).decision,
  ).toBe('reject');
  expect(
    scoreRun(
      { ...run, results: [{ ...run.results[0], outcome: 'malformed-output' }] },
      { ...scores, assessments: [] },
    ).decision,
  ).toBe('reject');
});

test('quality thresholds include 90 percent useful and 10 percent unwanted', () => {
  const assessments = structuredClone(scores.assessments);
  assessments[0].usefulCorrection = false;
  assessments[10].unwantedSuggestion = true;
  expect(scoreRun(run, { ...scores, assessments }).decision).toBe('adopt');
  assessments[1].usefulCorrection = false;
  expect(scoreRun(run, { ...scores, assessments }).decision).toBe('reject');
});

test('scoring rejects mismatched identities, duplicate cases, and invalid external scores', () => {
  for (const invalid of [
    null,
    { ...scores, runId: 'other' },
    { ...scores, assessments: [scores.assessments[0], scores.assessments[0]] },
    { ...scores, assessments: [{ ...scores.assessments[0], id: 'unknown' }] },
    { ...scores, assessments: [{ ...scores.assessments[0], rawInspected: 'yes' }] },
  ]) {
    expect(() => scoreRun(run, invalid)).toThrow();
  }

  const privateScores = { ...scores, privateText: 'never report this' };
  expect(JSON.stringify(scoreRun(run, privateScores))).not.toContain('never report');
});

test('scoring cannot accept contradictory raw-validity metadata', () => {
  expect(() =>
    scoreRun(
      { ...run, results: [{ ...run.results[0], schemaValid: false }] },
      { ...scores, assessments: [] },
    ),
  ).toThrow();
});
