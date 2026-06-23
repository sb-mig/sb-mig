# Copy Command Spec and Knowledge Base

Status: Draft
Task context: GCTT-3758, "Reinvestigate copy command for sb-mig"
Last updated: 2026-06-23

Related docs:

- `docs/dry-run-output-policy.md`

## Purpose

`sb-mig copy` should become a first-class command for copying Storyblok content between spaces or between a space and a local filesystem snapshot. The command must preserve the relationships that make copied content usable, especially story hierarchy, story-to-story references, asset references, asset folders, and publication state.

The immediate product goal is:

> Copy stories from one Storyblok space to another, copy the assets they use, and rewrite copied stories so asset fields point at the copied target-space assets rather than the original source-space assets.

This document captures the current knowledge, official Storyblok CLI behavior, required invariants, expected command shape, implementation model, and likely ticket breakdown.

## Current sb-mig State

The current `copy` command is not yet a robust copy system.

Relevant files:

- `src/cli/commands/copy.ts`
- `src/api/stories/tree.ts`
- `src/api/stories/stories.ts`
- `src/api/assets/assets.ts`
- `src/api-v2/stories/index.ts`

Current behavior:

- Only supports `copy stories`.
- Supports story/folder modes:
    - `subtree`: copy a story, or a folder plus all descendants
    - `children`: copy a folder's descendants without the folder root
    - `self`: copy only one story or folder shell
- Supports copying into a target folder or into the target root.
- Creates stories directly through the existing tree traversal.
- Does not keep a durable source-to-target ID map.
- Does not copy assets.
- Does not rewrite asset references in story content.
- Does not rewrite story references in story content.
- Exposes a current-state `--dry-run` mode and optional `--outputPath` JSON artifact for the implemented create-oriented story copy plan.
- Does not have idempotent rerun behavior.
- Does not provide a structured summary or unresolved-reference report.
- Publishes created stories through `createStory` rather than preserving source publication state.
- Logs and swallows some traversal errors, which can hide partial failures.

There is also an API-v2 `copyStories` helper, but it is not wired into the CLI and is still story-only. It strips some generated fields, which is better, but still does not handle manifests, assets, reference rewriting, publish state, or resumability.

## Official Storyblok CLI Baseline

Current official CLI package checked on 2026-06-23:

- npm package: `storyblok`
- latest version: `4.18.1`
- repository: `storyblok/monoblok`, package directory `packages/cli`

Useful references:

- Storyblok CLI docs: https://www.storyblok.com/docs/libraries/storyblok-cli
- Storyblok CLI v4.14 release article: https://www.storyblok.com/mp/storyblok-cli-v4-14-0-pull-and-push-stories-and-assets
- Management API introduction: https://www.storyblok.com/docs/api/management/getting-started/introduction
- Duplicate space endpoint: https://www.storyblok.com/docs/api/management/spaces/duplicate-a-space
- Duplicate story endpoint: https://www.storyblok.com/docs/api/management/stories/duplicate-a-story
- Asset folder endpoints: https://www.storyblok.com/docs/api/management/asset-folders
- Asset endpoints: https://www.storyblok.com/docs/api/management/assets
- Story object: https://www.storyblok.com/docs/api/management/stories/the-story-object
- Component schema field object: https://www.storyblok.com/docs/api/management/components/the-component-schema-field-object
- `@storyblok/migrations` reference helpers: https://www.storyblok.com/docs/libraries/js/migrations

### Official CLI Clean Copy Flow

For a clean source-space to target-space story plus asset copy, the official CLI flow is:

```bash
SOURCE_SPACE=123456
TARGET_SPACE=789012

npx storyblok@latest login --region eu

npx storyblok@latest components pull --space "$SOURCE_SPACE"
npx storyblok@latest assets pull --space "$SOURCE_SPACE"
npx storyblok@latest stories pull --space "$SOURCE_SPACE"

npx storyblok@latest components push --space "$TARGET_SPACE" --from "$SOURCE_SPACE"
npx storyblok@latest assets push --space "$TARGET_SPACE" --from "$SOURCE_SPACE"
npx storyblok@latest stories push --space "$TARGET_SPACE" --from "$SOURCE_SPACE"
```

Optional:

```bash
npx storyblok@latest stories push --space "$TARGET_SPACE" --from "$SOURCE_SPACE" --publish
```

The order matters:

1. Pull source components, assets, stories.
2. Push components to the target so story schemas exist.
3. Push assets to the target so asset mappings exist.
4. Push stories to the target so stories can be rewritten using the asset mappings.

### Meaning of `--update-stories`

Official CLI `assets push` supports:

```bash
npx storyblok@latest assets push --space "$TARGET_SPACE" --from "$SOURCE_SPACE" --update-stories
```

This is only needed when assets are pushed after stories already exist in the target and those existing stories need to be patched to point at the newly pushed assets.

For the clean copy flow, `stories push` already reads the asset manifest and rewrites asset fields while creating/updating stories. In that case `--update-stories` is usually unnecessary.

