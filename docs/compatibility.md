# Editor compatibility evidence

Automated tests use the built extension in an isolated Playwright Chromium profile and inject a deterministic fetch transport into its background worker. No installed Ollama model or personal browser profile is used. This tests extension wiring and editing behavior, not Ollama networking or model quality.

Run `pnpm test:e2e` after `pnpm exec playwright install chromium`.

| Surface or behavior                                        | Evidence                                                        |
| ---------------------------------------------------------- | --------------------------------------------------------------- |
| Native textarea replacement, undo/redo                     | Automated acceptance scenario                                   |
| Delayed acceptance/rejection feedback across field changes | Automated held-reply scenarios for success and failure          |
| Checking after acceptance with slow feedback               | Automated feedback delay longer than snapshot polling           |
| Input during pending inference                             | Automated delayed-response scenario                             |
| Password, email, opted-out fields                          | Automated exclusion scenario                                    |
| Persistent site disable                                    | Automated reload scenario                                       |
| Basic contenteditable                                      | Automated copy-only scenario; replacement unsupported           |
| Invalid stored memory                                      | Automated explicit reset through settings                       |
| Textarea selection before/inside/after a replacement       | Automated selection-mapping scenarios                           |
| Programmatic edits and lost field eligibility              | Automated stale-snapshot scenario                               |
| IME review deferral                                        | Automated composition-event scenario; real IME input unverified |
| React-controlled editors, frames                           | Further automated coverage required                             |
| Google Docs, closed shadow roots, rich-editor replacement  | Unsupported                                                     |

A dated architecture-review run (128 deterministic tests and 21 browser scenarios), browser version, and limitations are recorded in [foundation verification](verification/foundation-verification.md). The separate [Qwen report](verification/qwen-verification.md) records real-model fixture acceptance, not real-site support. A test's existence is not evidence that it passed. Add a fixture and verify exact replacement, selection, undo/redo, and framework state before expanding support claims.
