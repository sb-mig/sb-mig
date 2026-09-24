import { describe, it, expect, vi, beforeEach } from "vitest";

import { getAllItemsWithPagination } from "../../src/api/utils/request.js";
import Logger from "../../src/utils/logger.js";

// Mock Logger to prevent console output during tests
vi.mock("../../src/utils/logger.js", () => ({
    default: {
        log: vi.fn(),
        success: vi.fn(),
        warning: vi.fn(),
        error: vi.fn(),
    },
}));

describe("getAllItemsWithPagination", () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it("should fetch all items in a single page when total <= perPage", async () => {
        const mockItems = [
            { id: 1, name: "item1" },
            { id: 2, name: "item2" },
            { id: 3, name: "item3" },
        ];

        const apiFn = vi.fn().mockResolvedValue({
            data: { items: mockItems },
            total: 3,
            perPage: 100,
        });

        const result = await getAllItemsWithPagination({
            apiFn,
            params: { spaceId: "12345" },
            itemsKey: "items",
        });

        expect(result).toEqual(mockItems);
        expect(apiFn).toHaveBeenCalledTimes(1);
        expect(apiFn).toHaveBeenCalledWith({
            per_page: 100,
            page: 1,
            spaceId: "12345",
        });
    });

    it("should fetch all items across multiple pages", async () => {
        const page1Items = Array.from({ length: 100 }, (_, i) => ({
            id: i + 1,
            name: `item${i + 1}`,
        }));
        const page2Items = Array.from({ length: 50 }, (_, i) => ({
            id: i + 101,
            name: `item${i + 101}`,
        }));

        const apiFn = vi
            .fn()
            .mockResolvedValueOnce({
                data: { items: page1Items },
                total: 150,
                perPage: 100,
            })
            .mockResolvedValueOnce({
                data: { items: page2Items },
                total: 150,
                perPage: 100,
            });

        const result = await getAllItemsWithPagination({
            apiFn,
            params: { spaceId: "12345" },
            itemsKey: "items",
        });

        expect(result.length).toBe(150);
        expect(apiFn).toHaveBeenCalledTimes(2);
        expect(apiFn).toHaveBeenNthCalledWith(1, {
            per_page: 100,
            page: 1,
            spaceId: "12345",
        });
        expect(apiFn).toHaveBeenNthCalledWith(2, {
            per_page: 100,
            page: 2,
            spaceId: "12345",
        });
    });

    it("should handle empty results", async () => {
        const apiFn = vi.fn().mockResolvedValue({
            data: { items: [] },
            total: 0,
            perPage: 100,
        });

        const result = await getAllItemsWithPagination({
            apiFn,
            params: { spaceId: "12345" },
            itemsKey: "items",
        });

        expect(result).toEqual([]);
        expect(apiFn).toHaveBeenCalledTimes(1);
    });

    it("should work with different itemsKey values", async () => {
        const mockComponents = [
            { id: 1, name: "component1" },
            { id: 2, name: "component2" },
        ];

        const apiFn = vi.fn().mockResolvedValue({
            data: { components: mockComponents },
            total: 2,
            perPage: 100,
        });

        const result = await getAllItemsWithPagination({
            apiFn,
            params: { spaceId: "12345" },
            itemsKey: "components",
        });

        expect(result).toEqual(mockComponents);
    });

    it("should handle three pages of results", async () => {
        const page1Items = Array.from({ length: 100 }, (_, i) => ({
            id: i + 1,
        }));
        const page2Items = Array.from({ length: 100 }, (_, i) => ({
            id: i + 101,
        }));
        const page3Items = Array.from({ length: 25 }, (_, i) => ({
            id: i + 201,
        }));

        const apiFn = vi
            .fn()
            .mockResolvedValueOnce({
                data: { items: page1Items },
                total: 225,
                perPage: 100,
            })
            .mockResolvedValueOnce({
                data: { items: page2Items },
                total: 225,
                perPage: 100,
            })
            .mockResolvedValueOnce({
                data: { items: page3Items },
                total: 225,
                perPage: 100,
            });

        const result = await getAllItemsWithPagination({
            apiFn,
            params: { spaceId: "12345" },
            itemsKey: "items",
        });

        expect(result.length).toBe(225);
        expect(apiFn).toHaveBeenCalledTimes(3);
    });

    it("should pass additional params to apiFn", async () => {
        const apiFn = vi.fn().mockResolvedValue({
            data: { items: [] },
            total: 0,
            perPage: 100,
        });

        await getAllItemsWithPagination({
            apiFn,
            params: { spaceId: "12345", customParam: "value" },
            itemsKey: "items",
        });

        expect(apiFn).toHaveBeenCalledWith({
            per_page: 100,
            page: 1,
            spaceId: "12345",
            customParam: "value",
        });
    });

    describe("every item or it throws (MAR-3139)", () => {
        const noWait = { delays: [0, 0], sleep: async () => {} };
        const ids = (from: number, count: number) =>
            Array.from({ length: count }, (_, i) => ({ id: from + i }));
        const page = (key: string, items: any[], total: number) => ({
            data: { [key]: items },
            total,
            perPage: 100,
        });
        const warnings = () =>
            (
                Logger.warning as unknown as ReturnType<typeof vi.fn>
            ).mock.calls.map((call) => String(call[0]));

        // R1 canary. Mutation that must turn it red: restore `return allItems`
        // for a page without data.
        it("throws, naming the resource, page and cause, when a page has no data", async () => {
            const apiFn = vi
                .fn()
                .mockResolvedValueOnce(page("stories", ids(1, 100), 250))
                .mockResolvedValueOnce(undefined);

            await expect(
                getAllItemsWithPagination({
                    apiFn,
                    params: {},
                    itemsKey: "stories",
                    retry: noWait,
                }),
            ).rejects.toThrow(
                "Listing stories failed on page 2 of 3: the response carried no data",
            );
            expect(apiFn).toHaveBeenCalledTimes(2);
        });

        it("throws on a final error, with the cause and without retrying it", async () => {
            const apiFn = vi
                .fn()
                .mockResolvedValueOnce(page("assets", ids(1, 100), 250))
                .mockRejectedValueOnce(
                    Object.assign(new Error("Forbidden"), { status: 403 }),
                );

            await expect(
                getAllItemsWithPagination({
                    apiFn,
                    params: {},
                    itemsKey: "assets",
                    retry: noWait,
                }),
            ).rejects.toThrow(
                "Listing assets failed on page 2 of 3: Forbidden",
            );
            expect(apiFn).toHaveBeenCalledTimes(2);
        });

        it("names the attempts when a transient failure outlasts its retries", async () => {
            const drop = Object.assign(new Error("read ECONNRESET"), {
                code: "ECONNRESET",
            });
            const apiFn = vi
                .fn()
                .mockResolvedValueOnce(page("stories", ids(1, 100), 150))
                .mockRejectedValue(drop);

            await expect(
                getAllItemsWithPagination({
                    apiFn,
                    params: {},
                    itemsKey: "stories",
                    retry: noWait,
                }),
            ).rejects.toThrow(
                "Listing stories failed on page 2 of 2: read ECONNRESET (after 3 attempts)",
            );
            expect(apiFn).toHaveBeenCalledTimes(4);
        });

        it("says the page count is not known yet when page 1 fails", async () => {
            const apiFn = vi
                .fn()
                .mockRejectedValue(
                    Object.assign(new Error("Unauthorized"), { status: 401 }),
                );

            await expect(
                getAllItemsWithPagination({
                    apiFn,
                    params: {},
                    itemsKey: "components",
                    retry: noWait,
                }),
            ).rejects.toThrow(
                "Listing components failed on page 1 of ?: Unauthorized",
            );
        });

        // R2 canary. Mutation that must turn it red: call apiFn without
        // withRetry.
        it("retries a dropped page once and returns the full list with one retry line", async () => {
            const apiFn = vi
                .fn()
                .mockResolvedValueOnce(page("stories", ids(1, 100), 150))
                .mockRejectedValueOnce(
                    Object.assign(new Error("read ECONNRESET"), {
                        code: "ECONNRESET",
                    }),
                )
                .mockResolvedValueOnce(page("stories", ids(101, 50), 150));

            const result = await getAllItemsWithPagination({
                apiFn,
                params: { spaceId: "12345" },
                itemsKey: "stories",
                retry: noWait,
            });

            expect(result).toEqual(ids(1, 150));
            expect(apiFn).toHaveBeenCalledTimes(3);
            expect(
                warnings().filter((line) => line.startsWith("retrying ")),
            ).toEqual([
                "retrying listing stories page 2 for 'space 12345' (1/2) after read ECONNRESET",
            ]);
        });

        // R3 canary. Mutation that must turn it red: return the first read
        // without checking it (skip the re-read).
        it("reads a shifted listing again and returns the clean second read", async () => {
            // Read 1: an item inserted at the front pushes item 100 onto
            // page 2, where it is listed twice. Read 2: clean.
            const apiFn = vi
                .fn()
                .mockResolvedValueOnce(page("assets", ids(1, 100), 150))
                .mockResolvedValueOnce(page("assets", ids(100, 50), 150))
                .mockResolvedValueOnce(page("assets", ids(1, 100), 150))
                .mockResolvedValueOnce(page("assets", ids(101, 50), 150));

            const result = await getAllItemsWithPagination({
                apiFn,
                params: {},
                itemsKey: "assets",
                retry: noWait,
            });

            expect(result).toEqual(ids(1, 150));
            expect(apiFn).toHaveBeenCalledTimes(4);
            expect(warnings()).toContain(
                "Listing assets changed while it was read (got 149 distinct of 150, 1 repeated); reading it again.",
            );
        });

        it("throws when the listing shifted on both reads", async () => {
            const apiFn = vi
                .fn()
                .mockResolvedValueOnce(page("assets", ids(1, 100), 150))
                .mockResolvedValueOnce(page("assets", ids(100, 50), 150))
                .mockResolvedValueOnce(page("assets", ids(1, 100), 150))
                .mockResolvedValueOnce(page("assets", ids(100, 50), 150));

            await expect(
                getAllItemsWithPagination({
                    apiFn,
                    params: {},
                    itemsKey: "assets",
                    retry: noWait,
                }),
            ).rejects.toThrow(
                "Listing assets changed while it was read (got 149 distinct of 150, 1 repeated)",
            );
            expect(apiFn).toHaveBeenCalledTimes(4);
        });

        it("reads again when an item was skipped (fewer distinct than the total)", async () => {
            // Read 1: an item deleted from page 1 pulls item 101 onto it, so
            // page 2 starts at 102 and 101 is never seen.
            const apiFn = vi
                .fn()
                .mockResolvedValueOnce(page("stories", ids(1, 100), 150))
                .mockResolvedValueOnce(page("stories", ids(102, 49), 150))
                .mockResolvedValueOnce(page("stories", ids(1, 100), 149))
                .mockResolvedValueOnce(page("stories", ids(101, 49), 149));

            const result = await getAllItemsWithPagination({
                apiFn,
                params: {},
                itemsKey: "stories",
                retry: noWait,
            });

            expect(result).toHaveLength(149);
            expect(apiFn).toHaveBeenCalledTimes(4);
        });

        it("keeps the repeat check for an endpoint that sends no total", async () => {
            const apiFn = vi
                .fn()
                .mockResolvedValueOnce({
                    data: { components: [{ id: 1 }, { id: 1 }] },
                })
                .mockResolvedValueOnce({
                    data: { components: [{ id: 1 }, { id: 1 }] },
                });

            await expect(
                getAllItemsWithPagination({
                    apiFn,
                    params: {},
                    itemsKey: "components",
                    retry: noWait,
                }),
            ).rejects.toThrow(
                "Listing components changed while it was read (got 1 distinct of ?, 1 repeated)",
            );
        });

        it("never reads a clean listing twice", async () => {
            const apiFn = vi
                .fn()
                .mockResolvedValueOnce(page("stories", ids(1, 100), 250))
                .mockResolvedValueOnce(page("stories", ids(101, 100), 250))
                .mockResolvedValueOnce(page("stories", ids(201, 50), 250));

            await getAllItemsWithPagination({
                apiFn,
                params: {},
                itemsKey: "stories",
                retry: noWait,
            });

            expect(apiFn).toHaveBeenCalledTimes(3);
            expect(
                warnings().some((line) =>
                    line.includes("changed while it was read"),
                ),
            ).toBe(false);
        });
    });
});
