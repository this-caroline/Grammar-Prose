import { validateMemory, MAX_TEXT } from '../domain/review';
import { isRecord, isOneOf } from '../domain/validation';
import type { Request } from './messages';
import { validateSettings } from './settings';

function parseReviewRequest(value: Record<string, unknown>): Extract<Request, { type: 'review' }> {
  if (typeof value.text !== 'string' || value.text.length > MAX_TEXT) {
    throw new Error('Invalid request.');
  }

  if (typeof value.token !== 'string' || value.token.length === 0 || value.token.length > 100) {
    throw new Error('Invalid request.');
  }

  return { type: 'review', text: value.text, token: value.token };
}

function parseFeedbackRequest(
  value: Record<string, unknown>,
): Extract<Request, { type: 'feedback' }> {
  if (typeof value.token !== 'string' || value.token.length > 100) {
    throw new Error('Invalid request.');
  }

  if (typeof value.id !== 'string' || value.id.length > 100) {
    throw new Error('Invalid request.');
  }

  if (!isOneOf(value.outcome, ['accepted', 'rejected', 'too-soft'])) {
    throw new Error('Invalid request.');
  }

  return { type: 'feedback', token: value.token, id: value.id, outcome: value.outcome };
}

export function parseRequest(value: unknown): Request {
  if (!isRecord(value)) {
    throw new Error('Invalid request.');
  }

  switch (value.type) {
    case 'settings':
    case 'open-options':
    case 'cancel':
    case 'disable-site':
    case 'models':
      return { type: value.type };
    case 'review':
      return parseReviewRequest(value);
    case 'feedback':
      return parseFeedbackRequest(value);
    case 'save-memory':
      return { type: value.type, memory: validateMemory(value.memory) };

    case 'save-settings': {
      const settings = validateSettings(value);

      return { type: value.type, model: settings.model, disabledSites: settings.disabledSites };
    }
  }

  throw new Error('Invalid request.');
}
