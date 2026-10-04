import { expect, test, vi } from 'vitest';

import { readModelDigest } from '../src/evaluation/model-digest';

const digest = 'a'.repeat(64);

test('model digest lookup skips invalid entries and returns the first valid exact match', async () => {
  const fetchModels = vi.fn<typeof fetch>().mockResolvedValue(
    Response.json({
      models: [
        null,
        { name: 'other', digest },
        { name: 'local:latest', digest: 123 },
        { name: 'local:latest', digest: 'A'.repeat(64) },
        { name: 'local:latest', digest: 'a'.repeat(63) },
        { name: 'local:latest', digest },
        { name: 'local:latest', digest: 'b'.repeat(64) },
      ],
    }),
  );
  vi.stubGlobal('fetch', fetchModels);

  expect(await readModelDigest('local:latest')).toBe(digest);
  expect(fetchModels).toHaveBeenCalledTimes(1);

  const [url, options] = fetchModels.mock.calls[0]!;

  expect(url).toBe('http://localhost:11434/api/tags');
  expect(options?.redirect).toBe('error');
  expect(options?.signal).toBeInstanceOf(AbortSignal);
});

test.each([
  { label: 'non-record response', modelList: null },
  { label: 'missing models', modelList: {} },
  { label: 'non-array models', modelList: { models: {} } },
  { label: 'missing model', modelList: { models: [{ name: 'other', digest }] } },
  {
    label: 'invalid digest',
    modelList: { models: [{ name: 'local:latest', digest: 'g'.repeat(64) }] },
  },
])('model digest lookup returns null for $label', async ({ modelList }) => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json(modelList)));

  expect(await readModelDigest('local:latest')).toBeNull();
});

test.each([
  { label: 'HTTP failure', response: new Response('{}', { status: 500 }) },
  { label: 'invalid JSON', response: new Response('{') },
])('model digest lookup tolerates $label', async ({ response }) => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response));

  expect(await readModelDigest('local:latest')).toBeNull();
});

test('model digest lookup tolerates transport failure', async () => {
  vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('Connection failed')));

  expect(await readModelDigest('local:latest')).toBeNull();
});
