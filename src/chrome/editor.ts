import { canApply, type Suggestion } from '../domain/review';

export type Field = HTMLInputElement | HTMLTextAreaElement | HTMLElement;

function isEligiblePlainField(field: HTMLInputElement | HTMLTextAreaElement): boolean {
  if (field.disabled || field.readOnly) {
    return false;
  }

  const inputMode = field.getAttribute('inputmode');

  if (inputMode && inputMode !== 'text') {
    return false;
  }

  if (field instanceof HTMLInputElement && field.type !== 'text') {
    return false;
  }

  return !/password|one-time-code|cc-|username/i.test(field.autocomplete);
}

function findEditableRoot(target: HTMLElement): HTMLElement | null {
  if (!target.isContentEditable || target.closest('[contenteditable="false"]')) {
    return null;
  }

  let root = target;

  while (root.parentElement?.isContentEditable) {
    root = root.parentElement;
  }

  if (root.closest('[role="combobox"], .monaco-editor, .CodeMirror, [data-slate-editor]')) {
    return null;
  }

  return root;
}

export function detectField(target: EventTarget | null): Field | null {
  if (!(target instanceof HTMLElement)) {
    return null;
  }

  if (
    target.closest(
      '[data-grammar-prose], [data-grammar-prose-disabled], [data-local-prose], [data-local-prose-disabled], [aria-disabled="true"], [inert]',
    )
  ) {
    return null;
  }

  if (isPlain(target)) {
    return isEligiblePlainField(target) ? target : null;
  }

  return findEditableRoot(target);
}

export const isPlain = (field: Field): field is HTMLInputElement | HTMLTextAreaElement =>
  field instanceof HTMLInputElement || field instanceof HTMLTextAreaElement;
export const readField = (field: Field): string => (isPlain(field) ? field.value : field.innerText);

function mapSelectionPosition(position: number, suggestion: Suggestion): number {
  if (position <= suggestion.start) {
    return position;
  }

  if (position >= suggestion.end) {
    const lengthDifference = suggestion.replacement.length - suggestion.original.length;

    return position + lengthDifference;
  }

  return suggestion.start + suggestion.replacement.length;
}

export function replacePassage(field: Field, snapshot: string, suggestion: Suggestion): boolean {
  if (
    !isPlain(field) ||
    !field.isConnected ||
    !detectField(field) ||
    !canApply(readField(field), snapshot, suggestion)
  ) {
    return false;
  }

  const start = field.selectionStart ?? 0;
  const end = field.selectionEnd ?? start;
  const direction = field.selectionDirection ?? 'none';
  const scrollTop = field.scrollTop;
  const scrollLeft = field.scrollLeft;
  field.focus();
  field.setSelectionRange(suggestion.start, suggestion.end);
  // Chrome's editing command participates in native undo and emits the input event
  // observed by controlled fields. Never fall back to assigning .value.
  const changed = document.execCommand('insertText', false, suggestion.replacement);
  const expected =
    snapshot.slice(0, suggestion.start) + suggestion.replacement + snapshot.slice(suggestion.end);

  if (!changed || readField(field) !== expected) {
    field.setSelectionRange(start, end, direction);

    return false;
  }

  field.setSelectionRange(
    mapSelectionPosition(start, suggestion),
    mapSelectionPosition(end, suggestion),
    direction,
  );
  field.scrollTop = scrollTop;
  field.scrollLeft = scrollLeft;

  return true;
}
