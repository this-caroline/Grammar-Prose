# Foundation verification — 2026-10-03

Historical evidence from 2026-10-03. Counts, configuration, and decisions below describe those runs, not the current checkout. See the [upgrade plan](../upgrade-plan.md) for current gates and [compatibility matrix](../compatibility.md) for supported surfaces. Referenced `artifacts/` files are ignored local evidence and may be unavailable in a fresh checkout.

The runnable foundation is implemented, but the five-step foundation plan's commit gate is **not passed**. Real Ollama networking and explicit acceptance work. The selected `gemma3:4b` baseline produced a meaning-changing grammar correction and unnecessary tone suggestions. Do not interpret successful requests or category matches as semantic approval. No implementation commit was created during this verification.

## Environment and automated checks

- Apple M1 Pro, arm64 macOS, 16 GiB RAM.
- Node 26.10.0, pnpm 12.6.0; frozen installation passed.
- Playwright 1.63.0, bundled Chromium 153.0.8010.12, isolated temporary profiles.
- Oxfmt and `pnpm check` passed, including all 21 unit/integration tests and a clean build.
- All six built-extension browser tests passed: exact acceptance with native undo/redo, stale-result rejection, exclusions, persistent site disabling, rich-editor copy-only behavior with service errors, and explicit invalid-memory recovery.
- Coverage passed: statements 35.16%, branches 48.07%, functions 36.92%, lines 34.70%. Vitest does not collect the browser suite's coverage; content/editor/options code therefore remains largely absent from this report. Coverage is a baseline, not a completeness claim.
- Evaluation dry-run validated three synthetic cases. No personal benchmark was supplied.

## Real inference

Ollama 0.34.4 was started in a foreground session with cloud disabled, host `127.0.0.1:11434`, context length 8192, and the unpacked extension origin `chrome-extension://dofdoicibmajbhonjbikgmjhbdepgjcd`. Server startup confirmed cloud was disabled; `ollama ps` confirmed context 8192 and GPU execution. This origin is specific to this checkout. The temporary server was stopped after testing.

Model: `gemma3:4b`, Q4_K_M, digest `a2af6cc3eb7fa8be8504abaf9b04e88f17a119ec3f04a3addf55f92841195f5a`.

Prompt hash: `4fcbb0ee80b84bb7e0a1834bc47cdeac75df6ce55e6f76adf47a0bc4680de938`.

Dataset hash: `3900a52dfdb45af2c5993862c0c8edcfff66b17705148818f54cbaede608e38d`.

| Synthetic case | Initial run               | Warm run | Observed outcome                                                                        |
| -------------- | ------------------------- | -------- | --------------------------------------------------------------------------------------- |
| Agreement      | 7,373 ms, cold model load | 1,909 ms | One grammar suggestion; category matched, which does not establish meaning preservation |
| Firm request   | 2,076 ms                  | 2,056 ms | One unwanted tone suggestion; expected no change                                        |
| Numeric fact   | 2,015 ms                  | 1,899 ms | No suggestions; expected no change                                                      |

All six requests completed under the unchanged 25-second deadline. These are individual smoke measurements, not percentile budgets. Reports remain ignored under `artifacts/evaluation-1791048035950.json` and `artifacts/evaluation-1791048115607.json`.

## Real extension observations

A temporary Playwright script loaded the production build without replacing fetch. Settings discovered three installed models and explicitly saved `gemma3:4b`. The fixture review completed in approximately 4.9–5.9 seconds including scheduling and UI interaction.

The fixture contained the synthetic text “The tests is failing. Please fix this today.” The model proposed:

- “The test is failing.” This changes plural tests into one test instead of correcting verb agreement. The intended correction is “The tests are failing.”
- “Fix this today.” It labeled “Please fix this today.” harsh, with an explanation that does not support the rewrite.

The first smoke assertion deliberately expected the meaning-preserving plural correction and failed. A subsequent mechanics-only check confirmed that accepting the actual returned singular correction changed only that passage, preserved the following sentence, and supported native undo/redo. This does **not** turn the semantic failure into a passing test. Before acceptance, the original field remained unchanged. A screenshot remains locally at `artifacts/real-review.png`.

For the separate firm-request case, the extension suggested “Resolve the failing tests today.” in place of “Fix the failing tests today.” Urgency and deadline remained, but this was an unnecessary tone correction. The numeric case produced no suggestions.

A nonexistent model showed “Ollama returned HTTP 404. Check your model and Ollama server.” A request using an unlisted extension origin received HTTP 403. After the temporary server was stopped, the desktop app automatically restarted its own server without the test origin. The extension then displayed “Ollama denied this extension origin. See setup instructions.” This verifies denied-origin UI, but the stopped-server check remains unverified because the server restarted. Real-request stale rejection and rich-editor behavior were not repeated with the model; the deterministic browser suite covers those behaviors.

