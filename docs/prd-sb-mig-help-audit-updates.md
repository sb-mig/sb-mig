# PRD: sb-mig Help Coverage and Agent Usability

## Problem Statement

The `sb-mig` CLI has grown a broad command surface, but its help output no longer describes all implemented behavior accurately. Users and AI agents researching how to use `sb-mig` can miss important commands, flags, destructive behavior, default behavior, and command-specific gotchas.

The current help also has operational issues: some help paths exit with status code `2`, help output includes config and dotenv noise before the actual help text, and several implemented commands are either missing from top-level help or represented by placeholders.

This creates a documentation and usability gap for both humans and automation. A user should be able to run `sb-mig --help` and `sb-mig <command> --help` and understand what is supported, what is dangerous, what is read-only, what writes to Storyblok, and which flags are valid together.

## Solution

Improve `sb-mig` help so it becomes the canonical CLI usage reference.

The updated help should:

- List every supported public command at the top level.
- Explain each command's subcommands, flags, examples, side effects, and gotchas.
- Remove placeholder help such as `?` and `???`.
- Clearly distinguish read-only commands, local-file writes, Storyblok writes, and destructive operations.
- Document compatibility constraints and invalid flag combinations.
- Make help output clean and machine-readable by avoiding config-loading noise where possible.
- Ensure all help commands exit successfully with status code `0`.
- Add tests that prevent future drift between routed commands and documented commands.

## User Stories

1. As a CLI user, I want `sb-mig --help` to list every public command, so that I can discover what the tool supports.
2. As a CLI user, I want `sb-mig <command> --help` to exit with code `0`, so that scripts and agents can trust help commands.
3. As an AI agent, I want help output without config-loading noise, so that I can parse usage information reliably.
4. As a developer, I want help output to document real implemented behavior, so that users do not need to inspect source code.
5. As a content migrator, I want `migrate content` help to explain publication modes, so that I do not accidentally publish, collapse, or skip published layers incorrectly.
6. As a content migrator, I want `migrate content` help to explain that `preserve-layers` requires same-space migration, so that I avoid unsupported cross-space usage.
7. As a content migrator, I want legacy publication flags to be documented as replaced, so that I know which modern flags to use.
8. As a migration author, I want ordered repeated `--migration` usage documented, so that I can build migration pipelines intentionally.
9. As a migration author, I want component alias and component override formats documented, so that migration scope is predictable.
10. As a preset migrator, I want `migrate presets` documented, so that I know it exists and only supports one migration at a time.
11. As a preset migrator, I want preset-specific unsupported publication flags documented, so that I do not try to publish presets.
12. As a sync user, I want `sync components --ssot` documented as destructive, so that I understand it replaces GUI-created components.
13. As a sync user, I want `sync content` directions documented accurately, so that I know which directions support stories and assets.
14. As a sync user, I want the exact `fromAWSToSpace` spelling documented, so that AWS content sync works when available.
15. As a sync user, I want `sync content` examples to include `--syncDirection`, so that examples are executable.
16. As a plugin user, I want plugin sync help to explain the compiled `dist/export.js` expectation, so that I prepare plugin artifacts correctly.
17. As a story copier, I want `copy stories` documented, so that I can copy a story or folder between spaces.
18. As a story copier, I want the `folder/*` recursive strategy documented, so that I know how to copy folder children without the root folder.
19. As a story copier, I want `--sourceSpace`, `--targetSpace`, `--what`, and `--where` documented, so that I can provide the required copy inputs.
20. As a backup user, I want every backup target documented, so that I can back up components, groups, roles, datasources, presets, component presets, plugins, and stories.
21. As a backup user, I want `component-presets --metadata` documented, so that I can include package metadata when needed.
22. As a remover, I want no-op remove commands identified, so that I do not assume roles or datasources are actually removed.
23. As a remover, I want `remove story --all --from` documented as destructive, so that I understand it deletes stories from a space.
24. As a revert user, I want `revert content` help to document `--from`, `--to`, and `--yes`, so that I understand how local story files are restored.
25. As a revert user, I want the unused `--migration` reference removed, so that I do not pass irrelevant flags.
26. As a migration planner, I want `migrations recognize --from [--to]` documented, so that I can generate recommended migration commands.
27. As a project initializer, I want `init project` documented, so that I know it creates `.env` and updates the Storyblok preview domain.
28. As a maintainer, I want e2e tests for help coverage, so that future command additions do not silently miss documentation.
29. As a maintainer, I want command help text to share structured conventions, so that new commands are documented consistently.

