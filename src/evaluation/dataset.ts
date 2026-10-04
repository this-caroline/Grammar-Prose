import { categories, MAX_TEXT, type Category } from '../domain/review';
import { isRecord, isOneOf } from '../domain/validation';

export interface EvaluationCase {
  id: string;
  text: string;
  expectedCategories: Category[];
  meaning: string;
}
export interface Dataset {
  version: 1;
  provenance: 'synthetic' | 'user-approved';
  cases: EvaluationCase[];
}

function parseEvaluationCase(value: unknown): EvaluationCase {
  if (!isRecord(value)) {
    throw new Error('Invalid evaluation case.');
  }

  if (typeof value.id !== 'string' || !/^[a-z0-9-]{1,80}$/.test(value.id)) {
    throw new Error('Invalid evaluation case.');
  }

  if (typeof value.text !== 'string' || !value.text.trim() || value.text.length > MAX_TEXT) {
    throw new Error('Invalid evaluation case.');
  }

  if (!Array.isArray(value.expectedCategories)) {
    throw new Error('Invalid evaluation case.');
  }

  const expectedCategories: unknown[] = value.expectedCategories;

  if (!expectedCategories.every((category) => isOneOf(category, categories))) {
    throw new Error('Invalid evaluation case.');
  }

  if (typeof value.meaning !== 'string' || !value.meaning.trim()) {
    throw new Error('Invalid evaluation case.');
  }

  return { id: value.id, text: value.text, expectedCategories, meaning: value.meaning };
}

export function parseDataset(value: unknown): Dataset {
  if (!isRecord(value) || value.version !== 1) {
    throw new Error('Invalid evaluation dataset.');
  }

  if (!isOneOf(value.provenance, ['synthetic', 'user-approved'])) {
    throw new Error('Invalid evaluation dataset.');
  }

  if (!Array.isArray(value.cases) || value.cases.length === 0 || value.cases.length > 100) {
    throw new Error('Invalid evaluation dataset.');
  }

  const cases = (value.cases as unknown[]).map(parseEvaluationCase);

  if (new Set(cases.map((item) => item.id)).size !== cases.length) {
    throw new Error('Duplicate evaluation case IDs.');
  }

  return { version: 1, provenance: value.provenance, cases };
}
