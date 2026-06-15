# GCTT-3770 Component usage inspection

## Ticket summary

Jira: `GCTT-3770`

Title: `Sb-Mig: Add functionality to find usage of component combinations`

Goal: add a read-only sb-mig capability that can inspect Storyblok stories and report where specific component combinations are used.

The first real investigation is:

> Find and count stories where a vertical or reverse-direction flex group has at least one child with a width setting.

The implementation should not be hard-coded only for flex groups. It should create a reusable traversal engine so future investigations can be expressed as small queries.

## Product shape

Add a read-only inspect command:

```bash
sb-mig inspect component-usage --from 12345 --query flex-group-width-child
```

The query file is the only matcher interface for the first implementation. Do not add a second flag-based query language.

## Core design

Split the feature into two layers.

### 1. Traversal engine

The traversal engine is internal reusable code. It:

- fetches selected stories from a Storyblok space
- skips folders by default
- walks every nested Storyblok blok/component in `story.content`
- tracks where each component is found
- passes each component node to a matcher/query
- collects matches into a structured report

The scanner should be read-only. It must not call story update, publish, delete, or create endpoints.

### 2. Matchers

A matcher describes what we are looking for.

There is one matcher source:

- query files, for expressive reusable project-specific checks

The engine should receive a normalized matcher function created from a query file.

## Query files

Query files are the advanced and preferred long-term interface.

Proposed naming convention:

```txt
*.sb.query.ts
*.sb.query.js
*.sb.query.cjs
*.sb.query.mjs
```

Example:

```txt
flex-group-width-child.sb.query.ts
```

Usage:

```bash
sb-mig inspect component-usage --from 12345 --query flex-group-width-child
```

The query discovery behavior should follow existing sb-mig conventions where possible:

- resolve by query name first
- look in configured component/search directories where practical
- allow direct file path later if needed
- support TS through the existing on-the-fly build path if practical

### Query file contract

A query file exports a default query object:

```ts
export default {
  name: "flex-group-width-child",
  description:
    "Find flex groups with vertical or reverse direction and children with width.",

  match(node, context) {
    if (node.component !== "flex-group") {
      return null;
    }

    if (!["vertical", "reverse"].includes(node.direction)) {
      return null;
    }

    const children = Array.isArray(node.body) ? node.body : [];
    const childrenWithWidth = children.filter((child) => {
      return child.width !== undefined && child.width !== null && child.width !== "";
    });

    if (childrenWithWidth.length === 0) {
      return null;
    }

    return {
      childMatches: childrenWithWidth.length,
      matchingChildUids: childrenWithWidth.map((child) => child._uid),
    };
  },
};
```

The scanner calls `match(node, context)` for every component node it visits.

Return values:

- `null` or `undefined`: no match
- object: a match; object is stored under `details` in the report
- `true`: a match with no extra details

### Query context

The matcher receives:

```ts
interface ComponentUsageQueryContext {
  story: {
    id: number | string;
    name?: string;
    slug?: string;
    full_slug?: string;
  };
  path: string;
  parent?: Record<string, unknown>;
  ancestors: Array<Record<string, unknown>>;
}
```

The initial implementation only needs `story`, `path`, `parent`, and `ancestors`. Do not over-design the API before real queries need more.

### Query result normalization

Each match should become:

```ts
interface ComponentUsageMatch {
  storyId: number | string;
  storyName?: string;
  storySlug?: string;
  storyFullSlug?: string;
  component: string;
  uid?: string;
  path: string;
  parentComponent?: string;
  parentUid?: string;
  details?: Record<string, unknown>;
}
```

## Query-only parent and child example

Do not implement a CLI flag matcher in the first version.

The earlier flag-based idea:

```bash
sb-mig inspect component-usage \
  --from 12345 \
  --parentComponent flex-group \
  --parentField direction=vertical,reverse \
  --childHasField width
```

should instead be represented as a query file:

```ts
const hasValue = (value: unknown): boolean =>
  value !== undefined && value !== null && value !== "";

const directArrayChildren = (node: Record<string, any>): Record<string, any>[] =>
  Object.values(node)
    .filter(Array.isArray)
    .flat()
    .filter((item) => item && typeof item === "object" && item.component);

export default {
  name: "flex-group-width-child",
  description:
    "Find flex groups with vertical or reverse direction and children with width.",

  match(node) {
    if (node.component !== "flex-group") {
      return null;
    }

    if (!["vertical", "reverse"].includes(node.direction)) {
      return null;
    }

    const childrenWithWidth = directArrayChildren(node).filter((child) =>
      hasValue(child.width),
    );

    if (childrenWithWidth.length === 0) {
      return null;
    }

    return {
      childMatches: childrenWithWidth.length,
      matchingChildUids: childrenWithWidth.map((child) => child._uid),
    };
  },
};
```

This keeps the feature simple: one command path, one matcher contract, one way to express inspection logic.

## Story selection

Initial selection flags:

```txt
--from <spaceId>
--all
--withSlug <full_slug> repeatable
--startsWith <prefix>
```

Behavior:

