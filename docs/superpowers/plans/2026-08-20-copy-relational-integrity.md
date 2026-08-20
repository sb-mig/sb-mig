# Copy Relational Integrity Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make a copy run produce a correct 1:1 story copy, and let the run prove that every story relation points to the right target story.

**Architecture:** The copy command keeps its manifest ledger in `.sb-mig/copy/<source>/<target>/`. This plan makes the ledger authoritative. The run validates every mapping against the prefetched target map, records the resolved target uuid of every story reference in the content checkpoint, and gates the resume fast path on an exact comparison of that record. A new verification step reads the ledger plus one target list and reports every relation that does not resolve.

**Tech Stack:** TypeScript, ESM, Node 22 or later, vitest, storyblok-js-client, Storyblok Management API.

**Spec:** `docs/copy-relational-integrity.md`

## Global Constraints

- Change only the copy command. Allowed paths: `src/cli/commands/copy.ts`, `src/api/copy/*`, `src/cli/cli-descriptions.ts`, `__tests__/**`, `docs/**`.
- Do not change `src/api/stories/stories.ts`, `src/api/managementApi.ts`, or any other shared API module. Other commands depend on them.
- Keep `schema_version: 1` on the `story_content` manifest entry. New fields must be optional.
- A manifest written by an earlier version must keep working. A missing field means "legacy entry", not "invalid entry".
- Commit messages use conventional commits. Do not add co-author lines.
- Run `npx vitest run __tests__/cli __tests__/api/copy` before each commit. All tests must pass.
- Run `npx tsc --noEmit` before each commit.
- Every API call the copy command makes must go through the rate-limited client (`copyApiConfig.sbApi`), so SIGINT still aborts the run.

## Out of scope for this plan

- Repeatable `--source` and `--all` selection. That work gets its own plan.
- Bulk content reads, single-write creates, and per-level memory release. Those get a third plan.
- The `is_root` fix in the target space itself. That is a Storyblok data change, not code.

## File Structure

| File | Responsibility |
| --- | --- |
| `src/api/copy/target-lookup.ts` (new) | Read one target story by slug through the rate-limited client. Let errors propagate. |
| `src/api/copy/ref-ledger.ts` (new) | Build the reference ledger and the unresolved count for one story set. |
| `src/api/copy/verify-relations.ts` (new) | Compare the ledger against the target uuid set and report gaps. |
| `src/api/copy/resume-partition.ts` | Gate the fast path on the ledger instead of a count. |
| `src/api/copy/types.ts` | Add the optional `refs` field to the content checkpoint entry. |
| `src/api/copy/index.ts` | Export the new modules. |
| `src/cli/commands/copy.ts` | Wire the new modules. Remove the `verify` gate. Add the root component preflight and the `--verifyRelations` step. |
| `src/cli/cli-descriptions.ts` | Document the new flag. |

---

### Task 1: Always validate a manifest mapping

The shell phase trusts a manifest mapping unless the caller passes `--verify`. A deleted target story then receives a content write that fails with HTTP 404. The prefetched target map answers the same question for free, so the check must always run.

**Files:**
- Modify: `src/cli/commands/copy.ts:3644-3735` (`createStoriesAndWriteManifests` signature and the `trustMapping` branch)
- Modify: `src/cli/commands/copy.ts:5326` (the call site that passes `verify`)
- Test: `__tests__/cli/copy-shell-phase.test.ts`

**Interfaces:**
- Consumes: `getValidMappedTargetStory`, `prefetchTargetStories` output (`Map<string, any>` keyed by target `full_slug`).
- Produces: `createStoriesAndWriteManifests` without the `verify` parameter. Task 3 and Task 5 call this function with the same argument object minus `verify`.

- [ ] **Step 1: Write the failing test**

Add this test to `__tests__/cli/copy-shell-phase.test.ts`. The file already mocks `managementApi` and `api-config`.

```ts
    it("recreates a story whose manifest mapping is not in the prefetch map", async () => {
        const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "sb-mig-stale-"));
        const manifestRoot = path.join(tempDir, ".sb-mig");
        const paths = getDefaultCopyManifestPaths({
            sourceSpaceId: "1",
            targetSpaceId: "2",
            rootDir: manifestRoot,
        });

        await fs.mkdir(path.dirname(paths.combined), { recursive: true });
        await fs.writeFile(
            paths.combined,
            JSON.stringify({
                type: "story",
                source_space_id: "1",
                target_space_id: "2",
                source_id: 1,
                target_id: 900,
                source_uuid: "uuid-1",
                target_uuid: "tgt-900",
                source_full_slug: "blog",
                target_full_slug: "blog",
                action: "created",
                created_at: "2026-08-01T00:00:00.000Z",
            }) + "\n",
            "utf8",
        );

        createStory.mockResolvedValue({
            story: { id: 901, uuid: "tgt-901", full_slug: "blog" },
        });

        const source = story(1, "blog", true);

        const result = await createStoriesAndWriteManifests({
            tree: [treeNode(source)],
            realParentId: null,
            sourceStoryById: new Map([[1, source]]),
            targetSlugBySourceSlug: new Map([["blog", "blog"]]),
            sourceSpace: "1",
            targetSpace: "2",
            manifestRoot,
            targetStoriesBySlug: new Map(),
            writeConcurrency: 2,
            apiConfig: { spaceId: "2", sbApi: {} },
        });

        expect(createStory).toHaveBeenCalledTimes(1);
        expect(result.storiesMatched).toBe(0);

        await fs.rm(tempDir, { recursive: true, force: true });
    });
```

- [ ] **Step 2: Run the test and confirm it fails**

Run: `npx vitest run __tests__/cli/copy-shell-phase.test.ts -t "not in the prefetch map"`

Expected: FAIL. The current code trusts the mapping, so `createStory` receives no call and `storiesMatched` is 1.

- [ ] **Step 3: Remove the gate**

In `src/cli/commands/copy.ts`, replace the `trustMapping` block:

