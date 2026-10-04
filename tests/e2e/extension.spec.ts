import { readFile } from 'node:fs/promises';
import { createServer, type Server } from 'node:http';
import { resolve } from 'node:path';

import {
  test as base,
  expect,
  type BrowserContext,
  type Page,
  type Worker,
} from '@playwright/test';

import { saveBrowserCoverage } from './coverage';

interface MockState {
  calls: number;
  delay: number;
  fail: boolean;
}
type MockGlobal = typeof globalThis & { reviewMock: MockState };

async function initializeReviewMock(worker: Worker): Promise<void> {
  await worker.evaluate(async () => {
    await chrome.storage.local.set({
      settings: { version: 1, model: 'fixture-model', disabledSites: [] },
    });
    const state: MockState = { calls: 0, delay: 0, fail: false };
    (globalThis as MockGlobal).reviewMock = state;

    globalThis.fetch = async (input, init) => {
      if (input !== 'http://localhost:11434/api/chat' || init?.method !== 'POST') {
        throw new Error('Unexpected network request in test.');
      }

      state.calls++;
      await new Promise((resolveDelay) => setTimeout(resolveDelay, state.delay));

      if (state.fail) {
        return new Response('', { status: 503 });
      }

      return new Response(
        JSON.stringify({
          message: {
            content: JSON.stringify({
              suggestions: [
                {
                  category: 'grammar',
                  pattern: 'agreement',
                  original: 'The tests is failing.',
                  replacement: 'The tests are failing.',
                  explanation: 'Use plural agreement.',
                },
              ],
            }),
          },
        }),
      );
    };
  });
}

const test = base.extend<{
  extension: { context: BrowserContext; page: Page; worker: Worker; optionsUrl: string };
}>({
  extension: async ({ playwright }, use, testInfo) => {
    const html = await readFile('tests/editor-fixture.html', 'utf8');
    const server: Server = createServer((...[, response]) => {
      response.setHeader('Content-Type', 'text/html');
      response.end(html);
    });
    await new Promise<void>((resolveServer, reject) => {
      server.once('error', reject);
      server.listen(0, '127.0.0.1', resolveServer);
    });
    const address = server.address();

    if (!address || typeof address === 'string') {
      throw new Error('Fixture server unavailable.');
    }

    const extensionPath = resolve(
      process.env.GRAMMAR_PROSE_COVERAGE === '1' ? 'coverage/extension' : 'dist',
    );
    let context: BrowserContext | undefined;

    try {
      context = await playwright.chromium.launchPersistentContext('', {
        channel: 'chromium',
        headless: true,
        args: [`--disable-extensions-except=${extensionPath}`, `--load-extension=${extensionPath}`],
      });
      const worker = context.serviceWorkers()[0] ?? (await context.waitForEvent('serviceworker'));
      const optionsUrl = `chrome-extension://${new URL(worker.url()).host}/options.html`;
      await initializeReviewMock(worker);
      const page = await context.newPage();
      await page.goto(`http://127.0.0.1:${address.port}`);
      await page.locator('[data-grammar-prose]').waitFor({ state: 'attached' });

      try {
        await use({ context, page, worker, optionsUrl });
      } finally {
        if (process.env.GRAMMAR_PROSE_COVERAGE === '1') {
          await saveBrowserCoverage(
            context,
            worker,
            resolve('coverage/browser', String(testInfo.testId)),
          );
        }
      }
    } finally {
      await context?.close();
      await new Promise<void>((resolveServer, reject) =>
        server.close((error) => (error ? reject(error) : resolveServer())),
      );
    }
  },
});

async function openReview(page: Page) {
  await page.locator('textarea').first().focus();
  const badge = page.getByRole('button', { name: 'Show writing suggestions' });
  await expect(badge).toBeVisible();
  await badge.click();
}

test('Grammar Prose identity appears in the extension, review, settings, and export', async ({
  extension: { context, page, worker, optionsUrl },
}) => {
  expect(await worker.evaluate(() => chrome.runtime.getManifest().name)).toBe('Grammar Prose');
  await openReview(page);
  await expect(page.getByRole('heading', { name: 'Grammar Prose', exact: true })).toBeVisible();
  const options = await context.newPage();
  await options.goto(optionsUrl);
  await expect(options).toHaveTitle('Grammar Prose settings');
  await expect(options.locator('.eyebrow')).toHaveText('GRAMMAR PROSE · FOUNDATION PREVIEW');
  const pendingDownload = options.waitForEvent('download');
  await options.getByRole('button', { name: 'Export saved memory', exact: true }).click();
  const download = await pendingDownload;
  expect(download.suggestedFilename()).toBe('grammar-prose-memory.json');
});