## Core Concept: Manifests

A manifest records how source-space identities map to target-space identities.

This is necessary because Storyblok generates new IDs per space. A source story, source asset, or source asset folder cannot keep its original ID in the target space.

Example:

```txt
source story id 123       -> target story id 8123
source story uuid abc     -> target story uuid def
source asset id 999       -> target asset id 42001
source asset filename old -> target asset filename new
source folder id 77       -> target folder id 991
```

### Why Manifests Are Created During Push

Pulling from the source only reveals source identities. The target identities do not exist until the target API creates or matches the target resources.

During push/copy:

1. Create or match target resource.
2. Read the target response.
3. Write source-to-target mapping.
4. Use that mapping to rewrite later resources.

So the most important manifest entries are created during push, not pull.

### Official CLI Manifest Pattern

The official CLI uses JSONL manifests under `.storyblok/...`.

Observed pattern:

- Asset manifest maps source asset id and filename to target asset id and filename.
- Asset folder manifest maps source folder id to target folder id.
- Story manifest maps both:
    - source numeric story id to target numeric story id
    - source story uuid to target story uuid

This is important because different Storyblok fields use different identity types. Some use numeric IDs, some use UUIDs, and assets use both IDs and filenames.

### Official CLI Implementation Notes

The `storyblok@4.18.1` package confirms the implementation model that sb-mig should mirror conceptually:

- Generic manifests are newline-delimited JSON and are loaded by splitting non-empty lines and parsing each line.
- Manifest appends are incremental during push/copy, then deduplicated after successful non-dry-run asset pushes.
- `assets push` writes:
    - `.storyblok/assets/<from-space>/manifest.jsonl`
    - `.storyblok/assets/<from-space>/folders/manifest.jsonl`
- Asset manifest entries include:
    - `old_id`
    - `new_id`
    - `old_filename`
    - `new_filename`
    - `created_at`
- Asset folder manifest entries include:
    - `old_id`
    - `new_id`
    - `created_at`
- `stories push` writes `.storyblok/stories/<from-space>/manifest.jsonl`.
- Story manifest appends two entries per story:
    - source story `uuid` to target story `uuid`
    - source numeric story `id` to target numeric story `id`
- `stories push` loads both the story manifest and asset manifest before rewriting story content.
- `stories push` creates or matches story shells first, then rewrites references, then updates remote stories with mapped content.
- `assets push --update-stories` fetches existing target stories and rewrites asset references after assets have already been pushed.
- `stories push` requires local component schemas and aborts if schemas are missing or story JSON has fields that would be lost.
- Official rewrite traversal is schema-aware and handles `asset`, `multiasset`, `multilink`, `richtext`, `bloks`, and `options`.

The official CLI storage path is `.storyblok/`. sb-mig should use its own `.sb-mig/` path to avoid colliding with official CLI state while keeping the same durable JSONL manifest idea.

### `@storyblok/migrations` Reuse Candidate

The `@storyblok/migrations@0.1.15` package exposes `mapRefs(story, { schemas, maps })`.

It handles:

- `asset`
- `multiasset`
- `multilink`
- `richtext`
- embedded richtext bloks
- `bloks`
- `options`
- maps for `stories`, `assets`, `users`, `tags`, and `datasources`

Important caveat:

- The package's current asset mapper maps asset IDs, while the official CLI's internal mapper also updates filenames using richer asset map entries. For sb-mig asset-safe story copy, we either need to wrap/extend `mapRefs` with filename rewriting or keep our own rewriter aligned with official CLI behavior.

Recommendation:

- Treat `@storyblok/migrations` as the official reference traversal model.
- Prefer importing it if it gives us enough control over asset filename rewriting and reporting.
- If not, implement an sb-mig rewriter with the same field coverage and test fixtures copied from the official behavior model.

## Required sb-mig Manifest Model

`sb-mig copy` should have its own durable manifest format. Proposed default location:

```txt
.sb-mig/copy/<source-space-id>/<target-space-id>/
```

Proposed files:

```txt
.sb-mig/copy/<source>/<target>/manifest.jsonl
.sb-mig/copy/<source>/<target>/stories.manifest.jsonl
.sb-mig/copy/<source>/<target>/assets.manifest.jsonl
.sb-mig/copy/<source>/<target>/asset-folders.manifest.jsonl
.sb-mig/copy/<source>/<target>/report.json
```

Proposed story entry:

```json
{
    "type": "story",
    "source_space_id": "123456",
    "target_space_id": "789012",
    "source_id": 123,
    "target_id": 8123,
    "source_uuid": "source-uuid",
    "target_uuid": "target-uuid",
    "source_full_slug": "blog/my-post",
    "target_full_slug": "blog/my-post",
    "action": "created",
    "created_at": "2026-06-16T10:00:00.000Z"
}
```

Proposed asset entry:

