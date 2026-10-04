import { isRecord, isStringArray } from '../domain/validation';

export interface Settings {
  version: 1;
  model: string;
  disabledSites: string[];
}
export const defaultSettings = (): Settings => ({ version: 1, model: '', disabledSites: [] });

export function validateSettings(value: unknown): Settings {
  if (!isRecord(value)) {
    throw new Error('Invalid settings. Use hostnames only.');
  }

  const { version, model, disabledSites } = value;

  if (version !== undefined && version !== 1) {
    throw new Error('Invalid settings. Use hostnames only.');
  }

  if (typeof model !== 'string' || model.length > 200) {
    throw new Error('Invalid settings. Use hostnames only.');
  }

  if (!isStringArray(disabledSites) || disabledSites.length > 1000) {
    throw new Error('Invalid settings. Use hostnames only.');
  }

  if (disabledSites.some((site) => !/^[a-z0-9.:[\]-]+$/i.test(site))) {
    throw new Error('Invalid settings. Use hostnames only.');
  }

  return {
    version: 1,
    model: model.trim(),
    disabledSites: [...new Set(disabledSites.map((site) => site.toLowerCase()))],
  };
}
