import { isSuggestion, MAX_SUGGESTIONS } from '../domain/review';
import { isRecord, isStringArray } from '../domain/validation';
import type { Responses } from './messages';
import { validateSettings } from './settings';

export function parseResponse<ResponseType extends keyof Responses>(
  type: ResponseType,
  value: unknown,
): Responses[ResponseType] {
  if (!isRecord(value)) {
    throw new Error('Invalid extension response.');
  }

  if (value.ok !== true) {
    throw new Error(typeof value.error === 'string' ? value.error : 'Extension unavailable.');
  }

  let result: Responses[keyof Responses];

  switch (type) {
    case 'settings':
      result = validateSettings(value);
      break;
    case 'models':
      if (!isStringArray(value.models)) {
        throw new Error('Invalid model list.');
      }

      result = { models: value.models };
      break;
    case 'review':
      if (
        !Array.isArray(value.suggestions) ||
        value.suggestions.length > MAX_SUGGESTIONS ||
        !value.suggestions.every(isSuggestion)
      ) {
        throw new Error('Invalid suggestions.');
      }

      result = { suggestions: value.suggestions };
      break;
    case 'cancel':
    case 'disable-site':
    case 'feedback':
    case 'open-options':
    case 'save-memory':
    case 'save-settings':
      result = {};
  }

  return result as Responses[ResponseType];
}