```ts
            if (mappedTargetId) {
                const validTargetStory = getValidMappedTargetStory({
                    sourceStory,
                    targetStoryId: mappedTargetId,
                    targetFullSlug,
                    targetSpace,
                    targetStoriesBySlug,
                });

                if (validTargetStory) {
                    storiesMatched += 1;
                    levelNode.targetId = mappedTargetId;
                    progress?.tick();
                    return;
                }

                copyMaps.storyIds.delete(Number(sourceStory.id));
                copyMaps.storyUuids.delete(String(sourceStory.uuid));
            }
```

- [ ] **Step 4: Remove the parameter**

Delete `verify,` from the destructured parameters of `createStoriesAndWriteManifests` (near `src/cli/commands/copy.ts:3647`). Delete `verify: boolean;` from its parameter type (near line 3660). Delete the `verify,` argument at the call site (near line 5326).

Keep `const verify = runtime.verify;` in `copyCommand`. The resume partition still uses it.

- [ ] **Step 5: Run the tests**

Run: `npx vitest run __tests__/cli/copy-shell-phase.test.ts`

Expected: PASS, including the existing test named "trusts a verified mapping matching the prefetch map without creating a new story".

- [ ] **Step 6: Type check**

Run: `npx tsc --noEmit`

Expected: no output.

- [ ] **Step 7: Commit**

```bash
git add src/cli/commands/copy.ts __tests__/cli/copy-shell-phase.test.ts
git commit -m "fix(copy): always validate a manifest mapping against the target map"
```

---

### Task 2: A target lookup that the copy command owns

`managementApi.stories.getStoryBySlug` catches every error, returns `undefined`, and then calls `.map` on `undefined`. Every failure becomes `Cannot read properties of undefined (reading 'map')`. A `CopyAbortedError` also loses its type, so the abort path counts an interrupted story as a failure. The copy command needs its own lookup. The shared module stays as it is.

**Files:**
- Create: `src/api/copy/target-lookup.ts`
- Modify: `src/api/copy/index.ts`
- Modify: `src/cli/commands/copy.ts:3098-3126` (`createOrMatchReplacementShell`)
- Test: `__tests__/api/copy/target-lookup.test.ts` (new)
- Test: `__tests__/cli/copy-rewrite-phase.test.ts`

**Interfaces:**
- Consumes: the rate-limited client from `wrapSbApiWithLimiter`, available in `copy.ts` as `apiConfigOverride.sbApi`.
- Produces:

```ts
export const getTargetStoryBySlug: (args: {
    slug: string;
    spaceId: string;
    sbApi: any;
}) => Promise<any | undefined>;
```

The function resolves to the story row from the list endpoint, not to a `{ story }` wrapper. The row carries `id`, `uuid`, and `full_slug`.

- [ ] **Step 1: Write the failing unit test**

Create `__tests__/api/copy/target-lookup.test.ts`:

```ts
import { describe, expect, it, vi } from "vitest";

import { getTargetStoryBySlug } from "../../../src/api/copy/target-lookup.js";

describe("getTargetStoryBySlug", () => {
    it("returns the first matching story row", async () => {
        const get = vi.fn().mockResolvedValue({
            data: { stories: [{ id: 7, uuid: "u-7", full_slug: "a/b" }] },
        });

        const story = await getTargetStoryBySlug({
            slug: "a/b",
            spaceId: "2",
            sbApi: { get },
        });

        expect(story).toEqual({ id: 7, uuid: "u-7", full_slug: "a/b" });
        expect(get).toHaveBeenCalledWith("spaces/2/stories/", {
            per_page: 1,
            with_slug: "a/b",
        });
    });

    it("returns undefined when the space has no story at that slug", async () => {
        const get = vi.fn().mockResolvedValue({ data: { stories: [] } });

        await expect(
            getTargetStoryBySlug({ slug: "a/b", spaceId: "2", sbApi: { get } }),
        ).resolves.toBeUndefined();
    });

    it("propagates the error instead of swallowing it", async () => {
        const failure = Object.assign(new Error("Unprocessable"), {
            status: 422,
        });
        const get = vi.fn().mockRejectedValue(failure);

        await expect(
            getTargetStoryBySlug({ slug: "a/b", spaceId: "2", sbApi: { get } }),
        ).rejects.toBe(failure);
    });
});
```

- [ ] **Step 2: Run the test and confirm it fails**

Run: `npx vitest run __tests__/api/copy/target-lookup.test.ts`

Expected: FAIL. The module does not exist.

- [ ] **Step 3: Write the module**

Create `src/api/copy/target-lookup.ts`:

```ts
// The copy command needs a target story lookup that fails loudly. The shared
// managementApi.stories.getStoryBySlug catches every error and then reads
// `.map` on undefined, which turns a 422, a 401, and a CopyAbortedError into
// the same TypeError. The abort path in copy.ts tests `error instanceof
// CopyAbortedError`, so that type must survive.
export const getTargetStoryBySlug = async ({
    slug,
    spaceId,
    sbApi,
}: {
    slug: string;
    spaceId: string;
    sbApi: any;
}): Promise<any | undefined> => {
    const response = await sbApi.get(`spaces/${spaceId}/stories/`, {
        per_page: 1,
        with_slug: slug,
    });

    return response?.data?.stories?.[0];
};
```

- [ ] **Step 4: Export the module**

Add this line to `src/api/copy/index.ts`:

```ts
export * from "./target-lookup.js";
```

- [ ] **Step 5: Run the unit test**

Run: `npx vitest run __tests__/api/copy/target-lookup.test.ts`

Expected: PASS.

- [ ] **Step 6: Use it in the rewrite phase**

In `src/cli/commands/copy.ts`, inside `createOrMatchReplacementShell`, replace the lookup:

```ts
        const existingTargetStory = targetFullSlug
            ? await getTargetStoryBySlug({
                  slug: targetFullSlug,
                  spaceId: targetSpace,
                  sbApi: apiConfigOverride.sbApi,
              })
            : undefined;

        if (
            existingTargetStory?.id &&
            Number(existingTargetStory.id) !== staleTargetId
        ) {
            return writeStoryMapping({
                sourceStory,
                targetStory: existingTargetStory,
                targetFullSlug,
                action: "matched_by_target_key",
            });
        }
