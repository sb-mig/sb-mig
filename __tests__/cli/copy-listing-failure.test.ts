import { mkdtemp, rm, stat } from "fs/promises";
import { tmpdir } from "os";
import path from "path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
    getStoryById: vi.fn(),
    getStoryBySlug: vi.fn(),
    getAllStories: vi.fn(),
    getStoriesByFullSlugs: vi.fn(),
    getAllComponents: vi.fn(),
    getSpace: vi.fn(),
    getAllAssets: vi.fn(),
    getAllAssetFolders: vi.fn(),
    getAssetById: vi.fn(),
    sbApiGet: vi.fn(),
    askYesNo: vi.fn(),
}));

vi.mock("../../src/cli/helpers.js", () => ({
    askYesNo: mocks.askYesNo,
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
            getStoryById: mocks.getStoryById,
            getStoryBySlug: mocks.getStoryBySlug,
            getAllStories: mocks.getAllStories,
            getStoriesByFullSlugs: mocks.getStoriesByFullSlugs,
        },
        components: { getAllComponents: mocks.getAllComponents },
        spaces: { getSpace: mocks.getSpace },
        assets: {
            getAllAssets: mocks.getAllAssets,
            getAllAssetFolders: mocks.getAllAssetFolders,
            getAssetById: mocks.getAssetById,
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

import { getAllStories as realGetAllStories } from "../../src/api/stories/stories.js";
import { copyCommand } from "../../src/cli/commands/copy.js";
import Logger from "../../src/utils/logger.js";

const printed = () =>
    [Logger.log, Logger.error, Logger.warning, Logger.success]
        .flatMap((fn) => (fn as unknown as ReturnType<typeof vi.fn>).mock.calls)
        .flatMap((call) => String(call[0]).split("\n"));

/** A dry-run states its plan as `[dry-run] Would create N item(s)`; an apply as a PLAN block. */
const printedPlan = () =>
    printed().some(
        (line) => line.trim() === "PLAN" || line.includes("Would create"),
    );

let failPage2 = true;

const stub = (id: number) => ({
    id,
    name: `s-${id}`,
    slug: `s-${id}`,
    full_slug: `blog/s-${id}`,
    is_folder: false,
    parent_id: 1,
    uuid: `u-${id}`,
});

describe("copy stories when a listing page fails for good (MAR-3139 R5)", () => {
    const stdin = process.stdin as any;
    const originalIsTTY = stdin.isTTY;
    const originalExitCode = process.exitCode;
    let tempDir: string;

    beforeEach(async () => {
        vi.clearAllMocks();
        stdin.isTTY = false;
        process.exitCode = undefined;
        failPage2 = true;
        tempDir = await mkdtemp(path.join(tmpdir(), "sb-mig-listing-"));

        const blog = {
            id: 1,
            name: "blog",
            slug: "blog",
            full_slug: "blog",
            is_folder: true,
            parent_id: 0,
            uuid: "blog-uuid",
            content: { component: "page" },
        };

        mocks.getStoryBySlug.mockImplementation(async (slug: string) =>
            slug === "blog" ? { story: blog } : undefined,
        );
        mocks.getStoryById.mockResolvedValue(undefined);
        mocks.getStoriesByFullSlugs.mockResolvedValue([]);
        mocks.getAllComponents.mockResolvedValue([
            { name: "page", schema: {} },
        ]);
        mocks.getSpace.mockResolvedValue({ space: { languages: [] } });

        // The real listing, over an API whose page 2 of 3 is refused.
        const sbApi = {
            get: vi.fn(async (url: string, query: any) => {
                if (
                    failPage2 &&
                    url.endsWith("/stories/") &&
                    query?.page === 2
                ) {
                    throw Object.assign(new Error("Forbidden"), {
                        status: 403,
                    });
                }

                if (url.endsWith("/stories/")) {
                    const size = query.page === 3 ? 50 : 100;
                    return {
                        data: {
                            stories: Array.from({ length: size }, (_, i) =>
                                stub(1000 * query.page + i),
                            ),
                        },
                        total: 250,
                        perPage: 100,
                    };
                }

                // The content read of each listed story.
                const id = Number(url.split("/").at(-1));

                return {
                    data: {
                        story: { ...stub(id), content: { component: "page" } },
                    },
                };
            }),
        };

        mocks.getAllStories.mockImplementation((args: any, config: any) =>
            realGetAllStories(args, { ...config, sbApi }),
        );
    });

    afterEach(async () => {
        stdin.isTTY = originalIsTTY;
        process.exitCode = originalExitCode;
        await rm(tempDir, { recursive: true, force: true });
    });

    // The command rejects; the CLI entry has no catch of its own, so Node
    // ends the process with exit 1 (proved on the built binary). The point
    // here: nothing is planned or written from a half-read listing.
    it("rejects naming the listing and page, prints no plan and writes no report", async () => {
        const reportPath = path.join(tempDir, "plan.json");

        await expect(
            copyCommand({
                input: ["copy", "stories"],
                flags: {
                    from: "source-space",
                    to: "target-space",
                    source: "blog",
                    destination: "/",
                    dryRun: true,
                    manifestRoot: path.join(tempDir, ".sb-mig"),
                    outputPath: reportPath,
                },
            } as any),
        ).rejects.toThrow("Listing stories failed on page 2 of 3: Forbidden");

        expect(printedPlan()).toBe(false);
        await expect(stat(reportPath)).rejects.toThrow();
    });

    // The control: the same run over a listing that answers every page does
    // print the PLAN and write the report, so the checks above mean something.
    it("plans and writes the report when every page answers", async () => {
        failPage2 = false;
        const reportPath = path.join(tempDir, "plan.json");

        await copyCommand({
            input: ["copy", "stories"],
            flags: {
                from: "source-space",
                to: "target-space",
                source: "blog",
                destination: "/",
                dryRun: true,
                manifestRoot: path.join(tempDir, ".sb-mig"),
                outputPath: reportPath,
            },
        } as any);

        expect(printedPlan()).toBe(true);
        await expect(stat(reportPath)).resolves.toBeTruthy();
    });
});
