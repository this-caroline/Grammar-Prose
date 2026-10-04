import type { OllamaPort } from '../application/review';
import { policy } from '../domain/policy';
import { responseSchema, type Memory } from '../domain/review';
import { isRecord } from '../domain/validation';

export const ENDPOINT = 'http://localhost:11434';

export class LocalOllama implements OllamaPort {
  async listModels(signal: AbortSignal): Promise<string[]> {
    const response = await fetch(`${ENDPOINT}/api/tags`, { redirect: 'error', signal });

    if (!response.ok) {
      throw new Error(`Ollama returned HTTP ${response.status}.`);
    }

    const data: unknown = await response.json();

    if (!isRecord(data) || !Array.isArray(data.models)) {
      throw new Error('Ollama returned an invalid model list.');
    }

    return data.models.map((model: unknown) => {
      if (!isRecord(model) || typeof model.name !== 'string') {
        throw new Error('Ollama returned an invalid model list.');
      }

      return model.name;
    });
  }

  async review(text: string, memory: Memory, model: string, signal: AbortSignal): Promise<unknown> {
    if (!model.trim()) {
      throw new Error('Choose an installed Ollama model in settings.');
    }

    const response = await fetch(`${ENDPOINT}/api/chat`, {
      method: 'POST',
      signal,
      redirect: 'error',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model,
        stream: false,
        think: false,
        format: responseSchema,
        options: { temperature: 0 },
        messages: [
          { role: 'system', content: policy },
          { role: 'user', content: JSON.stringify({ memory, draft: text }) },
        ],
      }),
    });

    if (!response.ok) {
      throw new Error(
        response.status === 403
          ? 'Ollama denied this extension origin. See setup instructions.'
          : `Ollama returned HTTP ${response.status}. Check your model and Ollama server.`,
      );
    }

    const data: unknown = await response.json();

    if (!isRecord(data) || !isRecord(data.message) || typeof data.message.content !== 'string') {
      throw new Error('Ollama returned an invalid response.');
    }

    try {
      return JSON.parse(data.message.content) as unknown;
    } catch {
      throw new Error('Ollama returned invalid JSON. Try another model.');
    }
  }
}
