import { test, expect, vi, afterEach } from 'vitest';

import { emptyMemory } from '../src/domain/review';
import { createLocalStorage } from './helpers/storage';

afterEach(() => {
  vi.resetModules();
});

function createSender(): chrome.runtime.MessageSender {
  return {
    id: 'test-extension',
    url: 'https://example.com',
    tab: {
      id: 1,
      url: 'https://example.com',
      index: 0,
      pinned: false,
      highlighted: true,
      windowId: 1,
      active: true,
      incognito: false,
      selected: true,
      discarded: false,
      autoDiscardable: true,
      groupId: -1,
      frozen: false,
      lastAccessed: 0,
    },
    frameId: 0,
  };
}

function stubReviewFetch(): void {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockImplementation(() =>
      Promise.resolve(
        new Response(
          JSON.stringify({
            message: {
              content: JSON.stringify({
                suggestions: [
                  {
                    category: 'grammar',
                    pattern: 'agreement',
                    original: 'The tests is failing.',
                    replacement: 'The tests are failing.',
                    explanation: 'Plural agreement.',
                  },
                ],
              }),
            },
          }),
        ),
      ),
    ),
  );
}

async function harness() {
  const local = createLocalStorage({
    settings: { version: 1, model: 'test', disabledSites: [] },
  });
  const data = local.records;
  const write = local.set;
  let listener: (
    message: unknown,
    sender: chrome.runtime.MessageSender,
    reply: (value: unknown) => void,
  ) => boolean | undefined = () => undefined;

  let storageChanged: (changes: Record<string, chrome.storage.StorageChange>) => void = () => {};

  let tabRemoved: (tabId: number) => void = () => {};

  const event = { addListener: vi.fn() };
  vi.stubGlobal('chrome', {
    runtime: {
      id: 'test-extension',
      getURL: (path: string) => `chrome-extension://test-extension/${path}`,
      openOptionsPage: vi.fn().mockResolvedValue(undefined),
      onMessage: {
        addListener: (fn: typeof listener) => {
          listener = fn;
        },
      },
    },
    storage: {
      local,
      onChanged: {
        addListener: (callback: typeof storageChanged) => {
          storageChanged = callback;
        },
      },
    },
    tabs: {
      onRemoved: {
        addListener: (callback: typeof tabRemoved) => {
          tabRemoved = callback;
        },
      },
    },
    action: { onClicked: event },
    commands: { onCommand: event },
  });
  stubReviewFetch();
  await import('../src/chrome/background');
  const sender = createSender();
  const dispatch = (message: unknown, source = sender) =>
    new Promise<unknown>((resolve) => {
      const accepted = listener(message, source, resolve);

      if (!accepted) {
        resolve(undefined);
      }
    });

  return {
    data,
    write,
    sender,
    dispatch,
    storageChanged: (changes: Record<string, chrome.storage.StorageChange>) =>
      storageChanged(changes),
    tabRemoved: (tabId: number) => tabRemoved(tabId),
  };
}

test('settings page remains authorized when opened in a browser tab', async () => {
  const { dispatch, sender, write } = await harness();
  expect(
    await dispatch(
      { type: 'save-memory', memory: emptyMemory() },
      { ...sender, url: 'chrome-extension://test-extension/options.html' },
    ),
  ).toEqual({ ok: true });
  expect(write).toHaveBeenCalledWith({ memory: emptyMemory() });
});
test('content scripts cannot mutate privileged settings or memory', async () => {
  const { dispatch, sender, write } = await harness();
  expect(await dispatch({ type: 'save-memory', memory: emptyMemory() })).toEqual({
    ok: false,
    error: 'Unknown request.',
  });
  expect(
    await dispatch({ type: 'settings' }, { ...sender, id: 'another-extension' }),
  ).toBeUndefined();
  expect(write).not.toHaveBeenCalled();
});
test('worker validates requests and applies authoritative site disable', async () => {
  const { data, dispatch } = await harness();
  expect(await dispatch(null)).toEqual({ ok: false, error: 'Invalid request.' });
  data.settings = { version: 1, model: 'test', disabledSites: ['example.com'] };
  expect(await dispatch({ type: 'review', text: 'The tests is failing.', token: 'a' })).toEqual({
    ok: false,
    error: 'Checking is disabled on this site.',
  });
  expect(fetch).not.toHaveBeenCalled();
});
test('feedback is accepted once for a returned suggestion and serialized to storage', async () => {
  const { data, dispatch } = await harness();
  await dispatch({ type: 'review', text: 'The tests is failing.', token: 'a' });
  const feedback = { type: 'feedback', token: 'a', id: '0', outcome: 'accepted' };
  const results = await Promise.all([dispatch(feedback), dispatch(feedback)]);
  expect(results).toEqual([
    { ok: true },
    { ok: false, error: 'This suggestion is no longer available.' },
  ]);
  expect(data.memory).toEqual({
    ...emptyMemory(),
    patterns: { agreement: { accepted: 1, rejected: 0 } },
  });
});

