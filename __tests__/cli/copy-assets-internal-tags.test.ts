import { mkdir, mkdtemp, readFile, rm, writeFile } from "fs/promises";
import { tmpdir } from "os";
import path from "path";

import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
    getStoryBySlug: vi.fn(),
    getStoryById: vi.fn(),
    getStoriesByFullSlugs: vi.fn(),
    getStoryVersions: vi.fn(),
    getAllStories: vi.fn(),
    getAllComponents: vi.fn(),
    getSpace: vi.fn(),
    sbApiGet: vi.fn(),
    getAllAssets: vi.fn(),
    getAllAssetFolders: vi.fn(),
    getAllInternalTags: vi.fn(),
    createAsset: vi.fn(),
    createAssetFolder: vi.fn(),
    createAssetAndFinalize: vi.fn(),
    downloadAsset: vi.fn(),
    updateAsset: vi.fn(),
}));

vi.mock("../../src/cli/api-config.js", () => ({
    apiConfig: {
        spaceId: "default-space",
        sbApi: { get: mocks.sbApiGet },
    },
}));

vi.mock("../../src/api/managementApi.js", () => ({
    managementApi: {
        stories: {
            getStoryBySlug: mocks.getStoryBySlug,
            getStoryById: mocks.getStoryById,
            getStoriesByFullSlugs: mocks.getStoriesByFullSlugs,
            getStoryVersions: mocks.getStoryVersions,
            getAllStories: mocks.getAllStories,
        },
        components: { getAllComponents: mocks.getAllComponents },
        spaces: { getSpace: mocks.getSpace },
        internalTags: { getAllInternalTags: mocks.getAllInternalTags },
        assets: {
            getAllAssets: mocks.getAllAssets,
            getAllAssetFolders: mocks.getAllAssetFolders,
            createAsset: mocks.createAsset,
            createAssetFolder: mocks.createAssetFolder,
            createAssetAndFinalize: mocks.createAssetAndFinalize,
            downloadAsset: mocks.downloadAsset,
            updateAsset: mocks.updateAsset,
        },
    },
}));

vi.mock("../../src/utils/logger.js", () => ({
    default: {
        log: vi.fn(),
        success: vi.fn(),
        warning: vi.fn(),
        error: vi.fn(),
    },
}));

import { getAllInternalTags } from "../../src/api/internal-tags/internal-tags.js";
import { copyDescription } from "../../src/cli/cli-descriptions.js";
import { copyCommand } from "../../src/cli/commands/copy.js";
import Logger from "../../src/utils/logger.js";

/** Every line the run printed, in order. */
const printedLines = () =>
    (["log", "success", "warning", "error"] as const).flatMap((method) =>
        (Logger[method] as unknown as ReturnType<typeof vi.fn>).mock.calls.map(
            (call) => String(call[0]),
        ),
    );

const sourceAsset = (overrides: Record<string, any> = {}) => ({
    id: 700,
    filename: "https://a.storyblok.com/f/111/1200x630/2b7c4d6e9a/one.jpg",
    space_id: 111,
    asset_folder_id: null,
    alt: "the alt text",
    title: "",
    copyright: "",
    source: "",
    focus: "",
    content_type: "image/jpeg",
    content_length: 100,
    internal_tag_ids: [] as number[],
    internal_tags_list: [] as { id: number; name: string }[],
    ...overrides,
});

const tag = (id: number, name: string) => ({
    id,
    name,
    object_type: "asset",
});

const ledgerDir = (root: string) => path.join(root, "copy", "111", "222");

const writeLedger = async (root: string, entries: unknown[]) => {
    await mkdir(ledgerDir(root), { recursive: true });
    await writeFile(
        path.join(ledgerDir(root), "manifest.jsonl"),
        entries.map((entry) => JSON.stringify(entry)).join("\n") + "\n",
        "utf8",
    );
};

const readLedger = async (root: string) => {
    const content = await readFile(
        path.join(ledgerDir(root), "manifest.jsonl"),
        "utf8",
    );

    return content
        .split("\n")
        .filter(Boolean)
        .map((line) => JSON.parse(line));
};

const runCopyAssets = async (flags: Record<string, unknown>) =>
    copyCommand({
        input: ["copy", "assets"],
        flags: { from: "111", to: "222", all: true, ...flags },
    } as any);