- `--from` is required unless the configured `spaceId` fallback is intentionally reused.
- `--all`, `--withSlug`, or `--startsWith` selects stories.
- If no selector is passed, default to all non-folder stories only if that matches existing sb-mig command style. Otherwise require `--all`.
- Skip folders in matching, but folders may be fetched as part of Storyblok listing.

## Output

Console output should be concise and useful:

```txt
Component usage inspection
Space: 12345
Query: flex-group-width-child
Stories scanned: 1240
Stories matched: 37
Total matches: 52

Matches by story:
- home: 2
- campaign/summer: 1
- ...
```

JSON output should be available:

```bash
sb-mig inspect component-usage \
  --from 12345 \
  --query flex-group-width-child \
  --outputPath sbmig/usage/flex-group-width-child.json
```

Report shape:

```ts
interface ComponentUsageReport {
  queryName: string;
  spaceId: string;
  generatedAt: string;
  filters: {
    all?: boolean;
    withSlug?: string[];
    startsWith?: string;
  };
  totals: {
    storiesScanned: number;
    storiesMatched: number;
    matches: number;
  };
  matches: ComponentUsageMatch[];
}
```

## Proposed file locations

Implementation:

```txt
src/api/inspect/component-usage.ts
src/api/inspect/component-usage.types.ts
src/api/inspect/component-usage-query.ts
src/api/inspect/index.ts
src/cli/commands/inspect.ts
```

Tests:

```txt
__tests__/api/component-usage-inspect.test.ts
__tests__/cli/inspect-component-usage.test.ts
__tests__/fixtures/queries/flex-group-width-child.sb.query.js
```

Docs:

```txt
docs/gctt-3770-component-usage-inspect.md
```

## Implementation phases

### Phase 0: Spec and decisions

Status: planned

Tasks:

- capture ticket context
- agree command name
- agree query file contract
- agree that query files are the only matcher interface for the first implementation
- keep feature read-only

Exit criteria:

- this spec exists and is accepted as the working plan

### Phase 1: Pure traversal engine

Status: planned

Tasks:

- implement a pure recursive walker for Storyblok content
- pass each component node to a matcher
- track `path`, `parent`, and `ancestors`
- return normalized matches
- add unit tests with fixture story content

No Storyblok API calls in this phase.

Exit criteria:

- tests prove nested components are found
- tests prove parent and ancestor context is correct
- tests prove matcher result normalization

### Phase 2: Story scanning API

Status: planned

Tasks:

- add API function that accepts fetched stories and a matcher
- optionally add API function that fetches selected stories using existing `getAllStories`
- skip folders by default
- compute report totals
- add tests for story-level aggregation

Exit criteria:

- report contains story counts, match counts, and match rows
- no write endpoints are used

### Phase 3: Query file loading

Status: planned

Tasks:

- discover/load `*.sb.query.*` files
- normalize default export into matcher
- validate query shape and error clearly
- support JS first
- support TS using existing build-on-the-fly path if it is low risk

Exit criteria:

- a fixture query file can be loaded by name
- invalid query files fail with actionable errors

### Phase 4: CLI command

Status: planned

Tasks:

- add `inspect` command to `src/cli/index.ts`
- add `inspect component-usage` subcommand
- add flags:
  - `--from`
  - `--all`
  - `--withSlug`
  - `--startsWith`
  - `--query`
  - `--outputPath`
- print summary to console
- write JSON when `--outputPath` is passed

Exit criteria:

- CLI can run query-file mode
- CLI rejects missing `--query` clearly

### Phase 5: Built-in first query/example

Status: planned

Tasks:

- include an example query for the ticket case
- document it in README or command help
- decide whether built-in queries live in source or docs/examples

Candidate query:

```txt
flex-group-width-child
```

Exit criteria:

- the original Jira investigation can be run without writing custom code from scratch

### Phase 6: Hardening and follow-ups

Status: planned

Possible improvements:

- support direct query file path
- support multiple queries in one run
- support CSV output
- support `--includeFolders`
- expose API through `src/api-v2`
- add richer progress reporting for large spaces

These should not block the first ticket implementation.

## Testing strategy

Unit tests should cover:

- recursive content traversal
- arrays and nested objects
- parent context
- ancestor context
- path generation
- matcher return types: `null`, `undefined`, `true`, object
- query file validation
- report totals

CLI tests should cover:

- query-file mode
- missing required selector or missing matcher
- JSON output path

Live API tests are not required for the first implementation.

## Open decisions

- Should no selector default to `--all`, or should the user be forced to pass `--all` for safety?
- Should the query extension be exactly `.sb.query.ts`, or should JS/CJS/MJS be supported from day one?
- Should the first query be bundled as a built-in query or documented as an example file?
- Should the command name be `inspect component-usage`, `usage components`, or `discover usage`?

Current recommendation:

- require explicit `--all`, `--withSlug`, or `--startsWith`
- support JS query files first and TS if it reuses existing infrastructure cleanly
- expose the flex-group query as an example first, then promote to built-in if it proves generally useful
- use `inspect component-usage` because the command is read-only and investigative
