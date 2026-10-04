import { isRecord, isOneOf } from '../domain/validation';

interface RunCase {
  id: string;
  actionable: boolean;
  outcome: 'valid' | 'malformed-output' | 'transport-error' | 'not-reviewed';
}

interface Assessment {
  id: string;
  rawInspected: boolean;
  meaningPreserved: boolean;
  usefulCorrection: boolean;
  unwantedSuggestion: boolean;
}

function parseRunCase(value: unknown): RunCase {
  if (
    !isRecord(value) ||
    typeof value.id !== 'string' ||
    !/^[a-z0-9-]{1,80}$/.test(value.id) ||
    typeof value.actionable !== 'boolean' ||
    !isOneOf(value.outcome, ['valid', 'malformed-output', 'transport-error', 'not-reviewed'])
  ) {
    throw new Error('Invalid run case.');
  }

  if (typeof value.completed !== 'boolean' || typeof value.schemaValid !== 'boolean') {
    throw new Error('Invalid completion or schema score.');
  }

  if (value.outcome === 'valid' && (!value.completed || !value.schemaValid)) {
    throw new Error('Inconsistent valid outcome.');
  }

  return { id: value.id, actionable: value.actionable, outcome: value.outcome };
}

function parseAssessment(value: unknown): Assessment {
  if (!isRecord(value) || typeof value.id !== 'string' || !/^[a-z0-9-]{1,80}$/.test(value.id)) {
    throw new Error('Invalid assessment.');
  }

  const { rawInspected, meaningPreserved, usefulCorrection, unwantedSuggestion } = value;

  if (
    typeof rawInspected !== 'boolean' ||
    typeof meaningPreserved !== 'boolean' ||
    typeof usefulCorrection !== 'boolean' ||
    typeof unwantedSuggestion !== 'boolean'
  ) {
    throw new Error('Invalid assessment.');
  }

  return { id: value.id, rawInspected, meaningPreserved, usefulCorrection, unwantedSuggestion };
}

function parseCaseArray(value: unknown, requireCases: boolean): unknown[] {
  if (!Array.isArray(value) || value.length > 100 || (requireCases && value.length === 0)) {
    throw new Error('Invalid scoring cases.');
  }

  return value as unknown[];
}

function parseHash(value: unknown): string {
  if (typeof value !== 'string' || !/^[a-f0-9]{64}$/.test(value)) {
    throw new Error('Invalid run hash.');
  }

  return value;
}

function parseScoringInputs(run: unknown, scores: unknown) {
  if (!isRecord(run) || !isRecord(scores)) {
    throw new Error('Invalid scoring inputs.');
  }

  if (
    run.version !== 2 ||
    typeof run.runId !== 'string' ||
    !/^[a-f0-9-]{36}$/.test(run.runId) ||
    scores.version !== 1 ||
    scores.runId !== run.runId
  ) {
    throw new Error('Invalid or mismatched run identity.');
  }

  if (!isOneOf(run.provenance, ['synthetic', 'user-approved'])) {
    throw new Error('Invalid provenance.');
  }

  const results = parseCaseArray(run.results, true);
  const assessments = parseCaseArray(scores.assessments, false);

  return {
    runId: run.runId,
    datasetHash: parseHash(run.datasetHash),
    promptHash: parseHash(run.promptHash),
    provenance: run.provenance,
    results,
    assessments,
    identifiedModel: typeof run.modelDigest === 'string' && /^[a-f0-9]{64}$/.test(run.modelDigest),
  };
}

function qualityDecision(
  complete: boolean,
  inputs: ReturnType<typeof parseScoringInputs>,
  cases: RunCase[],
  qualityPass: boolean,
  meaningFailures: number,
): 'adopt' | 'reject' | 'pending' {
  if (meaningFailures > 0 || cases.some((item) => item.outcome !== 'valid')) {
    return 'reject';
  }

  if (
    complete &&
    inputs.identifiedModel &&
    inputs.provenance === 'user-approved' &&
    cases.length >= 20 &&
    cases.length <= 30
  ) {
    return qualityPass ? 'adopt' : 'reject';
  }

  return 'pending';
}

export function scoreRun(run: unknown, scores: unknown) {
  const inputs = parseScoringInputs(run, scores);
  const cases = inputs.results.map(parseRunCase);
  const assessments = inputs.assessments.map(parseAssessment);
  const caseIds = new Set(cases.map((item) => item.id));
  const byId = new Map(assessments.map((item) => [item.id, item]));

  if (
    caseIds.size !== cases.length ||
    byId.size !== assessments.length ||
    assessments.some((item) => !caseIds.has(item.id))
  ) {
    throw new Error('Duplicate or unknown scoring case.');
  }

  const actionable = cases.filter((item) => item.actionable);
  const noChange = cases.filter((item) => !item.actionable);
  const useful = actionable.filter((item) => byId.get(item.id)?.usefulCorrection).length;
  const unwanted = noChange.filter((item) => byId.get(item.id)?.unwantedSuggestion).length;
  const meaningFailures = assessments.filter((item) => !item.meaningPreserved).length;
  const complete = cases.every((item) => byId.get(item.id)?.rawInspected);
  const qualityPass =
    cases.every((item) => item.outcome === 'valid') &&
    meaningFailures === 0 &&
    actionable.length > 0 &&
    useful / actionable.length >= 0.9 &&
    noChange.length > 0 &&
    unwanted / noChange.length <= 0.1;
  const decision = qualityDecision(complete, inputs, cases, qualityPass, meaningFailures);

  return {
    version: 1,
    runId: inputs.runId,
    datasetHash: inputs.datasetHash,
    promptHash: inputs.promptHash,
    decision,
    assessed: assessments.length,
    cases: cases.length,
    meaningFailures,
    actionable: actionable.length,
    useful,
    noChange: noChange.length,
    unwanted,
    results: cases.map((item) => ({
      id: item.id,
      outcome: item.outcome,
      assessment: byId.get(item.id) ?? null,
    })),
  };
}