describe("the internal tags API module (R1)", () => {
    // R1 canary. Mutation that must turn it red: drop `by_object_type` from
    // the query. The bare endpoint answers 403 "This endpoint does not support
    // this token type" to every personal access token, so the parameter is not
    // a filter for convenience — it is the only way this read is allowed.
    it("always sends by_object_type, and pages like every other listing", async () => {
        const calls: any[] = [];
        const get = vi.fn(async (path: string, query: Record<string, any>) => {
            calls.push({ path, query });

            return {
                data: {
                    internal_tags:
                        query.page === 1
                            ? [{ id: 1, name: "A", object_type: "asset" }]
                            : [],
                },
                total: 1,
                perPage: 100,
            };
        });

        const result = await getAllInternalTags(
            { spaceId: "111", objectType: "asset" },
            { spaceId: "111", sbApi: { get } } as any,
        );

        expect(result.internal_tags).toEqual([
            { id: 1, name: "A", object_type: "asset" },
        ]);
        expect(calls.length).toBeGreaterThan(0);
        expect(
            calls.every((call) => call.query.by_object_type === "asset"),
        ).toBe(true);
        expect(calls[0].path).toBe("spaces/111/internal_tags/");
        expect(calls[0].query).toMatchObject({ per_page: 100, page: 1 });
    });
});

describe("copy assets: the help tells the truth about tags (R7)", () => {
    // R7 canary. Mutation that must turn it red: drop the gotcha, or promise
    // that copy assets creates the tags it cannot create.
    it("says tags are matched by name and never created", () => {
        expect(copyDescription).toContain(
            "including each asset's alt, title, copyright and its internal tags",
        );
        expect(copyDescription).toContain(
            "matches internal tags by name and never creates or removes one",
        );
        expect(copyDescription).toContain(
            "a tag it lacks is named in the PLAN so you can create it in Storyblok",
        );
    });
});