```

Add `getTargetStoryBySlug` to the existing import from `../../api/copy/index.js`.

- [ ] **Step 7: Write the abort test**

Add this test to `__tests__/cli/copy-rewrite-phase.test.ts`. The file already provides `story`, `baseArgs`, `updateStory`, and `CopyAbortedError`. Do not seed a shell mapping, so the phase must create the shell and must call the new lookup.

```ts
    it("counts an aborted shell recreation as pending, not as a failure", async () => {
        const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "sb-mig-abort-"));
        const manifestRoot = path.join(tempDir, ".sb-mig");
        const s = story(1);

        const result = await rewriteCopiedStoryContents({
            ...baseArgs(manifestRoot, [s]),
            apiConfig: {
                spaceId: "2",
                sbApi: {
                    get: vi.fn().mockRejectedValue(new CopyAbortedError()),
                },
            },
        });

        expect(result.failures).toEqual([]);
        expect(result.storiesAborted).toBe(1);
        expect(updateStory).not.toHaveBeenCalled();

        await fs.rm(tempDir, { recursive: true, force: true });
    });
```

If `rewriteCopiedStoryContents` names its summary field differently, read the return type at `src/cli/commands/copy.ts` and assert on the aborted counter that it does return.

- [ ] **Step 8: Run the phase tests**

Run: `npx vitest run __tests__/cli/copy-rewrite-phase.test.ts`

Expected: PASS.

- [ ] **Step 9: Type check and commit**

```bash
npx tsc --noEmit
git add src/api/copy/target-lookup.ts src/api/copy/index.ts src/cli/commands/copy.ts __tests__/api/copy/target-lookup.test.ts __tests__/cli/copy-rewrite-phase.test.ts
git commit -m "fix(copy): read target stories through a lookup that reports real errors"
```

---

### Task 3: Block a run whose root components are not content types

Storyblok rejects a story create with HTTP 422 and the message `please select a content type component as your root component` when the target space does not mark the root component as a content type. The dry-run validator checks that a component exists and that a field allows it. It does not check `is_root`. A run then fails story by story after it already wrote part of the tree.

**Files:**
- Modify: `src/cli/commands/copy.ts:2311-2320` (`ComponentCompatibilityFinding`)
- Modify: `src/cli/commands/copy.ts:2327-2437` (`buildTargetComponentValidator`)
- Modify: `src/cli/commands/copy.ts:1211-1227` (`summarizeComponentCompatibility`)
- Modify: `src/cli/commands/copy.ts:1229-1260` (`buildComponentCompatibilityWarnings`)
- Modify: `src/cli/commands/copy.ts` (the live path, right after `contentFetchedStories` and before the shell phase)
- Test: `__tests__/cli/copy-dry-run.test.ts`
- Test: `__tests__/cli/copy-command-flags.test.ts`

**Interfaces:**
- Consumes: `contentFetchedStories`, the array of source items whose content this run read.
- Produces: `validator.validateStoryRoot(story)` returns `ComponentCompatibilityFinding[]`, and `summarizeComponentCompatibility` gains `nonContentTypeComponents: string[]`.

- [ ] **Step 1: Write the failing validator test**

Add this test to `__tests__/cli/copy-dry-run.test.ts`, next to the test named "flags source components missing from the target space during story dry-run". Copy that test's shape: `mockChildStories`, then `copyCommand` with `dryRun: true`, then read the report from `outputPath`.

```ts
    it("flags a story root component that the target space does not mark as a content type", async () => {
        const tempDir = await mkdtemp(path.join(tmpdir(), "sb-mig-copy-"));
        const outputPath = path.join(tempDir, "plans", "copy-plan.json");

        // The target space knows the component, and marks it nestable only.
        mocks.getAllComponents.mockResolvedValue([
            { name: "page", schema: {}, is_root: true, is_nestable: false },
            {
                name: "sharedSection",
                schema: {},
                is_root: false,
                is_nestable: true,
            },
        ]);

        mockChildStories([
            {
                story: {
                    id: 2,
                    name: "Shared A",
                    slug: "shared-a",
                    full_slug: "blog/shared-a",
                    is_folder: false,
                    parent_id: 1,
                    uuid: "source-shared-uuid",
                    content: { component: "sharedSection", _uid: "blok-1" },
                },
            },
        ]);

        await copyCommand({
            input: ["copy", "stories"],
            flags: {
                from: "source-space",
                to: "target-space",
                source: "blog",
                destination: "imported",
                dryRun: true,
                outputPath,
            },
        } as any);

        const report = JSON.parse(await readFile(outputPath, "utf8"));

        expect(report.componentCompatibility).toMatchObject({
            checked: true,
            nonContentTypeComponents: ["sharedSection"],
        });

        await rm(tempDir, { recursive: true, force: true });
    });
```

- [ ] **Step 2: Run the test and confirm it fails**

Run: `npx vitest run __tests__/cli/copy-dry-run.test.ts -t "content type"`

Expected: FAIL. `nonContentTypeComponents` is undefined.

- [ ] **Step 3: Add the finding reason**

```ts
interface ComponentCompatibilityFinding {
    sourceStoryId: number;
    sourceFullSlug: string;
    component: string;
    path: string;
    uid?: string;
    field?: string;
    parentComponent?: string;
    reason:
        | "missing_in_target"
        | "not_allowed_in_field"
        | "not_content_type_in_target";
}
```

- [ ] **Step 4: Add the root check to the validator**

Inside `buildTargetComponentValidator`, after `schemaByName`, add:

```ts
    // Only a component that reports is_root === false is a proven problem.
    // A component object without the field tells us nothing, so the check
    // stays silent for it and keeps the report free of false positives.
    const nonRootComponentNames = new Set<string>(
        list
            .filter((component: any) => component?.is_root === false)
            .map((component: any) => component?.name)
            .filter(Boolean),
    );
