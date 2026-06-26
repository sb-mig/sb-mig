---
name: sb-mig-docs-sync
description: Use this whenever working in the sb-mig repository and changes affect CLI behavior, flags, command output, dry-run behavior, Storyblok copy/sync/migrate flows, public API behavior, README/docs, or user-facing workflows. This skill makes the agent check whether the separate sb-mig landing/docs repository needs updates, find it without hardcoded personal paths, and either update docs or leave a clear docs-update plan.
---

# sb-mig Docs Sync

Use this skill after user-facing sb-mig changes, especially CLI flags, command behavior, command help, dry-run output, copy/sync/migrate workflows, public API behavior, README/docs changes, and release notes.

The docs/landing repository is separate from this sb-mig repository:

```txt
https://github.com/marckraw/sb-mig-landing
```

Do not hardcode a maintainer's local filesystem path in this skill or in committed files.

## Goals

When sb-mig behavior changes:

1. Decide whether the landing/docs repo should be updated.
2. Find the local `sb-mig-landing` checkout safely.
3. Inspect the docs structure before editing.
4. Update docs when the repo is available and the change is clearly user-facing.
5. If docs cannot be updated, produce a concrete docs-update plan.
6. Keep summaries for sb-mig code changes and landing/docs changes clearly separated.

## Resolve the Landing Repo

Resolve the landing repo in this order.

### 1. Environment Variable

Prefer:

```bash
SB_MIG_LANDING_REPO=/absolute/path/to/sb-mig-landing
```

Use this when set and the directory exists.

### 2. Local Ignored Config

Then check this repo-local file:

```txt
.sb-mig-docs.local.json
```

Expected shape:

```json
{
  "landingRepoPath": "/absolute/path/to/sb-mig-landing"
}
```

This file is intentionally ignored by git. It may contain local machine paths.

### 3. Nearby Directory Guesses

If neither config source exists, try common sibling locations relative to the current sb-mig repo:

```txt
../sb-mig-landing
../../sb-mig-landing
../../../sb-mig-landing
```

These guesses are only convenience checks.

### 4. Ask the User

If no path is found, ask the user for the landing repo path or tell them to set `SB_MIG_LANDING_REPO`.

Do not fail the main sb-mig task only because docs repo discovery failed. Instead, include a docs-update plan in the final response.

## Validate Before Editing

Before writing to a resolved path:

1. Confirm it is a directory.
2. Confirm it is a git repo, or at least contains a `package.json`.
3. Prefer checking `git remote -v`.
4. Treat the path as trusted for editing only when a remote contains one of:
   - `marckraw/sb-mig-landing`
   - `sb-mig-landing`
5. If the repo identity is unclear, ask for confirmation before editing.

Never create or edit docs in an unrelated directory just because the path exists.

## When Docs Updates Are Needed

Usually update or plan docs when changes affect:

- CLI command names, flags, aliases, examples, or help text
- default behavior
- dry-run behavior or output artifacts
- copy/sync/migrate workflows
- Storyblok Management API expectations visible to users
- public `api-v2` exports
- setup/config/environment instructions
- release train or package manager behavior
- breaking changes, deprecations, or migration paths

Usually no docs update is needed for:

- internal tests only
- internal refactors with no behavioral change
- lint/format/build-only changes
- private implementation cleanup that does not affect public usage

When unsure, err toward leaving a small docs-update note rather than silently ignoring it.

## Workflow

1. Inspect the sb-mig changes.
   - Use `git status --short`.
   - Use `git diff -- <relevant files>`.
   - Identify user-facing behavior.

2. Resolve and validate `sb-mig-landing`.

3. Inspect the docs repo before editing.
   - Use `rg --files` to map docs/pages.
   - Read package scripts and likely docs files.
   - Prefer existing docs structure and wording style.

4. Update docs only where the change naturally belongs.
   - Keep examples executable.
   - Keep command flags aligned with sb-mig help output.
   - Mention limitations explicitly when behavior is incomplete.
   - Avoid broad marketing rewrites unless asked.

5. Verify docs changes when feasible.
   - Run formatting/typecheck/build only if the repo scripts are obvious and cheap.
   - If not run, say so in the final response.

6. Final response should separate:
   - sb-mig repo changes
   - sb-mig-landing repo changes
   - docs follow-up plan if docs were not updated

## Local Config Setup for Maintainers

Maintainers can configure their local docs repo without leaking paths:

```bash
export SB_MIG_LANDING_REPO="/absolute/path/to/sb-mig-landing"
```

or create:

```txt
.sb-mig-docs.local.json
```

with:

```json
{
  "landingRepoPath": "/absolute/path/to/sb-mig-landing"
}
```

The local config file should remain ignored by git.

## Safety Notes

- Do not commit local absolute paths.
- Do not mention a maintainer's personal path in docs, tests, examples, or committed skill files.
- Do not write to an unvalidated external repo.
- Do not mix sb-mig and landing repo git operations unless the user explicitly asks for commits.
- If both repos are dirty, preserve unrelated changes and summarize only the files touched for the docs task.

