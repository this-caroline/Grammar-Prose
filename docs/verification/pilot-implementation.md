# Personal-pilot implementation — 2026-10-04

Status: **release blocked; quality adoption pending**. Version remains `0.1.0`, storage schema remains 1. This report describes this work session separately from historical foundation and Qwen reports. No personal corpus or `EXAMPLE.md` was supplied or modified.

## Baseline and ownership

Frozen install used Node 26.10.0 and pnpm 12.6.0. Before changes, `pnpm check` passed 128 deterministic tests and the complete built-extension baseline passed 23 browser scenarios. A separate pre-change coverage run was not captured; current combined coverage is recorded below instead.

Existing domain validation owns passage, protected-term, numeric and duplicate rejection. It now returns fixed diagnostics through `inspectReview`; production `validateSuggestions` delegates to the same implementation. Raw schema validity is independently checked against the response schema and cannot certify meaning. Malformed HTTP/model JSON is distinct from transport failure. No new network destination, draft storage, automatic acceptance, timeout or text-limit change was introduced.

Settings and memory retain their existing readers, writers and schema. Legacy settings normalize in memory; current records round-trip; corrupt settings and unknown future versions fail without writes. Explicit recovery and the forward/rollback paths are described in [candidate notes](../release-pilot.md).

## Current model observation

Explicitly selected installed `qwen3.5:9b`, digest `6488c96fa5faab64bb65cbd30d4289e20e6130ef535a93ef9a49f42eda893ea7`, temperature zero, thinking disabled. The unchanged prompt and synthetic regression corpus were used:

- Run identity: `03d87e5b-3ebc-4fbd-bd94-af11beb3c45a`.
- Prompt SHA-256: `719835a2d60145deaf75fb64c3c080f69c14defce3ee5dfe1234d66b165c2f80`.
- Dataset SHA-256: `2ad1b1b0099cfc1636d272f243996228512e986190f6487c035084fa660525d2`.
- Local ignored report: `artifacts/evaluation-1791111947491.json`.
- 12/12 completed, 12/12 raw-schema valid, zero validation rejections, zero transport errors. Seven valid empty reviews, five proposals. All category sets matched.
- Agent raw inspection reproduced the known invented-fact tone rewrite. This is evidence of failure, not a human score or permission to adopt. The policy has not changed and tone has not been disabled.
- Latencies ranged from 2,957 to 12,984 ms. The first review took 12,984 ms; the remaining 11 were at most 7,169 ms. These are adapter timings on short synthetic cases, not 50 warm end-to-end reviews or a verified cold-start budget.

Dry-run dataset validation and offline scoring with an empty human-assessment file passed. The scoring result is **pending**. Reports store fixed outcomes, counts, hashes and boolean scores, never passages or arbitrary exception text. `--inspect` intentionally prints raw proposals for local inspection and should not be captured when using private cases.

**Decision:** reject the current baseline for v1 because of the observed invented-fact tone proposal. The human-scored personal-corpus decision remains pending.

The plan requires the approved 20–30 cases and additional approved holdout cases before the bounded prompt comparison and adoption decision. No personal labels were invented and no alternative model was selected or downloaded.

## Environment and resource limits

Read directly in this session: MacBookPro18,3, Apple M1 Pro, 16 GiB unified memory; macOS 26.5.2 (25F84); installed Chrome 154.0.8037.97; Ollama 0.34.4. Automated fixtures use Playwright's Chromium 153.0.8010.12, not the installed Chrome profile.

An idle snapshot after inference showed no loaded Ollama model and 5,814.88 MiB system-wide swap in use. No before-load baseline, workload attribution, enabled/disabled browser comparison or sustained resource series was captured. These values cannot establish extension-attributable memory growth or comfortable daily-use headroom.

## Automated proof

`pnpm check` passed 141 deterministic tests, the Python archive test and a clean production build. The complete instrumented browser suite passed 33/33 scenarios. Combined coverage: 86.38% lines, 86.37% statements, 81.76% functions and 88.62% branches. Branch coverage by ownership layer: adapters 100%, application 90.79%, Chrome 79.92%, domain 99.17%, evaluation 91.67%. Remaining uncovered branches are visible in ignored `coverage/coverage-final.json`; command-line orchestration is exercised separately by dry-run/scoring commands, not fully covered by these providers.

Focused checks proved React 19.3.0 state synchronization, exact replacement, surrounding text, selection and native undo/redo; same/cross-origin frames; settings invalidation; real worker stopped state and disappearance of its old in-memory context; keyboard review/Accept/Escape/status; and clean model setup with settings persistence. Transport is deterministic in browser tests.

The scrolling check exposed that a hidden offscreen badge stayed hidden on return. The content coordinator now retains whether a badge is available separately from viewport visibility, and the test verifies hide-and-return behavior. Rich editors remain copy-only.

Archive contents are allowlisted production files with fixed order, timestamp and permissions. The package unit test checks repeated bytes, exclusions and version mismatch without overwriting the prior archive. Manifest version is generated from `package.json`. Two final production rebuilds produced identical bytes. Archive SHA-256: `6921f87869f49b504d201cc57281adc81150fb713b84f5c9f1acbe081bf1d7eb`. The archive was extracted to ignored `artifacts/pilot-extracted` for the complete deterministic browser smoke suite; **33/33 scenarios passed against the extracted production archive**, including setup, settings persistence, Accept/undo, copy-only behavior, exclusions and service-error handling. This is not a real-Ollama or preserved-profile upgrade/rollback smoke test.

## Open gates

User-approved corpus and human raw-proposal scores; bounded prompt comparison and unseen-case confirmation; real stable Chrome, IME, Gmail, GitHub and Notion checks; browser zoom; 50 warm end-to-end reviews and cold/resource measurements under the normal workload; five elapsed days of pilot use; real-Ollama archive setup; preserved-profile upgrade/rollback; and hosted CI on the exact release commit remain unverified. Publishing is outside this task. These dependencies prevent delivering an approved `1.0.0` release in this session.
