import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { syncComponentsData } from "../../src/api/components/components.sync.js";
import Logger from "../../src/utils/logger.js";
import {
    createMockApiConfig,
    createPaginatedResponse,
} from "../mocks/storyblokClient.mock.js";

vi.mock("../../src/utils/logger.js", () => ({
    default: {
        log: vi.fn(),
        success: vi.fn(),
        warning: vi.fn(),
        error: vi.fn(),
    },
}));

describe("sync components SSOT", () => {
    let consoleErrorSpy: ReturnType<typeof vi.spyOn>;

    beforeEach(() => {
        vi.clearAllMocks();
        consoleErrorSpy = vi
            .spyOn(console, "error")
            .mockImplementation(() => undefined);
    });

    afterEach(() => {
        consoleErrorSpy.mockRestore();
    });

    it("continues syncing when a remote component cannot be removed", async () => {
        const config = createMockApiConfig();
        let componentReads = 0;

        config.sbApi.get.mockImplementation((path: string) => {
            if (path.includes("component_groups")) {
                return Promise.resolve(
                    createPaginatedResponse([], "component_groups"),
                );
            }

            componentReads++;
            const components =
                componentReads === 1
                    ? [
                          { id: 1, name: "page" },
                          { id: 2, name: "obsolete" },
                      ]
                    : [{ id: 1, name: "page" }];

            return Promise.resolve(
                createPaginatedResponse(components, "components"),
            );
        });

        config.sbApi.delete.mockImplementation((path: string) => {
            if (path.includes("/components/1")) {
                return Promise.reject(
                    new Error("Cannot delete default content type"),
                );
            }

            return Promise.resolve({ data: {} });
        });
        config.sbApi.put.mockResolvedValue({ data: {} });
        config.sbApi.post.mockResolvedValue({ data: {} });

        const result = await syncComponentsData(
            {
                components: [{ name: "page" }, { name: "card" }],
                presets: false,
                ssot: true,
            },
            config,
        );

        expect(config.sbApi.delete).toHaveBeenCalledTimes(2);
        expect(config.sbApi.put).toHaveBeenCalledWith(
            "spaces/12345/components/1",
            { component: { id: 1, name: "page", component_group_uuid: null } },
        );
        expect(config.sbApi.post).toHaveBeenCalledWith(
            "spaces/12345/components/",
            { component: { name: "card", component_group_uuid: null } },
        );
        expect(result.created).toEqual(["card"]);
        expect(result.updated).toEqual(["page"]);
        expect(result.skipped).toEqual(["component 'page'"]);
        expect(result.errors).toEqual([
            {
                name: "component 'page'",
                message:
                    "SSOT removal failed: Cannot delete default content type",
            },
        ]);
        expect(Logger.warning).toHaveBeenCalledWith(
            "Could not remove component 'page' during SSOT sync: Cannot delete default content type",
        );
    });
});
