# Copy command: speed and resume design

Date: 2026-08-17
Status: draft for review
Scope: `sb-mig copy stories` and `sb-mig copy assets` (`src/cli/commands/copy.ts`, `src/api/copy/*`)

## Goal

Make the copy command fast at large scale (20,000+ stories) and make a rerun after a failure cheap. A resumed run must redo only the work that did not complete. Default behavior must not change except in speed and in the number of HTTP calls.

## Non-goals

- No rewrite of the copy command architecture. The two phases (create shells, then rewrite content) stay.
- No change to the dry-run and apply report schemas, except additive fields.
- No change to the manifest entry types that exist today.
- No new `copy status` subcommand. The dry-run covers this need.

## Problems today

1. The shell phase and the rewrite phase walk the story tree one story at a time. Each story costs 1 to 4 sequential HTTP calls.
2. The shell phase sends one `getStoryBySlug` call per story to detect conflicts. On a rerun, each mapped story costs up to 2 more validation calls (`getValidMappedTargetStory`). For 20,000 stories this is 20,000 to 40,000 GET calls.
3. The rewrite phase has no checkpoint. A rerun sends `updateStory` again for every story, including stories that already succeeded.
4. A rerun fetches the full content of every source story before it decides what to do.
5. The asset phase copies one asset at a time. Each asset costs about 4 sequential calls (download, upload, finalize, metadata).
6. `dedupeManifestFile` rewrites the manifest in place. A crash during this write corrupts the manifest and destroys all resume state.
7. A transient error (5xx, network reset) marks a story as failed. The only recovery is a full rerun.
8. `storyblok-js-client` throttles only GET calls. Write calls have no throttle. Sequential loops hide this today. Parallel loops would not.

## Design

### 1. Adaptive rate limiter (new `src/utils/rate-limiter.ts`)

One shared token-bucket limiter per copy run. Every Management API call in the copy phases goes through `limiter.schedule(fn)`.

- Default target rate: 6 requests per second. The `--rateLimit <n>` flag overrides it.
- Concurrency cap: about 2 × the target rate in flight, so slow responses do not stack requests.
- On a 429 response: honor the `Retry-After` header. Without the header, use exponential backoff with jitter. Retry up to 5 times. Cut the current rate by half.
- On a 5xx response or a network error: retry up to 3 times with backoff. Then record the item as failed, as today.
- Recovery ramp: raise the rate by 10 percent for each short period without a 429, up to the configured maximum.

The Management API throttles per token. One global limiter is therefore the correct scope. Story writes, asset uploads, and prefetch calls share one budget.

### 2. Bulk target prefetch

New helper `prefetchTargetStories(targetSpace, destinationRoot)`. It pages through the target story list (no content) under `starts_with` and returns a `Map<full_slug, storyStub>`. For 20,000 stories this is about 200 GET calls instead of 20,000 or more.

Consumers:

- `createStoriesAndWriteManifests`: the conflict and match check becomes a map lookup.
- `getValidMappedTargetStory`: runs only under `--verify` and reads the map instead of 2 GET calls.
- `findTargetConflicts` (dry-run): becomes a local set intersection.

The stale-mapping safety net stays: an `updateStory` 404 still deletes the mapping and recreates the shell.

Assets: keep the full target-asset fetch, but skip it when every selected asset already has a manifest mapping.

### 3. Parallel execution

- Shell phase: replace the depth-first walk with a level-order walk. Create all nodes at depth N in parallel with `mapWithConcurrency` under the limiter. Then continue with depth N+1. Parents always exist before children.
- Rewrite phase: all shells exist and the maps are loaded, so there is no order dependency. Flatten the tree and update all stories in parallel. The preserve-layers call sequence (published layer, publish, restore draft) stays sequential inside one story and parallel across stories.
- Asset phase: copy assets in parallel. The 4-call sequence per asset stays sequential inside one asset. Asset folders keep the level-order rule because of the parent dependency.
- Route the published-layer context fetch and the `getAllStories` content fetch through the same limiter.
- Serialize manifest appends through a small in-process write queue, so the combined file and the resource file stay consistent under parallel workers.

### 4. Content checkpoint (`story_content` manifest entry)

New additive entry type in the same JSONL manifest. Old manifests keep working. `buildCopyMaps` ignores unknown types today, so old sb-mig versions also read new manifests without error.

```json
{
  "type": "story_content",
  "schema_version": 1,
  "source_space_id": "...",
  "target_space_id": "...",
  "source_id": 123,
  "target_id": 456,
  "source_updated_at": "2026-08-17T10:00:00.000Z",
  "content_hash": "sha256:...",
  "unresolved_refs": 0,
  "created_at": "..."
}
```

