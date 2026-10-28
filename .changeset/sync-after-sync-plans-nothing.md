---
"sb-mig": patch
---

A `sync components --presets --dry-run` right after a sync now plans nothing. Presets that exist in the space are compared by content and planned as `unchanged` unless something really differs; an `update` lists where in `changedKeys`. `preview_tmpl` is compared the way Storyblok stores it: sanitised to the tags and `class` attribute its docs allow, and with entities decoded, since a bare `>` is stored as `&gt;`. A changed class, or an allowed tag added or removed, still shows.