## Implementation Decisions

- Treat help output as the primary public documentation for the CLI.
- Keep current CLI architecture initially, but reduce help drift by centralizing command metadata where practical.
- Update the top-level command list to include all intended public commands.
- Decide whether `test` is public or internal. If internal, keep it hidden and out of top-level help. If public, document it.
- Update command descriptions for:
  - `sync`
  - `copy`
  - `migrate`
  - `backup`
  - `discover`
  - `remove`
  - `revert`
  - `migrations`
  - `init`
  - `language-publish-state`
  - `story-versions`
  - `published-layer-export`
  - `debug`
- Use consistent sections in command help:
  - Usage
  - Description
  - Commands
  - Flags
  - Side Effects
  - Gotchas
  - Examples
- Document destructive behavior explicitly for:
  - `sync content` when replacing target stories
  - `sync components --ssot`
  - `remove story --all --from`
  - `migrate content` and `migrate presets`
  - `revert content`
- Document read-only behavior explicitly for:
  - `language-publish-state`
  - `story-versions`
  - `published-layer-export`
  - `discover`
- Fix help exit paths so `--help` and `help` return success.
- Avoid loading Storyblok config and dotenv output before help where feasible. The preferred approach is lazy command imports or an early help path before config-dependent imports.
- Correct `fromAWSToSpace` spelling in sync help and keep examples aligned with actual sync direction values.
- Remove misleading no-op documentation, or explicitly mark no-op commands as not implemented.
- Do not change command behavior as part of this PRD unless required to make help truthful. Behavior changes should be separate work unless they are bug fixes directly tied to help correctness.

## Testing Decisions

- Add e2e tests for top-level help:
  - `sb-mig --help` exits `0`.
  - Top-level help includes every public command.
  - Top-level help does not include internal-only commands.
- Add e2e tests for command help:
  - `sb-mig <command> --help` exits `0` for every public command.
  - Each command help contains expected usage, flags, and examples.
- Add regression coverage for clean help output:
  - Help should not require a Storyblok config file.
  - Help should not print config discovery warnings before usage text.
  - Help should not print dotenv tips in normal test output.
- Add targeted assertions for high-risk documented gotchas:
  - `migrate` help mentions `preserve-layers` same-space requirement.
  - `migrate` help mentions `migrate presets`.
  - `copy` help mentions `copy stories`, `--what`, `--where`, and `folder/*`.
  - `sync` help mentions `--syncDirection`, `--ssot`, and `fromAWSToSpace`.
  - `remove` help marks story removal as destructive and roles/datasources as unavailable or unsupported if they remain no-op.
- Prefer tests that validate user-visible help behavior, not implementation details of string constants.
- Existing prior art: basic CLI e2e help tests already exist and can be expanded.

## Acceptance Criteria

- `sb-mig --help` exits `0`.
- `sb-mig help` exits `0`.
- Every public `sb-mig <command> --help` exits `0`.
- Help output can be read without Storyblok config lookup warnings or dotenv tip noise.
- Top-level help lists all public commands.
- `copy` help no longer contains `?`.
- `revert` help no longer contains `???` or unused `--migration`.
- `migrate` help documents both `content` and `presets`.
- `sync` help uses the implemented `fromAWSToSpace` spelling.
- Destructive commands clearly state their side effects.
- Read-only inspection commands clearly state that they do not write to Storyblok.
- Tests fail if a public routed command is missing from top-level help.

## Out of Scope

- Reworking the entire CLI framework.
- Changing Storyblok migration semantics.
- Implementing no-op `remove roles` or `remove datasources`.
- Making `copy stories` production-hardened beyond documenting current behavior.
- Rewriting README or long-form docs, except where needed to point users to CLI help.
- Publishing issue tracker tickets from this PRD.

## Further Notes

- The audit found that generated help currently includes config-loading messages before help text because config is imported eagerly.
- The audit also found that command help currently exits with code `2` for subcommands, despite printing the expected help body.
- The implementation should preserve the convention that `sb-mig --help` is the best documentation source, but make that claim true for the full current command surface.
