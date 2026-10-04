import { isRecord, isOneOf, isStringArray } from './validation';

export const categories = ['grammar', 'clarity', 'tone'] as const;
export type Category = (typeof categories)[number];
const patternCategories = {
  agreement: 'grammar',
  tense: 'grammar',
  articles: 'grammar',
  punctuation: 'grammar',
  'word-choice': 'grammar',
  wordiness: 'clarity',
  ambiguity: 'clarity',
  'passive-aggressive': 'tone',
  dismissive: 'tone',
  harsh: 'tone',
  unprofessional: 'tone',
} as const satisfies Record<string, Category>;
export type Pattern = keyof typeof patternCategories;
const patterns = Object.keys(patternCategories) as Pattern[];
export interface Suggestion {
  id: string;
  category: Category;
  pattern: Pattern;
  original: string;
  replacement: string;
  explanation: string;
  start: number;
  end: number;
}
export interface Memory {
  version: 1;
  patterns: Partial<Record<Pattern, { accepted: number; rejected: number }>>;
  tooSoft: number;
  terms: string[];
  tonePreferences: string;
}
export const emptyMemory = (): Memory => ({
  version: 1,
  patterns: {},
  tooSoft: 0,
  terms: [],
  tonePreferences: '',
});
export const MAX_TEXT = 6000;
export const MAX_SUGGESTIONS = 20;

export function completedText(text: string): string {
  // Segmenter can join a completed sentence to a lowercase unfinished sentence.
  let end = 0;

  for (const match of text.matchAll(/[.!?]["'”’\])]*(?=\s|$)/g)) {
    const before = text.slice(0, match.index);
    const word = before.match(/([\w.]+)$/)?.[1] ?? '';

    if (
      match[0][0] === '.' &&
      (/^(?:Mr|Mrs|Ms|Dr|Prof|Sr|Jr|vs|etc|e\.g|i\.e)$/i.test(word) || /^[A-Z]$/.test(word))
    ) {
      continue;
    }

    end = match.index + match[0].length;
  }

  return text.slice(0, end);
}

export const responseSchema = {
  type: 'object',
  required: ['suggestions'],
  additionalProperties: false,
  properties: {
    suggestions: {
      type: 'array',
      maxItems: MAX_SUGGESTIONS,
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['category', 'pattern', 'original', 'replacement', 'explanation'],
        properties: {
          category: { type: 'string', enum: categories },
          pattern: { type: 'string', enum: patterns },
          original: { type: 'string' },
          replacement: { type: 'string' },
          explanation: { type: 'string' },
        },
      },
    },
  },
};

type ReviewPassage = Pick<
  Suggestion,
  'category' | 'pattern' | 'original' | 'replacement' | 'explanation'
>;

function parseReviewPassage(item: unknown): ReviewPassage | null {
  if (!isRecord(item)) {
    return null;
  }

  const { category, pattern, original, replacement, explanation } = item;

  if (
    !isOneOf(category, categories) ||
    !isOneOf(pattern, patterns) ||
    patternCategories[pattern] !== category
  ) {
    return null;
  }

  if (
    typeof original !== 'string' ||
    typeof replacement !== 'string' ||
    typeof explanation !== 'string'
  ) {
    return null;
  }

  if (
    ![original, replacement, explanation].every(
      (value) => value.trim().length > 0 && value.length <= MAX_TEXT,
    )
  ) {
    return null;
  }

  return { category, pattern, original, replacement, explanation };
}

export function isSuggestion(value: unknown): value is Suggestion {
  if (!isRecord(value)) {
    return false;
  }

  const passage = parseReviewPassage(value);

  if (!passage) {
    return false;
  }

  if (typeof value.id !== 'string' || !value.id || value.id.length > 100) {
    return false;
  }

  if (typeof value.start !== 'number' || !Number.isSafeInteger(value.start) || value.start < 0) {
    return false;
  }

  return (
    typeof value.end === 'number' &&
    Number.isSafeInteger(value.end) &&
    value.end === value.start + passage.original.length
  );
}

const rejectionReasons = [
  'malformed',
  'passage',
  'protected-term',
  'numbers',
  'duplicate',
  'limit',
] as const;
type RejectionReason = (typeof rejectionReasons)[number];

function passageRejection(
  value: ReviewPassage,
  text: string,
  memory: Memory,
  suggestions: Suggestion[],
): RejectionReason | null {
  const start = text.indexOf(value.original);

  if (
    start < 0 ||
    text.indexOf(value.original, start + 1) >= 0 ||
    value.original === value.replacement
  ) {
    return 'passage';
  }

  if (
    memory.terms.some((term) => value.original.includes(term) && !value.replacement.includes(term))
  ) {
    return 'protected-term';
  }

  if (
    JSON.stringify(value.original.match(/\d+(?:[.,:]\d+)*/g)) !==
    JSON.stringify(value.replacement.match(/\d+(?:[.,:]\d+)*/g))
  ) {
    return 'numbers';
  }

  if (
    suggestions.some(
      (suggestion) =>
        suggestion.category === value.category &&
        suggestion.start === start &&
        suggestion.replacement === value.replacement,
    )
  ) {
    return 'duplicate';
  }

  return null;
}

export function inspectReview(raw: unknown, text: string, memory: Memory) {
  if (!isRecord(raw) || !Array.isArray(raw.suggestions)) {
    throw new Error('Ollama returned an invalid review.');
  }

  const suggestions: Suggestion[] = [];
  const rejections: Record<RejectionReason, number> = {
    malformed: 0,
    passage: 0,
    'protected-term': 0,
    numbers: 0,
    duplicate: 0,
    limit: Math.max(0, raw.suggestions.length - MAX_SUGGESTIONS),
  };
  const rawItems: unknown[] = raw.suggestions;
  const fields = ['category', 'pattern', 'original', 'replacement', 'explanation'];
  const schemaValid =
    Object.keys(raw).length === 1 &&
    rawItems.length <= MAX_SUGGESTIONS &&
    rawItems.every(
      (item) =>
        isRecord(item) &&
        Object.keys(item).length === fields.length &&
        fields.every((field) => field in item) &&
        isOneOf(item.category, categories) &&
        isOneOf(item.pattern, patterns) &&
        typeof item.original === 'string' &&
        typeof item.replacement === 'string' &&
        typeof item.explanation === 'string',
    );

  for (const item of rawItems.slice(0, MAX_SUGGESTIONS)) {
    const value = parseReviewPassage(item);

    if (!value) {
      rejections.malformed++;
      continue;
    }

    const rejection = passageRejection(value, text, memory, suggestions);

    if (rejection) {
      rejections[rejection]++;
      continue;
    }

    const start = text.indexOf(value.original);
    suggestions.push({
      ...value,
      id: String(suggestions.length),
      start,
      end: start + value.original.length,
    });
  }

  return { suggestions, schemaValid, rawCount: rawItems.length, rejections };
}

export function validateSuggestions(raw: unknown, text: string, memory: Memory): Suggestion[] {
  return inspectReview(raw, text, memory).suggestions;
}

export function canApply(current: string, snapshot: string, suggestion: Suggestion): boolean {
  return (
    current === snapshot && current.slice(suggestion.start, suggestion.end) === suggestion.original
  );
}

function isNonnegativeInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
}