```

Add this method to the returned object:

```ts
        // A story's root component must exist in the target space AND carry
        // is_root. Storyblok answers a create with HTTP 422 and "please select
        // a content type component as your root component" in both cases.
        validateStoryRoot(story: any): ComponentCompatibilityFinding[] {
            const component = story?.content?.component;

            if (!component || story?.is_folder === true) {
                return [];
            }

            if (!targetComponentNames.has(component)) {
                // validateStory already reports this component as missing.
                return [];
            }

            if (!nonRootComponentNames.has(component)) {
                return [];
            }

            return [
                {
                    sourceStoryId: Number(story?.id),
                    sourceFullSlug: String(
                        story?.full_slug ?? story?.slug ?? "",
                    ),
                    component,
                    path: "content.component",
                    reason: "not_content_type_in_target",
                },
            ];
        },
```

- [ ] **Step 5: Add the summary bucket and the warning**

In `summarizeComponentCompatibility`, add:

```ts
    nonContentTypeComponents: uniqueSorted(
        findings
            .filter((finding) => finding.reason === "not_content_type_in_target")
            .map((finding) => finding.component),
    ),
```

Add the matching field to `CopyDryRunComponentCompatibility`.

In `buildComponentCompatibilityWarnings`, add:

```ts
    if (componentCompatibility.nonContentTypeComponents.length > 0) {
        warnings.push({
            code: "component_not_content_type",
            message: `Component(s) used as a story root that the target space does not mark as a content type (story creates will fail with a 422 until you set them to Universal or Content type): ${componentCompatibility.nonContentTypeComponents.join(", ")}.`,
        });
    }
```

- [ ] **Step 6: Call the root check in both paths**

In the dry-run branch, extend the existing `flatMap` so it collects both checks:

```ts
                                  contentFetchedStories.flatMap((item: any) => [
                                      ...componentValidator.validateStory(
                                          item?.story,
                                      ),
                                      ...componentValidator.validateStoryRoot(
                                          item?.story,
                                      ),
                                  ]),
```

In the live path, add a preflight before the shell phase. Place it after `contentFetchedStories` exists and before `prefetchTargetStories`:

```ts
                // Preflight: a root component that the target space does not
                // accept as a content type fails every create for that story
                // with HTTP 422. Stop before the first write instead of
                // failing story by story across a long run.
                const preflightValidator =
                    await buildTargetComponentValidator(targetSpace);

                if (preflightValidator.canValidate) {
                    const rootFindings = contentFetchedStories.flatMap(
                        (item: any) =>
                            preflightValidator.validateStoryRoot(item?.story),
                    );

                    if (rootFindings.length > 0) {
                        const components = uniqueSorted(
                            rootFindings.map((finding) => finding.component),
                        );

                        throw new Error(
                            `Target space '${targetSpace}' does not accept these components as a story root: ${components.join(", ")}. Set each one to a content type (Universal keeps it nestable), then run the copy again. Stories affected: ${rootFindings.length}.`,
                        );
                    }
                }
```

- [ ] **Step 7: Write the live-path test**

Add this test to `__tests__/cli/copy-dry-run.test.ts`, because that file already owns the full command harness. Drop the `dryRun` flag so the run takes the live path.

```ts
    it("stops a live run before any write when a story root component is not a content type", async () => {
        mocks.getAllComponents.mockResolvedValue([
            { name: "page", schema: {}, is_root: true },
            { name: "sharedSection", schema: {}, is_root: false },
        ]);

        mockChildStories([
            {
                story: {
                    id: 2,
                    name: "Shared A",
                    slug: "shared-a",
                    full_slug: "blog/shared-a",
                    is_folder: false,
                    parent_id: 1,
                    uuid: "source-shared-uuid",
                    content: { component: "sharedSection", _uid: "blok-1" },
                },
            },
        ]);

        await expect(
            copyCommand({
                input: ["copy", "stories"],
                flags: {
                    from: "source-space",
                    to: "target-space",
                    source: "blog",
                    destination: "imported",
                },
            } as any),
        ).rejects.toThrow(/does not accept these components as a story root/);

        expect(mocks.createStory).not.toHaveBeenCalled();
    });
```

- [ ] **Step 8: Run the tests**

Run: `npx vitest run __tests__/cli/copy-dry-run.test.ts`

Expected: PASS. Every existing test in the file must still pass. A fake component list without `is_root` must produce no new finding.

- [ ] **Step 9: Type check and commit**

```bash
npx tsc --noEmit
git add src/cli/commands/copy.ts __tests__/cli/copy-dry-run.test.ts __tests__/cli/copy-command-flags.test.ts
git commit -m "feat(copy): block a run whose story root components are not content types"
```

---

### Task 4: Record the resolved relations in the checkpoint

The checkpoint stores `unresolved_refs` as a number. That number cannot tell a later run that a reference now maps, and it cannot tell a later run that a mapping changed. A story whose referenced target was deleted and created again keeps `unresolved_refs: 0`, so the fast path skips it and the reference stays dead. The checkpoint must store the pairs.

**Files:**
- Create: `src/api/copy/ref-ledger.ts`
- Modify: `src/api/copy/types.ts` (`CopyStoryContentManifestEntry`)
- Modify: `src/api/copy/resume-partition.ts`
- Modify: `src/api/copy/index.ts`
- Modify: `src/cli/commands/copy.ts:2941-2975` (replace `countUnresolvedRefs` usage) and `:3520-3545` (the checkpoint entry)
- Modify: `src/cli/commands/copy.ts:4859-4870` (the `partitionStoriesForResume` call)
- Test: `__tests__/api/copy/ref-ledger.test.ts` (new)
- Test: `__tests__/api/copy/resume-partition.test.ts`

**Interfaces:**
- Consumes: `scanStoriesReferences` from `src/api/copy/reference-scanner.ts`, `CopyMaps`, and `CopyComponentSchemaRegistry`.
- Produces:

```ts
export type CopyRefLedgerEntry = {
    source_uuid: string;
    target_uuid: string | null;
};

