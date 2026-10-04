import {
  completedText,
  MAX_TEXT,
  validateSuggestions,
  type Memory,
  type Suggestion,
} from '../domain/review';

export const REVIEW_TIMEOUT_MS = 25_000;

export interface OllamaPort {
  review(text: string, memory: Memory, model: string, signal: AbortSignal): Promise<unknown>;
}

export async function reviewWriting(
  port: OllamaPort,
  text: string,
  memory: Memory,
  model: string,
  signal: AbortSignal,
): Promise<Suggestion[]> {
  if (signal.aborted) {
    throw new Error('Review cancelled.');
  }

  if (text.length > MAX_TEXT) {
    throw new Error('Use a field with at most 6,000 characters.');
  }

  const completed = completedText(text);

  if (!completed.trim()) {
    return [];
  }

  const raw = await port.review(completed, memory, model, signal);

  if (signal.aborted) {
    throw new Error('Review cancelled.');
  }

  return validateSuggestions(raw, completed, memory);
}