```json
{
    "type": "asset",
    "source_space_id": "123456",
    "target_space_id": "789012",
    "source_id": 999,
    "target_id": 42001,
    "source_filename": "https://a.storyblok.com/f/123456/source.jpg",
    "target_filename": "https://a.storyblok.com/f/789012/target.jpg",
    "source_asset_folder_id": 77,
    "target_asset_folder_id": 991,
    "action": "created",
    "created_at": "2026-06-16T10:00:00.000Z"
}
```

Proposed asset folder entry:

```json
{
    "type": "asset_folder",
    "source_space_id": "123456",
    "target_space_id": "789012",
    "source_id": 77,
    "target_id": 991,
    "source_name": "Hero",
    "target_name": "Hero",
    "source_parent_id": null,
    "target_parent_id": null,
    "action": "created",
    "created_at": "2026-06-16T10:00:00.000Z"
}
```

At runtime these entries should build lookup maps:

```ts
type CopyMaps = {
    storyIds: Map<number, number>;
    storyUuids: Map<string, string>;
    assetIds: Map<number, { id: number; filename: string }>;
    assetFilenames: Map<string, string>;
    assetFolderIds: Map<number, number>;
};
```

## Relational Integrity Requirements

Copying is successful only when the copied target content points to other copied target resources.

### Story Hierarchy

Requirements:

- Preserve folder/story parent-child hierarchy.
- Create parents before children.
- Map source `parent_id` to target `parent_id`.
- Preserve `is_folder`.
- Preserve `is_startpage` where valid.
- Handle root stories and folder-local starts.
- Support copying a subtree into a target folder.

Implementation implication:

- Build a source tree.
- Create folders and story shells in hierarchy order.
- Write story ID/UUID mappings before rewriting full content.

### Story References

Storyblok story content can reference other stories by ID or UUID depending on field type.

Known fields to rewrite:

| Field location                              | Identity   | Required behavior                                |
| ------------------------------------------- | ---------- | ------------------------------------------------ |
| `multilink` with `linktype: "story"`        | story id   | Replace source story id with target story id     |
| `richtext` story links                      | story uuid | Replace source story uuid with target story uuid |
| `options` with `source: "internal_stories"` | story ids  | Replace each source id with target id            |
| nested `bloks`                              | varies     | Recursively inspect nested components            |
| richtext embedded bloks                     | varies     | Recursively inspect embedded component content   |
| `alternates[].id`                           | story id   | Replace source id with target id                 |
| `alternates[].parent_id`                    | story id   | Replace source parent id with target parent id   |
| `parent_id`                                 | story id   | Replace source parent id with target parent id   |

If a story reference points to a story outside the selected copy scope, the command must not silently corrupt it. The copy report should classify it:

- `preserved_external_reference`
- `unresolved_story_reference`
- `skipped_reference_rewrite`

Potential policies:

- `preserve`: keep original external reference.
- `fail`: fail copy when external reference cannot be mapped.
- `include-referenced`: expand scope to include referenced stories.

MVP should default to `preserve` plus report warnings.

### Asset References

Asset fields commonly contain both an asset ID and a filename URL. Both can need rewriting.

Known fields to rewrite:

| Field location          | Identity           | Required behavior                                               |
| ----------------------- | ------------------ | --------------------------------------------------------------- |
| `asset` field           | asset id, filename | Replace with target asset id and target filename                |
| `multiasset` field      | asset id, filename | Replace each asset object                                       |
| nested `bloks`          | varies             | Recursively inspect nested components                           |
| richtext embedded bloks | varies             | Recursively inspect embedded component content                  |
| plugin/custom fields    | unknown            | Warn if schema is unknown or plugin data may contain references |

Asset references should be rewritten after target assets exist and asset manifests are populated.

### Asset Folders

Requirements:

- Copy asset folders before assets.
- Preserve folder nesting.
- Map source `asset_folder_id` to target `asset_folder_id`.
- Put copied assets in equivalent target folders.
- Support matching existing target folders by manifest first, then by path/name when safe.

### Component Schemas

Reference rewriting should be schema-aware.

Why:

- Story content is arbitrary JSON.
- Component schemas tell us which fields are `asset`, `multiasset`, `multilink`, `richtext`, `bloks`, `options`, etc.
- Without schemas, we can only do unsafe generic traversal.

Requirements:

- For robust rewriting, fetch or require source component schemas.
- If schemas are missing, the command should either:
    - fail in strict mode, or
    - continue with warnings and limited generic rewriting.

MVP recommendation:

- Require schemas for `copy stories --with-assets`.
- Add `--allow-missing-schemas` later if needed.

### Datasources

Datasource references can appear in schema-driven option fields and content values.

Requirements for later phases:

- Copy datasources and entries before final story update when stories depend on them.
- Map datasource identities where Storyblok uses IDs.
- Preserve dimensions and dimension values.
- Report missing datasource references.

MVP can document datasource support as out of scope unless the user includes `--include datasources`.

### Publication State

The current `createStory` behavior publishes unconditionally. That is not acceptable for first-class copy.

