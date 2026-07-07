---
"sb-mig": patch
---

Remap UUID-based story references during `copy stories`: Multi-Options → Stories fields (string uuid arrays), single-select `option` story fields, and multilink links whose `id` is a string uuid are now rewritten to the target space's uuids, plus a safety-net pass that rewrites any bare string value matching a known copied-story source uuid (covers custom plugin fields and `shared_component`). The dry-run reference scanner now detects and reports these uuid references as mapped/unresolved instead of silently skipping them.
