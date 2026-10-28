# A space right after `sync components --all --presets`

The regression fixture for MAR-4738: a sync straight after a sync must plan nothing.

- `local-components.json`: seven Backpack 4.11.0 schemas as sb-mig loads them (`sb-accordion`, `sb-accordion-item`, `sb-alert`, `sb-card-primitive-body`, `sb-cta-card`, `sb-divider`, `sb-headline`), with their eight presets in `all_presets`. Each custom `design` field keeps two of its options: the rest have the same shape, only longer.
- `space.json`: the space after those schemas were created, in the Management API's shapes: the components listing (ids, dates, `pos` and `id` on every field, the group by uuid, `all_presets` as references), the component groups, and the presets listing with each preset's content.

`preview_tmpl` follows what the sandbox space (295911465792355) stored, read back through the Storyblok MCP in the live checks of sb-mig#429. Storyblok keeps only `span`, `div` and `strong` with their `class`, drops other tags but keeps their text, drops other attributes, and escapes a bare `<` or `>` as `&lt;` / `&gt;`. A bare `&`, quotes and non-ASCII characters are stored as written.

- `sb-accordion` and `sb-card-primitive-body` are the exact recorded values. The rule, applied to the local template, gives `sb-card-primitive-body` byte for byte, whitespace included.
- `sb-headline` (`{{it.content}}`) and `sb-cta-card` (its `<em>` dropped) follow from the recorded excerpts.
- The others (`sb-accordion-item`, `sb-alert`, `sb-divider`) are rebuilt from the local template by that rule.

Two preset details are stand-ins, not recorded, and the comparison must tolerate them: one preset has a new top-level `_uid` (`sb-accordion`, "Default (Section)"), and one image has lost its protocol (`sb-divider`, "Default (Flex Group)").