Requirements:

- Preserve source publication state by default.
- Draft-only source stories should remain draft-only in target.
- Published source stories should be published in target.
- Published stories with unpublished changes need a defined policy.

Proposed modes:

```txt
--publication-mode preserve-layers
--publication-mode collapse-draft
--publication-mode save-only
```

These should align with existing migration work documented in:

- `docs/migrate-content-published-layer.md`
- `docs/migrate-content-publish-languages.md`

Default recommendation:

```txt
preserve-layers
```

### Idempotency and Resume

Rerunning copy should not duplicate everything.

Matching priority:

1. Existing manifest mapping.
2. Target resource by stable key:
    - story full_slug
    - asset folder path
    - asset filename or checksum where available
    - datasource name/slug
    - component name
3. Create new target resource.

The report should show:

- created
- updated
- skipped
- matched_by_manifest
- matched_by_target_key
- unresolved
- failed

Partial failure must be resumable from existing manifest state.

## Proposed Copy Command Surface

### MVP: Stories With Assets

```bash
sb-mig copy stories \
  --from 123456 \
  --to 789012 \
  --source blog \
  --with-assets \
  --dry-run
```

Then:

```bash
sb-mig copy stories \
  --from 123456 \
  --to 789012 \
  --source blog \
  --with-assets
```

Current implemented copy-shape subset:

```bash
sb-mig copy stories --from 123456 --to 789012 --source blog --destination imported
sb-mig copy stories --from 123456 --to 789012 --source blog/* --destination imported
sb-mig copy stories --from 123456 --to 789012 --source blog --mode self --destination /
sb-mig copy stories --from 123456 --to 789012 --source blog --destination imported --dry-run
```

Expected behavior:

1. Fetch source stories in scope.
2. Discover asset references used by those stories.
3. Fetch and copy required asset folders.
4. Copy required assets.
5. Create target story shells and write story mappings.
6. Rewrite copied story content using story and asset maps.
7. Update target stories.
8. Preserve publication state.
9. Write manifest and report.

### Current Dry-Run Contract

The current copy dry-run is a planning preview for the implemented create-oriented story copy.

Command:

```bash
sb-mig copy stories \
  --from 123456 \
  --to 789012 \
  --source blog \
  --destination imported \
  --dry-run
```

Optional machine-readable artifact:

```bash
sb-mig copy stories \
  --from 123456 \
  --to 789012 \
  --source blog \
  --destination imported \
  --dry-run \
  --outputPath sbmig/copy-plans/blog-copy.json
```

Dry-run behavior:

1. Resolve source space, target space, source, destination, and copy mode.
2. Fetch the source story or folder.
3. Fetch descendants when mode is `subtree` or `children`.
4. Validate the destination:
    - omitted, `/`, or `root` means target root
    - otherwise the target destination must exist and be a folder
5. Build the exact selected tree roots that real copy would pass to creation.
6. Compute planned target full slugs from destination plus copied story slugs.
7. Check likely target path conflicts by looking up each planned target full slug in the target space.
8. Log the plan using `[dry-run]` messages.
9. When `--outputPath` is passed, create parent directories and write one local JSON plan artifact.
10. Return before `traverseAndCreate`.
11. Perform no Storyblok writes.

Example output shape:

```txt
[dry-run] Copy stories preview only. No Storyblok writes will be made.
[dry-run] Source space: 123456
[dry-run] Target space: 789012
[dry-run] Source: blog
[dry-run] Destination: imported
[dry-run] Mode: subtree
[dry-run] Would create 3 story/folder item(s):
[dry-run]   folder imported/blog
[dry-run]   story  imported/blog/post-1
[dry-run]   story  imported/blog/post-2
[dry-run] Warning: target story already exists at 'imported/blog/post-1'. Current copy is create-only, so the real copy may fail.
[dry-run] Current limitation: assets are not copied by this command yet.
[dry-run] Current limitation: asset fields and story references are not rewritten yet.
```

Important limitations:

- Dry-run is not a future manifest simulation.
- It does not generate fake Storyblok IDs.
- It does not simulate asset copy or reference rewriting yet.
- It detects likely slug conflicts, but real copy can still fail if target state changes between dry-run and copy.
- It uses the current create-oriented behavior as the source of truth.

Dry-run follows `docs/dry-run-output-policy.md`: `--dry-run` remains Storyblok-write-free and file-free by default; `--outputPath` writes the machine-readable copy plan artifact.

Future dry-run should evolve into a full `CopyPlan` preview once manifests, assets, upsert/conflict policies, and reference rewriting exist.

### Explicit Assets Command

```bash
sb-mig copy assets \
  --from 123456 \
  --to 789012 \
  --all
```

```bash
sb-mig copy assets \
  --from 123456 \
  --to 789012 \
  --referenced-by-stories \
  --starts-with blog/
```

Potential `--update-stories` equivalent:

```bash
sb-mig copy assets \
  --from 123456 \
  --to 789012 \
  --all \
  --update-stories
```

