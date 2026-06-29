# Spec: `migrate continue` — finish a dry-run as a fast, write-only migration

Status: **Draft for review** (no code written yet) — revised after Codex review
Author: spec generated 2026-06-02
Related: [`migrate-content-published-layer.md`](./migrate-content-published-layer.md), [`migrate-content-publish-languages.md`](./migrate-content-publish-languages.md)

---

## 1. Problem

`sb-mig migrate content` and its `--dry-run` variant share **one** function
(`doTheMigration`, `src/api/data-migration/component-data-migration.ts:1528`). The only
divergence is an early `return` at line 1771 when `dryRun` is true. Everything before that
line runs identically in both modes, and on large spaces it is the expensive part:

| Step | Function | Cost | Dry-run | Real |
|---|---|---|---|---|
| 1. Pull all stories | `loadItemsToMigrate` → `getAllStories` (1442) | 🐢 N+1 API reads (biggest) | ✅ | ✅ |
| 2. Transform in memory | `runMigrationPipelineInMemory` (1579) | 🐢 CPU | ✅ | ✅ |
| 3. Published-layer fetch (preserve-layers) | `buildPublishedLayerContext` (1627) | 🐢 API reads | ✅ | ✅ |
| 4. Language-state fetch (publish modes) | `buildLanguagePublishStateMapFromStories` (1679) | 🐢 API reads | ✅ | ✅ |
| 5. Write artifacts | `save*Artifact*` (1703–1756) | 💾 disk | ✅ | ✅ |
| **dry-run returns (1771)** | | | **STOP** | |
| 6a. Mark migrations applied | `modifyOrCreateAppliedMigrationsFile` (1774) | 💾 disk | ❌ | ✅ |
| 6b. Write to Storyblok | `updateStories` / `writeDirtyPublishedLayerStories` (1793–1871) | 🐢 API writes | ❌ | ✅ |
| 7. Run log | `saveMigrationRunLog` (1876) | 💾 disk | ❌ | ✅ |

The intended workflow is: **dry-run first to verify, then migrate for real.** Both runs
re-do steps 1–4. On large spaces that is ~1h + ~1h ≈ 2h, where the second hour repeats
work already done.

## 2. Operating assumption (important)

The target space is under **content freeze** during the dry-run → continue window. No
editor changes content in between. This is a hard requirement of the workflow, so
`continue` does **not** implement drift detection. (If the freeze assumption is ever
dropped, a staleness check can be added later; out of scope here.)

## 3. Goal

Add `sb-mig migrate continue`: a **write-only** path that finishes what a dry-run started
by executing steps 6–7, reusing the artifacts the dry-run already wrote. Target wall-clock
≈ the PUT/publish calls alone.

Hard constraint: **reuse the existing post-preparation code verbatim.** The refactor
extracts a single function — call it **`finalizeMigration(...)`** — that covers everything
`doTheMigration` does *after* the dry-run `return`: marking migrations applied (6a), the
Storyblok writes (6b), and the run log (7). `doTheMigration` calls it; `continue` calls the
same function with inputs reconstructed from artifacts. This is the key correction from
review: `continue` must be equivalent to a *real migration after the prep phase*, not merely
"the writes happened."

## 4. UX — auto-discover, show, confirm

No file-path argument. `continue` discovers the dry-run output in the `migrations/` folder,
summarizes it, and asks for confirmation:

```bash
# 1. Preview (unchanged behavior; now also drops a small continue-manifest + a dirty-records artifact)
sb-mig migrate content --all --migrateFrom space \
  --from 12345 --to 12345 \
  --migration ./my.sb.migration.cjs \
  --publicationMode preserve-layers \
  --dryRun

# 2. Finish it — fast, write-only
sb-mig migrate continue
```

`migrate continue` prints, then prompts (unless `--yes`):

```
Found dry-run to continue:
  manifest:        dry-run--12345--2026-06-02---story-continue-manifest.json
  space (from→to): 12345 → 12345
  publication mode: preserve-layers
  migrations:       my.sb.migration.cjs
  languages:        [default], de, fr
  stories to write: 240 changed  (18 dirty-published dual-layer writes)
  using artifacts:
    - dry-run--12345--2026-06-02---story-to-migrate.json
    - dry-run--12345--2026-06-02---draft-current-after-full.json
    - dry-run--12345--2026-06-02---published-layer-after-full.json
    - dry-run--12345--2026-06-02---dirty-published-records.json
    - dry-run--12345--2026-06-02---language-publish-state-map.json
    - dry-run--12345--2026-06-02---story-migration-pipeline-summary.json

Continue and write these to Storyblok space 12345? (y/N)
```

