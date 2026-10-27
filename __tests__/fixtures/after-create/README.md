# A space right after `sync components --all --presets`

The regression fixture for MAR-4738: a sync straight after a sync must plan nothing.

- `local-components.json`: four Backpack 4.11.0 schemas as sb-mig loads them (`sb-accordion`, `sb-accordion-item`, `sb-alert`, `sb-divider`), with their five presets in `all_presets`. Each custom `design` field keeps two of its options: the rest have the same shape, only longer.
- `space.json`: the space after those schemas were created, in the Management API's shapes: the components listing (ids, dates, `pos` and `id` on every field, the group by uuid, `all_presets` as references), the component groups, and the presets listing with each preset's content.

Two things the space does are not recorded as such, because the first live run kept only counts. The fixture stands in for them, and the comparison must tolerate either form:

- `preview_tmpl` with a `<span>`: on `sb-alert` the span tags are unwrapped, on `sb-accordion` the markup comes back entity-escaped. The live run flagged 68 components, and Backpack has exactly 68 templates with a `<span>`.
- Presets: one preset has a new top-level `_uid` (`sb-accordion`, "Default (Section)") and one image has lost its protocol (`sb-divider`, "Default (Flex Group)").
