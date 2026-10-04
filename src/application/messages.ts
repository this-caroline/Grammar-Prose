import type { Memory, Suggestion } from '../domain/review';
import type { Settings } from './settings';

export type Outcome = 'accepted' | 'rejected' | 'too-soft';
export type Request =
  | { type: 'settings' | 'open-options' | 'cancel' | 'disable-site' | 'models' }
  | { type: 'review'; text: string; token: string }
  | { type: 'feedback'; token: string; id: string; outcome: Outcome }
  | { type: 'save-memory'; memory: Memory }
  | { type: 'save-settings'; model: string; disabledSites: string[] };
export interface Responses {
  settings: Settings;
  'open-options': Record<string, never>;
  cancel: Record<string, never>;
  'disable-site': Record<string, never>;
  models: { models: string[] };
  review: { suggestions: Suggestion[] };
  feedback: Record<string, never>;
  'save-memory': Record<string, never>;
  'save-settings': Record<string, never>;
}