describe("copy assets: internal tags", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mocks.getAllInternalTags.mockResolvedValue({ internal_tags: [] });
        mocks.getAllAssetFolders.mockResolvedValue({ asset_folders: [] });
        mocks.getAllAssets.mockImplementation(({ spaceId }: any) =>
            Promise.resolve(
                spaceId === "111"
                    ? { assets: [sourceAsset()] }
                    : { assets: [] },
            ),
        );
        mocks.downloadAsset.mockResolvedValue("/tmp/one.jpg");
        mocks.createAssetAndFinalize.mockResolvedValue({
            id: 7000,
            filename:
                "https://a.storyblok.com/f/222/1200x630/9c8d7e6f5a/one.jpg",
            asset_folder_id: null,
        });
        mocks.updateAsset.mockResolvedValue({});
        mocks.getSpace.mockResolvedValue({ space: { languages: [] } });
        mocks.sbApiGet.mockResolvedValue({
            data: { space: { languages: [] } },
        });
    });

    // R1 canary. Mutation that must turn it red: list the tags without
    // `by_object_type` (the bare endpoint answers 403 to a personal token).
    it("reads both spaces' asset tags, always by object type", async () => {
        const tempDir = await mkdtemp(path.join(tmpdir(), "sb-mig-tags-"));

        await runCopyAssets({
            dryRun: true,
            manifestRoot: path.join(tempDir, ".sb-mig"),
        });

        expect(mocks.getAllInternalTags.mock.calls).toEqual([
            [
                { spaceId: "111", objectType: "asset" },
                expect.objectContaining({ spaceId: "111" }),
            ],
            [
                { spaceId: "222", objectType: "asset" },
                expect.objectContaining({ spaceId: "222" }),
            ],
        ]);

        await rm(tempDir, { recursive: true, force: true });
    });

    // R2 canary. Mutations that must turn it red: create the missing tag (a
    // POST appears where the API refuses one); match by id instead of name.
    it("matches by name, names what is missing, and never writes a tag", async () => {
        const tempDir = await mkdtemp(path.join(tmpdir(), "sb-mig-tags-"));
        const outputPath = path.join(tempDir, "plan.json");

        mocks.getAllAssets.mockImplementation(({ spaceId }: any) =>
            Promise.resolve(
                spaceId === "111"
                    ? {
                          assets: [
                              sourceAsset({ internal_tag_ids: [10, 11] }),
                              sourceAsset({ id: 701, internal_tag_ids: [] }),
                          ],
                      }
                    : { assets: [] },
            ),
        );
        mocks.getAllInternalTags.mockImplementation(({ spaceId }: any) =>
            Promise.resolve(
                spaceId === "111"
                    ? {
                          // `C` exists in the source and no selected asset uses
                          // it: it is neither matched nor named.
                          internal_tags: [
                              tag(10, "A"),
                              tag(11, "B"),
                              tag(12, "C"),
                          ],
                      }
                    : { internal_tags: [tag(91, " B ")] },
            ),
        );

        await runCopyAssets({
            dryRun: true,
            outputPath,
            manifestRoot: path.join(tempDir, ".sb-mig"),
        });

        const report = JSON.parse(await readFile(outputPath, "utf8"));

        expect(report.internalTags).toEqual({
            matched: ["B"],
            missing: ["A"],
            assetsWithMissingTags: 1,
        });
        expect(printedLines()).toContain(
            "[dry-run]  internal tags: 1 matched, 1 missing in space 222 — create them in Storyblok (Assets → Tags) and rerun: A",
        );
        // Nothing may write a tag: the Management API refuses it anyway.
        expect(JSON.stringify(mocks.getAllInternalTags.mock.calls)).not.toMatch(
            /post|create/i,
        );

        await rm(tempDir, { recursive: true, force: true });
    });

    it("says nothing about tags when no selected asset carries one", async () => {
        const tempDir = await mkdtemp(path.join(tmpdir(), "sb-mig-tags-"));
        const outputPath = path.join(tempDir, "plan.json");

        mocks.getAllInternalTags.mockImplementation(({ spaceId }: any) =>
            Promise.resolve({
                internal_tags: spaceId === "111" ? [tag(10, "A")] : [],
            }),
        );

        await runCopyAssets({
            dryRun: true,
            outputPath,
            manifestRoot: path.join(tempDir, ".sb-mig"),
        });

        const report = JSON.parse(await readFile(outputPath, "utf8"));

        expect(report.internalTags).toEqual({
            matched: [],
            missing: [],
            assetsWithMissingTags: 0,
        });
        expect(
            printedLines().filter((line) => line.includes("internal tags:")),
        ).toEqual([]);

        await rm(tempDir, { recursive: true, force: true });
    });

    // R3 canary. Mutation that must turn it red: send the source's own tag
    // ids (what the released version does, and what Storyblok rejects).
    it("writes the target's tag ids with the metadata", async () => {
        const tempDir = await mkdtemp(path.join(tmpdir(), "sb-mig-tags-"));

        mocks.getAllAssets.mockImplementation(({ spaceId }: any) =>
            Promise.resolve(
                spaceId === "111"
                    ? { assets: [sourceAsset({ internal_tag_ids: [10, 11] })] }
                    : { assets: [] },
            ),
        );
        mocks.getAllInternalTags.mockImplementation(({ spaceId }: any) =>
            Promise.resolve(
                spaceId === "111"
                    ? { internal_tags: [tag(10, "A"), tag(11, "B")] }
                    : { internal_tags: [tag(90, "A"), tag(91, "B")] },
            ),
        );

        await runCopyAssets({
            yes: true,
            manifestRoot: path.join(tempDir, ".sb-mig"),
        });

        expect(mocks.updateAsset).toHaveBeenCalledTimes(1);
        expect(mocks.updateAsset.mock.calls[0][0]).toMatchObject({
            spaceId: "222",
            assetId: 7000,
            payload: { alt: "the alt text", internal_tag_ids: [90, 91] },
        });

        await rm(tempDir, { recursive: true, force: true });
    });

    // R3 canary. Mutation that must turn it red: send the unmapped id anyway,
    // which makes Storyblok reject the whole payload and loses the alt text.
    it("keeps the alt when every tag of an asset is missing", async () => {
        const tempDir = await mkdtemp(path.join(tmpdir(), "sb-mig-tags-"));

        mocks.getAllAssets.mockImplementation(({ spaceId }: any) =>
            Promise.resolve(
                spaceId === "111"
                    ? { assets: [sourceAsset({ internal_tag_ids: [10] })] }
                    : { assets: [] },
            ),
        );
        mocks.getAllInternalTags.mockImplementation(({ spaceId }: any) =>
            Promise.resolve({
                internal_tags: spaceId === "111" ? [tag(10, "A")] : [],
            }),
        );

        await runCopyAssets({
            yes: true,
            manifestRoot: path.join(tempDir, ".sb-mig"),
        });

        const payload = mocks.updateAsset.mock.calls[0][0].payload;

        expect(payload.alt).toBe("the alt text");
        expect("internal_tag_ids" in payload).toBe(false);

        await rm(tempDir, { recursive: true, force: true });
    });

    // R4 canary. Mutation that must turn it red: stop writing `internal_tag`
    // ledger entries, or stop reading them back into the maps.
    it("records every matched tag in the ledger and reads it back", async () => {
        const tempDir = await mkdtemp(path.join(tmpdir(), "sb-mig-tags-"));
        const manifestRoot = path.join(tempDir, ".sb-mig");

        mocks.getAllAssets.mockImplementation(({ spaceId }: any) =>
            Promise.resolve(
                spaceId === "111"
                    ? { assets: [sourceAsset({ internal_tag_ids: [10] })] }
                    : { assets: [] },
            ),
        );
        mocks.getAllInternalTags.mockImplementation(({ spaceId }: any) =>
            Promise.resolve(
                spaceId === "111"
                    ? { internal_tags: [tag(10, "A")] }
                    : { internal_tags: [tag(90, "A")] },
            ),
        );

        await runCopyAssets({ yes: true, manifestRoot });

        const tagEntries = (await readLedger(manifestRoot)).filter(
            (entry) => entry.type === "internal_tag",
        );

        expect(tagEntries).toEqual([
            expect.objectContaining({
                type: "internal_tag",
                source_space_id: "111",
                target_space_id: "222",
                source_id: 10,
                target_id: 90,
                name: "A",
                object_type: "asset",
                action: "matched_by_target_key",
            }),
        ]);

        await rm(tempDir, { recursive: true, force: true });
    });

    // R4 canary. Mutation that must turn it red: ignore the ledger's tag
    // lines, so a tag renamed in the target loses its mapping.
    it("keeps a mapping the ledger holds even when the target renamed the tag", async () => {
        const tempDir = await mkdtemp(path.join(tmpdir(), "sb-mig-tags-"));
        const manifestRoot = path.join(tempDir, ".sb-mig");

        await writeLedger(manifestRoot, [
            {
                type: "internal_tag",
                source_space_id: "111",
                target_space_id: "222",
                source_id: 10,
                target_id: 90,
                name: "A",
                object_type: "asset",
                action: "matched_by_target_key",
                created_at: "2026-09-23T00:00:00.000Z",
            },
        ]);

        mocks.getAllAssets.mockImplementation(({ spaceId }: any) =>
            Promise.resolve(
                spaceId === "111"
                    ? { assets: [sourceAsset({ internal_tag_ids: [10] })] }
                    : { assets: [] },
            ),
        );
        mocks.getAllInternalTags.mockImplementation(({ spaceId }: any) =>
            Promise.resolve(
                spaceId === "111"
                    ? { internal_tags: [tag(10, "A")] }
                    : // The same tag, renamed by hand in the target.
                      { internal_tags: [tag(90, "A (renamed)")] },
            ),
        );

        await runCopyAssets({ yes: true, manifestRoot });

        expect(mocks.updateAsset.mock.calls[0][0].payload).toMatchObject({
            internal_tag_ids: [90],
        });

        await rm(tempDir, { recursive: true, force: true });
    });

    // R5 canary. Mutation that must turn it red: skip the metadata write for
    // an asset the run matched instead of created.
    it("re-writes the metadata of an asset that was already copied", async () => {
        const tempDir = await mkdtemp(path.join(tmpdir(), "sb-mig-tags-"));
        const manifestRoot = path.join(tempDir, ".sb-mig");

        await writeLedger(manifestRoot, [
            {
                type: "asset",
                source_space_id: "111",
                target_space_id: "222",
                source_id: 700,
                target_id: 7000,
                source_filename:
                    "https://a.storyblok.com/f/111/1200x630/2b7c4d6e9a/one.jpg",
                target_filename:
                    "https://a.storyblok.com/f/222/1200x630/9c8d7e6f5a/one.jpg",
                action: "created",
                created_at: "2026-09-23T00:00:00.000Z",
            },
        ]);

        mocks.getAllAssets.mockImplementation(({ spaceId }: any) =>
            Promise.resolve(
                spaceId === "111"
                    ? { assets: [sourceAsset({ internal_tag_ids: [10] })] }
                    : {
                          assets: [
                              {
                                  id: 7000,
                                  filename:
                                      "https://a.storyblok.com/f/222/1200x630/9c8d7e6f5a/one.jpg",
                              },
                          ],
                      },
            ),
        );
        mocks.getAllInternalTags.mockImplementation(({ spaceId }: any) =>
            Promise.resolve(
                spaceId === "111"
                    ? { internal_tags: [tag(10, "A")] }
                    : { internal_tags: [tag(90, "A")] },
            ),
        );

        await runCopyAssets({ yes: true, manifestRoot });

        // Nothing is uploaded again, and the metadata lands anyway: this is
        // how an asset that lost its alt to a rejected tag id gets it back.
        expect(mocks.createAssetAndFinalize).not.toHaveBeenCalled();
        expect(mocks.updateAsset).toHaveBeenCalledTimes(1);
        expect(mocks.updateAsset.mock.calls[0][0]).toMatchObject({
            assetId: 7000,
            payload: { alt: "the alt text", internal_tag_ids: [90] },
        });

        await rm(tempDir, { recursive: true, force: true });
    });

    // R5 canary, the second matched path (MAR-3354 lap 3, A). Mutation that
    // must turn it red: replace the `writeAssetMetadata` call of the
    // target-key-matched branch with the bare outcome.
    //
    // This is the path a run takes after a native space duplicate with a fresh
    // or lost --manifestRoot: the file is already in the target, no ledger line
    // maps it, and it is found by its file name. Its metadata has to be written
    // too, or the assets that lost their alt keep it lost.
    it("writes the metadata of an asset the target already holds by file name", async () => {
        const tempDir = await mkdtemp(path.join(tmpdir(), "sb-mig-tags-"));
        // No ledger at all: the match can only come from the target listing.
        const manifestRoot = path.join(tempDir, ".sb-mig");

        mocks.getAllAssets.mockImplementation(({ spaceId }: any) =>
            Promise.resolve(
                spaceId === "111"
                    ? { assets: [sourceAsset({ internal_tag_ids: [10] })] }
                    : {
                          assets: [
                              {
                                  id: 7001,
                                  filename:
                                      "https://a.storyblok.com/f/222/1200x630/9c8d7e6f5a/one.jpg",
                                  asset_folder_id: null,
                              },
                          ],
                      },
            ),
        );
        mocks.getAllInternalTags.mockImplementation(({ spaceId }: any) =>
            Promise.resolve(
                spaceId === "111"
                    ? { internal_tags: [tag(10, "A")] }
                    : { internal_tags: [tag(90, "A")] },
            ),
        );

        await runCopyAssets({ yes: true, manifestRoot });

        // Matched by file name, not uploaded again, and its metadata written.
        expect(mocks.createAssetAndFinalize).not.toHaveBeenCalled();
        expect(mocks.updateAsset).toHaveBeenCalledTimes(1);
        expect(mocks.updateAsset.mock.calls[0][0]).toMatchObject({
            spaceId: "222",
            assetId: 7001,
            payload: { alt: "the alt text", internal_tag_ids: [90] },
        });
        expect(
            (await readLedger(manifestRoot)).filter(
                (entry) => entry.type === "asset",
            ),
        ).toEqual([
            expect.objectContaining({
                source_id: 700,
                target_id: 7001,
                action: "matched_by_target_key",
            }),
        ]);

        await rm(tempDir, { recursive: true, force: true });
    });

    // R6 canary. Mutation that must turn it red: drop `internalTags` from the
    // apply report, or stop printing the line before the first write.
    it("prints the line and reports the names on an apply run", async () => {
        const tempDir = await mkdtemp(path.join(tmpdir(), "sb-mig-tags-"));
        const outputPath = path.join(tempDir, "applied.json");

        mocks.getAllAssets.mockImplementation(({ spaceId }: any) =>
            Promise.resolve(
                spaceId === "111"
                    ? { assets: [sourceAsset({ internal_tag_ids: [10, 11] })] }
                    : { assets: [] },
            ),
        );
        mocks.getAllInternalTags.mockImplementation(({ spaceId }: any) =>
            Promise.resolve(
                spaceId === "111"
                    ? { internal_tags: [tag(10, "zeta"), tag(11, "alpha")] }
                    : { internal_tags: [tag(91, "alpha")] },
            ),
        );

        await runCopyAssets({
            yes: true,
            outputPath,
            manifestRoot: path.join(tempDir, ".sb-mig"),
        });

        const report = JSON.parse(await readFile(outputPath, "utf8"));

        expect(report.internalTags).toEqual({
            matched: ["alpha"],
            missing: ["zeta"],
            assetsWithMissingTags: 1,
        });
        expect(printedLines()).toContain(
            "  internal tags: 1 matched, 1 missing in space 222 — create them in Storyblok (Assets → Tags) and rerun: zeta",
        );

        await rm(tempDir, { recursive: true, force: true });
    });
});