export const buildRefLedger: (args: {
    stories: any[];
    maps: CopyMaps;
    schemas: CopyComponentSchemaRegistry;
    isNonContentRefPath: (path: string) => boolean;
    hasMappedAssetReference: (reference: any) => boolean;
}) => { unresolvedRefs: number; refs: CopyRefLedgerEntry[] };
```

Task 5 reads `refs` from the manifest. It does not call this function.

- [ ] **Step 1: Write the failing ledger test**

Create `__tests__/api/copy/ref-ledger.test.ts`:

```ts
import { describe, expect, it } from "vitest";

import { buildRefLedger } from "../../../src/api/copy/ref-ledger.js";
import { createEmptyCopyMaps } from "../../../src/api/copy/manifest.js";

const schemas = {
    page: { link: { type: "option", source: "internal_stories" } },
};

const story = (uuid: string) => ({
    id: 1,
    uuid: "src-1",
    full_slug: "a",
    content: { component: "page", link: uuid },
});

describe("buildRefLedger", () => {
    it("records a mapped reference with its target uuid", () => {
        const maps = createEmptyCopyMaps();
        maps.storyUuids.set("ref-uuid", "tgt-uuid");

        const ledger = buildRefLedger({
            stories: [story("ref-uuid")],
            maps,
            schemas,
            isNonContentRefPath: () => false,
            hasMappedAssetReference: () => true,
        });

        expect(ledger.refs).toEqual([
            { source_uuid: "ref-uuid", target_uuid: "tgt-uuid" },
        ]);
        expect(ledger.unresolvedRefs).toBe(0);
    });

    it("records an unmapped reference with a null target uuid", () => {
        const ledger = buildRefLedger({
            stories: [story("ref-uuid")],
            maps: createEmptyCopyMaps(),
            schemas,
            isNonContentRefPath: () => false,
            hasMappedAssetReference: () => true,
        });

        expect(ledger.refs).toEqual([
            { source_uuid: "ref-uuid", target_uuid: null },
        ]);
        expect(ledger.unresolvedRefs).toBe(1);
    });
});
```

- [ ] **Step 2: Run the test and confirm it fails**

Run: `npx vitest run __tests__/api/copy/ref-ledger.test.ts`

Expected: FAIL. The module does not exist.

- [ ] **Step 3: Write the module**

Create `src/api/copy/ref-ledger.ts`. Move the body of `countUnresolvedRefs` here and return the pairs next to the count.

```ts
import type {
    CopyComponentSchemaRegistry,
    CopyMaps,
} from "./types.js";

import { scanStoriesReferences } from "./reference-scanner.js";

export type CopyRefLedgerEntry = {
    source_uuid: string;
    target_uuid: string | null;
};

// The scanner sees every reference, mapped or not. The rewriter records only
// the ones it already mapped, so it cannot report a miss. The ledger keeps
// one row per referenced source uuid, with the target uuid this run wrote or
// null when the run could not map it. A reference that carries only a story
// id and no uuid still counts in unresolvedRefs, and it gets no ledger row,
// because the gate compares uuids.
export const buildRefLedger = ({
    stories,
    maps,
    schemas,
    isNonContentRefPath,
    hasMappedAssetReference,
}: {
    stories: any[];
    maps: CopyMaps;
    schemas: CopyComponentSchemaRegistry;
    isNonContentRefPath: (path: string) => boolean;
    hasMappedAssetReference: (reference: any) => boolean;
}): { unresolvedRefs: number; refs: CopyRefLedgerEntry[] } => {
    const scanResult = scanStoriesReferences({
        stories,
        schemas,
        options: { referencePolicy: "preserve" },
    });

    const unresolvedAssetReferences = scanResult.assetReferences.filter(
        (reference) =>
            !isNonContentRefPath(reference.path) &&
            !hasMappedAssetReference(reference),
    ).length;

    const refsByUuid = new Map<string, string | null>();
    let unresolvedStoryReferences = 0;

    for (const reference of scanResult.storyReferences) {
        if (isNonContentRefPath(reference.path)) {
            continue;
        }

        const byId =
            reference.referencedStoryId !== undefined &&
            maps.storyIds.has(reference.referencedStoryId);
        const uuid = reference.referencedStoryUuid;
        const targetUuid = uuid ? (maps.storyUuids.get(uuid) ?? null) : null;

        if (!byId && targetUuid === null) {
            unresolvedStoryReferences += 1;
        }

        if (uuid) {
            refsByUuid.set(uuid, targetUuid);
        }
    }

    return {
        unresolvedRefs: unresolvedAssetReferences + unresolvedStoryReferences,
        refs: [...refsByUuid.entries()].map(([source_uuid, target_uuid]) => ({
            source_uuid,
            target_uuid,
        })),
    };
};
```

Export it from `src/api/copy/index.ts`:

```ts
export * from "./ref-ledger.js";
```

- [ ] **Step 4: Run the ledger test**

Run: `npx vitest run __tests__/api/copy/ref-ledger.test.ts`

Expected: PASS.

- [ ] **Step 5: Add the field to the checkpoint type**

In `src/api/copy/types.ts`, add to `CopyStoryContentManifestEntry`:

```ts
    // One row per referenced source story uuid, with the target uuid this run
    // wrote. A null target uuid means the run could not map the reference.
    // The field is optional: an entry without it comes from an earlier
    // version, and the resume gate falls back to unresolved_refs for it.
    refs?: { source_uuid: string; target_uuid: string | null }[];
```

- [ ] **Step 6: Write the checkpoint with the ledger**

In `src/cli/commands/copy.ts`, replace the `countUnresolvedRefs` call in the checkpoint entry:

```ts
                    const ledger = buildRefLedger({
                        stories: storiesToScanForUnresolvedRefs,
                        maps,
                        schemas,
                        isNonContentRefPath,
                        hasMappedAssetReference: (reference: any) =>
                            hasMappedAssetReference({ ...reference, copyMaps: maps }),
                    });
