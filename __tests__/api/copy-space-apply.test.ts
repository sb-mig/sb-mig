import { describe, expect, it, vi } from "vitest";

import { readCopySpaceSnapshot } from "../../src/api/copy/space-apply.js";

/**
 * A client whose `components` listing is paged as Storyblok pages it, and whose
 * `component_groups` listing (read alongside components) is one empty page.
 */
const pagedClient = ({
    total,
    perPage,
    pageSizes,
}: {
    total?: number;
    perPage?: number;
    pageSizes: number[];
}) => {
    const get = vi.fn(async (path: string, params: any = {}) => {
        if (path.endsWith("/component_groups/")) {
            return { data: { component_groups: [] } };
        }

        const size = pageSizes[params.page - 1] ?? 0;

        return {
            data: {
                components: Array.from({ length: size }, (_, index) => ({
                    id: params.page * 1000 + index,
                    name: `component-${params.page}-${index}`,
                })),
            },
            ...(total !== undefined ? { total } : {}),
            ...(perPage !== undefined ? { perPage } : {}),
        };
    });

    return { get, post: vi.fn(), put: vi.fn() };
};

const componentPages = (get: ReturnType<typeof vi.fn>) =>
    get.mock.calls
        .filter(([path]) => String(path).endsWith("/components/"))
        .map(([, params]) => params.page);

describe("copy space: reading every page", () => {
    // F7 canary. Mutation that must turn it red: in readAll, set
    // `totalPages = 1` whatever `total` says.
    it("reads every page when the response reports a total", async () => {
        const client = pagedClient({
            total: 250,
            perPage: 100,
            pageSizes: [100, 100, 50],
        });

        const snapshot = await readCopySpaceSnapshot({
            sbApi: client,
            spaceId: "111",
            resources: ["components"],
        });

        expect(componentPages(client.get)).toEqual([1, 2, 3]);
        expect(snapshot.components).toHaveLength(250);
        expect(snapshot.components[0]?.name).toBe("component-1-0");
        expect(snapshot.components[249]?.name).toBe("component-3-49");
    });

    it("reads one page when the response reports no total", async () => {
        const client = pagedClient({ pageSizes: [7] });

        const snapshot = await readCopySpaceSnapshot({
            sbApi: client,
            spaceId: "111",
            resources: ["components"],
        });

        expect(componentPages(client.get)).toEqual([1]);
        expect(snapshot.components).toHaveLength(7);
    });
});
