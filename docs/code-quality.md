# Code quality gate

Correct behavior and readable implementation are both completion requirements. This gate applies equally to code written by people and code generated or modified by an AI coding tool.

## Required qualities

- Follow Oxfmt and the type-aware Oxlint configuration. Do not suppress enabled rules with inline directives, naming exceptions, per-file relaxations, or disabled-rule overrides.
- Group and deterministically order imports, followed by a blank line before executable code.
- Use descriptive names for domain concepts, state, callbacks, and intermediate results.
- Separate declarations, control flow, and unrelated operations with readable logical blocks.
- Expand nested conditionals, dense expressions, and one-line logic when the expanded form is easier to verify.
- Keep functions focused and within the configured size and nesting limits.
- Remove unused imports and variables rather than silencing their diagnostics.
- Match the domain, application, adapter, and Chrome boundaries in [architecture.md](architecture.md).
- Prefer explicit code that preserves product invariants over clever code that minimizes line count.

Oxfmt owns whitespace, operator spacing, object and array layout, and supported file formatting. Oxlint adds semantic readability rules for imports, padding between statement groups, braces, naming, nested conditionals, function size, unsafe values, promises, and unused code.

## Comments

Prefer clear names and straightforward code. Add a comment only when a necessary,
non-obvious constraint or reason cannot be expressed clearly in the code itself,
such as native undo behavior, asynchronous ordering, browser execution contexts,
or incompatible coverage formats. Explain why the implementation must work that
way; do not narrate operations, repeat types, or restate a test's assertions.
Remove comments that become redundant after refactoring. Complexity alone is not
permission to document code that should first be simplified.

## Readable conditions

Group guard clauses by the rule they enforce. Validate the outer record first,
then each field's type and bounds, then cross-field relationships. Keep a field's
short-circuit type check beside operations that require that type. For example,
`typeof model !== 'string' || model.length > 200` is one model rule; version,
model, and hostname validation belong in separate guards.

Aim for at most three simple clauses in a condition. This is a review guideline,
not a mechanical count: a short named invariant can legitimately combine several
checks. Split unrelated rules even when they fit on one line. Prefer positive
predicate names that describe a domain fact, and extract a function when it owns
a coherent operation, such as parsing one evaluation case. Avoid hiding a long
expression behind a vague boolean or creating one helper per trivial comparison.

Keep validation order and short-circuit safety explicit. Do not evaluate every
check eagerly in a boolean array, access a field before proving the record/type,
or change accepted input, limits, migration, and error messages during a
readability refactor. Repeated guard error messages are acceptable when they make
the rejection rules easier to audit without an error-helper abstraction.

## Types and unused code

Explicit `any` and unsafe assignments, calls, arguments, member access, and
returns are lint errors. TypeScript strict mode also rejects implicit `any`.
Do not replace an unvalidated boundary value with a type assertion that pretends
it is already a valid request, response, settings record, or model result.

`unknown` expresses untrusted input at message, JSON, storage, and error boundaries.
Narrow it with runtime validation before using it. Inside validated application
logic, use concrete domain types; the serialized write queue, for example, tracks
completion with `Promise<void>` rather than storing an unspecified result.

Unused local declarations and parameters fail both lint and TypeScript checks.
Lint checks every parameter and caught error, with no underscore-name exemption;
omit unused callback bindings instead of renaming them. TypeScript independently
enables `noUnusedLocals` and `noUnusedParameters`. Fallow checks project-wide
unused exports and files, which a per-file lint cannot detect. No baseline accepts
existing unused-code findings.

## Enforced branching and review gates

Oxlint limits modified cyclomatic complexity to 12 per function and parameters to
five. Modified complexity counts a switch once, so adding a typed message case
is not penalized like adding an independent condition; boolean operators and
conditional branches still count. The budget supplements the existing 80-line
and four-level nesting limits. It is a ceiling, not a target. Boundary validators
may need several field checks; do not split them into meaningless predicates just
to lower a score. Request dispatch belongs in a typed switch with authorization
checks kept beside the operation they protect.

Strict equality, unnecessary ternaries, lonely nested `if` statements, and
non-exhaustive union switches are errors. A default branch does not substitute
for named union cases. The response parser names each empty acknowledgement
variant, so a new request cannot silently bypass response validation.

Naming length and casing cannot enforce meaningful names. Before completing a
change, review these questions alongside the automated gate:

- Does each name explain the domain fact, result, or operation it represents?
  Replace vague names such as `data`, `value`, or `item` when the context does not
  make their role immediately clear. They can remain useful in generic validators.
- Can a reader explain each compound condition and its failure behavior without
  following aliases across files? Name a domain predicate when it conveys a real
  concept; retain explicit boundary checks when extraction hides validation.
- Does each branch belong to this function, and can mutually exclusive dispatch
  use the existing discriminated union?
