import { spawnSync } from 'node:child_process';
import { readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

import coverageLibrary, { type CoverageMapData } from 'istanbul-lib-coverage';

function run(argumentsList: string[], collectBrowserCoverage = false): void {
  const result = spawnSync('pnpm', argumentsList, {
    stdio: 'inherit',
    env: { ...process.env, GRAMMAR_PROSE_COVERAGE: collectBrowserCoverage ? '1' : '0' },
  });

  if (result.error) {
    throw result.error;
  }

  if (result.status !== 0) {
    throw new Error(`pnpm ${argumentsList.join(' ')} failed (${result.status}).`);
  }
}

async function mergeCoverage(): Promise<void> {
  const unitReport = await readFile('coverage/unit/coverage-final.json', 'utf8');
  const coverage = coverageLibrary.createCoverageMap(JSON.parse(unitReport) as CoverageMapData);
  const browserSources = new Set(
    ['content', 'editor', 'options', 'view'].map((moduleName) =>
      resolve(`src/chrome/${moduleName}.ts`),
    ),
  );
  // V8 and Istanbul use different function/statement ranges. Never merge two
  // providers for the same file: that creates duplicate, apparently untested maps.
  coverage.filter((filename) => !browserSources.has(filename));
  const browserFiles = await readdir('coverage/browser', { recursive: true });

  for (const file of browserFiles.filter((filename) => filename.endsWith('.json'))) {
    const report = await readFile(resolve('coverage/browser', file), 'utf8');
    const browserCoverage = coverageLibrary.createCoverageMap(
      JSON.parse(report) as CoverageMapData,
    );
    browserCoverage.filter((filename) => browserSources.has(filename));
    coverage.merge(browserCoverage);
  }

  for (const filename of browserSources) {
    const fileCoverage = coverage.fileCoverageFor(filename);

    if (!Object.values(fileCoverage.f).some((count) => count > 0)) {
      throw new Error(`Missing executed browser coverage for ${filename}.`);
    }
  }

  const summary = coverage.getCoverageSummary().toJSON();
  await writeFile('coverage/coverage-final.json', JSON.stringify(coverage.toJSON()));
  await writeFile('coverage/coverage-summary.json', JSON.stringify(summary, null, 2));
  process.stdout.write(
    `Combined unit and Chromium coverage:\n${JSON.stringify(summary, null, 2)}\n`,
  );
}

await rm('coverage', { recursive: true, force: true });
run(['exec', 'vitest', 'run', '--coverage', '--coverage.reportsDirectory=coverage/unit']);

run(['build'], true);
run(['exec', 'playwright', 'test', '--max-failures=1'], true);
await mergeCoverage();
