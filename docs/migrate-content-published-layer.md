# Dual-layer Storyblok content migration

## Problem

Storyblok stories can have two meaningful content layers at the same time:

- the current editable story content, returned by the Management API story read
- the currently published production content

For a story where `published === true` and `unpublished_changes === true`, these layers are intentionally different. Editors published one version, then saved newer draft edits that should not be live yet.

The existing `migrate content` command reads the Management API story and migrates that current editable content. If a dirty published story is handled as a single layer, sb-mig has to make an explicit tradeoff: either publish the latest draft and lose the older published layer, or keep the migrated draft saved and leave the published production JSON unmigrated.

For schema/content migrations, that is not enough. The production layer must be migrated too.

## Confirmed API behavior

The normal Management API story read does not expose a `version=published` selector. It returns the current editable story state.

The Storyblok Management Story Versions API can be queried with:

```http
GET /v1/spaces/:space_id/story_versions?by_story_id=:story_id&show_content=true
```

In the observed payload for story `178888427520390` (`translation-migration-testing/test-1/contact-us`), the endpoint returned versions with:

```txt
status: "draft"
status: "published"
```

The version object is not a full Management story object. It has keys like:

```txt
id, story_id, status, content, created_at, user, parent_id, release_id
```

But `story_versions[].content` matched the raw Management story `story.content` shape:

- same root content keys
- same nested path structure
- same value types
- same `_uid` and `component` block structure
- same translated field key style, for example `title__i18n__fr`

For the first sample Contact Us story comparison:

```txt
Management input content hash:       e2b189f7102b611e
Latest published version hash:       e2b189f7102b611e
Management vs published path diffs:  0
Management vs published type diffs:  0
```

This means the Story Versions API is a viable source for the published content layer, as long as we use only the `content` from the version and keep the surrounding story envelope from the current Management story.

The later dirty-story test in space `292655015569577` confirmed the exact state we need to preserve:

```txt
story id:             178888427520390
full_slug:            translation-migration-testing/test-1/contact-us
published:            true
unpublished_changes:  true
current_version_id:   178936391675780

draft/current hash:   8a6e8fdcc97e8fdc
published hash:       8f02385e5083696c
statuses fetched:     draft, published
shape diffs:          0 missing, 0 extra, 0 type diffs
```

The only content difference between draft/current and published was the expected French rich-text value:

```txt
path:
body[4].content[0].content[0].content[0].content__i18n__fr.content[0].content[0].text

draft/current:  French Text Saved Again
published:      French Text Published Again
```

This confirms that `status: "draft"` and `status: "published"` are the observed Story Versions API status values for this workflow, and that the latest published layer can be selected from the version list without using the Content Delivery API.

## Layer model

For each selected story, sb-mig should treat the source as two possible migration inputs.

Draft/current layer:

```ts
const draftLayerStory = managementStory;
```

Published layer:

```ts
const publishedLayerStory = {
    ...managementStory,
    content: latestPublishedVersion.content,
};
```

The published layer must use the current Management story metadata for ids, slug, parent, translated slugs, path, and other story-level fields. The historical version object should not be passed directly to the migration pipeline because it is not a full story object.

## Publication modes

`migrate content` uses explicit publication modes instead of a generic `--publish` flag:

```bash
--publicationMode preserve-layers
--publicationMode collapse-draft
--publicationMode save-only
```

`preserve-layers` is the correct Storyblok-state-preserving mode and the default for space-to-same-space migrations. It uses Story Versions API for dirty published stories, migrates the latest published layer and the latest draft/current layer separately, publishes the migrated published layer, then restores the migrated draft/current layer as saved draft.

`collapse-draft` is the duplicated-space fallback. Storyblok duplicated spaces can preserve `published` and `unpublished_changes` metadata while having empty version history. In that case there is no Management-shaped published layer to fetch. This mode intentionally migrates the latest draft/current content and publishes it for stories that are already published. Draft-only or unpublished stories remain saved-only.

`save-only` migrates all changed stories as saved draft and does not publish anything.

`--publicationLanguages` controls which language scope is inspected and preserved when the selected publication mode publishes a story. It defaults to `all`:

```bash
--publicationLanguages default
--publicationLanguages all
--publicationLanguages default,fr,de
```

For each selected story and each resolved language, migrate builds a language publish-state map automatically. A language is published after migration only if that language was published before migration. In `collapse-draft`, a language with unpublished changes is intentionally published from latest draft/current content. In `preserve-layers`, the migrated published layer is published for languages that were published before, then migrated draft/current content is restored with `publish:false`.

For each story:

### Draft-only story

If the story is not published:

```txt
read Management current content
migrate current content
update story with publish:false
```

There is no published layer to preserve.

### Clean published story

If the story is published and has no unpublished changes:

```txt
read Management current content
read latest published version content
```

The two layers should normally match. The migration may use the normal current story path, then update and publish as today.

The first implementation can keep the existing single-layer path for clean published stories. It should still include them in the dual-layer summary as `clean-published` so dry-run output makes it clear why no draft restore is needed.

### Published story with unpublished changes

If the story is published and has saved draft edits:

```txt
read Management current content as draft/current layer
read latest story version where status === "published" as published layer

migrate published layer in memory
migrate draft/current layer in memory

write migrated published layer
publish migrated published layer
write migrated draft/current layer with publish:false
```

