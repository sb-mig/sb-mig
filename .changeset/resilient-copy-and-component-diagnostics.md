---
"sb-mig": patch
---

Keep `copy stories` going when a single story update fails (e.g. a component the target space schema rejects) instead of aborting the whole run, report the failed stories at the end, enrich the 422 error with the offending component's field, parent, `_uid` and content path, and predict these schema rejections in the dry-run report by validating source components against the target space.