test('built extension accepts one passage and preserves native undo/redo', async ({
  extension: { page, worker },
}) => {
  await openReview(page);
  await page.getByRole('button', { name: 'Accept', exact: true }).click();
  const field = page.locator('textarea').first();
  await expect(field).toHaveValue('The tests are failing. Please fix this today.');
  await field.press('ControlOrMeta+z');
  await expect(field).toHaveValue('The tests is failing. Please fix this today.');
  await field.press('ControlOrMeta+Shift+z');
  await expect(field).toHaveValue('The tests are failing. Please fix this today.');
  await expect
    .poll(() =>
      worker.evaluate(async () => {
        const data = await chrome.storage.local.get('memory');

        return JSON.stringify(data.memory as unknown);
      }),
    )
    .toContain('"accepted":1');
});
interface FeedbackGate {
  started: boolean;
  release: () => void;
}
type FeedbackGlobal = typeof globalThis & { feedbackGate: FeedbackGate };

async function delayNextFeedback(worker: Worker, fail: boolean): Promise<void> {
  await worker.evaluate((shouldFail) => {
    const originalGet = chrome.storage.local.get.bind(chrome.storage.local);

    let release = () => {};

    const pending = new Promise<void>((resolveFeedback) => {
      release = resolveFeedback;
    });
    const gate: FeedbackGate = { started: false, release };

    (globalThis as FeedbackGlobal).feedbackGate = gate;

    Object.defineProperty(chrome.storage.local, 'get', {
      configurable: true,
      writable: true,
      value: async (keys: string) => {
        if (keys === 'memory' && !gate.started) {
          gate.started = true;
          await pending;
          chrome.storage.local.get = originalGet;

          if (shouldFail) {
            throw new Error('Delayed feedback failed.');
          }
        }

        return originalGet(keys);
      },
    });
  }, fail);
}

for (const action of ['Accept', 'Reject']) {
  for (const fail of [false, true]) {
    test(`late ${action.toLowerCase()} feedback ${fail ? 'failure' : 'success'} preserves a newer field review`, async ({
      extension: { page, worker },
    }) => {
      await openReview(page);
      await delayNextFeedback(worker, fail);
      await page.getByRole('button', { name: action, exact: true }).click();
      await expect
        .poll(() => worker.evaluate(() => (globalThis as FeedbackGlobal).feedbackGate.started))
        .toBe(true);
      const nextField = page.getByLabel('Plain input', { exact: true });
      await nextField.focus();
      const badge = page.getByRole('button', { name: 'Show writing suggestions' });
      await expect(badge).toBeVisible();
      await badge.click();
      await expect(page.getByRole('button', { name: 'Accept', exact: true })).toBeVisible();
      await worker.evaluate(() => (globalThis as FeedbackGlobal).feedbackGate.release());
      // Allow the deliberately held feedback reply to reach the old action handler.
      await page.waitForTimeout(300);
      await expect(badge).toBeVisible();
      await expect(page.getByRole('button', { name: 'Accept', exact: true })).toBeVisible();
      await expect(page.getByText('Feedback was not saved:', { exact: false })).toHaveCount(0);
      await expect(nextField).toHaveValue('The tests is failing.');
      await page.getByRole('button', { name: 'Accept', exact: true }).click();
      await expect(nextField).toHaveValue('The tests are failing.');
    });
  }
}

test('acceptance resumes checking after feedback outlasts snapshot polling', async ({
  extension: { page, worker },
}) => {
  await openReview(page);
  await delayNextFeedback(worker, false);
  await page.getByRole('button', { name: 'Accept', exact: true }).click();
  await expect
    .poll(() => worker.evaluate(() => (globalThis as FeedbackGlobal).feedbackGate.started))
    .toBe(true);
  await expect(page.getByRole('button', { name: 'Show writing suggestions' })).toBeHidden();
  // Cross the 400 ms stale-snapshot interval while the accepted field stays focused.
  await page.waitForTimeout(650);
  await worker.evaluate(() => (globalThis as FeedbackGlobal).feedbackGate.release());
  await expect
    .poll(() => worker.evaluate(() => (globalThis as MockGlobal).reviewMock.calls))
    .toBe(2);
  await expect(page.locator('textarea').first()).toHaveValue(
    'The tests are failing. Please fix this today.',
  );
});