- `content_hash` = sha256 over the rewritten payload, the publication mode, and the resolved publish languages.
- `unresolved_refs` = the count of references in the story that the rewrite could not map at write time. References that the policy preserves on purpose (`preserved_external`) do not count.
- The rewrite phase writes the entry after a story update succeeds, including the publish step when one applies.
- Skip rule per story: if a checkpoint exists, recompute the rewritten payload and compare the hash. On a match, skip with zero API calls. On a mismatch, update the story and replace the checkpoint.
- A new manifest mapping changes the rewritten payload, so the hash changes and the story is copied again. A publication mode change also changes the hash.
- A failed story never gets a checkpoint, so a rerun retries it.
- `--force-content` ignores all checkpoints.

### 5. Resume fast path: skip the source content fetch

The story list is cheap and contains `updated_at`. Use it to avoid the full content fetch on a rerun.

Skip the content fetch for a story when all of these hold:

1. A checkpoint exists for the story.
2. The checkpoint `source_updated_at` equals the list `updated_at`.
3. The checkpoint `unresolved_refs` equals 0.

Reason: the source did not change, and every reference resolved at write time. The recomputed hash cannot differ, and new mappings cannot change resolved references. A story with `unresolved_refs > 0` or a changed `updated_at` gets a full fetch and the hash compare from section 4.

A clean resume of an interrupted 20,000-story copy then costs about 200 list GET calls plus the remaining work only.

### 6. Trust-by-default resume, `--verify` flag

Mapped stories skip validation calls by default. The 404 fallback covers stale mappings. `--verify` re-enables the checks: full content fetch, hash compare, and target existence check against the prefetch map. The dry-run consumes checkpoints and reports skipped versus pending items, so it answers "what is left" after a crash.

### 7. Atomic manifest writes

`writeManifest` writes to a temp file in the same directory and then renames it over the target. A crash during a dedupe pass can no longer corrupt the manifest.

### 8. Observability and interrupts

- Progress line, throttled to about one update per second: phase, done/total, current request rate, ETA, skipped count, failed count.
- Keep all current log messages. Counters aggregate across parallel workers.
- SIGINT: stop new work, let in-flight requests finish, flush manifest appends, print the failed and pending counts, and print the exact command to resume. Exit non-zero.
- On a run with failures, print the same resume hint.
- Exit summary table: created, matched, skipped, failed, per resource type.

## Flags

| Flag | Default | Effect |
| --- | --- | --- |
| `--rateLimit <n>` | 6 | Target requests per second for the shared limiter. Overrides the `rateLimit` value from the sb-mig config file when both are set. |
| `--verify` | off | Re-check mapped stories and checkpoints against the target space. |
| `--force-content` | off | Ignore `story_content` checkpoints and rewrite every story. |

## Compatibility guarantees

- Failure semantics do not change: per-story failures collect, the run continues, and the exit code is non-zero with the same summary.
- The 404 stale-mapping recovery does not change.
- Report schemas gain only additive fields (`storiesSkipped` and checkpoint counts).
- Old manifests work with the new version. New manifests work with the old version, because unknown entry types are ignored.
- Known limitation (unchanged): target assets match by bare filename. Two target assets with one filename block the match, and a rerun after a partial asset copy can upload a duplicate.

## Testing

Runner: vitest (`npm run test:unit`). No copy tests exist today. Add:

1. Rate limiter unit tests: 429 backoff, `Retry-After` honor, rate cut and ramp, 5xx retry, retry exhaustion.
2. Checkpoint tests: hash stability, hash change on map change, hash change on publication mode change.
3. Skip decision matrix: checkpoint × `updated_at` × `unresolved_refs` × `--verify` × `--force-content`.
4. Level-order walk: parents created before children, sibling parallelism, failed parent skips its branch.
5. Prefetch map matching: conflict detection equals the current per-slug behavior.
6. Atomic write: interrupted write leaves the old file intact (temp-file assertion).
7. Manifest write queue: parallel appends produce valid JSONL with no interleaved lines.
8. Copy phase integration tests with a mocked `managementApi`: first run, crash mid-run, resume, source edit between runs.

All existing tests must pass without modification.

## Delivery

- Branch: `feat/copy-speed-resume` (created).
- Conventional commits, small steps, no co-author lines.
- PR from a fork of `sb-mig/sb-mig` to upstream. Add the fork remote and push at PR time, not before.
- README and docs site notes for the new flags follow the repo AGENTS.md rule: keep links to the canonical docs at `https://sb-mig.vercel.app` accurate.
