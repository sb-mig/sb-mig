---
"sb-mig": patch
---

Fix heap out-of-memory in `migrate continue` on large spaces: changed stories are now streamed from the dry-run artifact and written in bounded batches instead of being materialized as one in-memory array, and the full-space after-full snapshots are stream-filtered down to the dirty-published subset the dual-layer writer actually needs. Truncated artifacts (dry-run killed mid-write) now fail loudly before any write instead of silently continuing with a partial set, and preserve-layers run logs now label every write with the correct story.
