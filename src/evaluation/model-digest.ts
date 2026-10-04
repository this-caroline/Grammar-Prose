import { ENDPOINT } from '../adapters/ollama';
import { REVIEW_TIMEOUT_MS } from '../application/review';
import { isRecord } from '../domain/validation';

export async function readModelDigest(model: string): Promise<string | null> {
  try {
    const response = await fetch(`${ENDPOINT}/api/tags`, {
      redirect: 'error',
      signal: AbortSignal.timeout(REVIEW_TIMEOUT_MS),
    });

    if (!response.ok) {
      return null;
    }

    const modelList: unknown = await response.json();

    return findModelDigest(modelList, model);
  } catch {
    return null;
  }
}

function findModelDigest(modelList: unknown, model: string): string | null {
  if (!isRecord(modelList) || !Array.isArray(modelList.models)) {
    return null;
  }

  for (const entry of modelList.models as unknown[]) {
    if (!isRecord(entry) || entry.name !== model) {
      continue;
    }

    if (typeof entry.digest === 'string' && /^[a-f0-9]{64}$/.test(entry.digest)) {
      return entry.digest;
    }
  }

  return null;
}
