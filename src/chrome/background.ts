import { LocalOllama } from '../adapters/ollama';
import { ChromeMemory, readSettings, writeSettings } from '../adapters/storage';
import type { Request } from '../application/messages';
import { parseRequest } from '../application/requests';
import { REVIEW_TIMEOUT_MS, reviewWriting } from '../application/review';
import { feedback, type Suggestion } from '../domain/review';

type ReviewRequest = Extract<Request, { type: 'review' }>;
type FeedbackRequest = Extract<Request, { type: 'feedback' }>;

interface ReviewSession {
  suggestions: Suggestion[];
  token: string;
}

const memory = new ChromeMemory();
const ollama = new LocalOllama();
const activeReviews = new Map<string, AbortController>();
const reviewSessions = new Map<string, ReviewSession>();
const MAX_REVIEW_SESSIONS = 100;
const MAX_ACTIVE_REVIEWS = 3;
const MODEL_LIST_TIMEOUT_MS = 5_000;

let pendingWrite: Promise<void> = Promise.resolve();

function serializeWrite<Result>(operation: () => Promise<Result>): Promise<Result> {
  const result = pendingWrite.then(operation);
  pendingWrite = result.then(
    () => {},
    () => {},
  );

  return result;
}

function getHostname(url?: string): string {
  if (!url) {
    return '';
  }

  try {
    return new URL(url).hostname;
  } catch {
    return '';
  }
}

function getRequestKey(sender: chrome.runtime.MessageSender): string {
  return `${sender.tab?.id}:${sender.documentId ?? sender.frameId}`;
}

function abortReview(requestKey: string): void {
  activeReviews.get(requestKey)?.abort();
  reviewSessions.delete(requestKey);
}

function trimReviewSessions(): void {
  if (reviewSessions.size < MAX_REVIEW_SESSIONS) {
    return;
  }

  const oldestRequestKey = reviewSessions.keys().next().value;

  if (oldestRequestKey !== undefined) {
    reviewSessions.delete(oldestRequestKey);
  }
}

async function disableSite(sender: chrome.runtime.MessageSender): Promise<object> {
  const site = getHostname(sender.tab?.url) || getHostname(sender.url);

  if (!site) {
    throw new Error('Cannot identify this site.');
  }

  return serializeWrite(async () => {
    const settings = await readSettings();
    const disabledSites = [...new Set([...settings.disabledSites, site])];

    await writeSettings({ ...settings, disabledSites });

    return {};
  });
}

function ensureSiteIsEnabled(sender: chrome.runtime.MessageSender, disabledSites: string[]): void {
  const sites = [getHostname(sender.tab?.url), getHostname(sender.url)];

  if (sites.some((site) => disabledSites.includes(site))) {
    throw new Error('Checking is disabled on this site.');
  }
}

async function runReview(
  request: ReviewRequest,
  sender: chrome.runtime.MessageSender,
  requestKey: string,
): Promise<{ suggestions: Suggestion[] }> {
  abortReview(requestKey);

  if (activeReviews.size >= MAX_ACTIVE_REVIEWS) {
    throw new Error('Ollama is busy. Try again shortly.');
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REVIEW_TIMEOUT_MS);
  activeReviews.set(requestKey, controller);

  try {
    const settings = await readSettings();

    if (controller.signal.aborted || activeReviews.get(requestKey) !== controller) {
      throw new Error('Review cancelled.');
    }

    ensureSiteIsEnabled(sender, settings.disabledSites);

    const suggestions = await reviewWriting(
      ollama,
      request.text,
      await memory.read(),
      settings.model,
      controller.signal,
    );

    if (activeReviews.get(requestKey) !== controller) {
      throw new Error('Review cancelled.');
    }

    trimReviewSessions();
    reviewSessions.set(requestKey, { token: request.token, suggestions });

    return { suggestions };
  } catch (error) {
    if (controller.signal.aborted) {
      throw new Error('Review cancelled or exceeded 25 seconds. Try a smaller local model.');
    }

    if (error instanceof TypeError) {
      throw new Error('Cannot reach local Ollama. Open settings to check the connection.');
    }

    throw error;
  } finally {
    clearTimeout(timeout);

    if (activeReviews.get(requestKey) === controller) {
      activeReviews.delete(requestKey);
    }
  }
}