- Do tests demonstrate rejected input, authorization, cancellation, stale results,
  and other affected invariants, rather than mirroring private helper structure?

Enabling every lint rule is not the acceptance criterion. A trial of
`typescript/no-unnecessary-condition` flags the required post-await abort check:
TypeScript narrowing does not model external mutation of `AbortSignal.aborted`.
Do not remove cancellation checks to satisfy that rule. Strict boolean expressions
also need a separate audit of nullable strings, numeric IDs, and browser types;
they are not enabled by this change.

## Evaluation and coverage audit

The deterministic test gate now parses both checked-in synthetic evaluation
corpora. This catches broken dataset contracts without inference. It does not
measure model quality. See [evaluation.md](evaluation.md) for the separate model
acceptance requirements.

Coverage reporting is advisory, not a failure gate. Review coverage by layer:
a global average can hide an untested security boundary. Browser fixture coverage
does not establish real-site compatibility or semantic quality.

Dead-code analysis is blocking through `pnpm dead-code`, included in `pnpm check`.
The pinned Fallow scan fails on findings and parser failures, including unused
entry exports. Cognitive-complexity health analysis remains advisory.

## Completion workflow

```sh
pnpm format
pnpm check
```

Run the focused browser or evaluation command when the changed behavior requires it. `pnpm check` verifies formatting, linting, type checking, unused-code analysis, deterministic tests, the Python 3 standard-library archive test, and a clean build. CI installs from `pnpm-lock.yaml` with `--frozen-lockfile`, repeats that gate, runs Playwright, and collects coverage.

Do not mark an AI-assisted task complete because the generated code compiles. It is complete only when the relevant behavior is tested, the full quality gate passes, and the implementation remains clear to a maintainer reading it without the generation context.

## Fallow analysis

Run `pnpm dead-code` for the pinned blocking scan. `.fallowrc.json`
declares the runtime roots bundled by `scripts/build.ts`, `scripts/eval.ts`, `scripts/score.ts`, and the React browser fixture.
The editor is reached through the content script. These files are required runtime
code, even when the analyzer cannot discover esbuild's `entryPoints` property.
The sole unresolved-import exception, `./options.js`, is generated from
`src/chrome/options.ts` beside the copied HTML in `dist`; it is not a missing source
module. The default export in `playwright.config.ts` is explicitly exempted
because Playwright consumes it at runtime; other exports in that file are checked.
Keep these declarations aligned with the build scripts.

For health analysis, first run `pnpm test:coverage`, then
`npx fallow@3.31.0 health --coverage coverage/coverage-final.json`. Coverage now runs
both Vitest and the built extension in isolated Chromium. Istanbul instruments
TypeScript before esbuild transforms it, preserving original source locations.
Chrome DevTools Protocol reads the content script's isolated execution world;
options-page coverage is collected as well. Content, editor, options, and view use
browser coverage; all other source files use Vitest coverage. V8 and Istanbul
produce different ranges, so combining providers for the same file would create
duplicate maps and misleading totals. The merged report at
`coverage/coverage-final.json` is the input for Fallow, and
`coverage/coverage-summary.json` contains combined totals. The HTML report under
`coverage/unit` covers unit tests only. Browser snapshots are collected from live
contexts at scenario end; documents destroyed by navigation are not recovered.

The instrumented bundle lives under `coverage/extension`, separate from the
production `dist` build. Its bootstrap uses `globalThis` directly to respect
extension CSP. Coverage does not add permissions, network destinations, persisted
drafts, or instrumentation to production bundles. Failed test runs do not publish
a merged report, and each run removes previous reports before collecting evidence.
CI retains the production browser run and also runs the instrumented suite.

Fallow's refactoring targets are recommendations, not failures. Importer count
alone does not justify splitting a small module with one clear responsibility.

## Unit test design

Exercise real domain validators, application use cases, and adapters. Substitute
only unavailable external boundaries: Chrome APIs and network transport. Keep
scenario responses local to each test; do not install a universal success mock
that could hide an unexpected request. Vitest's `unstubGlobals` and `restoreMocks`
restore those boundaries automatically between tests. Reset modules only for
side-effect entry points such as the background worker.

Use `tests/helpers/storage.ts` for Chrome local-storage scenarios. Its key-based
reads and cloned records prevent shared references or ignored keys from masking
persistence bugs. This fake covers only the promise-based single-key operations
used here; built-extension tests remain the proof for actual Chrome behavior.

Assert full observable results when fields matter, error causes/messages when
failure behavior matters, and absent boundary calls for rejected requests. Pair
rejection cases with accepted boundary values. Use named, parameterized cases
instead of nested loops, and keep expected contracts independent of production
constants when a changed limit or taxonomy must trigger review. Extract helpers
for repeated boundary behavior, not for trivial assertions or unrelated fixtures.
