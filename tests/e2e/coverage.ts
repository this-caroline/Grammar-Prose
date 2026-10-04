import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import type { BrowserContext, Page, Worker } from '@playwright/test';

async function pageCoverage(context: BrowserContext, page: Page): Promise<string[]> {
  const session = await context.newCDPSession(page);
  const contextIds: number[] = [];
  session.on('Runtime.executionContextCreated', ({ context: executionContext }) => {
    contextIds.push(executionContext.id);
  });
  await session.send('Runtime.enable');
  const snapshots: string[] = [];

  try {
    for (const contextId of contextIds) {
      // Content scripts run in an isolated world, outside page.evaluate's context.
      const { result, exceptionDetails } = await session.send('Runtime.evaluate', {
        expression: 'JSON.stringify(globalThis.__coverage__)',
        contextId,
        returnByValue: true,
      });

      if (exceptionDetails) {
        throw new Error('Could not read extension coverage.');
      }

      const value: unknown = result.value;

      if (typeof value === 'string') {
        snapshots.push(value);
      }
    }
  } finally {
    await session.detach();
  }

  return snapshots;
}

export async function saveBrowserCoverage(
  context: BrowserContext,
  worker: Worker,
  outputDirectory: string,
): Promise<void> {
  const snapshots = await Promise.all(context.pages().map((page) => pageCoverage(context, page)));
  const workerSnapshot = await worker.evaluate(() => {
    const runtime = globalThis as typeof globalThis & { __coverage__?: unknown };

    return JSON.stringify(runtime.__coverage__);
  });

  if (!workerSnapshot || !snapshots.flat().length) {
    throw new Error(
      'Coverage requires an instrumented extension in both worker and content worlds.',
    );
  }

  await mkdir(outputDirectory, { recursive: true });

  for (const [index, snapshot] of [...snapshots.flat(), workerSnapshot].entries()) {
    await writeFile(join(outputDirectory, `${index}.json`), snapshot);
  }
}