```

Then use it in the entry:

```ts
                        unresolved_refs: ledger.unresolvedRefs,
                        refs: ledger.refs,
```

Delete the now unused `countUnresolvedRefs` function. Keep `isNonContentRefPath` and its comment, because the ledger takes it as an argument.

- [ ] **Step 7: Write the failing gate test**

Add these tests to `__tests__/api/copy/resume-partition.test.ts`:

```ts
    it("does not fast-path a story whose reference now maps", () => {
        const partition = partitionStoriesForResume({
            listStories: [{ id: 1, updated_at: "2026-08-01T00:00:00.000Z" }],
            checkpoints: new Map([
                [
                    1,
                    {
                        ...baseCheckpoint,
                        refs: [{ source_uuid: "ref-1", target_uuid: null }],
                    } as any,
                ],
            ]),
            verify: false,
            forceContent: false,
            publicationMode: "save-only",
            targetFullSlugBySourceId: new Map([[1, "dst/a"]]),
            mappedSourceIds: new Set([1]),
            storyUuids: new Map([["ref-1", "tgt-1"]]),
        });

        expect(partition.needsContentIds.has(1)).toBe(true);
    });

    it("does not fast-path a story whose reference target changed", () => {
        const partition = partitionStoriesForResume({
            listStories: [{ id: 1, updated_at: "2026-08-01T00:00:00.000Z" }],
            checkpoints: new Map([
                [
                    1,
                    {
                        ...baseCheckpoint,
                        refs: [{ source_uuid: "ref-1", target_uuid: "old-1" }],
                    } as any,
                ],
            ]),
            verify: false,
            forceContent: false,
            publicationMode: "save-only",
            targetFullSlugBySourceId: new Map([[1, "dst/a"]]),
            mappedSourceIds: new Set([1]),
            storyUuids: new Map([["ref-1", "new-1"]]),
        });

        expect(partition.needsContentIds.has(1)).toBe(true);
    });

    it("fast-paths a story whose reference targets still match", () => {
        const partition = partitionStoriesForResume({
            listStories: [{ id: 1, updated_at: "2026-08-01T00:00:00.000Z" }],
            checkpoints: new Map([
                [
                    1,
                    {
                        ...baseCheckpoint,
                        refs: [{ source_uuid: "ref-1", target_uuid: "tgt-1" }],
                    } as any,
                ],
            ]),
            verify: false,
            forceContent: false,
            publicationMode: "save-only",
            targetFullSlugBySourceId: new Map([[1, "dst/a"]]),
            mappedSourceIds: new Set([1]),
            storyUuids: new Map([["ref-1", "tgt-1"]]),
        });

        expect(partition.fastPathSourceIds.has(1)).toBe(true);
    });

    it("falls back to unresolved_refs for a legacy checkpoint without refs", () => {
        const partition = partitionStoriesForResume({
            listStories: [{ id: 1, updated_at: "2026-08-01T00:00:00.000Z" }],
            checkpoints: new Map([[1, { ...baseCheckpoint } as any]]),
            verify: false,
            forceContent: false,
            publicationMode: "save-only",
            targetFullSlugBySourceId: new Map([[1, "dst/a"]]),
            mappedSourceIds: new Set([1]),
            storyUuids: new Map(),
        });

        expect(partition.fastPathSourceIds.has(1)).toBe(true);
    });
```

Define `baseCheckpoint` at the top of the file if it does not exist:

```ts
const baseCheckpoint = {
    type: "story_content" as const,
    schema_version: 1 as const,
    source_space_id: "1",
    target_space_id: "2",
    source_id: 1,
    target_id: 100,
    source_updated_at: "2026-08-01T00:00:00.000Z",
    content_hash: "sha256:abc",
    unresolved_refs: 0,
    created_at: "2026-08-01T00:00:00.000Z",
    publication_mode: "save-only",
    target_full_slug: "dst/a",
};
```

- [ ] **Step 8: Run the tests and confirm the new ones fail**

Run: `npx vitest run __tests__/api/copy/resume-partition.test.ts`

Expected: the two "does not fast-path" tests FAIL. The gate reads only the count today.

- [ ] **Step 9: Add the gate**

In `src/api/copy/resume-partition.ts`, add the parameter and the check:

```ts
const refsStillValid = (
    checkpoint: CopyStoryContentManifestEntry,
    storyUuids: Map<string, string>,
): boolean => {
    // A legacy checkpoint has no refs. unresolved_refs already gates it.
    if (checkpoint.refs === undefined) {
        return true;
    }

    return checkpoint.refs.every(
        (ref) => (storyUuids.get(ref.source_uuid) ?? null) === ref.target_uuid,
    );
};
```

Add `storyUuids: Map<string, string>;` to the parameter type of `partitionStoriesForResume`, and add this line to the `eligible` expression:

```ts
            refsStillValid(checkpoint, storyUuids) &&
```

- [ ] **Step 10: Pass the map at the call site**

In `src/cli/commands/copy.ts`, add to the `partitionStoriesForResume` call:

```ts
                    storyUuids: copyMaps.storyUuids,
```

- [ ] **Step 11: Run the copy suites**

Run: `npx vitest run __tests__/cli __tests__/api/copy`

Expected: PASS.

- [ ] **Step 12: Type check and commit**

```bash
npx tsc --noEmit
git add src/api/copy/ref-ledger.ts src/api/copy/types.ts src/api/copy/resume-partition.ts src/api/copy/index.ts src/cli/commands/copy.ts __tests__/api/copy/ref-ledger.test.ts __tests__/api/copy/resume-partition.test.ts
git commit -m "feat(copy): record resolved story relations in the content checkpoint"
```

---

### Task 5: Verify every relation and fail the run when one is broken

The ledger records what the run wrote. A verification step compares it against the target space and reports every gap. The check costs one target list and no per-story request.

**Files:**
- Create: `src/api/copy/verify-relations.ts`
- Modify: `src/api/copy/index.ts`
- Modify: `src/cli/commands/copy.ts` (`resolveCopyRuntimeOptions`, and the live path after the manifest dedupe)
- Modify: `src/cli/cli-descriptions.ts`
- Test: `__tests__/api/copy/verify-relations.test.ts` (new)
- Test: `__tests__/cli/copy-resume-e2e.test.ts`

**Interfaces:**
- Consumes: `loadManifest` output, and the `Map<string, any>` from `prefetchTargetStories`.
- Produces:

```ts
export type RelationGap = {
    sourceId: number;
    sourceUuid: string;
    targetUuid: string | null;
    reason: "unresolved" | "missing_in_target";
};