Meaning:

- Copy assets.
- Then patch already existing target stories using the new asset manifest.

This is useful when assets are copied after stories already exist.

### Full Space Copy

```bash
sb-mig copy space \
  --from 123456 \
  --to 789012 \
  --include components,datasources,assets,stories \
  --dry-run
```

Potential new-target mode:

```bash
sb-mig copy space \
  --from 123456 \
  --name "Production Copy 2026-06-16" \
  --include components,datasources,assets,stories
```

Important Storyblok caveat:

- Storyblok's duplicate-space endpoint duplicates content and components, but not assets.
- Duplicated content can still reference source-space assets.
- Even when using duplicate-space as a shortcut, sb-mig may still need to copy assets and rewrite story asset references.

### Local Pull/Push Mode

Longer-term:

```bash
sb-mig copy pull --from 123456 --include components,assets,stories
sb-mig copy push --from 123456 --to 789012 --include components,assets,stories
```

This mirrors the official CLI mental model while keeping sb-mig's own manifest/report model.

## Execution Model

### Direct Space-to-Space Copy

Even direct copy should use durable manifests.

Recommended pipeline:

1. Load config and validate auth.
2. Resolve region and rate limit settings.
3. Resolve source scope.
4. Fetch component schemas required for reference traversal.
5. Build copy plan.
6. Load existing manifests, if any.
7. Copy or match asset folders.
8. Copy or match assets.
9. Create or match story shells in hierarchy order.
10. Build story and asset maps.
11. Rewrite story content.
12. Update target stories.
13. Apply publication state.
14. Write manifest entries and report.

### Two-Pass Story Copy

Stories should not be copied in one full-content create call.

Pass 1: create shells

```ts
{
    name,
    slug,
    parent_id,
    is_folder,
    is_startpage,
    content: {
        component: source.content.component,
        _uid: ""
    }
}
```

Pass 2: update full rewritten content

```ts
{
    ...sourceStory,
    id: targetId,
    uuid: targetUuid,
    parent_id: mappedParentId,
    content: rewriteReferences(sourceStory.content, maps, schemas)
}
```

Reason:

- A story can reference another story that has not yet been created.
- Target IDs and UUIDs are only known after target creation.
- Asset URLs and IDs are only known after target asset upload.

### Copy Plan

Dry-run should produce a plan without target writes.

Proposed plan shape:

```ts
type CopyPlan = {
    sourceSpaceId: string;
    targetSpaceId: string;
    scope: CopyScope;
    stories: PlannedStory[];
    assets: PlannedAsset[];
    assetFolders: PlannedAssetFolder[];
    components: PlannedComponent[];
    datasources: PlannedDatasource[];
    warnings: CopyWarning[];
};
```

Plan entries should include predicted action:

```txt
create
update
skip
match
unknown
```

## Reference Rewriter Design

Reference rewriting should be centralized, tested, and reusable.

Proposed module:

```txt
src/api/copy/reference-rewriter.ts
```

Proposed API:

```ts
type RewriteReferencesArgs = {
    story: StoryblokStory;
    schemas: ComponentSchemaRegistry;
    maps: CopyMaps;
    options: {
        missingReferencePolicy: "preserve" | "fail" | "warn";
    };
};

type RewriteReferencesResult = {
    story: StoryblokStory;
    rewrites: ReferenceRewrite[];
    warnings: CopyWarning[];
    unresolved: UnresolvedReference[];
};
```

Reference rewrite records:

```ts
type ReferenceRewrite = {
    type: "asset" | "story" | "asset_folder";
    path: string;
    sourceValue: unknown;
    targetValue: unknown;
};
```

Unresolved reference records:

```ts
type UnresolvedReference = {
    type: "asset" | "story";
    path: string;
    sourceValue: unknown;
    reason:
        | "not_in_manifest"
        | "not_in_scope"
        | "unknown_schema"
        | "unsupported_field";
};
```

## Safety Requirements

The command should be conservative by default.

Required safety behavior:

- `--dry-run` for all copy modes.
- No destructive deletes unless `--prune` or equivalent is explicit.
- Confirm dangerous operations unless `--yes`.
- Avoid silent partial success.
- Write a machine-readable report.
- Preserve raw API error details in debug mode.
- Support resume after failure.
- Respect Storyblok rate limits.
- Support Storyblok regions.

## Known Storyblok/API Constraints

- Management API list endpoints are paginated.
- Official max page size is generally 100 items, with datasource entries using a higher max.
- Rate limits vary by Storyblok plan.
- Asset upload uses signed upload flow.
- Space duplicate does not create independent asset copies.
- Story duplicate is same-space-oriented and is not sufficient for cross-space copy.
- Some references live in plugin fields or custom JSON where schema-safe rewriting may be impossible.
- Historical story versions, activity logs, release scheduling, workflow state, tasks, comments, and app-specific metadata may not be fully copyable through the same flow.

