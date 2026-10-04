# Local personal-pilot candidate

Status: **release blocked**. The package version remains `0.1.0`; this is not an approved v1 release. Publishing and Chrome Web Store submission are outside this workflow.

## Candidate changes

Evaluation now distinguishes raw schema validity, fixed validation rejection counts, transport failure, and valid empty reviews. Reports identify each run, dataset, prompt and installed model digest. Human scoring is offline and requires inspection of raw proposals. A passing quality decision does not close editing, performance, packaging or CI gates.

Built-extension fixtures cover React-controlled inputs and textareas, frames, settings races, keyboard actions and viewport positioning. React and its types are pinned development dependencies used only by the isolated fixture server; they are absent from production bundles.

Builds generate the manifest version from `package.json`. The storage schema remains version 1. Packaging uses Python 3's standard library and stores ZIP entries without compression, avoiding compressor-version differences. It includes only six production files, sorted with fixed timestamps and permissions, and writes a SHA-256 checksum.

## Build and installation

Use the pinned Node and pnpm versions and an installed Python 3 (used only for archive creation and its test), then run:

```sh
pnpm install --frozen-lockfile
pnpm check
pnpm package
```

The output is `artifacts/grammar-prose-0.1.0.zip` and its `.zip.sha256` file. From `artifacts`, check the checksum with `shasum -a 256 -c grammar-prose-0.1.0.zip.sha256`. Extract to a permanent local directory. Chrome cannot load the ZIP directly. At `chrome://extensions`, enable Developer mode and choose **Load unpacked**, selecting the extracted directory.

Follow [local-only Ollama setup](../README.md#run-with-local-ollama), connect in settings and explicitly select the installed `qwen3.5:9b`. No model is selected or downloaded automatically. Test with synthetic text before using private drafts. The 25-second deadline and 6,000-character limit are unchanged.

## Upgrade and rollback

Storage ownership is unchanged: options and the worker read settings through the storage adapter; the worker serializes settings and memory writes; options read memory for editing/export. Settings are `{version: 1, model, disabledSites}`; memory is `{version: 1, patterns, tooSoft, terms, tonePreferences}`. Legacy unversioned settings are normalized in memory only. Missing records use defaults. Invalid or unknown future records fail validation without an automatic write.

Before upgrading, retain the prior ZIP and checksum, record the extension ID and installation directory, and export valid memory through settings. Preserve the same unpacked directory and Chrome extension entry when replacing files and reloading. Loading another directory can create another extension ID and separate storage. Do not uninstall as a rollback procedure: Chrome can remove its saved settings and memory.

Rollback by restoring the prior archive into that same directory and reloading the existing entry. Current schema-1 records remain readable. Unknown future versions are preserved but unavailable to this version; restore the compatible application or explicitly reset/re-enter records in settings. **Delete memory** and **Save settings** are explicit user recovery actions. There is no draft history to restore because drafts are never persisted.

## Required release evidence

- Approved 20–30-case corpus with acceptable outcomes, complete human raw-proposal scoring, zero meaning changes, at least 90% useful actionable corrections and at most 10% unwanted no-change suggestions. The known invented-fact tone rewrite still blocks adoption.
- Real Chrome checks on native and React fields; real IME; Gmail compose, GitHub writing fields and Notion text blocks with synthetic text and no submission. Rich editors remain copy-only. Google Docs, closed shadow roots, code editors and unsafe extraction remain unsupported.
- Cold and at least 50 warm end-to-end reviews on the actual Mac/Chrome with the normal workload, p95 at most 10 seconds warm, cold within 25 seconds and no timeouts. Include short, medium and near-limit fields, tabs and frames. Record memory/swap before loading, after loading, during use and after idle; compare browser overhead with the extension enabled and disabled.
- Five dated daily pilot records: lost text, wrong accepted replacement, keyboard failures, responsiveness and resource growth. These require elapsed real use, not automated fixture events.
- Extracted-archive smoke with real Ollama, upgrade/rollback in a preserved profile, identical archive rebuild, and hosted CI passing on the exact release commit.

The current dated evidence belongs in [pilot implementation verification](verification/pilot-implementation.md). Unfinished gates stay open in [the upgrade plan](upgrade-plan.md).