Discovery rules (settled, §11 D-1): exactly one manifest → use it; more than one → list and
stop, requiring `--manifest <filename>`; zero → clear error pointing at `migrate content … --dryRun`.

## 5. The continue-manifest (small glue artifact, NEW)

Why a manifest, given the goal of "no new primitive": some inputs the finalize phase needs
are **not** recoverable from existing artifacts — `to` (never saved today; pipeline-summary
saves only `from`), the exact `migrationConfigName`s (needed to mark migrations applied),
and `migrateFrom` / `fromFilePath` / requested languages (needed for a faithful run log).

So the dry-run writes one **small** machine file holding those scalars and **references the
heavy arrays by filename** (no content duplication). The user never opens or passes it —
`continue` finds it. It is plumbing, not a concept.

Written by `saveContinueManifest(...)` in `doTheMigration` just before the dry-run `return`
(≈1757), only when `dryRun === true`. Uses the existing `artifactBaseName` / `useDatestamp`
naming so it sits beside the other `dry-run--<base>---*` files.

Filename: `dry-run--<artifactBaseName>---<itemType>-continue-manifest.json`

```jsonc
{
  "manifestVersion": 1,
  "sbMigVersion": "6.1.1-beta.1",
  "createdAt": "2026-06-02T..Z",          // stamped by caller
  "kind": "migrate-content-continue-manifest",

  "itemType": "story",
  "from": "12345",
  "to": "12345",
  "migrateFrom": "space",                 // run-log metadata
  "fromFilePath": null,                   // run-log metadata
  "publicationMode": "preserve-layers",
  "migrationConfigNames": ["my-migration"],          // EXACT prepared names → mark applied (F1)
  "publishLanguages": { "requested": "all" },        // run-log metadata (F2)
  "resolvedPublishLanguages": ["[default]", "de", "fr"],

  // pointers to existing artifacts in the SAME folder (heavy arrays, not duplicated)
  "artifacts": {
    "changedItems":        "dry-run--12345--2026-06-02---story-to-migrate.json",
    "pipelineSummary":     "dry-run--12345--2026-06-02---story-migration-pipeline-summary.json", // stepReports + totalItems (F2)
    "inputFull":           "dry-run--12345--2026-06-02---story-input-full.json",                 // recovery snapshot (F5)
    "languageStateMap":    "dry-run--12345--2026-06-02---language-publish-state-map.json",       // null if save-only
    "draftAfterFull":      "dry-run--12345--2026-06-02---draft-current-after-full.json",         // preserve-layers only
    "publishedAfterFull":  "dry-run--12345--2026-06-02---published-layer-after-full.json",       // preserve-layers only
    "dirtyPublishedRecords":"dry-run--12345--2026-06-02---dirty-published-records.json"          // preserve-layers only (F3)
  }
}
```

### 5.1 New `dirty-published-records.json` artifact (preserve-layers only) — F3

Review correctly flagged that `dirtyPublishedRecords` is **not** lightweight metadata: each
`PublishedLayerRecord` embeds the full original draft story via `record.draftCurrentItem.story`
(`component-data-migration.ts:1191`), which the dual-layer writer uses for id/name/slug and
for its existing changed-since-read guard. Reconstructing this by joining the human-readable
`published-layer-summary` with `draft-current-input-full` would be fragile.

Decision (D-4): in preserve-layers dry-runs, serialize the **exact** `dirtyPublishedRecords`
array to its own machine artifact `dry-run--<base>---dirty-published-records.json` and
reference it from the manifest. `continue` loads it as-is and passes it straight into the
existing writer — no shape juggling. Content-freeze (§2) makes the embedded story snapshots
valid at continue time.

## 6. `migrate continue` algorithm

1. Discover the manifest (§4). Load + validate (`manifestVersion`, `kind`, required fields).
2. Load referenced artifacts from the same folder; missing file → clear error naming it.
3. Reconstruct the inputs `finalizeMigration` expects:
   - `pipelineResult` = `{ changedItems: <changedItems.json>,
     finalItems: <draftAfterFull or changedItems>,
     stepReports: <pipelineSummary.steps>,            // faithful migrationConfigs in run log (F2)
     totalItems: <pipelineSummary.totalItems> }`.     // not changedItems.length (F2)
   - `publishedLayerContext` = `{ dirtyPublishedRecords: <dirtyPublishedRecords.json>, … }` (F3).
   - `publishedLayerPipelineResult` = `{ finalItems: <publishedAfterFull>,
     changedItems: finalItems.filter(id ∈ publishedChangedIds) }`
     (publishedChangedIds derived from the records / after-full comparison at dry-run time and
     carried in the dirty-records artifact).
   - `languagePublishStateMap` from its file (or undefined for save-only).
