---
"sb-mig": patch
---

A `sync components --presets --dry-run` right after a sync now plans nothing. Presets that exist in the space are compared by content and planned as `unchanged` unless something really differs; an `update` lists where in `changedKeys`. `preview_tmpl` is compared with HTML entities decoded, since Storyblok stores a `>` in the template's logic as `&gt;`; a change to the markup still shows.
