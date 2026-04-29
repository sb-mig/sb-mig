import { beforeEach, describe, expect, it, vi } from "vitest";

import { syncDatasourcesData } from "../../src/api/datasources/datasources.js";
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

describe("datasource sync dry-run", () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it("plans existing datasource updates without API writes", async () => {
        const config = createMockApiConfig();

        config.sbApi.get.mockImplementation((path: string) => {
            if (path.includes("datasource_entries")) {
                return Promise.resolve({
                    data: {
                        datasource_entries: [
                            { id: 101, name: "red", value: "#f00" },
                        ],
                    },
                });
            }

            return Promise.resolve(
                createPaginatedResponse(
                    [
                        {
                            id: 1,
                            name: "colors",
                            slug: "colors",
                            dimensions: [],
                        },
                    ],
                    "datasources",
                ),
            );
        });

        const result = await syncDatasourcesData(
            {
                datasources: [
                    {
                        name: "colors",
                        slug: "colors",
                        dimensions: [],
                        datasource_entries: [
                            { name: "red", value: "#ff0000" },
                            { name: "blue", value: "#0000ff" },
                        ],
                    },
                ],
                dryRun: true,
            },
            config,
        );

        expect(result).toMatchObject({
            created: [],
            updated: ["colors"],
            skipped: [],
            errors: [],
        });
        expect(config.sbApi.post).not.toHaveBeenCalled();
        expect(config.sbApi.put).not.toHaveBeenCalled();
    });

    it("plans new datasource creation without API writes", async () => {
        const config = createMockApiConfig();
        config.sbApi.get.mockResolvedValue(
            createPaginatedResponse([], "datasources"),
        );

        const result = await syncDatasourcesData(
            {
                datasources: [
                    {
                        name: "colors",
                        slug: "colors",
                        dimensions: [],
                        datasource_entries: [
                            { name: "red", value: "#ff0000" },
                        ],
                    },
                ],
                dryRun: true,
            },
            config,
        );

        expect(result).toMatchObject({
            created: ["colors"],
            updated: [],
            skipped: [],
            errors: [],
        });
        expect(config.sbApi.post).not.toHaveBeenCalled();
        expect(config.sbApi.put).not.toHaveBeenCalled();
    });
});