async function recordFeedback(request: FeedbackRequest, requestKey: string): Promise<object> {
  const reviewSession = reviewSessions.get(requestKey);
  const suggestion = reviewSession?.suggestions.find((candidate) => candidate.id === request.id);

  if (
    !reviewSession ||
    reviewSession.token !== request.token ||
    !suggestion ||
    (request.outcome === 'too-soft' && suggestion.category !== 'tone')
  ) {
    throw new Error('This suggestion is no longer available.');
  }

  reviewSession.suggestions = reviewSession.suggestions.filter(
    (candidate) => candidate.id !== suggestion.id,
  );

  return serializeWrite(async () => {
    const currentMemory = await memory.read();

    await memory.write(feedback(currentMemory, suggestion.pattern, request.outcome));

    return {};
  });
}

async function handleRequest(
  rawMessage: unknown,
  sender: chrome.runtime.MessageSender,
): Promise<object> {
  const message = parseRequest(rawMessage);
  const requestKey = getRequestKey(sender);
  const isOptionsPage = sender.url === chrome.runtime.getURL('options.html');

  switch (message.type) {
    case 'settings':
      return readSettings();
    case 'open-options':
      await chrome.runtime.openOptionsPage();

      return {};
    case 'cancel':
      abortReview(requestKey);

      return {};
    case 'disable-site':
      if (sender.tab) {
        return disableSite(sender);
      }

      break;
    case 'review':
      if (sender.tab) {
        return runReview(message, sender, requestKey);
      }

      break;
    case 'feedback':
      if (sender.tab) {
        return recordFeedback(message, requestKey);
      }

      break;
    case 'save-memory':
      if (isOptionsPage) {
        return serializeWrite(async () => {
          await memory.write(message.memory);

          return {};
        });
      }

      break;
    case 'save-settings':
      if (isOptionsPage) {
        return serializeWrite(async () => {
          await writeSettings({
            version: 1,
            model: message.model,
            disabledSites: message.disabledSites,
          });

          return {};
        });
      }

      break;

    case 'models':
      if (isOptionsPage) {
        return { models: await ollama.listModels(AbortSignal.timeout(MODEL_LIST_TIMEOUT_MS)) };
      }
  }

  throw new Error('Unknown request.');
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Request failed.';
}

chrome.runtime.onMessage.addListener((rawMessage: unknown, sender, reply) => {
  if (sender.id !== chrome.runtime.id) {
    return;
  }

  void handleRequest(rawMessage, sender).then(
    (value) => reply({ ok: true, ...value }),
    (error: unknown) => reply({ error: getErrorMessage(error), ok: false }),
  );

  return true;
});

chrome.storage.onChanged.addListener((changes) => {
  if (changes.settings || changes.memory) {
    for (const controller of activeReviews.values()) {
      controller.abort();
    }
  }

  if (changes.settings) {
    reviewSessions.clear();
  }
});

chrome.tabs.onRemoved.addListener((tabId) => {
  for (const requestKey of activeReviews.keys()) {
    if (requestKey.startsWith(`${tabId}:`)) {
      activeReviews.get(requestKey)?.abort();
      activeReviews.delete(requestKey);
    }
  }

  for (const requestKey of reviewSessions.keys()) {
    if (requestKey.startsWith(`${tabId}:`)) {
      reviewSessions.delete(requestKey);
    }
  }
});

chrome.action.onClicked.addListener(() => {
  void chrome.runtime.openOptionsPage().catch(() => {});
});

async function handleCommand(command: string): Promise<void> {
  if (command !== 'review-field') {
    return;
  }

  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

  if (tab?.id) {
    await chrome.tabs.sendMessage(tab.id, { type: 'review-focused' }).catch(() => {});
  }
}

chrome.commands.onCommand.addListener((command) => {
  void handleCommand(command).catch(() => {});
});