function validatePatternCounts(value: Record<string, unknown>): Memory['patterns'] {
  const counts: Memory['patterns'] = {};

  for (const [key, entry] of Object.entries(value)) {
    if (!isOneOf(key, patterns) || !isRecord(entry)) {
      throw new Error('Invalid pattern counts.');
    }

    if (!isNonnegativeInteger(entry.accepted) || !isNonnegativeInteger(entry.rejected)) {
      throw new Error('Invalid pattern counts.');
    }

    counts[key] = { accepted: entry.accepted, rejected: entry.rejected };
  }

  return counts;
}

export function validateMemory(value: unknown): Memory {
  if (!isRecord(value) || value.version !== 1) {
    throw new Error('Invalid memory format.');
  }

  if (!isRecord(value.patterns)) {
    throw new Error('Invalid memory format.');
  }

  if (!isStringArray(value.terms) || value.terms.length > 100) {
    throw new Error('Invalid memory format.');
  }

  if (value.terms.some((term) => !term.trim() || term.length > 100)) {
    throw new Error('Invalid memory format.');
  }

  if (typeof value.tonePreferences !== 'string' || value.tonePreferences.length > 2000) {
    throw new Error('Invalid memory format.');
  }

  if (!isNonnegativeInteger(value.tooSoft)) {
    throw new Error('Invalid memory format.');
  }

  const counts = validatePatternCounts(value.patterns);

  return {
    version: 1,
    patterns: counts,
    tooSoft: value.tooSoft,
    terms: [...new Set(value.terms)],
    tonePreferences: value.tonePreferences,
  };
}

export function feedback(
  memory: Memory,
  pattern: Pattern,
  outcome: 'accepted' | 'rejected' | 'too-soft',
): Memory {
  const updated = structuredClone(memory);
  const counts = updated.patterns[pattern] ?? { accepted: 0, rejected: 0 };
  counts[outcome === 'accepted' ? 'accepted' : 'rejected']++;
  updated.patterns[pattern] = counts;

  if (outcome === 'too-soft') {
    updated.tooSoft++;
  }

  return updated;
}
