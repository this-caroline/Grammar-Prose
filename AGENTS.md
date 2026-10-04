# Working in Grammar Prose

Use the Node version in `.nvmrc` and the pnpm version in `package.json`. Start with `pnpm install --frozen-lockfile`.

- `pnpm check`: formatting, type-aware Oxlint, typechecking, unit/integration tests, clean build.
- `pnpm test:e2e`: built-extension browser tests; first install Chromium with `pnpm exec playwright install chromium`.
- `pnpm test:coverage`: inspect untested branches. Add behavioral tests for meaningful changes.
- `pnpm format`: apply Oxfmt; if `EXAMPLE.md` is supplied later, it is deliberately excluded and must remain unchanged.

Treat readability as part of correctness for every generated or modified file. Use descriptive names, separate logical blocks, keep imports grouped, and split dense expressions or oversized functions when that improves scanning. Follow the surrounding architecture and favor maintainable, explicit code over compressed or clever code. Do not introduce an abstraction unless it removes real complexity.

Before considering a code change complete, run Oxfmt, then make `pnpm check` and the relevant focused tests pass. The lint configuration enforces import organization, statement spacing, control-flow clarity, naming, unused code, and function size. Do not weaken these rules or add lint exceptions to accommodate code. Keep comments only for necessary, non-obvious constraints that clear code cannot express. See `docs/code-quality.md` for the quality gate.

Keep domain code independent of browser/network APIs, and application code independent of concrete adapters. Validate external data at its boundary; do not bypass unsafe-value lint rules with `any`.

Preserve explicit acceptance, exact snapshot matching, native undo, loopback-only inference, and no persisted drafts. See `docs/architecture.md` for the canonical invariants. Browser simulations cannot establish real editor compatibility.

Use current stable tooling by default. Pin adopted versions and update the lockfile; document concrete compatibility exceptions. Follow `docs/upgrade-plan.md` and record evidence without marking unverified stages complete.

Repository skills in `.agents/skills/` cover editor compatibility and review evaluation. Shared scripts and docs remain the source of truth; avoid duplicating them in skills.