export const verifyRelations: (args: {
    entries: CopyManifestEntry[];
    targetStoryUuids: Set<string>;
    selectionSourceIds: Set<number>;
}) => { gaps: RelationGap[]; missingMappings: number[] };
```

- [ ] **Step 1: Write the failing test**

Create `__tests__/api/copy/verify-relations.test.ts`:

```ts
import { describe, expect, it } from "vitest";

import { verifyRelations } from "../../../src/api/copy/verify-relations.js";

const checkpoint = (sourceId: number, refs: any[]) => ({
    type: "story_content" as const,
    schema_version: 1 as const,
    source_space_id: "1",
    target_space_id: "2",
    source_id: sourceId,
    target_id: 100 + sourceId,
    content_hash: "sha256:abc",
    unresolved_refs: 0,
    created_at: "2026-08-01T00:00:00.000Z",
    refs,
});

describe("verifyRelations", () => {
    it("reports nothing when every relation resolves to a target story", () => {
        const result = verifyRelations({
            entries: [checkpoint(1, [{ source_uuid: "s", target_uuid: "t" }])],
            targetStoryUuids: new Set(["t"]),
            selectionSourceIds: new Set([1]),
        });

        expect(result.gaps).toEqual([]);
        expect(result.missingMappings).toEqual([]);
    });

    it("reports a relation the run could not map", () => {
        const result = verifyRelations({
            entries: [checkpoint(1, [{ source_uuid: "s", target_uuid: null }])],
            targetStoryUuids: new Set(),
            selectionSourceIds: new Set([1]),
        });

        expect(result.gaps).toEqual([
            {
                sourceId: 1,
                sourceUuid: "s",
                targetUuid: null,
                reason: "unresolved",
            },
        ]);
    });

    it("reports a relation whose target story no longer exists", () => {
        const result = verifyRelations({
            entries: [checkpoint(1, [{ source_uuid: "s", target_uuid: "t" }])],
            targetStoryUuids: new Set(["other"]),
            selectionSourceIds: new Set([1]),
        });

        expect(result.gaps[0].reason).toBe("missing_in_target");
    });

    it("reports a selected story that has no checkpoint", () => {
        const result = verifyRelations({
            entries: [],
            targetStoryUuids: new Set(),
            selectionSourceIds: new Set([7]),
        });

        expect(result.missingMappings).toEqual([7]);
    });
});
```

- [ ] **Step 2: Run the test and confirm it fails**

Run: `npx vitest run __tests__/api/copy/verify-relations.test.ts`

Expected: FAIL. The module does not exist.

- [ ] **Step 3: Write the module**

Create `src/api/copy/verify-relations.ts`:

```ts
import type {
    CopyManifestEntry,
    CopyStoryContentManifestEntry,
} from "./types.js";

export type RelationGap = {
    sourceId: number;
    sourceUuid: string;
    targetUuid: string | null;
    reason: "unresolved" | "missing_in_target";
};

const isStoryContentEntry = (
    entry: CopyManifestEntry,
): entry is CopyStoryContentManifestEntry => entry.type === "story_content";

// The ledger records the target uuid that the run wrote into each reference.
// A relation is correct when that uuid is not null and the target space still
// holds a story with it. This needs no story content and no per-story request.
export const verifyRelations = ({
    entries,
    targetStoryUuids,
    selectionSourceIds,
}: {
    entries: CopyManifestEntry[];
    targetStoryUuids: Set<string>;
    selectionSourceIds: Set<number>;
}): { gaps: RelationGap[]; missingMappings: number[] } => {
    const gaps: RelationGap[] = [];
    const checkpointSourceIds = new Set<number>();

    for (const entry of entries) {
        if (!isStoryContentEntry(entry)) {
            continue;
        }

        checkpointSourceIds.add(Number(entry.source_id));

        if (!selectionSourceIds.has(Number(entry.source_id))) {
            continue;
        }

        for (const ref of entry.refs ?? []) {
            if (ref.target_uuid === null) {
                gaps.push({
                    sourceId: Number(entry.source_id),
                    sourceUuid: ref.source_uuid,
                    targetUuid: null,
                    reason: "unresolved",
                });
                continue;
            }

            if (!targetStoryUuids.has(ref.target_uuid)) {
                gaps.push({
                    sourceId: Number(entry.source_id),
                    sourceUuid: ref.source_uuid,
                    targetUuid: ref.target_uuid,
                    reason: "missing_in_target",
                });
            }
        }
    }

    const missingMappings = [...selectionSourceIds].filter(
        (sourceId) => !checkpointSourceIds.has(sourceId),
    );

    return { gaps, missingMappings };
};
```

Export it from `src/api/copy/index.ts`:

```ts
export * from "./verify-relations.js";
```

- [ ] **Step 4: Run the test**

Run: `npx vitest run __tests__/api/copy/verify-relations.test.ts`

Expected: PASS.

- [ ] **Step 5: Add the flag, test first**

Add this test to `__tests__/cli/copy-command-flags.test.ts`, inside the `resolveCopyRuntimeOptions` describe block:

```ts
    it("parses verifyRelations in both spellings", () => {
        expect(resolveCopyRuntimeOptions({}, {}).verifyRelations).toBe(false);
        expect(
            resolveCopyRuntimeOptions({ verifyRelations: true }, {})
                .verifyRelations,
        ).toBe(true);
        expect(
            resolveCopyRuntimeOptions({ "verify-relations": true }, {})
                .verifyRelations,
        ).toBe(true);
    });
