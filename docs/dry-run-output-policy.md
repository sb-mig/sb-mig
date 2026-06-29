# Dry-Run and Output Artifact Policy

Status: Draft
Last updated: 2026-06-23

## Purpose

sb-mig commands should have a predictable dry-run and local-output model. This matters for humans, CI, and AI agents: console output is useful for quick feedback, but structured files are easier to inspect, diff, re-read, and pass into later implementation or review steps.

## Recommended Policy

Use these rules for new commands and for existing commands when they are actively touched.

### `--dry-run`

`--dry-run` means:

- Do not write to Storyblok.
- Storyblok reads are allowed when needed to build a realistic plan.
- Do not create local files by default, unless the command already has established dry-run artifact behavior.
- Log a clear preview with `[dry-run]` messages.
- Report current limitations explicitly when the preview cannot model future behavior.

### `--outputPath <path>`

`--outputPath` means:

- Write the command's primary machine-readable artifact to the requested path.
- Create parent directories when needed.
- Use a stable JSON shape unless the command's domain requires another format.
- If used with `--dry-run`, write a dry-run plan/report artifact and still avoid Storyblok writes.

If a command later supports both generated and explicit output paths, prefer:

```bash
--write-plan
--outputPath path/to/file.json
```

Where `--outputPath` implies local artifact writing.

## Default Behavior

Default dry-run should be low-noise:

```txt
--dry-run = remote read-only preview, no local files by default
--dry-run --outputPath = remote read-only preview plus local structured artifact
```

This avoids cluttering repositories during exploratory dry-runs, while still giving agents and CI a reliable artifact when requested.

## Artifact Shape

Prefer JSON for coherent dry-run plans and reports:

```json
{
  "schemaVersion": 1,
  "command": "copy stories",
  "dryRun": true,
  "generatedAt": "2026-06-23T12:00:00.000Z",
  "input": {
    "from": "123456",
    "to": "789012",
    "source": "blog",
    "destination": "imported"
  },
  "normalized": {
    "sourceSpaceId": "123456",
    "targetSpaceId": "789012",
    "source": "blog",
    "destination": "imported",
    "mode": "subtree"
  },
  "summary": {
    "plannedCreates": 3,
    "plannedUpdates": 0,
    "warnings": 1,
    "errors": 0
  },
  "items": [],
  "warnings": [],
  "errors": [],
  "limitations": []
}
```

Use JSONL for append-only event streams or durable manifests where entries are accumulated over time, for example copy manifests:

```jsonl
{"type":"story","source_id":123,"target_id":8123}
{"type":"asset","source_id":999,"target_id":42001}
```

## Required Artifact Fields

Structured artifacts should include:

- `schemaVersion`
- `command`
- `dryRun`
- `generatedAt`
- original `input`
- normalized options
- summary counts
- planned items/actions where applicable
- warnings
- errors
- known limitations

Useful optional fields:

- `commands.dryRun`
- `commands.apply`
- `sourceSpaceId`
- `targetSpaceId`
- `reportKind`

## Existing Command Exception: `migrate content`

`migrate content --dry-run` already writes local migration artifacts and is mission critical. Keep its existing behavior and conventions unless there is a dedicated migration-artifact refactor.

Do not retrofit this policy into `migrate content` opportunistically. Its current artifact flow is part of the operational safety model for migrations.

If migration artifacts are revisited later, treat that as a focused migration task with explicit compatibility requirements.

## Rollout Guidance

Apply this policy first to commands under active development.

Current priority:

1. `copy stories`
2. future `copy assets`
3. future `copy space`
4. sync commands when they are next touched

Do not block small command improvements on converting every command at once.

## Copy Command Recommendation

For `copy stories`, the next artifact step should be:

```bash
sb-mig copy stories \
  --from 123456 \
  --to 789012 \
  --source blog \
  --destination imported \
  --dry-run \
  --outputPath sbmig/copy-plans/blog-copy.json
```

Expected behavior:

- No Storyblok writes.
- One local JSON plan written to `--outputPath`.
- Console output includes the output path.
- The JSON contains planned target paths, conflicts, warnings, limitations, and a real-copy command suggestion.