## Edge Cases To Cover

Stories:

- root story
- folder story
- nested folders
- copied subtree into a different target folder
- startpage
- story slug collision in target
- target story matched by manifest
- target story matched by full_slug
- story references outside selected copy scope
- circular story references
- localized fields with `__i18n__` suffixes
- richtext story links
- richtext embedded bloks

Assets:

- asset field
- multiasset field
- assets inside nested bloks
- assets inside richtext embedded bloks
- private assets
- missing/unreachable source asset URL
- asset folder nesting
- asset filename collision
- re-running after partial asset upload

Schemas:

- missing component schema
- schema field unknown in content
- plugin field with possible hidden references
- component group and preset preservation

Publication:

- draft-only source story
- clean published source story
- published source story with unpublished changes
- multilingual publish state

Operational:

- rate limiting
- retryable API failures
- process interruption and resume
- dry-run report accuracy
- cross-region configuration

## MVP Acceptance Criteria

MVP should satisfy:

1. `sb-mig copy stories --from <source> --to <target> --with-assets` copies selected stories and their referenced assets.
2. Copied stories point at target-space asset IDs and target-space asset filenames.
3. Copied story hierarchy is preserved.
4. Copied story-to-story references are rewritten when referenced stories are in scope.
5. References outside scope are reported.
6. Asset folders are recreated or matched in target.
7. Command writes durable manifests.
8. Command can be rerun without duplicating already copied resources.
9. Command supports `--dry-run`.
10. Command produces a structured report.
11. Command does not publish everything unconditionally.
12. Unit tests cover reference rewriting and manifest map behavior.

## Suggested Implementation Slices

Linear project `sb-mig` is the implementation source of truth. Keep this section aligned with Linear issues whenever the roadmap changes.

Existing related Linear issues:

- `MAR-1507`: focused parent roadmap for official-CLI-aligned copy assets/references work.
- `MAR-1508`: manifest store and copy graph model.
- `MAR-1509`: schema-aware reference scanner and graph report.
- `MAR-1510`: `copy assets` with asset folders/assets manifests.
- `MAR-1511`: story shell creation and story ID/UUID manifest.
- `MAR-1512`: reference rewriting from manifests.
- `MAR-1513`: `copy stories --with-assets` end-to-end pipeline.
- `MAR-1514`: `--reference-policy fail` and `include-referenced`.
- `MAR-1515`: publication state, resume behavior, and live safety.
- `MAR-1451`: older SDK-refactor issue for copy story CLI strategies.
- `MAR-1452`: older SDK-refactor issue for content/asset directional sync.
- `MAR-1464`: older SDK-refactor issue for spaces/auth/assets slices.
- `MAR-1502`: copy stories dry-run `--outputPath` JSON artifact.
- `MAR-1503`: shared command report writer for `--outputPath` artifacts.

The focused copy roadmap should live in new copy-specific issues under the `sb-mig` project rather than overloading the broad SDK-refactor tickets.

### Slice 1: Copy Domain Model and Manifest Store

Deliverables:

- `src/api/copy/types.ts`
- `src/api/copy/manifest.ts`
- JSONL load/append/dedupe helpers.
- Runtime map builder.
- Unit tests for manifest append/load/dedupe.

### Slice 2: Copy Planner

Deliverables:

- Scope resolution for story slugs, `starts_with`, folder subtree, and explicit IDs.
- Source story fetch with pagination.
- Asset reference discovery from stories.
- Dry-run plan object.
- Report skeleton.

### Slice 3: Asset Folder and Asset Copy

Deliverables:

- Asset folder fetch/create/update/match.
- Asset fetch/download/upload through signed upload.
- Asset metadata preservation.
- Asset and folder manifest entries.
- Rerun idempotency.

### Slice 4: Story Shell Creation

Deliverables:

- Build story tree.
- Create or match target story shells in hierarchy order.
- Write story ID and UUID mappings.
- No full-content update yet.

### Slice 5: Reference Rewriter

Deliverables:

- Schema-aware traversal.
- Asset field rewrite.
- Multiasset rewrite.
- Multilink story rewrite.
- Richtext story-link rewrite.
- Nested blok traversal.
- Options/internal stories rewrite.
- Unresolved-reference reporting.

### Slice 6: Final Story Update and Publication State

Deliverables:

- Update target stories with rewritten content.
- Preserve publication state using existing migration publication utilities where possible.
- Handle multilingual publication state.
- Structured result summary.

### Slice 7: CLI Surface

Deliverables:

- `sb-mig copy stories`
- flags:
    - `--from`
    - `--to`
    - `--source`
    - `--destination`
    - `--mode`
    - `--with-assets`
    - `--dry-run`
    - `--yes`
    - `--publication-mode`
    - `--manifest-dir`
    - `--missing-reference-policy`
- useful help text and examples.

### Slice 8: Integration and Live Tests

Deliverables:

- Unit fixtures for story JSON and schemas.
- Mock API tests for operation order.
- Optional live test gated by Storyblok credentials.
- Regression tests for rerun/resume behavior.

