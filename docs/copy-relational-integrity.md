# Copy command: relational integrity and scale

Status: design, not implemented.
Scope: the copy command only. Files: `src/cli/commands/copy.ts`, `src/api/copy/*`, and their tests.

## Goal

A copy run must produce a 1:1 copy of the selected source stories in the target space.
Every relation between two copied stories must point to the correct target story.
A run must work on a space with thousands of stories.
The result must be provable. A run reports whether every relation is correct.

## Non-goals

- Component schema sync. A separate command owns that work.
- Asset copy behavior. This design keeps it as it is.
- Changes to shared API modules such as `src/api/stories/stories.ts`. Other commands depend on them.
- New publication semantics.

## Problems today

1. The shell phase trusts a manifest mapping unless the caller passes `--verify` (`src/cli/commands/copy.ts:3715`). If somebody deletes the target story, the run writes content to a story that no longer exists. The `master` branch validated every mapping, so this is a regression of the speed work.
2. The copy command reads target stories through `managementApi.stories.getStoryBySlug`. That function catches every error and returns `undefined` (`src/api/stories/stories.ts:549`). The next line calls `.map` on `undefined`. Every API error becomes `Cannot read properties of undefined (reading 'map')`. A `CopyAbortedError` also loses its type, so the abort path counts interrupted stories as failures.
3. A story reference to a story outside the selection keeps the source uuid. The story records `unresolved_refs > 0`, so a later run repeats the copy and fixes the reference. This heals only when somebody runs that root again. It also misses one case. If the referenced target story is deleted and created again with a new uuid, the referencing story still records `unresolved_refs: 0`. The fast path skips it forever, and the reference stays dead.
4. The dry-run validator checks that a component exists in the target space and that a field allows it. It does not check `is_root`. A story whose root component is not a content type in the target space fails at write time with HTTP 422.
5. A run copies one root folder. `--source` takes one slug. A space copy needs one run per root, so references between roots cannot resolve in a single run.
6. A first run sends about three requests per story: one content read, one shell create, one content write. The content read runs one story at a time.
7. A run holds the fetched content of every story in memory at the same time.

## Design

### 1. Always validate the manifest mapping

Remove the `verify` condition in the shell phase. Validate every mapping against `targetStoriesBySlug`.

The map comes from `prefetchTargetStories`, which already runs, and which pages the target space once with `starts_with: destination`. Every planned target slug sits under the destination, so a missing entry means the target story is gone. The check costs no extra request. The `master` branch paid two requests per mapped story for the same answer.

When the mapping is invalid, the run deletes it from the in-memory maps and creates the shell again. The manifest keeps the old row. Dedupe keys a story row by source id, and the newer row wins, so the file converges without a prune step.

### 2. A target lookup that the copy command owns

Add `src/api/copy/target-lookup.ts`. The helper reads a target story by slug through the rate-limited client and lets errors propagate.

`createOrMatchReplacementShell` calls this helper instead of `managementApi.stories.getStoryBySlug`. A `CopyAbortedError` then reaches the caller with its type intact, so the abort path counts an interrupted story as pending. An HTTP 422 or 401 reaches the log with its status.

### 3. Blocking preflight for root components

Extend `buildTargetComponentValidator`. The check needs the root component name, and that name lives in the story content, so this step runs after the content read and before the first write. A story that takes the resume fast path needs no check, because an earlier run already wrote it.

For every story with content in this run, require two things in the target space:

1. A component with that name exists.
2. That component has `is_root: true`.

Report every failure as one blocking list before any write. The dry-run prints the same list. This turns a mid-run HTTP 422 into a message that names the components to fix.

### 4. Selection: repeatable `--source` and `--all`

`--source` accepts the flag more than once and accepts a comma separated list.
`--all` selects every root-level entry of the source space.

Both forms build one selection, one plan, one shell phase, and one rewrite phase. The shell phase maps every selected story before the rewrite phase writes any content, so a reference between two selected stories always resolves inside the run. Protected-space rules and dry-run output stay as they are.

### 5. A relations ledger in the checkpoint

Extend the `story_content` manifest entry:

```ts
refs?: { source_uuid: string; target_uuid: string | null }[]
```

The rewrite phase writes this list from the payload it just sent. A `null` target uuid means the run could not map the reference.

`partitionStoriesForResume` then compares the ledger against the current maps instead of reading a count:

- The ledger holds `null` and the source uuid now maps. The story needs a rewrite.
- The ledger holds `X` and the source uuid now maps to `Y`. The story needs a rewrite.
- Every entry matches. The fast path is safe.

The second rule closes the dead-uuid case in problem 3.

A new entry keeps `unresolved_refs` as the count of `null` targets, so the field stays correct for readers that expect it.

Compatibility: an entry without `refs` comes from an earlier run. The gate falls back to `unresolved_refs` for that entry, so an upgrade does not force a full re-copy. `schema_version` stays 1 because the field is additive.

### 6. Relation verification

Add `--verify-relations`. The step runs after the rewrite phase.

The check needs no story content and no per-story request:

1. List the target space once and collect every target story uuid.
2. Read every `story_content` entry for this space pair.
3. For each recorded ref, require a non-null target uuid, and require that uuid in the target set.
4. Also require a story mapping for every source story in the selection.

The step prints a report and exits with a non-zero code when it finds a gap. The report names each source story, each broken reference, and the command that repairs it.

This proves what the run wrote, because the ledger records the payload that the run sent.

### 7. Bulk content read

Read source content from the draft delivery API in pages of 100 stories. A space with 20000 stories needs about 200 requests instead of about 20000.

The delivery API needs the preview token of the source space. The run accepts `--sourceToken`, and it falls back to `storyblokConfig.accessToken` when that token belongs to the source space. Without a token the run keeps the current per-story management read.

Two safeguards:

- The bulk reader sends a cache-busting `cv` value, so a stale cache cannot serve old content.
- `--noBulkContent` forces the management path. Use it when a space returns content that the management API does not return.

### 8. One write for a story that nothing references

The shell phase exists so that a reference can resolve before a content write. A story that no other selected story references does not need a shell. The run creates it once with its final content.

The reference scan already builds the data for this decision. The run needs the reverse index: the set of source uuids that any selected story references. A story outside that set takes the single-write path. This removes one write for most leaf stories.

This item is optional. Land it after items 1 to 7 and after the tests for them pass.

### 9. Bounded memory

The rewrite phase walks the tree level by level. Release the content of a story after its write, and keep only the id, the slug, the hash, and the ref list. Fetch content per level instead of for the whole selection when the bulk reader is active.

The run then holds one level of content at a time. Memory stops growing with the story count.

## Run order

1. Resolve the selection from `--source` and `--all`.
2. List source stubs for every root.
3. Load the manifest. Build the maps and the checkpoints.
4. Plan target slugs.
5. Partition the stories with the ledger gate.
6. Read content for the needs-content set.
7. Run the root-component preflight on that content. Stop on a blocking failure.
8. Create shells, level by level.
9. Rewrite content, level by level. Write a checkpoint with the ref ledger.
10. Dedupe the manifest files.
11. Verify relations when the caller asks for it.
12. Print the summary and the resume line.

## Error handling

- The limiter raises `CopyAbortedError` on SIGINT. The run skips the item, counts it as pending, and prints the resume command.
- An HTTP 404 on a content write means a stale mapping. The run creates the shell again and repeats the write.
- A failure on one story does not stop the run. A failed shell skips that branch, because a child cannot resolve a parent that does not exist.
- A preflight failure stops the run before any write.

## Testing

Unit tests:

- The ledger gate: a `null` ref that now maps, a changed target uuid, an exact match, and a legacy entry without `refs`.
- The preflight check: a missing component and a component with `is_root: false`.
- Selection parsing: repeated `--source`, a comma separated list, and `--all`.
- The verification checker: a broken ref, a missing story mapping, and a clean space.

End-to-end tests against the in-memory fake spaces:

- One run copies two roots that reference each other. Every reference resolves.
- A deleted target folder. The run creates the subtree again and does not write to a dead id.
- A missing `is_root`. The run stops before the first write and names the component.
- SIGINT during the rewrite phase. The run counts pending items and does not report failures.
- Several roots copied one at a time into one manifest. This test exists.

Scale test:

- A fake space with 5000 stories. Assert the request count per phase and assert that the run releases content per level.

## Delivery order

1. Item 1 and item 2. They fix current failures and cost little.
2. Item 3. It stops a long run from dying at write time.
3. Item 4. It removes the cross-root gap.
4. Item 5 and item 6. They give the correctness proof.
5. Item 7 and item 9. They make a first run on a large space practical.
6. Item 8, when the rest is stable.
