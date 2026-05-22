# Migrate content publication languages

## Goal

`sb-mig migrate content` must preserve Storyblok publication state while allowing explicit language publication for field-level translations stored as `__i18n__<language>` variants.

Publication is now controlled by publication-state modes, not by a generic `--publish` flag.

## Flags

```txt
--publicationMode preserve-layers
--publicationMode collapse-draft
--publicationMode save-only
--publicationLanguages default
--publicationLanguages all
--publicationLanguages default,fr,de,es
```

`--publicationMode preserve-layers` is the correct default for spaces with Story Versions API history. It migrates dirty-published stories as two layers: latest published content and latest draft/current content.

`--publicationMode collapse-draft` is the duplicated-space fallback. It publishes migrated draft/current content for stories that are already published, including dirty-published stories. Draft-only or unpublished stories stay saved-only.

`--publicationMode save-only` saves every changed story as draft/current content and does not publish.

`--publicationLanguages` controls which language scope is inspected and preserved. It defaults to `all`, which resolves to `[default]` plus the configured language codes from the target Storyblok space.

For every selected story and every resolved language, migrate builds a language publish-state map automatically before writing. The old `--languagePublishStatePath` flow is still available as an override/debug input, but it is no longer a required separate pre-step.

## Storyblok API facts

- Story update: `PUT /v1/spaces/:space_id/stories/:story_id`
- Story publish: `GET /v1/spaces/:space_id/stories/:story_id/publish`
- Publish endpoint accepts comma-separated `lang`, for example `[default],fr,de`.
- Space read is used to resolve configured language codes for `--publicationLanguages all`.

## Write ordering

When explicit publication languages are requested, each story must be updated before it is published:

```txt
PUT migrated story with publish:false
GET story publish endpoint with lang=[default],fr,de
```

Story tasks may run concurrently, but update-then-publish ordering must be preserved inside each story task.

## Collapse-draft behavior

`--publicationMode collapse-draft` uses the Management API draft/current story as the only migration input.

| Source story state | Migration behavior |
| --- | --- |
| `published: false` | Save migrated story as draft. Skip publish. |
| `published: true`, `unpublished_changes: false` | Save migrated story, then publish requested languages. |
| `published: true`, `unpublished_changes: true` | Save migrated draft/current story, then publish requested languages. |
| `published: true`, missing `unpublished_changes` | Save migrated story as draft. Skip publish. |

This mode intentionally collapses the old published layer into the latest draft/current layer. Use it only when the published Story Version is unavailable, such as duplicated Storyblok spaces with missing version history.

## Preserve-layers behavior

`--publicationMode preserve-layers` is documented in `docs/migrate-content-published-layer.md`.

For dirty-published stories it:

1. reads latest draft/current content from Management Stories API
2. reads latest published content from Management Story Versions API
3. migrates both layers separately
4. writes and publishes the migrated published layer
5. restores the migrated draft/current layer with `publish:false`

## Examples

Duplicated-space fallback. This preserves publication decisions per language and collapses any published language's latest draft/current content into published content:

```bash
sb-mig migrate content --all --from 123 --to 123 --migration v3toV4 --publicationMode collapse-draft --yes
```

Production/state-preserving mode:

```bash
sb-mig migrate content --all --from 123 --to 123 --migration v3toV4 --publicationMode preserve-layers --yes
```

Save-only preview:

```bash
sb-mig migrate content --all --from 123 --to 123 --migration v3toV4 --publicationMode save-only --dry-run
```
