import { test, expect, vi } from 'vitest';

import { ChromeMemory, readSettings, writeSettings } from '../src/adapters/storage';
import { defaultSettings } from '../src/application/settings';
import { emptyMemory } from '../src/domain/review';
import { createLocalStorage } from './helpers/storage';

function storage(records: Record<string, unknown>) {
  const local = createLocalStorage(records);
  vi.stubGlobal('chrome', { storage: { local } });

  return local.set;
}

test('missing records use defaults; legacy settings migrate in memory only', async () => {
  const set = storage({});
  expect(await readSettings()).toEqual(defaultSettings());
  expect(await new ChromeMemory().read()).toEqual(emptyMemory());
  expect(set).not.toHaveBeenCalled();
  storage({ settings: { model: 'local', disabledSites: [] } });
  expect(await readSettings()).toEqual({ version: 1, model: 'local', disabledSites: [] });
});
test('invalid records fail without silently overwriting user data', async () => {
  const set = storage({ memory: { version: 99 }, settings: null });
  await expect(new ChromeMemory().read()).rejects.toThrow();
  await expect(readSettings()).rejects.toThrow();
  expect(set).not.toHaveBeenCalled();
});
test('writes validate memory before touching storage', async () => {
  const set = storage({});
  await new ChromeMemory().write(emptyMemory());
  expect(set).toHaveBeenCalledWith({ memory: emptyMemory() });
  set.mockClear();
  await expect(new ChromeMemory().write({ ...emptyMemory(), tooSoft: -1 })).rejects.toThrow();
  expect(set).not.toHaveBeenCalled();
});

test('memory writes round-trip through storage without retaining caller references', async () => {
  const set = storage({});
  const memory = { ...emptyMemory(), terms: ['GitLab'] };
  const adapter = new ChromeMemory();
  await adapter.write(memory);
  memory.terms.push('mutated after write');

  const stored = await adapter.read();
  expect(stored).toEqual({ ...emptyMemory(), terms: ['GitLab'] });
  stored.terms.push('mutated after read');
  expect(await adapter.read()).toEqual({ ...emptyMemory(), terms: ['GitLab'] });
  expect(set).toHaveBeenCalledTimes(1);
});

test('settings writes normalize valid records and reject invalid data before persistence', async () => {
  const set = storage({});
  await writeSettings({
    version: 1,
    model: ' local ',
    disabledSites: ['EXAMPLE.COM', 'example.com'],
  });
  expect(set).toHaveBeenCalledWith({
    settings: { version: 1, model: 'local', disabledSites: ['example.com'] },
  });
  set.mockClear();
  await expect(
    writeSettings({ version: 1, model: 'local', disabledSites: ['example.com/path'] }),
  ).rejects.toThrow();
  expect(set).not.toHaveBeenCalled();
});