These observations were made by the coding agent through an isolated browser and screenshot inspection. They are not a human semantic review or evidence of compatibility with real sites or a personal Chrome profile.

## Remaining gate

Steps 1–3 are verified in an isolated Chromium environment. Step 4's automated suite passes, but model usefulness and meaning preservation fail. The stopped-server smoke check was completed in the follow-up below. Step 5 remains pending. Retain the current timeout, validation rules, and explicit acceptance requirement.

Next work should compare a deliberately selected model or a bounded prompt change against an expanded, agreed corpus, including plural facts and tone false positives. Do not tune repeatedly against these three smoke cases or claim daily-use readiness. Human review of the real-model fixture remains required before the planned foundation commit.

## Follow-up: bounded prompt comparison

On 2026-10-03, compared the unchanged production prompt with one candidate that explicitly preserves subjects and singular/plural facts, disallows stylistic synonym substitutions, and reserves tone corrections for personal attacks, contempt, or passive-aggressive wording. No examples from the evaluation set were added to the prompt. The candidate was **rejected for adoption**; production policy remains unchanged.

The expanded `evals/foundation-regressions.json` contains 12 synthetic cases, not human-approved personal examples. Both prompts used the same installed model/digest, context 8192, temperature zero, schema, application validation, and 25-second deadline. Runs were sequential, alternating baseline and candidate per case. Raw and validated suggestions were inspected separately. Local comparison code, candidate text, and timing metadata remain in ignored `artifacts/compare-prompts.mjs`, `artifacts/candidate-policy.txt`, and `artifacts/prompt-comparison.json`.

| Measure                                 | Production baseline | Candidate |
| --------------------------------------- | ------------------- | --------- |
| Completed requests                      | 12/12               | 12/12     |
| Expected category sets after validation | 7/12                | 11/12     |
| Median observed latency                 | 2,784.5 ms          | 1,772 ms  |
| Maximum observed latency                | 22,213 ms           | 2,732 ms  |

The baseline's first request included cold model loading; the candidate ran warm, so these timing differences do not establish a fair speed improvement. Candidate prompt SHA-256: `719835a2d60145deaf75fb64c3c080f69c14defce3ee5dfe1234d66b165c2f80`.

The higher category score is insufficient for adoption:

- Both prompts changed plural tests to singular test in the agreement and combined fixture cases. Category matching counts these meaning-changing corrections as matches.
- The candidate still labeled the firm request harsh and suggested changing “the” to “these,” with an unsupported explanation.
- The candidate correctly left the new invoice deadlines, negated approval, factual technical criticism, and already-correct plural sentence alone. Both prompts correctly repaired agreement in the new workers and report cases.
- For the personal attack, the baseline duplicated the following requested action; the candidate removed the insult but added unsolicited “Please.” Neither is a clean demonstration of all policy requirements.
- Some baseline raw suggestions were discarded because they were empty, unchanged, or altered numeric notation. A validated empty result is not evidence that the model itself produced a correct empty review.

No human semantic scores were assigned. Next-model comparison is pending explicit model selection. Do not repeatedly tune this prompt against the same small corpus.

The stopped-server UI check was subsequently completed after closing the desktop app and stopping the temporary server: the built extension displayed “Cannot reach local Ollama. Open settings to check the connection.” This resolves the earlier stopped-server verification gap. The desktop app was reopened afterward; local-only test configuration must be reapplied before further inference. Model quality and human review remain the foundation commit blockers.

## Architecture review follow-up

On 2026-10-03, `pnpm check` passed with 128 deterministic tests, and the production built-extension suite passed all 21 scenarios in isolated Chromium. Four held-feedback scenarios cover acceptance and rejection, each with successful and failed persistence, while another field receives a new review. Late replies preserve the newer suggestions and status, and the newer suggestion remains actionable. A further scenario verifies that checking resumes after acceptance when feedback outlasts snapshot polling. Existing native undo/redo, selection mapping, stale-inference, IME-deferral, site-disable, and copy-only scenarios also passed.

Model discovery now belongs to the Ollama adapter, settings writes belong to the validated storage adapter, and shadow-DOM rendering belongs to the Chrome view module. Authorization and serialized writes remain in the worker; review-session identity remains in the content coordinator. The response boundary reuses domain checks for suggestion fields and category/pattern consistency. These changes do not establish real-site compatibility or model quality; no inference was performed for this follow-up.
