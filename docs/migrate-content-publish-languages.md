# Migrate Content Publish Languages Spec

## Goal

`sb-mig migrate content` should be able to publish migrated Storyblok stories in the default language and selected field-level translation languages after the story update has been saved.

The immediate use case is Backpack Storyblok migrations. Those migrations already preserve and move field-level translation values stored as `__i18n__<language>` field variants. The missing behavior is publication of those translated variants after `sb-mig` writes the migrated story back through the Storyblok Management API.

## Current Behavior

The command already accepts `--publish`.

Current write flow:

1. Load stories from a Storyblok space or from a local migration JSON file.
2. Run one or more migration configs in memory.
3. Save migration artifacts and run summary files.
4. Update each changed story with `PUT /spaces/:spaceId/stories/:storyId`.
5. Pass `publish: 1` when `--publish` is set, otherwise `publish: 0`.

The current implementation lives mainly in:

- `src/cli/index.ts`
- `src/cli/commands/migrate.ts`
- `src/api/data-migration/component-data-migration.ts`
- `src/api/stories/stories.ts`

Problem: `publish: 1` on the update request does not give us explicit multi-language publication control for field-level translations. The migrated translated field data may be saved, but non-default language versions remain draft/unpublished.

## Storyblok API Facts

Official docs checked on 2026-05-07:

- Update story:
  - `PUT https://mapi.storyblok.com/v1/spaces/:space_id/stories/:story_id`
  - Docs: https://www.storyblok.com/docs/api/management/stories/update-a-story
  - Supports `publish` for publishing during update.
  - Supports `lang` as a single language code for individual language publishing, but this is not ideal for publishing all changed translations.

- Publish story:
  - `GET https://mapi.storyblok.com/v1/spaces/:space_id/stories/:story_id/publish`
  - Docs: https://www.storyblok.com/docs/api/management/stories/publish-a-story
  - Supports `lang` as comma-separated language codes.
  - Example format: `lang=es,pt-br,[default]`.
  - Requires Storyblok setting `Settings -> Internationalization -> Publish translations individually`.
  - `[default]` is the special token for the default story version.

- Retrieve space:
  - `GET https://mapi.storyblok.com/v1/spaces/:space_id`
  - Docs: https://www.storyblok.com/docs/api/management/spaces/retrieve-a-single-space
  - Use this to fetch configured target-space languages when publishing all languages.

## Target Behavior

Keep `--publish` as the opt-in switch. Migrations should still save drafts by default.

Add a language selector flag for content migrations:

```txt
--publishLanguages default
--publishLanguages all
--publishLanguages default,fr,de,es
```

Recommended semantics:

- No `--publish`: update stories as draft only. No publish endpoint calls.
- `--publish` without `--publishLanguages`: keep the legacy single-update behavior and publish through `PUT /stories/:storyId` with `publish: 1`.
- `--publish --publishLanguages default`: publish `[default]`.
- `--publish --publishLanguages all`: fetch configured languages from target space and publish `[default]` plus all configured language codes.
- `--publish --publishLanguages default,fr,de`: publish `[default],fr,de`.
- `default` should normalize to Storyblok's `[default]` token.
- `[default]` should also be accepted directly for advanced users.
- Configured space languages must come from Storyblok, not from app locale config.

## Required Ordering

For each changed story, the update must complete successfully before publishing that story.

Correct per-story sequence:

```ts
const updateResult = await updateStory(story, story.id, {
    publish: false,
}, config);

if (!updateResult.ok) {
    return updateResult;
}

if (options.publish) {
    return publishStoryLanguages(story.id, publishLanguages, config);
}

return updateResult;
```

Do not update and publish the same story in parallel when explicit publish languages are requested. Publishing before the `PUT` completes risks publishing stale content.

It is acceptable to process multiple stories concurrently as long as each story task preserves update-then-publish ordering internally. If rate-limit pressure is high, add a concurrency limit or delay around publish calls.

Explicit publish-language modes intentionally add a second Management API call per changed story: one `PUT` to save the migrated draft, then one `GET /publish` to publish the requested language variants. Large migrations should account for the extra Storyblok API traffic and the configured client rate limit.

## Proposed Implementation Plan

