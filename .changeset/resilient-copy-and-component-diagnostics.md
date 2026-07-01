---
"sb-mig": patch
---

Keep `copy stories` going when a single story update fails (e.g. a component the target space schema rejects) instead of aborting the whole run: every story is still attempted, the failed stories are reported, and apply mode then exits non-zero. The 422 error is enriched with the offending component's field, parent, `_uid` and content path, and the dry-run report now predicts these schema rejections by validating source components against the target space.
