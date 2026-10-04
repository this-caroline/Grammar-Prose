---
name: review-evaluation
description: Compare Grammar Prose prompt or local-model changes using the versioned evaluation corpus, latency results, and human meaning-preservation scores.
---

Read [evaluation instructions](../../../docs/evaluation.md). The evaluation document owns the acceptance benchmark; [architecture](../../../docs/architecture.md) owns privacy invariants.

Validate the selected dataset with `pnpm eval -- --dry-run --dataset PATH`. Preserve `EXAMPLE.md`; distinguish synthetic cases from user-approved examples. Do not infer the user's desired rewrites or labels.

For real inference, use an explicitly selected installed local model and a local-only Ollama server. Run `pnpm eval -- --model MODEL --dataset PATH`. If no model or agreed labels are available, finish dataset/harness validation and report that quality comparison is pending. Do not select or download a model on the user's behalf.

When the evaluation harness or prompt code changes, follow the shared [code quality gate](../../../docs/code-quality.md#completion-workflow).

Compare reports using the same corpus and hardware; record the model digest when available. The runner omits private text. Category matches and completed requests are not semantic-quality or schema-validity scores. Assess urgency, negation, responsibility, facts, and requested action through human review in the extension, and keep reports free of private passages.

Deliver measured differences, human-scored limitations, and an adopt/reject/pending recommendation. Stop once the comparison answers the requested question; do not tune repeatedly against the benchmark to manufacture a passing result.
