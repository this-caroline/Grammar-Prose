---
name: editor-compatibility
description: Reproduce and verify Grammar Prose browser-editor issues or add an editor adapter. Use for selection, undo, controlled inputs, frames, IME, and stale review behavior.
---

Read [compatibility evidence](../../../docs/compatibility.md) and the editing invariants in [architecture](../../../docs/architecture.md).

Reproduce the requested behavior in `tests/editor-fixture.html` or a narrowly scoped new fixture. Exercise the built extension using `tests/e2e/extension.spec.ts`; the fixture creates an isolated browser profile and replaces only background fetch. Do not use the user's personal browser profile or real drafts for automated tests.

For replacement support, verify exact passage replacement, untouched surrounding text, selection, native undo/redo, and framework state where applicable. Test an edit during pending inference. Keep unverified rich editors copy-only; assigning `.value` is not an acceptable undo-preserving fallback.

Follow the shared [code quality gate](../../../docs/code-quality.md#completion-workflow) for code changes.

Run `pnpm check` and the relevant `pnpm test:e2e --grep "scenario"`. Report the observed behavior, browser tested, and remaining limits; update the compatibility matrix only with passing evidence. Stop when the requested scenario and regressions pass, or identify the concrete unavailable environment without claiming support.
