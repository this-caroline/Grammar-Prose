import { defaultSettings, validateSettings, type Settings } from '../application/settings';
import { emptyMemory, validateMemory, type Memory } from '../domain/review';

export async function readSettings(): Promise<Settings> {
  const data = await chrome.storage.local.get('settings');
  const settings: unknown = data.settings;

  return settings === undefined ? defaultSettings() : validateSettings(settings);
}

export async function writeSettings(settings: Settings): Promise<void> {
  await chrome.storage.local.set({ settings: validateSettings(settings) });
}

export class ChromeMemory {
  async read(): Promise<Memory> {
    const data = await chrome.storage.local.get('memory');
    const memory: unknown = data.memory;

    return memory === undefined ? emptyMemory() : validateMemory(memory);
  }

  async write(memory: Memory): Promise<void> {
    await chrome.storage.local.set({ memory: validateMemory(memory) });
  }
}
