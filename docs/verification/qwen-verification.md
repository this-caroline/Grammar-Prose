# Qwen development candidate — 2026-10-03

Historical evidence from 2026-10-03. Counts, configuration, and decisions below describe those runs, not the current checkout. See the [upgrade plan](../upgrade-plan.md) for current gates and [compatibility matrix](../compatibility.md) for supported surfaces. Referenced `artifacts/` files are ignored local evidence and may be unavailable in a fresh checkout.

`qwen3.5:9b` is installed and selected as the development model in the setup documentation. It resolves the original plural-agreement failure when paired with the conservative prompt. This is a development recommendation, not semantic certification: a tone rewrite still invented a factual claim. Human scoring and the foundation commit remain pending.

## Configuration

- Apple M1 Pro, 16 GiB unified memory, macOS arm64; Ollama 0.34.4.
- Model `qwen3.5:9b`, 9.7B, Q4_K_M; download size 6,594,474,711 bytes.
- Model digest `6488c96fa5faab64bb65cbd30d4289e20e6130ef535a93ef9a49f42eda893ea7`.
- Local-only foreground Ollama, bound to `127.0.0.1:11434`; cloud disabled, context 8192, exact test extension origin allowed.
- `/api/show` reports thinking values `[false, true]`, default `true`. The adapter now explicitly sends `think: false`, and evaluation reports record it. Alternative models need to support that request control; reasoning-only models are not verified.
- Temperature zero, structured JSON, unchanged 25-second deadline and 6,000-character limit. No automatic model selection or settings migration was added.

## Bounded comparison

The existing production prompt was evaluated first, followed by the already-written conservative candidate. There was no further prompt tuning. Both used the same 12 synthetic cases and application validation. The raw suggestions were inspected alongside the validated suggestions; no human semantic scores were assigned.

| Combination                | Requests completed | Category matches | Median latency | Maximum latency |
| -------------------------- | ------------------ | ---------------- | -------------- | --------------- |
| Qwen + original prompt     | 12/12              | 10/12            | 4,409.5 ms     | 10,991 ms       |
| Qwen + conservative prompt | 12/12              | 12/12            | 3,069.5 ms     | 7,712 ms        |

The original-prompt run began with a cold load; the conservative run was warm. Timing differences are descriptive, not proof of a speed improvement. Model defaults beyond the explicitly supplied options are model-specific, so comparisons with Gemma are comparisons of deployment configurations rather than isolated parameter counts.

The original prompt corrected plural agreement but still removed “Please” in the combined fixture and rewrote negated approval unnecessarily. It also duplicated the required action when replacing a personal insult.

The conservative prompt correctly repaired all four grammar cases while retaining subject number and numeric facts. It left firm requests, polite requests, deadlines, negation, factual criticism, and correct plural prose unchanged. It was adopted as the development prompt because it removes the observed regressions relative to the previous prompt on this corpus.

**Remaining semantic failure:** for “You are an idiot. Fix the failing tests today.” it replaced the insult with “The code is incorrect.” The input does not establish that claim. Its category is correctly labeled tone, so the 12/12 category score conceals this failure. Do not describe the model as passing all semantic tests or ready for daily use.

Prompt SHA-256: `719835a2d60145deaf75fb64c3c080f69c14defce3ee5dfe1234d66b165c2f80`.

The normal production evaluation command was then run with the adopted prompt:

```sh
pnpm eval -- --model qwen3.5:9b --dataset evals/foundation-regressions.json
```

All 12 requests completed, all category sets matched, and observed latencies ranged from 3,010 to 7,555 ms. Report: ignored local file `artifacts/evaluation-1791050951458.json`. Dataset SHA-256: `2ad1b1b0099cfc1636d272f243996228512e986190f6487c035084fa660525d2`. This rerun verifies the production adapter configuration; it does not add a semantic approval.

## Extension and resource observations

The production build was loaded into an isolated Chromium 153.0.8010.12 profile with real Ollama fetches. Settings discovered four models and explicitly saved Qwen in that temporary profile. No personal Chrome profile was modified.

The fixture displayed exactly one suggestion: “The tests is failing.” → “The tests are failing.” It preserved “Please fix this today.” and left the field unchanged before acceptance. Accept, native undo, and native redo all passed with exact full-field assertions. Review plus UI scheduling took 8,499 ms. The coding agent inspected the screenshot at ignored local path `artifacts/qwen-real-review.png`; this is not a human semantic score.

`ollama ps` reported 5.7 GB loaded, 100% GPU, context 8192. With the current desktop workload and Chromium testing, system-wide free-memory percentages sampled at 17–23%; swap usage sampled at roughly 5,730–8,426 MiB. No pre-load swap baseline was captured, so these totals cannot be attributed to Qwen. The observed latencies fit the deadline, but comfortable memory headroom under sustained normal use has not been established. This model is a more plausible fit than the larger installed alternatives, not a guarantee of swap-free operation.

## Validation and remaining work

Frozen install, Oxfmt, `pnpm check` (21 unit/integration tests plus build), and six deterministic built-extension browser tests passed during integration. The transport contract test now verifies `think: false`. The real Qwen acceptance test passed after the prompt was adopted. Loopback-only inference, explicit acceptance, snapshot checks, native undo, and no persisted drafts remain unchanged.

Reload the built extension and explicitly select `qwen3.5:9b` in your own Chrome settings. The foreground test server uses this checkout's unpacked extension origin; a different extension ID needs the documented server restart with its own origin.

Before daily use, obtain human semantic scores on the agreed personal corpus, address invented facts in tone rewrites, and measure sustained latency and memory pressure with the normal browser workload. Do not expand editor-support claims from these fixture results. The foundation commit remains pending human review and resolution or explicit scoping of the known tone limitation.
