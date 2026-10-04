import type { Request, Responses } from '../application/messages';
import { parseResponse } from '../application/responses';

export async function send<Message extends Request>(
  message: Message,
): Promise<Responses[Message['type']]> {
  let response: unknown;

  try {
    response = await chrome.runtime.sendMessage(message);
  } catch (error) {
    if (error instanceof Error && error.message.includes('Extension context invalidated')) {
      throw new Error(
        'Grammar Prose was reloaded. Save your text, then refresh this page to reconnect.',
      );
    }

    throw error;
  }

  return parseResponse<Message['type']>(message.type, response);
}