1. Add CLI flag parsing.
   - Add `publishLanguages` as a string flag in `src/cli/index.ts`.
   - Add it to the allowed migrate option list in `src/cli/commands/migrate.ts`.
   - Pass it through content migration only.
   - Reject or ignore it for preset migration with a clear error.

2. Add typed publish options.
   - Extend `ModifyStoryOptions` / `UpdateStories` options in `src/api/stories/stories.types.ts`.
   - Add a small type such as:

```ts
export type PublishLanguagesOption = "default" | "all" | string[];
```

3. Add language resolution helper.
   - Parse CLI values:
     - `undefined` -> default publish target
     - `default` -> `["[default]"]`
     - `all` -> marker that needs target-space language fetch
     - comma-separated list -> normalized list
   - Deduplicate values.
   - Normalize `default` to `[default]`.
   - Validate empty values and reject invalid combinations.

4. Add space language helper.
   - Use `managementApi.spaces.getSpace({ spaceId }, config)`.
   - Read configured Storyblok languages defensively, likely from `data.space.languages`.
   - Accept language objects with `code`.
   - Ignore blank/missing codes.
   - Return only non-default codes; prepend `[default]` at publish call time.

5. Add publish endpoint helper.
   - Implement in `src/api/stories/stories.ts`:

```ts
publishStoryLanguages({
    storyId,
    languages,
}, config)
```

   - Build endpoint:

```txt
spaces/:spaceId/stories/:storyId/publish?lang=${encodeURIComponent(lang)}
```

   - Use `sbApi.get(...)`.
   - Return the same `MutationWriteResult` style as `updateStory`, including `ok`, `id`, `name`, `slug`, `spaceId`, `status`, and `response`.

6. Change write flow.
   - When `--publish` is false, keep current draft update behavior.
   - When `--publish` is true and `--publishLanguages` is not provided, preserve the legacy single `PUT` with `publish: 1`.
   - When `--publish` is true and `--publishLanguages` is provided:
     - Update story with `publish: false`.
     - If update succeeds, publish requested languages.
     - If update fails, do not publish that story.
   - This can live inside `updateStories` so call sites keep one write operation per changed story.

7. Update logging/artifacts.
   - Pipeline summary should include publish language mode/resolved languages.
   - Migration run log should identify whether a failure happened during update or publish.
   - At minimum, publish failures must count as failed writes so the command reports partial failure.

8. Add tests.
   - Unit test default publish behavior still sends draft update first.
   - Unit test `--publish --publishLanguages all`:
     - fetches target space languages once
     - updates a story first
     - then calls publish endpoint with `[default],fr,de`
   - Unit test failed update:
     - does not call publish endpoint
   - Unit test explicit languages:
     - `default,fr` becomes `[default],fr`
   - CLI flag parsing test for `publishLanguages`.

9. Update help text.
   - Document `--publishLanguages`.
   - Add examples:

```txt
sb-mig migrate content --all --from 123 --to 123 --migration v3toV4 --publish --publishLanguages all --yes
sb-mig migrate content --all --from 123 --to 123 --migration v3toV4 --publish --publishLanguages default,fr,de --yes
```

## Open Decisions

- Default for `--publish` without `--publishLanguages`:
  - Decision: preserve legacy `PUT` publish behavior for backwards compatibility.
  - Use `--publish --publishLanguages default` when the explicit update-then-publish endpoint flow is desired for the default language.

- Failure model:
  - Recommended: if update succeeds but publish fails, count the story as failed overall and include stage `publish` in logs.
  - Alternative: count update success and publish failure separately. More precise, but requires broader run-log schema changes.

- Rate limiting:
  - Recommended first pass: sequential publish inside each story task, with existing Storyblok client rate limit. Add explicit concurrency/delay only if live testing shows throttling.
  - Conservative option: process publish calls with a small concurrency limit or a 300ms delay.

## Acceptance Criteria

- Draft-only migrations continue to work unchanged.
- Existing `--publish` behavior remains compatible unless `--publishLanguages` is provided.
- `--publish --publishLanguages all` updates each changed story first, then publishes `[default]` plus configured target-space languages.
- A failed update never triggers publish for that story.
- A failed publish is visible in CLI output and migration run logs.
- Tests cover ordering, language normalization, automatic language fetch, and failure handling.
