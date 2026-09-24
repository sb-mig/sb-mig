import { beforeEach, describe, expect, it, vi } from "vitest";

// Retries pause for real otherwise; a 500 is transient and retried twice.
vi.mock("../../src/utils/async-utils.js", async (importOriginal) => ({
    ...(await importOriginal<object>()),
    delay: async () => {},
}));

vi.mock("../../src/utils/logger.js", () => ({
    default: {
        log: vi.fn(),
        success: vi.fn(),
        warning: vi.fn(),
        error: vi.fn(),
    },
}));

import {
    getAllComponents,
    getAllComponentsGroups,
} from "../../src/api/components/components.js";
import { getAllDatasources } from "../../src/api/datasources/datasources.js";
import { getAllPlugins } from "../../src/api/plugins/plugins.js";
import { getAllPresets } from "../../src/api/presets/presets.js";
import { getAllRoles } from "../../src/api/roles/roles.js";

const failing = (status: number) => ({
    spaceId: "12345",
    sbApi: {
        get: vi.fn(async () => {
            throw Object.assign(new Error(`status ${status}`), {
                status,
                response: { status },
            });
        }),
    },
});

const answering = (key: string, items: any[]) => ({
    spaceId: "12345",
    sbApi: {
        get: vi.fn(async () => ({ data: { [key]: items } })),
    },
});

/**
 * MAR-3139 R4: an error never becomes an empty list. Where Storyblok answers
 * 404 for "this space has none of these", the caller says so explicitly.
 */
describe("listing callers — none is explicit, a failure is never none (MAR-3139 R4)", () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    const callers: [string, (config: any) => Promise<any>, string][] = [
        ["presets", getAllPresets, "presets"],
        ["roles", getAllRoles, "space_roles"],
        ["datasources", getAllDatasources, "datasources"],
        ["component groups", getAllComponentsGroups, "component_groups"],
        ["components", getAllComponents, "components"],
        ["plugins", getAllPlugins, "field_types"],
    ];

    // Mutation that must turn these red: restore one caller's
    // `.catch(err => Logger.error(err))` (or its `return false`).
    it.each(callers)("%s: a 500 rejects", async (_name, list, key) => {
        await expect(list(failing(500))).rejects.toThrow(
            `Listing ${key} failed on page 1 of ?: status 500 (after 3 attempts)`,
        );
    });

    it.each(callers)(
        "%s: a listing that answers returns its items",
        async (_name, list, key) => {
            await expect(
                list(answering(key, [{ id: 1 }, { id: 2 }])),
            ).resolves.toEqual([{ id: 1 }, { id: 2 }]);
        },
    );

    const noneOn404 = callers.slice(0, 4);

    it.each(noneOn404)(
        "%s: a 404 is an explicit empty list",
        async (_name, list) => {
            await expect(list(failing(404))).resolves.toEqual([]);
        },
    );

    it.each(callers.slice(4))(
        "%s: a 404 is not read as none",
        async (_name, list, key) => {
            await expect(list(failing(404))).rejects.toThrow(
                `Listing ${key} failed on page 1 of ?: status 404`,
            );
        },
    );

    it("datasources: passes the page on, so page 2 is not page 1 again", async () => {
        const config = answering("datasources", [{ id: 1 }]);

        await getAllDatasources(config as any);

        expect(config.sbApi.get).toHaveBeenCalledWith(
            "spaces/12345/datasources/",
            { per_page: 100, page: 1 },
        );
    });
});