```

Run: `npx vitest run __tests__/cli/copy-command-flags.test.ts -t "verifyRelations"`

Expected: FAIL. The field does not exist.

In `resolveCopyRuntimeOptions`, add the field to the return type and to the returned object:

```ts
    verifyRelations: boolean;
```

```ts
        verifyRelations: Boolean(
            flags["verifyRelations"] ?? flags["verify-relations"],
        ),
```

- [ ] **Step 6: Run the check in the live path**

In `copyCommand`, after `dedupeManifestFile` finishes and before the summary, add:

```ts
                if (runtime.verifyRelations) {
                    const targetStoryUuids = new Set<string>(
                        [
                            ...(
                                await prefetchTargetStories({
                                    destination: normalizeDestination(destination),
                                    config: {
                                        spaceId: targetSpace,
                                        sbApi: copyApiConfig.sbApi,
                                    },
                                })
                            ).values(),
                        ].map((story: any) => String(story.uuid)),
                    );
                    const { gaps, missingMappings } = verifyRelations({
                        entries: await loadManifest(manifestPaths.combined),
                        targetStoryUuids,
                        selectionSourceIds: new Set(
                            sourceStories.map((item: any) =>
                                Number(item.story.id),
                            ),
                        ),
                    });

                    if (gaps.length === 0 && missingMappings.length === 0) {
                        Logger.success(
                            `Relations verified: every relation in ${sourceStories.length} selected story/stories resolves in space '${targetSpace}'.`,
                        );
                    } else {
                        Logger.error(
                            `Relation check failed: ${gaps.length} broken relation(s), ${missingMappings.length} story/stories without a mapping.`,
                        );

                        for (const gap of gaps) {
                            Logger.error(
                                `  - source story ${gap.sourceId} references ${gap.sourceUuid} (${gap.reason}).`,
                            );
                        }

                        for (const sourceId of missingMappings) {
                            Logger.error(
                                `  - source story ${sourceId} has no target mapping.`,
                            );
                        }

                        process.exitCode = 1;
                    }
                }
```

Add `verifyRelations` and `loadManifest` to the existing import from `../../api/copy/index.js`.

- [ ] **Step 7: Document the flag**

Add the flag to the copy help text in `src/cli/cli-descriptions.ts`, next to `--verify`:

```
  --verifyRelations   After the copy, check that every recorded story relation resolves in the target space. Exit code 1 on a gap.
```

- [ ] **Step 8: Write the end-to-end test**

Add this test to `__tests__/cli/copy-resume-e2e.test.ts`, inside the multi-root describe block:

```ts
        it("7. reports success when every relation resolves after both roots are copied", async () => {
            process.exitCode = 0;

            await copyCommand({
                input: ["copy", "stories"],
                flags: {
                    from: SOURCE_SPACE,
                    to: TARGET_SPACE,
                    source: "news",
                    mode: "subtree",
                    manifestRoot,
                    publicationMode: "save-only",
                    verifyRelations: true,
                },
            } as any);

            expect(process.exitCode).toBe(0);
            const successCall = (Logger.success as any).mock.calls.find(
                (call: any[]) => String(call[0]).startsWith("Relations verified"),
            );
            expect(successCall).toBeDefined();
        });
```

- [ ] **Step 9: Run the copy suites**

Run: `npx vitest run __tests__/cli __tests__/api/copy`

Expected: PASS.

- [ ] **Step 10: Type check and commit**

```bash
npx tsc --noEmit
git add src/api/copy/verify-relations.ts src/api/copy/index.ts src/cli/commands/copy.ts src/cli/cli-descriptions.ts __tests__/api/copy/verify-relations.test.ts __tests__/cli/copy-resume-e2e.test.ts
git commit -m "feat(copy): add --verifyRelations to prove every story relation resolves"
```

---

### Task 6: Document the new behavior

**Files:**
- Modify: `README.md` (the copy command section)
- Modify: `docs/copy-speed-resume.md` (the checkpoint and flags sections)
- Modify: `docs/copy-relational-integrity.md` (mark the delivered items)

- [ ] **Step 1: Update the README flag table**

Add one row for `--verifyRelations`. Keep the wording of the other rows.

- [ ] **Step 2: Update the resume design doc**

In `docs/copy-speed-resume.md`, update section 4 and section 6. State that the checkpoint now carries `refs`, and that the fast path compares those pairs against the current maps. State that the shell phase always validates a mapping, so `--verify` no longer controls that check.

- [ ] **Step 3: Update the spec**

In `docs/copy-relational-integrity.md`, add a "Delivered" line under items 1, 2, 3, 5, and 6.

- [ ] **Step 4: Commit**

```bash
git add README.md docs/copy-speed-resume.md docs/copy-relational-integrity.md
git commit -m "docs(copy): document relation verification and the reference ledger"
```

---

## Self-review notes

- Spec coverage: item 1 maps to Task 1. Item 2 maps to Task 2. Item 3 maps to Task 3. Item 5 maps to Task 4. Item 6 maps to Task 5. Item 4 (selection) and items 7 to 9 (scale) are out of scope, and this plan says so at the top.
- The `verify` flag keeps one job after Task 1: it forces the resume partition to skip the fast path. Task 1 removes it only from the shell phase.
- `buildRefLedger` takes `isNonContentRefPath` and `hasMappedAssetReference` as arguments, because both live in `copy.ts` today. A later refactor can move them into `src/api/copy/`.
- Task 5 reuses `prefetchTargetStories`, so the verification step adds one paginated list per run and no per-story request.
- The root component check reports a component only when the target space says `is_root === false`. The existing test fixtures return component objects without that field, so they produce no new finding, and Task 3 does not need a fixture rewrite. The real Management API always returns the field.
- Task 5 sets `process.exitCode = 1`. The file already uses this pattern for the interrupt exit code 130, so the command keeps one way to report an exit code.
