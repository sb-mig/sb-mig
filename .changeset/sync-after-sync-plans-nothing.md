---
"sb-mig": patch
---

A `sync components --presets --dry-run` right after a sync now plans nothing. Presets that exist in the space are compared by content and planned as `unchanged` unless something really differs; an `update` lists where in `changedKeys`. `preview_tmpl` is compared by its logic and text, since Storyblok hands the markup back in its own form.
