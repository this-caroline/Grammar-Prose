import type { Outcome } from '../application/messages';
import { defaultSettings, validateSettings } from '../application/settings';
import { canApply, completedText, MAX_TEXT, type Suggestion } from '../domain/review';
import { isRecord } from '../domain/validation';
import { detectField, isPlain, readField, replacePassage, type Field } from './editor';
import { send } from './messages';
import { badge, panel, renderReview, shadow } from './view';

let field: Field | null = null;
let snapshot = '';
let token = '';
let suggestions: Suggestion[] = [];
let status = '';
let badgeAvailable = false;
let timer: ReturnType<typeof setTimeout> | undefined;
let revision = 0;
let composing = false;
let applying = false;
let settings = defaultSettings();
const disabled = new WeakSet<Field>();
const siteDisabled = () =>
  settings.disabledSites.includes(location.hostname) ||
  settings.disabledSites.includes(topHostname());

function topHostname() {
  try {
    return window.top?.location.hostname ?? '';
  } catch {
    return document.referrer ? new URL(document.referrer).hostname : '';
  }
}

function invalidate() {
  revision++;
  clearTimeout(timer);
  suggestions = [];
  snapshot = '';
  badgeAvailable = false;
  badge.hidden = true;
  panel.hidden = true;
  void send({ type: 'cancel' }).catch(() => {});
}

function position() {
  if (!field) {
    return;
  }

  const rect = field.getBoundingClientRect();
  badge.style.left = `${Math.max(4, Math.min(innerWidth - 90, rect.right - 72))}px`;
  badge.style.top = `${Math.max(4, Math.min(innerHeight - 35, rect.bottom + 3))}px`;

  badge.hidden = !badgeAvailable || !field.isConnected || rect.bottom < 0 || rect.top > innerHeight;
}

interface ReviewAction {
  field: Field | null;
  token: string;
  revision: number;
}

function captureReviewAction(): ReviewAction {
  return { field, token, revision };
}

function isCurrentAction(action: ReviewAction): boolean {
  return action.field === field && action.token === token && action.revision === revision;
}

async function record(
  action: ReviewAction,
  suggestion: Suggestion,
  outcome: Outcome,
): Promise<string | null> {
  try {
    await send({ type: 'feedback', token: action.token, id: suggestion.id, outcome });

    return null;
  } catch (error) {
    return `Feedback was not saved: ${error instanceof Error ? error.message : 'Request failed.'}`;
  }
}

async function copySuggestion(suggestion: Suggestion): Promise<void> {
  const action = captureReviewAction();
  let message: string;

  try {
    await navigator.clipboard.writeText(suggestion.replacement);
    message = 'Copied. Apply it in your editor; copying does not count as acceptance.';
  } catch {
    message = 'Clipboard unavailable. Select and copy the replacement text above.';
  }

  if (isCurrentAction(action)) {
    status = message;
    render();
  }
}

function render() {
  renderReview(status, suggestions, Boolean(field && isPlain(field)), {
    accept: (suggestion) => {
      void accept(suggestion);
    },
    copy: (suggestion) => {
      void copySuggestion(suggestion);
    },
    reject: (suggestion, outcome) => {
      void reject(suggestion, outcome);
    },
    check: () => {
      void check(true);
    },
    disableField: () => {
      if (field) {
        disabled.add(field);
      }

      invalidate();
    },
    disableSite: () => {
      void send({ type: 'disable-site' }).then(invalidate).catch(showError);
    },
    settings: () => {
      void send({ type: 'open-options' }).catch(showError);
    },
    close: () => {
      panel.hidden = true;
      badge.focus();
    },
  });
}

function showError(error: unknown) {
  status = error instanceof Error ? error.message : 'Review failed.';
  render();
}

async function reject(suggestion: Suggestion, outcome: Outcome) {
  const action = captureReviewAction();

  const feedbackError = await record(action, suggestion, outcome);

  if (!isCurrentAction(action)) {
    return;
  }

  if (feedbackError) {
    status = feedbackError;
  }

  suggestions = suggestions.filter((candidate) => candidate.id !== suggestion.id);
  render();
}

async function accept(suggestion: Suggestion) {
  const action = captureReviewAction();

  if (!field || !canApply(readField(field), snapshot, suggestion)) {
    invalidate();

    return;
  }

  applying = true;
  const success = replacePassage(field, snapshot, suggestion);
  applying = false;

  if (!success) {
    status =
      'This editor could not safely apply the suggestion. Use Copy suggestion. Check the field before continuing.';
    render();

    return;
  }

  // Send feedback before cancellation expires the suggestion in the worker.
  const pendingFeedback = record(action, suggestion, 'accepted');
  invalidate();
  const acceptedAction = captureReviewAction();
  const feedbackError = await pendingFeedback;

  if (!isCurrentAction(acceptedAction)) {
    return;
  }

  if (feedbackError) {
    status = feedbackError;
  }

  schedule();
}