test('settings changes expire feedback while memory and unrelated changes preserve it', async () => {
  const { dispatch, storageChanged } = await harness();
  const review = { type: 'review', text: 'The tests is failing.', token: 'a' };
  const feedback = { type: 'feedback', token: 'a', id: '0', outcome: 'accepted' };
  await dispatch(review);
  storageChanged({ unrelated: { newValue: true } });
  storageChanged({ memory: { newValue: emptyMemory() } });
  expect(await dispatch(feedback)).toEqual({ ok: true });
  await dispatch(review);
  storageChanged({ settings: { newValue: {} } });
  expect(await dispatch(feedback)).toEqual({
    ok: false,
    error: 'This suggestion is no longer available.',
  });
});

test('closing a tab expires only its feedback sessions', async () => {
  const { dispatch, sender, tabRemoved } = await harness();
  const otherSender = { ...sender, tab: { ...sender.tab!, id: 10 } };
  const review = { type: 'review', text: 'The tests is failing.', token: 'a' };
  const feedback = { type: 'feedback', token: 'a', id: '0', outcome: 'accepted' };
  await dispatch(review);
  await dispatch(review, otherSender);
  tabRemoved(1);
  expect(await dispatch(feedback)).toEqual({
    ok: false,
    error: 'This suggestion is no longer available.',
  });
  expect(await dispatch(feedback, otherSender)).toEqual({ ok: true });
});

test.each(['settings', 'memory', 'tab'])(
  '%s lifecycle event cancels a pending review',
  async (event) => {
    const { dispatch, storageChanged, tabRemoved } = await harness();

    let requestStarted = () => {};

    const started = new Promise<void>((resolve) => {
      requestStarted = resolve;
    });
    vi.mocked(fetch).mockImplementationOnce((...[, init]) => {
      requestStarted();

      return new Promise<Response>((...[, reject]) => {
        init?.signal?.addEventListener('abort', () => reject(new Error('Review cancelled.')));
      });
    });
    const pending = dispatch({ type: 'review', text: 'The tests is failing.', token: 'a' });
    await started;
    storageChanged({ unrelated: { newValue: true } });
    tabRemoved(10);

    if (event === 'tab') {
      tabRemoved(1);
    } else {
      storageChanged({ [event]: { newValue: {} } });
    }

    expect(await pending).toEqual({
      ok: false,
      error: 'Review cancelled or exceeded 25 seconds. Try a smaller local model.',
    });
  },
);

test.each([
  { type: 'disable-site' },
  { type: 'review', text: 'The tests is failing.', token: 'a' },
  { type: 'feedback', token: 'a', id: '0', outcome: 'accepted' },
])('tab-bound request $type rejects a sender without a tab', async (request) => {
  const { dispatch, sender, write } = await harness();
  const senderWithoutTab = { ...sender, tab: undefined };

  expect(await dispatch(request, senderWithoutTab)).toEqual({
    ok: false,
    error: 'Unknown request.',
  });
  expect(write).not.toHaveBeenCalled();
  expect(fetch).not.toHaveBeenCalled();
});

test.each([{ type: 'save-settings', model: 'test', disabledSites: [] }, { type: 'models' }])(
  'privileged request $type rejects a content-script sender',
  async (request) => {
    const { dispatch, write } = await harness();

    expect(await dispatch(request)).toEqual({ ok: false, error: 'Unknown request.' });
    expect(write).not.toHaveBeenCalled();
    expect(fetch).not.toHaveBeenCalled();
  },
);

test('options model discovery returns the adapter result with a bounded request signal', async () => {
  const { dispatch, sender } = await harness();
  const fetchModels = vi
    .fn<typeof fetch>()
    .mockResolvedValue(Response.json({ models: [{ name: 'local-model' }] }));
  vi.stubGlobal('fetch', fetchModels);
  expect(
    await dispatch(
      { type: 'models' },
      { ...sender, url: 'chrome-extension://test-extension/options.html' },
    ),
  ).toEqual({ ok: true, models: ['local-model'] });
  expect(fetchModels).toHaveBeenCalledTimes(1);
  const [url, options] = fetchModels.mock.calls[0];
  expect(url).toBe('http://localhost:11434/api/tags');
  expect(options?.redirect).toBe('error');
  expect(options?.signal).toBeInstanceOf(AbortSignal);
});
