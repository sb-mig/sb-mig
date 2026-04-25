import { beforeEach, describe, expect, it, vi } from "vitest";

import { syncComponentsData } from "../../src/api/components/components.sync.js";
import { syncPluginsData } from "../../src/api/plugins/plugins.js";
import { syncRolesData } from "../../src/api/roles/roles.js";
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

describe("sync dry-run", () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it("plans component creates and updates without API writes", async () => {
        const config = createMockApiConfig();

        config.sbApi.get.mockImplementation((path: string) => {
            if (path.includes("component_groups")) {
                return Promise.resolve(
                    createPaginatedResponse([], "component_groups"),
                );
            }

            return Promise.resolve(
                createPaginatedResponse(
                    [{ id: 1, name: "hero" }],
                    "components",
                ),
            );
        });

        const result = await syncComponentsData(
            {
                components: [{ name: "hero" }, { name: "card" }],
                presets: false,
                dryRun: true,
            },
            config,
        );

        expect(result).toMatchObject({
            created: ["card"],
            updated: ["hero"],
            skipped: [],
            errors: [],
        });
        expect(config.sbApi.post).not.toHaveBeenCalled();
        expect(config.sbApi.put).not.toHaveBeenCalled();
        expect(config.sbApi.delete).not.toHaveBeenCalled();
    });

    it("plans role creates and updates without API writes", async () => {
        const config = createMockApiConfig();
        config.sbApi.get.mockResolvedValue(
            createPaginatedResponse(
                [{ id: 1, role: "Editor" }],
                "space_roles",
            ),
        );

        const result = await syncRolesData(
            {
                roles: [{ role: "Editor" }, { role: "Publisher" }],
                dryRun: true,
            },
            config,
        );

        expect(result).toMatchObject({
            created: ["Publisher"],
            updated: ["Editor"],
            skipped: [],
            errors: [],
        });
        expect(config.sbApi.post).not.toHaveBeenCalled();
        expect(config.sbApi.put).not.toHaveBeenCalled();
    });

    it("plans plugin creates and updates without API writes", async () => {
        const config = createMockApiConfig();
        config.sbApi.get.mockResolvedValue(
            createPaginatedResponse(
                [{ id: 1, name: "color-picker" }],
                "field_types",
            ),
        );

        const result = await syncPluginsData(
            {
                plugins: [
                    { name: "color-picker", body: "" },
                    { name: "link-picker", body: "" },
                ],
                dryRun: true,
            },
            config,
        );

        expect(result).toMatchObject({
            created: ["link-picker"],
            updated: ["color-picker"],
            skipped: [],
            errors: [],
        });
        expect(config.sbApi.post).not.toHaveBeenCalled();
        expect(config.sbApi.put).not.toHaveBeenCalled();
    });
});
