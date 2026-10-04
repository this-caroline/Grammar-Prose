import { vi } from 'vitest';

export function createLocalStorage(initialRecords: Record<string, unknown> = {}) {
  const records = structuredClone(initialRecords);
  const get = vi.fn(async (key: string) =>
    Object.hasOwn(records, key) ? { [key]: structuredClone(records[key]) } : {},
  );
  const set = vi.fn(async (updates: Record<string, unknown>) => {
    Object.assign(records, structuredClone(updates));
  });

  return { records, get, set };
}
