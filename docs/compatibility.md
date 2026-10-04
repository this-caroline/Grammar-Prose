# Editor compatibility evidence

Automated tests use the built extension in an isolated Playwright Chromium profile and inject a deterministic fetch transport into its background worker. No installed Ollama model or personal browser profile is used. This tests extension wiring and editing behavior, not Ollama networking or model quality.

Run `pnpm test:e2e` after `pnpm exec playwright install chromium`.

| Surface or behavior                                        | Evidence                                                                                                                                           |
| ---------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| Native textarea replacement, undo/redo                     | Automated acceptance scenario                                                                                                                      |
| Delayed acceptance/rejection feedback across field changes | Automated held-reply scenarios for success and failure                                                                                             |
| Checking after acceptance with slow feedback               | Automated feedback delay longer than snapshot polling                                                                                              |
| Input during pending inference                             | Automated delayed-response scenario                                                                                                                |
| Password, email, opted-out fields                          | Automated exclusion scenario                                                                                                                       |
| Persistent site disable                                    | Automated reload scenario                                                                                                                          |
| Basic contenteditable                                      | Automated copy-only scenario; replacement unsupported                                                                                              |
| Invalid stored memory                                      | Automated explicit reset through settings                                                                                                          |
| Textarea selection before/inside/after a replacement       | Automated selection-mapping scenarios                                                                                                              |
| Programmatic edits and lost field eligibility              | Automated stale-snapshot scenario                                                                                                                  |
| IME review deferral                                        | Automated composition-event scenario; real IME input unverified                                                                                    |
| React-controlled input and textarea                        | React 19.3.0 fixture: exact replacement, selection, state after rerender, native undo/redo; [dated evidence](verification/pilot-implementation.md) |
| Same-origin and cross-origin HTTP frames                   | Automated input replacement and native undo/redo; real-site frames unverified                                                                      |
| Settings changes during inference                          | Automated cancellation and untouched-text scenario                                                                                                 |
| Worker restart during review and feedback                  | Automated stopped-state, lost in-memory context, and fresh-review recovery                                                                         |
| Keyboard review, Accept, Escape and status                 | Automated keyboard activation, focus restoration, native undo and status role                                                                      |
| Scrolling and viewport resize                              | Automated viewport bounds and offscreen badge recovery; real browser zoom pending                                                                  |
| Gmail compose, GitHub writing fields, Notion text blocks   | Manual safe extraction and copy-only verification pending                                                                                          |
| Google Docs, closed shadow roots, rich-editor replacement  | Unsupported                                                                                                                                        |

A dated architecture-review run (128 deterministic tests and 21 browser scenarios), browser version, and limitations are recorded in [foundation verification](verification/foundation-verification.md). The separate [Qwen report](verification/qwen-verification.md) records real-model fixture acceptance, not real-site support. A test's existence is not evidence that it passed. Add a fixture and verify exact replacement, selection, undo/redo, and framework state before expanding support claims.

Current personal-pilot evidence is recorded separately in [the 2026-10-04 report](verification/pilot-implementation.md). Fixture results do not establish compatibility with the installed stable Chrome or named sites.