4. Show summary + confirm (`askForConfirmation`; `--yes` bypasses prompt only — §11 D-2).
5. Call `finalizeMigration(...)` — the **same** code path steps 6–7 use today, including
   `modifyOrCreateAppliedMigrationsFile` for each `migrationConfigName` (F1).
6. The run log (written inside finalize) is tagged `continuedFromManifest: <filename>` (F2/D-5).

## 7. Code changes (proposed, minimal)

1. **`src/api/data-migration/component-data-migration.ts`**
   - Extract `doTheMigration`'s post-`return` block (1774–1918: applied-migration tracking +
     writes + run log) into an exported, behavior-preserving
     `finalizeMigration({ itemType, from, to, migrateFrom, fromFilePath, publicationMode,
     publicationLanguages, resolvedPublishLanguages, languagePublishStateMap,
     preparedMigrationConfigsOrNames, pipelineResult, publishedLayerContext,
     publishedLayerPipelineResult, continuedFromManifest? }, config)`. `doTheMigration`
     calls it; nothing else in the prep phase changes.
   - Add `saveContinueManifest(...)` (mirrors `savePublicationPlanArtifact`, 1053) and, for
     preserve-layers, a `saveDirtyPublishedRecordsArtifact(...)`. Call both before the
     dry-run `return`.
   - Add `continueMigration(opts, config)`: discover/load/validate manifest → load artifacts →
     reconstruct inputs (§6) → `finalizeMigration`.
2. **`src/api/data-migration/migration-run-log.ts`** — add optional `continuedFromManifest`
   field to the run-log record/schema (additive; D-5).
3. **`src/cli/commands/migrate.ts`** — add `MIGRATE_COMMANDS.continue` + a `case` parsing
   `--manifest?`, `--yes`, calling `continueMigration`. Reuse `askForConfirmation`.
4. **`src/cli/index.ts` / help** — register `migrate continue` and its flags.
5. **Types** — `ContinueManifest` interface in `migrate.types.ts`.

No changes to `updateStories`, `writeDirtyPublishedLayerStories`, or the transform pipeline.
**No drift detection** (content freeze, §2).

## 8. Backup / recovery (F5)

A normal real run backs up the space before writing (`backupStories`, `migrate.ts:220`;
`before__…` snapshot, `1995`). `continue` deliberately does **not** reload the space, so it
does not produce a fresh backup. This is acceptable because the dry-run already wrote the
full pre-migration snapshots and they are the designated recovery artifact:
- `dry-run--<base>---<itemType>-input-full.json` (all input stories), and for preserve-layers
  `dry-run--<base>---draft-current-input-full.json` / `…---published-layer-input-full.json`.

These `*-input-full` files are written **only** in dry-run mode (`saveDryRunDiffArtifacts`
returns early when `!dryRun`), and `continue` always follows a dry-run, so they are
guaranteed present. The manifest references `inputFull` so `continue` can name it in the
confirmation output as the rollback source. No new backup step is added.

## 9. Edge cases

- **`save-only`:** no publish, no language map, no published-layer pointers. `continue`
  PUTs `changedItems` with `publish:false`. Simplest path.
- **`collapse-draft`:** `changedItems` + language map; no published-layer block.
- **`preserve-layers`:** full manifest + dirty-records artifact; dirty stories go through the
  existing dual-layer writer (which keeps its own per-story re-fetch+restore guard).
- **Empty result (`changedItems: []`, no dirty records):** no-op, exit 0 with a notice (and
  still mark migrations applied? → see D-6 below).
- **`migrateFrom: "file"` dry-runs:** still produce a manifest; `continue` works the same.
- **Manifest `to` vs current config:** the manifest's `to` is authoritative and shown in the
  confirm prompt so a wrong-space run is caught by eye before writing.

## 10. Acceptance criteria

1. A dry-run writes `dry-run--<base>---<itemType>-continue-manifest.json` (§5) and, for
   preserve-layers, `dry-run--<base>---dirty-published-records.json` (§5.1).
