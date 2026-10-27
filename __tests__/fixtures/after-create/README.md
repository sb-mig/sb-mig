# A space right after `sync components --all --presets`

The regression fixture for MAR-4738: a sync straight after a sync must plan nothing.

- `local-components.json`: four Backpack 4.11.0 schemas as sb-mig loads them (`sb-accordion`, `sb-accordion-item`, `sb-alert`, `sb-divider`), with their five presets in `all_presets`. Each custom `design` field keeps two of its options: the rest have the same shape, only longer.
- `space.json`: the space after those schemas were created, in the Management API's shapes: the components listing (ids, dates, `pos` and `id` on every field, the group by uuid, `all_presets` as references), the component groups, and the presets listing with each preset's content.

`preview_tmpl` is as the sandbox space (295911465792355) stored it, read back through the Storyblok MCP after the first live check of sb-mig#429. The tags stay as written; a bare `>` outside them comes back as `&gt;`. `sb-accordion` is that exact recorded value, and the others have no `>` outside a tag, so they are stored as written.

Two preset details are stand-ins, not recorded, and the comparison must tolerate them: one preset has a new top-level `_uid` (`sb-accordion`, "Default (Section)"), and one image has lost its protocol (`sb-divider`, "Default (Flex Group)").
