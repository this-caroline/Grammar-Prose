# Review evaluation

The checked-in `evals/synthetic.json` contains three synthetic engineering smoke cases, not personal examples or an acceptance benchmark. `EXAMPLE.md` is reserved for a future user-approved corpus and is not present in this checkout. The acceptance benchmark and adoption requirements are defined below.

The separate `evals/foundation-regressions.json` contains 12 synthetic engineering cases, including the three original smoke cases and nine cases covering plural facts, singular agreement, deadlines, negation, technical criticism, a personal attack, and already-correct prose. These labels are engineering expectations, not user-approved personal preferences. Use this set for bounded model/prompt comparisons; inspect raw and validated suggestions because filtering can hide malformed output.

Validate dataset structure without contacting a model:

```sh
pnpm eval -- --dry-run
```

For an explicitly selected installed model, follow the [local-only Ollama setup](../README.md#run-with-local-ollama) and run:

```sh
pnpm eval -- --model qwen3.5:9b --dataset evals/foundation-regressions.json
```

Requests use the same prompt, validation, fixed loopback endpoint, 25-second timeout, zero temperature, and `think: false` as the extension. Do not run against a cloud model. No model is automatically downloaded or selected. The runner writes ignored reports under `artifacts/` with case IDs, timing, category matches, model name, dataset/prompt hashes, and hardware metadata. Drafts, replacements, explanations, and arbitrary error text are not written to reports. Record the installed model digest separately when comparing mutable model tags.

Completion and category matching are diagnostic signals. They do not establish schema conformance, useful corrections, or preservation of urgency/negation/intent. Review suggestions in the extension against the agreed meanings and record human scores without copying private passages into reports. A rejected malformed suggestion can also look like “no suggestions”; do not count that as semantic success.

Compare results on the same hardware, model version, and corpus. Set latency and quality budgets after measurement. Private datasets and reports should remain local. The general CI job runs deterministic tests; it never invokes real inference.

The [Qwen verification report](verification/qwen-verification.md) records the current development candidate and its remaining semantic failure. Passing category labels does not resolve that failure.

## Acceptance benchmark and adoption gate

Agree with the user on roughly 20–30 personal cases before adopting a model for daily use. For each case, record the original sentence, expected category (or no change), non-negotiable meaning, and acceptable outcomes. Include urgent criticism, direct statements that must stay direct, technical terms, grammar-only cases, and passive-aggressive phrasing. Do not manufacture personal examples or infer labels. Keep private datasets local.

`pnpm check` validates both synthetic corpus files through deterministic tests.
The current inference report still measures completion, latency, and categories
after filtering. It has no raw schema-validity metric, scored acceptable rewrites,
latency budget, or failing semantic acceptance threshold. A category match must
never be used as the release approval signal.

Before promoting model evaluation to an acceptance gate, require:

- An agreed user-approved corpus with non-negotiable meaning and acceptable outcomes.
- Separate raw schema validity and rejection counts, so filtered malformed output
  cannot pass an expected no-change case.
- Human scores for useful corrections, tone false positives, and preservation of
  negation, urgency, responsibility, facts, and requested action.
- Measured quality and latency budgets on fixed hardware and an identified model
  digest, followed by an explicit adopt/reject/pending decision.

These remain pending; this audit does not invent labels, select a model, or claim
semantic success from deterministic tests. Keep real inference outside general
CI and preserve the report's prohibition on private text.