function describeReviewResult(currentField: Field): string {
  if (!suggestions.length) {
    return 'No suggestions for completed sentences.';
  }

  if (isPlain(currentField)) {
    return 'Review each change before accepting.';
  }

  return 'This rich editor uses Copy suggestion. Automatic replacement is unavailable.';
}

function canReviewField(currentField: Field | null): currentField is Field {
  return Boolean(
    currentField &&
    !composing &&
    !disabled.has(currentField) &&
    !siteDisabled() &&
    detectField(currentField),
  );
}

function reviewPreflightMessage(text: string): string {
  if (!completedText(text).trim()) {
    return 'Finish a sentence with punctuation to review it.';
  }

  if (text.length > MAX_TEXT) {
    return 'Use a field with at most 6,000 characters.';
  }

  return '';
}

function setReviewStatus(message: string, requestedManually: boolean): void {
  status = message;

  if (requestedManually) {
    panel.hidden = false;
    render();
  }
}

function isCurrentReview(currentField: Field, text: string, currentRevision: number): boolean {
  return (
    currentRevision === revision &&
    field === currentField &&
    readField(currentField) === text &&
    Boolean(detectField(currentField))
  );
}

async function check(requestedManually = false) {
  if (!canReviewField(field)) {
    return;
  }

  const currentField = field;
  const text = readField(currentField);
  invalidate();
  const currentRevision = revision;
  const preflightMessage = reviewPreflightMessage(text);

  if (preflightMessage) {
    if (requestedManually) {
      setReviewStatus(preflightMessage, true);
    }

    return;
  }

  token = crypto.randomUUID();
  const requestToken = token;
  setReviewStatus('Checking locally…', requestedManually);

  try {
    const result = await send({ type: 'review', text, token: requestToken });

    if (!isCurrentReview(currentField, text, currentRevision)) {
      return;
    }

    snapshot = text;
    suggestions = result.suggestions;
    status = describeReviewResult(currentField);
    badge.textContent = `${suggestions.length} edits`;
    badgeAvailable = suggestions.length > 0;
    position();
    render();
  } catch (error) {
    if (currentRevision !== revision) {
      return;
    }

    showError(error);
    badge.textContent = 'Grammar Prose !';
    badgeAvailable = true;
    position();
  }
}

function schedule() {
  clearTimeout(timer);

  if (field && !disabled.has(field) && !siteDisabled()) {
    timer = setTimeout(() => {
      void check();
    }, 900);
  }
}

badge.onclick = () => {
  panel.hidden = !panel.hidden;

  if (!panel.hidden) {
    render();
    panel.querySelector('button')?.focus();
  }
};

document.addEventListener(
  'focusin',
  (event) => {
    const next = detectField(event.composedPath()[0]);

    if (next && next !== field) {
      invalidate();
      field = next;
      schedule();
    }
  },
  true,
);
document.addEventListener(
  'input',
  (event) => {
    if (applying) {
      return;
    }

    const next = detectField(event.composedPath()[0]);

    if (next) {
      field = next;
      invalidate();

      if (!composing) {
        schedule();
      }
    }
  },
  true,
);
document.addEventListener(
  'compositionstart',
  () => {
    composing = true;
    invalidate();
  },
  true,
);
document.addEventListener(
  'compositionend',
  () => {
    composing = false;
    schedule();
  },
  true,
);
document.addEventListener(
  'keydown',
  (event) => {
    if (event.key === 'Escape' && !panel.hidden) {
      panel.hidden = true;
      field?.focus();
    }
  },
  true,
);
shadow.addEventListener('keydown', (event) => {
  if ((event as KeyboardEvent).key === 'Escape') {
    panel.hidden = true;
    field?.focus();
  }
});
window.addEventListener('scroll', position, true);
window.addEventListener('resize', position);
// Programmatic edits may omit input events. Hide stale results before the next interaction.
setInterval(() => {
  if (
    field &&
    snapshot &&
    (!field.isConnected || readField(field) !== snapshot || !detectField(field))
  ) {
    invalidate();
  }
}, 400);
chrome.runtime.onMessage.addListener((message: unknown) => {
  if (isRecord(message) && message.type === 'review-focused' && document.hasFocus()) {
    const next = detectField(document.activeElement);

    if (next) {
      field = next;
    }

    void check(true);
  }
});
chrome.storage.onChanged.addListener((changes) => {
  if (changes.settings) {
    try {
      settings = validateSettings(changes.settings.newValue as unknown);
    } catch (error) {
      showError(error);
    }

    invalidate();
  }
});
void send({ type: 'settings' })
  .then((value) => {
    settings = value;
  })
  .catch(() => {});