The writes must be sequential:

1. update the story with migrated published-layer content
2. publish that migrated published layer
3. update the story with migrated draft-layer content using `publish:false`

This ordering matters. Publishing after restoring the draft would publish editor draft work by mistake.

The expected final state is:

```txt
published JSON: migrated production content
draft JSON:     migrated saved editor content
story state:    published=true and unpublished_changes=true
```

## Safety checks

The real migrate implementation should include these checks:

- For a dirty published story, fail the story if no `status === "published"` version can be found.
- Select the newest published version by version ordering or `created_at`.
- Re-fetch the Management story before writing and compare `current_version_id` or `updated_at` against the story that was read before migration.
- If the story changed during the run, fail or skip that story instead of overwriting new editor work.
- Never publish the draft/current layer.
- Record run-log events for published-layer update, published-layer publish, and draft-layer restore.
- Write separate artifacts for draft input/output and published input/output so the operation is inspectable.

## Dry-run contract

`--dry-run --publicationMode preserve-layers` must prove the data path without writing to Storyblok.

Dry run should:

- fetch the same Management draft/current stories that a real run would use
- fetch Story Versions API for dirty published stories
- select the newest `status === "published"` version for each dirty published story
- create wrapped published-layer stories using the current Management story envelope
- run the configured migration pipeline independently against draft/current stories and published-layer stories
- write local JSON artifacts for the exact payloads that would be used in a real write
- write a summary explaining what would happen and in which order
- never call Storyblok update or publish endpoints

The dry-run summary should include:

- total selected stories
- count of draft-only stories
- count of clean published stories
- count of dirty published stories
- count of dirty published stories with a published layer found
- count of dirty published stories missing a published layer
- count of draft/current stories changed by the migration
- count of published-layer stories changed by the migration
- story ids, names, and full slugs
- source story state: `published`, `unpublished_changes`, `current_version_id`, `updated_at`, `published_at`
- selected published version: `id`, `status`, `created_at`, and content hash
- draft/current content hashes before and after migration
- published-layer content hashes before and after migration
- structural compatibility signals for draft/current versus selected published content
- planned write order for dirty published stories:

```txt
1. update migrated published layer
2. publish migrated published layer
3. restore migrated draft/current layer with publish:false
```

Recommended dry-run artifacts:

```txt
<name>---draft-current-input-full.json
<name>---draft-current-after-full.json
<name>---published-layer-input-full.json
<name>---published-layer-after-full.json
<name>---published-layer-summary.json
```

For dirty published stories, these files should contain enough data to say: if the same command is run without `--dry-run`, these migrated local payloads are the payloads that would be written to Storyblok in the sequential order above.

## Real write contract

When `--publicationMode preserve-layers` is used without `--dry-run`, writes must be sequential per dirty published story:

1. re-fetch the current Management story
2. compare the current story's `current_version_id` or `updated_at` against the story that was migrated
3. if the story changed during the run, fail/skip it
4. update the story with migrated published-layer content
5. publish that migrated published layer
6. update the story with migrated draft/current content and `publish:false`

The draft/current layer must never be published as part of the restore step. The restore step is expected to recreate `published=true` plus `unpublished_changes=true`.

Clean published stories may continue through the existing update-and-publish path. Draft-only stories may continue through the existing save-draft path.

## Implemented behavior

The current implementation:

1. Uses `--publicationMode preserve-layers` for dual-layer migration.
2. Uses `--publicationMode collapse-draft` for duplicated spaces without story versions.
3. Uses `--publicationMode save-only` for draft-only writes.
4. Refactors the migration pipeline so an already-loaded story array can be migrated without fetching again.
5. Fetches Story Versions API pages and selects the newest `status === "published"` version.
6. Builds dual-layer inputs for dirty published stories.
7. Runs the migration pipeline separately for draft/current and published-layer inputs.
8. Writes dry-run artifacts with the dual-layer files and summary.
9. Adds the real sequential write path for dirty published stories.
10. Adds focused tests for:
   - dry-run artifact generation
   - missing published version handling
   - dirty published write order
   - stale story safety check
   - dirty-published `collapse-draft` publishing

## Read-only export spike

The read-only export command exists to prove the model across real stories before implementing or using write behavior.

The command should:

- fetch selected Management stories using the same source filters as `migrate content`
- fetch Story Versions API for each selected story
- select the latest version with `status === "published"`
- write the current Management stories as the draft/current layer
- write wrapped published-layer stories as migration-compatible story objects
- write a summary with story state, version ids, version statuses, content hashes, and structural compatibility signals

The exported published-layer story should have this shape:

```ts
{
    story: {
        ...managementStory,
        content: latestPublishedVersion.content,
    },
}
```

This shape is intentionally compatible with the existing migration pipeline input.

The export command already confirmed the model for the dirty Contact Us story in the correct `21_05` migration space. The failed `20_05` attempt was a space mismatch, not a slug issue. `with_slug` works with the full slug in the correct space.

## Open questions

- Confirm pagination behavior for stories with many versions.
- Decide whether real runs should fail the whole command on a missing published layer, or skip only the affected story and fail the final summary.