2. `migrate continue` auto-discovers the manifest, prints the summary (§4), and on confirm
   performs the **identical** Storyblok writes a real `migrate content` would.
3. `continue` performs **no bulk `getAllStories`, no transform, no published-layer fetch, and
   no language-state fetch.** (preserve-layers retains the existing per-dirty-story re-fetch
   inside the dual-layer writer — that is expected, not a violation.) (F4)
4. `continue` updates `applied-backpack-migrations.json` for every `migrationConfigName`,
   exactly as a real run does. (F1)
5. The run log written by `continue` has correct `migrationConfigs`, `totalItems`, `migrateFrom`,
   `fromFilePath`, and language metadata (i.e. equals a real run's log), plus
   `continuedFromManifest`. (F2)
6. For a space where dry-run takes T, `continue` takes ≈ write-time only.
7. All three publication modes covered; existing `migrate content` behavior unchanged
   (verified by existing real-run tests passing unmodified after the `finalizeMigration` extraction).
8. No drift logic introduced.

## 11. Settled decisions

- **D-1 (multiple dry-runs):** exactly one manifest → use it; more than one → list and stop,
  require `--manifest <filename>`; never auto-pick newest.
- **D-2 (confirmation):** always confirm before writing; `--yes` only bypasses the prompt
  (CI parity), never changes what is shown/logged.
- **D-3 (presets):** v1 is stories only; presets deferred.
- **D-4 (dirty records, F3):** dry-run serializes the exact `dirtyPublishedRecords` to a new
  machine artifact; `continue` references and loads it as-is. (Chosen over reconstructing from
  the human summary, which is fragile.)
- **D-5 (run-log schema, F2):** add an additive `continuedFromManifest` field so the run log
  records provenance; otherwise the log equals a normal run's.
- **D-6 (settled):** when `changedItems` is empty, `continue` still marks migrations applied,
  matching a real run (the applied-migrations loop runs before the zero-change check). This
  falls out for free because `finalizeMigration` keeps that exact ordering.

## 14. Implementation status (done)

Implemented on branch `migration-using-dry-run-artifacts`:
- `finalizeMigration` extracted (applied-tracking + writes + run log); `doTheMigration` calls it.
- Dry-run emits `…---<itemType>-continue-manifest.json` (+ `…---dirty-published-records.json`
  for preserve-layers). Manifest resolves sibling artifact filenames from disk to survive
  datestamp granularity.
- `prepareContinueMigration` discovers/validates the manifest, reconstructs inputs, returns a
  summary + `run()` thunk.
- `migrate continue` CLI command (`--manifest`, `--yes`) with confirmation prompt; help updated.
- `continuedFromManifest` added to the run-log schema.
- Tests: `__tests__/api/migration-continue.test.ts` (save-only round trip, preserve-layers
  reconstruction, discovery + validation). All existing migration tests still pass unchanged.

## 12. Why this design serves the workflow goal

`continue` exists for a behavioral reason, not just speed. Today the ~2× cost tempts people
to **skip the dry-run** and run a real `migrate content` directly — which defeats the point,
since the dry-run is where you inspect the summaries and catch problems before touching the
space. By making the real write a cheap `continue` on top of an already-paid-for dry-run, the
safe path (always dry-run first) becomes the *fast* path too. `continue` must therefore stay
small and its confirmation clear, so "dry-run, then continue" is the obvious low-friction habit.

## 13. Review feedback incorporated (Codex)

| Finding | Resolution |
|---|---|
| F1 — applied-migration tracking skipped | Extraction widened to `finalizeMigration` (incl. `modifyOrCreateAppliedMigrationsFile`); manifest carries exact `migrationConfigNames`. §3, §7, AC-4. |
| F2 — run log loses metadata | Manifest references `pipeline-summary` (stepReports/totalItems) and carries `migrateFrom`/`fromFilePath`/languages; add `continuedFromManifest` field. §5, §6, AC-5, D-5. |
| F3 — "metadata not content" false for preserve-layers | New `dirty-published-records.json` artifact stores exact records (with embedded draft story); referenced, loaded as-is. §5.1, D-4. |
| F4 — "only writes" AC too strong | AC-3 reworded: no bulk fetch/transform/layer/language fetch; per-dirty-story re-fetch allowed. |
| F5 — backup undecided | §8: dry-run `*-input-full` files are the designated recovery snapshot; manifest references `inputFull`; no new backup step. |