test('typing during a delayed request discards the old result', async ({
  extension: { page, worker },
}) => {
  await worker.evaluate(() => {
    (globalThis as MockGlobal).reviewMock.delay = 1200;
  });
  const field = page.locator('textarea').first();
  await field.focus();
  await expect
    .poll(() => worker.evaluate(() => (globalThis as MockGlobal).reviewMock.calls))
    .toBe(1);
  await field.fill('An unfinished changed thought');
  await page.waitForTimeout(1500);
  await expect(page.getByRole('button', { name: 'Show writing suggestions' })).toBeHidden();
  await expect(field).toHaveValue('An unfinished changed thought');
});
test('excluded fields never start a review', async ({ extension: { page, worker } }) => {
  await page.getByLabel('Password: must never review').fill('The tests is failing.');
  await page.getByLabel('Email: must never review').fill('The tests is failing.');
  await page.getByLabel('Opt-out: must never review').focus();
  await page.waitForTimeout(1200);
  expect(await worker.evaluate(() => (globalThis as MockGlobal).reviewMock.calls)).toBe(0);
});
test('site disabling persists and prevents reviews after reload', async ({
  extension: { page, worker },
}) => {
  await openReview(page);
  await page.getByRole('button', { name: 'Disable site', exact: true }).click();
  await expect
    .poll(() =>
      worker.evaluate(async () =>
        JSON.stringify((await chrome.storage.local.get('settings')).settings as unknown),
      ),
    )
    .toContain('127.0.0.1');
  const calls = await worker.evaluate(() => (globalThis as MockGlobal).reviewMock.calls);
  await page.reload();
  await page.locator('textarea').first().focus();
  await page.waitForTimeout(1200);
  expect(await worker.evaluate(() => (globalThis as MockGlobal).reviewMock.calls)).toBe(calls);
});
test('rich editors stay copy-only and service errors remain visible', async ({
  extension: { page, worker },
}) => {
  await page.locator('[contenteditable=true]').focus();
  await page.getByRole('button', { name: 'Show writing suggestions' }).click();
  await expect(page.getByRole('button', { name: 'Accept', exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Copy suggestion' })).toBeVisible();
  await worker.evaluate(() => {
    (globalThis as MockGlobal).reviewMock.fail = true;
  });
  await page.getByRole('button', { name: 'Check again' }).click();
  await expect(page.getByText('Ollama returned HTTP 503.', { exact: false })).toBeVisible();
});
test('options recover invalid memory through an explicit reset', async ({
  extension: { context, worker, optionsUrl },
}) => {
  await worker.evaluate(async () => {
    await chrome.storage.local.set({ memory: { version: 99 } });
  });
  const options = await context.newPage();
  await options.goto(optionsUrl);
  await expect(options.getByRole('status')).toContainText('Invalid memory');
  await options.getByRole('button', { name: 'Delete memory', exact: true }).click();
  await expect(options.getByRole('status')).toHaveText('Memory deleted.');
});

test('settings show Chrome’s actual assigned review shortcut', async ({
  extension: { context, worker, optionsUrl },
}) => {
  const shortcut = await worker.evaluate(async () => {
    const commands = await chrome.commands.getAll();

    return commands.find((command) => command.name === 'review-field')?.shortcut;
  });
  const options = await context.newPage();
  await options.goto(optionsUrl);
  await expect(options.locator('#review-shortcut')).toHaveText(
    shortcut
      ? `Use ${shortcut} to request a review.`
      : 'No review shortcut is assigned. Set one at chrome://extensions/shortcuts.',
  );
});

test('settings explain how to assign an unavailable review shortcut', async ({
  extension: { context, optionsUrl },
}) => {
  const options = await context.newPage();
  await options.addInitScript(() => {
    chrome.commands.getAll = async () => [{ name: 'review-field', shortcut: '' }];
  });
  await options.goto(optionsUrl);
  await expect(options.locator('#review-shortcut')).toHaveText(
    'No review shortcut is assigned. Set one at chrome://extensions/shortcuts.',
  );
});

const excludedFieldGroups = [
  {
    name: 'sensitive and unsupported editor branches',
    markup: [
      '<textarea disabled>The tests is failing.</textarea>',
      '<textarea readonly>The tests is failing.</textarea>',
      '<textarea inputmode="numeric">The tests is failing.</textarea>',
      '<input type="search" value="The tests is failing.">',
      '<input autocomplete="one-time-code" value="The tests is failing.">',
      '<input autocomplete="cc-name" value="The tests is failing.">',
      '<input autocomplete="username" value="The tests is failing.">',
      '<div aria-disabled="true"><textarea>The tests is failing.</textarea></div>',
      '<div inert><textarea>The tests is failing.</textarea></div>',
      '<div contenteditable="true"><span contenteditable="false" tabindex="0">The tests is failing.</span></div>',
      '<div role="combobox" contenteditable="true">The tests is failing.</div>',
      '<div class="monaco-editor" contenteditable="true">The tests is failing.</div>',
      '<div class="CodeMirror" contenteditable="true">The tests is failing.</div>',
      '<div data-slate-editor contenteditable="true">The tests is failing.</div>',
    ],
  },
  {
    name: 'renamed and legacy opt-out markers',
    markup: [
      '<div data-grammar-prose><textarea>The tests is failing.</textarea></div>',
      '<textarea data-grammar-prose-disabled>The tests is failing.</textarea>',
      '<div data-local-prose><textarea>The tests is failing.</textarea></div>',
      '<textarea data-local-prose-disabled>The tests is failing.</textarea>',
    ],
  },
];

for (const group of excludedFieldGroups) {
  test(`field eligibility excludes ${group.name}`, async ({ extension: { page, worker } }) => {
    for (const markup of group.markup) {
      await page.evaluate((html) => {
        const container = document.createElement('section');
        container.innerHTML = html;
        document.body.append(container);
        const target =
          container.querySelector<HTMLElement>('span') ??
          container.querySelector<HTMLElement>('textarea, input, [contenteditable]');
        target?.dispatchEvent(new FocusEvent('focusin', { bubbles: true, composed: true }));
      }, markup);
      await page.waitForTimeout(1000);
      expect(await worker.evaluate(() => (globalThis as MockGlobal).reviewMock.calls)).toBe(0);
    }
  });
}

for (const selection of [
  { start: 0, end: 0, expectedStart: 0, expectedEnd: 0 },
  { start: 5, end: 9, expectedStart: 22, expectedEnd: 22 },
  { start: 24, end: 30, expectedStart: 25, expectedEnd: 31 },
]) {
  test(`acceptance preserves selection at ${selection.start}:${selection.end}`, async ({
    extension: { page },
  }) => {
    await openReview(page);
    const field = page.locator('textarea').first();
    await field.evaluate((element: HTMLTextAreaElement, range) => {
      element.setSelectionRange(range.start, range.end, 'backward');
    }, selection);
    await page.getByRole('button', { name: 'Accept', exact: true }).click();
    await expect(field).toHaveValue('The tests are failing. Please fix this today.');
    expect(
      await field.evaluate((element: HTMLTextAreaElement) => ({
        start: element.selectionStart,
        end: element.selectionEnd,
        direction: element.selectionDirection,
      })),
    ).toEqual({
      start: selection.expectedStart,
      end: selection.expectedEnd,
      direction: selection.expectedStart === selection.expectedEnd ? 'forward' : 'backward',
    });
  });
}

test('programmatic edits and lost eligibility invalidate displayed suggestions', async ({
  extension: { page, worker },
}) => {
  await openReview(page);
  const field = page.locator('textarea').first();
  await field.evaluate((element: HTMLTextAreaElement) => {
    element.value = 'A different completed sentence.';
  });
  await expect(page.getByRole('button', { name: 'Accept', exact: true })).toBeHidden();
  await expect(page.getByRole('button', { name: 'Show writing suggestions' })).toBeHidden();
  await field.fill('The tests is failing. Please fix this today.');
  await openReview(page);
  await field.evaluate((element: HTMLTextAreaElement) => {
    element.readOnly = true;
  });
  await expect(page.getByRole('button', { name: 'Accept', exact: true })).toBeHidden();
  expect(
    await worker.evaluate(async () => (await chrome.storage.local.get('memory')).memory),
  ).toBeUndefined();
});

test('IME composition defers review until composition ends', async ({
  extension: { page, worker },
}) => {
  const field = page.locator('textarea').first();
  await field.focus();
  await field.dispatchEvent('compositionstart');
  await field.fill('The tests is failing.');
  await page.waitForTimeout(1200);
  expect(await worker.evaluate(() => (globalThis as MockGlobal).reviewMock.calls)).toBe(0);
  await field.dispatchEvent('compositionend');
  await expect(page.getByRole('button', { name: 'Show writing suggestions' })).toBeVisible();
});

for (const preflight of [
  { text: 'An unfinished thought', message: 'Finish a sentence with punctuation to review it.' },
  {
    text: 'The tests is failing. '.repeat(300),
    message: 'Use a field with at most 6,000 characters.',
  },
]) {
  test(`manual review explains: ${preflight.message}`, async ({ extension: { page, worker } }) => {
    await page.locator('textarea').first().fill(preflight.text);
    await worker.evaluate(async () => {
      const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
      const tabId = tabs[0]?.id;

      if (tabId === undefined) {
        throw new Error('Fixture tab unavailable.');
      }

      await chrome.tabs.sendMessage(tabId, { type: 'review-focused' });
    });
    await expect(page.getByText(preflight.message, { exact: true })).toBeVisible();
    expect(await worker.evaluate(() => (globalThis as MockGlobal).reviewMock.calls)).toBe(0);
  });
}
