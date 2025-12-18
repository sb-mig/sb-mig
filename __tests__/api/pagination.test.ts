import { describe, it, expect, vi, beforeEach } from "vitest";

import { getAllItemsWithPagination } from "../../src/api/utils/request.js";

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
});