## Linear Phase Plan

Use these phases as the ticket structure.

### Phase 0: Roadmap and Sources of Truth (`MAR-1507`)

Goal:

- Keep the repo spec, Linear document, and Linear ticket tree aligned.
- Record official Storyblok CLI behavior with exact version/date.
- Make the plan easy for agents to reload after context compaction.

Exit criteria:

- `docs/copy-command-spec.md` documents official CLI manifest behavior.
- Linear has a parent roadmap issue and phase tickets.
- Linear document mirrors the key plan and links back to the repo spec.

### Phase 1: Manifest Store and Copy Graph Model (`MAR-1508`)

Goal:

- Add the copy domain model used by all later phases.
- Store durable source-to-target mappings in JSONL manifests.
- Produce a graph/report object that dry-run and real copy both use.

Required behavior:

- Manifest loader treats missing files as empty.
- Manifest append is atomic enough for command usage.
- Manifest dedupe keeps latest mapping for a source key.
- Runtime maps include story IDs, story UUIDs, asset IDs, asset filenames, and asset folder IDs.
- Graph nodes include selected stories, referenced assets, asset folders, story references, warnings, and limitations.

Do not implement real asset/story rewriting in this phase.

### Phase 2: Schema-Aware Reference Scanner (`MAR-1509`)

Goal:

- Scan selected stories and produce a reference graph before copying.

Required behavior:

- Require component schemas by default.
- Traverse `bloks` and richtext embedded bloks.
- Detect asset references in `asset` and `multiasset`.
- Detect story references in `multilink`, richtext story links, and `options` with `source: "internal_stories"`.
- Detect `alternates` and parent references outside content.
- Report plugin/custom fields as potentially opaque.
- Output structured unresolved/external-reference entries.

Default story-reference policy for MVP:

```txt
--reference-policy preserve
```

Meaning:

- Rewrite only references already mapped or inside selected copy scope.
- Preserve external references.
- Report preserved external references in the graph/report.

### Phase 3: `copy assets` (`MAR-1510`)

Goal:

- Copy asset folders and assets independently of stories.

Current implementation status:

- `sb-mig copy assets --from <sourceSpaceId> --to <targetSpaceId> --all --dry-run` is implemented as the first safe slice.
- `--outputPath` writes a JSON report with the copy graph, ordered asset-folder nodes, asset nodes, warnings, limitations, and replay commands.
- `sb-mig copy assets --from <sourceSpaceId> --to <targetSpaceId> --all` now applies the copy.
- Apply mode loads existing `.sb-mig/copy/<source>/<target>/manifest.jsonl` mappings first.
- Apply mode creates or matches asset folders before assets.
- Apply mode uploads assets, calls Storyblok `finish_upload`, optionally updates safe metadata, and writes asset/asset-folder manifests.
- Reruns avoid duplicate uploads when a manifest mapping exists. Without a manifest, the command may match target folders by path and target assets by unique file name.

Required behavior:

- Copy or match asset folders before assets.
- Preserve asset folder nesting.
- Copy assets through signed upload flow.
- Preserve safe metadata: `alt`, `title`, `copyright`, `source`, `focus`, `meta_data`, `is_private`, `locked`, `publish_at` when supported.
- Write asset and asset-folder manifests.
- Support `--dry-run` and `--outputPath`.
- Support rerun without duplicate uploads where manifest or safe target match exists.

MVP selector:

```bash
sb-mig copy assets --from 123456 --to 789012 --all
```

Safe dry-run selector available now:

```bash
sb-mig copy assets --from 123456 --to 789012 --all --dry-run --outputPath sbmig/copy-plans/assets-copy.json
```

Later selectors:

```bash
sb-mig copy assets --from 123456 --to 789012 --referenced-by-stories --source blog
sb-mig copy assets --from 123456 --to 789012 --starts-with blog/
```

### Phase 4: Story Shell Creation and Story Manifest (`MAR-1511`)

Goal:

- Create or match target story shells in hierarchy order before full content update.

Current implementation status:

- `copy stories` apply mode now writes story ID/UUID manifests while preserving the current full-content create behavior.
- Manifests are written to `.sb-mig/copy/<source>/<target>/stories.manifest.jsonl` and the combined `.sb-mig/copy/<source>/<target>/manifest.jsonl`.
- Existing manifest mappings are loaded first so reruns can reuse mapped target parents.
- If no manifest entry exists, target stories are matched by planned target `full_slug` before creating a new story.
- Pure shell-only creation is still future work; this incremental slice intentionally avoids regressing the current user-facing story copy behavior before reference rewriting exists.

Required behavior:

- Create folders before child stories.
- Preserve parent-child structure under selected destination.
- Create minimal story shells with slug/name/folder/startpage/content component.
- Write both source numeric ID to target numeric ID and source UUID to target UUID.
- Match by manifest first, then target slug when safe.
- Avoid updating full story content in this phase except minimal shell data.

