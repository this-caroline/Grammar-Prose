import { expect, test, vi } from 'vitest';

import { send } from '../src/chrome/messages';

test('an invalidated extension context explains how to reconnect', async () => {
  vi.stubGlobal('chrome', {
    runtime: {
      sendMessage: () => {
        throw new Error('Extension context invalidated.');
      },
    },
  });

  await expect(send({ type: 'settings' })).rejects.toThrow(
    'Grammar Prose was reloaded. Save your text, then refresh this page to reconnect.',
  );
});

test('unrelated messaging errors retain their original cause', async () => {
  const failure = new Error('The message port closed before a response was received.');
  vi.stubGlobal('chrome', {
    runtime: { sendMessage: () => Promise.reject(failure) },
  });

  await expect(send({ type: 'settings' })).rejects.toBe(failure);
});
