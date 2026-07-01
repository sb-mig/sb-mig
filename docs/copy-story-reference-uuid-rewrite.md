# Copy: rewrite UUID-based story references (Multi-Options / bare-uuid fields)

## Status

Implemented (see `src/api/copy/reference-rewriter.ts` /
`src/api/copy/reference-scanner.ts`). Originally: high priority — caused silent,
production-visible data corruption after cross-space `copy stories`.

## Summary

`sb-mig copy stories` recreates stories in the target space, which assigns them
**new UUIDs** (UUIDs are not preserved). The copy already rewrites some story
references so they point at the new target UUIDs — but it **misses story
references stored as bare UUID strings**, most importantly Storyblok
**Multi-Options fields whose source is "Stories"** (e.g. a `categories` field).

Those fields keep the **source space's** story UUIDs after the copy. In the
target space those UUIDs do not exist, so the editor renders them as
**"Restricted story" / "Unpublished linked story"**, and any frontend logic that
resolves them (e.g. blog category filtering) breaks.

This is not a Storyblok bug. Storyblok is correctly reporting that the referenced
UUIDs are not stories in the target space.

## Reproduction

1. In a source space, create a `page` with a `blog-articles-section` blok that has
   a Multi-Options → Stories field (`categories`) referencing several category
   stories.
2. `sb-mig copy stories` that subtree to a target space (which also copies the
   category stories).
3. Open the copied page in the target space.

Observed: the `categories` values are byte-for-byte identical to the source, i.e.
still the **source** UUIDs. The category stories in the target have **different**
UUIDs (confirmed: the page's own `uuid` also changes on copy). The editor shows
the categories as "Restricted story".

Real example (space `293297219276299` → `282295`):

- Page source uuid `c0848727-…` → target uuid `db472ee1-…` (changed, as expected)
- `blog-articles-section.categories[0]` source `2166697c-…` → target `2166697c-…`
  (**unchanged — the bug**). The manifest proves the correct target uuid should be
  `010fe283-…`.

## Root cause

`src/api/copy/reference-rewriter.ts`. The walker (`rewriteNode`) applies four
rewriters to every node. The story-reference ones are incomplete:

1. `rewriteStoryLinkObject` — handles multilink objects, but only:
   - `node.id` when it is a **number**, and
   - `node.uuid` when it is a string.

   Real Storyblok story multilinks store the target uuid as a **string in `id`**
   (`{ "linktype": "story", "id": "<uuid>", "cached_url": "…" }`) and have no
   `uuid` key — so those `id` UUIDs are **not** rewritten. (These often still
   *appear* to work because the frontend resolves via `cached_url`, which masks
   the stale `id`.)

2. `rewriteSchemaAwareOptions` — handles `type: "options"` +
   `source: "internal_stories"` fields, but only remaps items where
   `typeof item === "number"`:

   ```ts
   fieldValue.forEach((item, index) => {
       if (typeof item !== "number") {
           return; // <-- string UUIDs (the actual Multi-Options → Stories value) are skipped
       }
       const targetId = state.maps.storyIds.get(item);
       ...
   });
   ```

   A Storyblok **Multi-Options → Stories** field stores an array of **string
   UUIDs**, not numeric ids. So every one of them is skipped.

3. Bare UUID strings in any other field shape (custom plugins, `shared_component`
   on `shared-selector`, etc.) are never considered.

Because detection is shared with the dry-run scanner
(`src/api/copy/reference-scanner.ts`), the dry-run report also **fails to flag**
these references (they are counted as neither mapped nor unresolved). The
breakage is invisible until you open the target story.

## Fix

Extend `reference-rewriter.ts` (and mirror in `reference-scanner.ts`) to rewrite
UUID-based story references using the existing `state.maps.storyUuids`
(source-uuid → target-uuid) map.

1. **Multi-Options / options → stories with string items.** In
   `rewriteSchemaAwareOptions`, when an item is a string that is a key in
   `storyUuids`, rewrite it to the target uuid. Keep the existing numeric-id path
   (via `storyIds`) for numeric fields. Also confirm the field-type check covers
   the schema type Storyblok emits for Multi-Options (`options`; verify whether a
   single-select `option` + `source: internal_stories` needs the same).

2. **Multilink `id` as string uuid.** In `rewriteStoryLinkObject`, when
   `node.linktype === "story"` and `node.id` is a **string** present in
   `storyUuids`, rewrite it (and refresh `cached_url` if we track slug mappings).

3. **General safety net (recommended).** Add a final pass: any **string value
   that is a key in `storyUuids`** gets rewritten to its target uuid. This is
   safe because it only ever touches values that are known copied-story source
   UUIDs — block `_uid`s, space ids, story ids, etc. live in different namespaces
   and will not be keys. This single rule also covers custom field plugins and
   `shared-selector.shared_component` without per-field schema knowledge.

   Guard rails for the safety net:
   - Only replace exact matches against `storyUuids` keys.
   - Do not descend into `_editable` (Storyblok regenerates it) — or simply rely
     on the fact that its contents are not story UUIDs.
   - Record every rewrite in `state.records` (type `story`) so it appears in the
     report/telemetry.

4. **Scanner parity.** Update `reference-scanner.ts` so the dry-run report counts
   these as mapped/unresolved story references, and so `--dry-run` surfaces
   unresolved UUIDs *before* an apply.

### Note on `shared_component` (shared blocks)

`shared-selector.shared_component` is a UUID reference. In this data it happened
to resolve to a copied story UUID present in the manifest, so the safety-net rule
fixes it. True Storyblok "shared blocks" are a separate entity, though — if/when
we copy shared blocks, they need their own source→target UUID map. Track
separately; out of scope for the first fix.

## Tests

- Unit (rewriter): Multi-Options string-uuid array → remapped via `storyUuids`;
  numeric options still remapped via `storyIds`; multilink string `id` remapped;
  bare-uuid string field remapped by the safety net; a string that is *not* a
  known source uuid is left untouched; nested arrays/bloks covered.
- Scanner: the same fields are counted and reported; unresolved uuids (no map
  entry) are reported as unresolved in `--dry-run`.
- Regression fixture mirroring the `blog-articles-section` shape
  (`categories` + `filter_groups[].categories`).

## Related

- Production remediation for already-copied content is handled out-of-band by a
  standalone, manifest-driven script (dry-run first). This ticket is the
  fix-forward so future copies are correct and the dry-run warns ahead of time.