### Phase 5: Reference Rewriter (`MAR-1512`)

Goal:

- Rewrite copied story content using manifests and schemas.

Required behavior:

- Rewrite asset fields with target asset ID and target filename.
- Rewrite multiasset entries.
- Rewrite internal story multilinks.
- Rewrite richtext story links by UUID.
- Rewrite embedded richtext bloks recursively.
- Rewrite `options` with `source: "internal_stories"`.
- Rewrite `alternates` where mapped.
- Preserve/report external references according to `--reference-policy preserve`.
- Expose enough rewrite records for JSON reports.

Implementation note:

- Compare against `@storyblok/migrations mapRefs()` and official CLI internals.
- If using `mapRefs`, add sb-mig wrapping for asset filename rewriting and detailed reporting.

### Phase 6: `copy stories --with-assets` (`MAR-1513`)

Goal:

- End-to-end story copy with referenced assets copied first and story content relinked to target assets.

Required order:

1. Resolve story scope.
2. Load schemas.
3. Build copy graph.
4. Load manifests.
5. Copy/match asset folders.
6. Copy/match referenced assets.
7. Create/match story shells.
8. Rewrite story content.
9. Update target stories.
10. Write report.

MVP command:

```bash
sb-mig copy stories \
  --from 123456 \
  --to 789012 \
  --source blog \
  --destination imported \
  --with-assets \
  --dry-run \
  --outputPath sbmig/copy-plans/blog-copy.json
```

### Phase 7: Story Reference Expansion Policies (`MAR-1514`)

Goal:

- Add explicit behavior for references to stories outside the selected copy scope.

Policies:

```txt
preserve
fail
include-referenced
```

MVP already uses `preserve`.

Later behavior:

- `fail`: abort plan/apply when an external story reference has no mapping.
- `include-referenced`: expand selected story graph to include referenced stories.
- Add `--reference-depth` to avoid accidental full-space expansion.
- Detect and report cycles.

### Phase 8: Publication State, Resume, and Live Safety (`MAR-1515`)

Goal:

- Make first-class copy operationally safe.

Required behavior:

- Preserve draft-only stories as draft-only.
- Publish clean published source stories in target.
- Define behavior for published stories with unpublished changes.
- Support multilingual publication where possible.
- Resume cleanly after partial failures.
- Write final report with created/updated/skipped/failed/matched counts.
- Add mock and optional live tests for real Storyblok spaces.

Recommended default:

```txt
--publication-mode preserve-layers
```

Fallback for MVP if full layer preservation is too large:

```txt
--publication-mode save-only
```

with explicit report warnings.

## Open Questions

1. Should the default story selector be explicit, or should `copy stories --all` be required for full-space content?
2. Should `copy stories --with-assets` copy only referenced assets or all assets in the space?
3. Should missing referenced stories fail by default or warn by default?
4. Should target story matching by slug be automatic, or only when `--upsert` is provided?
5. Should direct space-to-space copy write local manifests by default? Recommendation: yes.
6. Should manifests be stored in `.sb-mig/` or `.storyblok/`? Recommendation: `.sb-mig/` to avoid colliding with the official CLI.
7. Should we reuse existing `sync content` code or build copy as a separate domain? Recommendation: build copy separately and reuse only stable low-level API helpers.
8. How far should MVP go on components, component groups, presets, datasources, roles, and plugins?
9. Should copy support Storyblok duplicate-space as an optimization for new target spaces?
10. What is the expected behavior for source stories that are published with unpublished draft changes?

## Confirmed Scope Decisions

These decisions came out of the first copy-command design pass.

In current scope:

- Copy into a target root must be supported.
- Copying just one folder shell is useful and should be supported through `--mode self`.
- Copying a folder should recursively copy the folder and everything below it by default.
- Copying a folder's contents without the root remains useful and can be expressed with `folder/*` or `--mode children`.
- Current behavior is create-oriented. Conflict handling, updating, and merging need a later design pass.

Deferred for later:

- Shallow folder copy with a depth limit.
- Copying multiple selected stories/folders in one command.
- Preserving source path under a new destination instead of attaching selected roots directly under destination.
- Same-space copy with automatic rename.
- Advanced conflict policies such as skip/update/rename/overwrite.

Needs deeper design:

- Partial subtree copy with internal references preserved.
- Asset copy plus story asset-reference relinking.
- Story-to-story reference relinking when only part of the source tree is copied.

The partial-subtree/reference problem should be designed together with the asset-copy manifest work. Both depend on the same source-to-target identity map.

## Recommended Product Direction

`copy` should not be a thin alias for `sync content`.

`sync` is about aligning a target with source content. `copy` should be about faithfully reproducing selected source resources into another destination while preserving relationships and making the operation resumable.

The main architectural pillar is:

```txt
plan -> create/match identities -> write manifests -> rewrite references -> update final content
```

That is the difference between a best-effort story clone and a first-class cross-space copy command.
