import { beforeEach, describe, expect, it, vi } from "vitest";

import {
    createDatasourceEntry,
    getDatasourceEntries,
} from "../../src/api/datasources/datasource-entries.js";
import {
    createDatasource,
    updateDatasource,
} from "../../src/api/datasources/datasources.js";
import Logger from "../../src/utils/logger.js";
import { createMockApiConfig } from "../mocks/storyblokClient.mock.js";

vi.mock("../../src/utils/logger.js", () => ({
    default: {
        log: vi.fn(),
        success: vi.fn(),
        warning: vi.fn(),
        error: vi.fn(),
    },
}));

describe("datasource API error logging", () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it("logs entry create failures with entry name and Storyblok response details", async () => {
        const config = createMockApiConfig();
        config.sbApi.post.mockRejectedValue({
            response: {
                status: 422,
                statusText: "Unprocessable Entity",
                data: {
                    message: "Validation failed",
                    errors: { name: ["has already been taken"] },
                },
            },
        });

        await createDatasourceEntry(
            {
                data: {
                    datasource: {
                        id: 123,
                        name: "colors-theme-dark",
                    },
                },
                datasourceEntry: {
                    name: "color-brand-primary",
                    value: "#006BD6",
                },
            },
            config,
        );

        expect(Logger.error).toHaveBeenCalledWith(
            expect.stringContaining(
                "Unable to create datasource entry 'color-brand-primary'",
            ),
        );
        expect(Logger.error).toHaveBeenCalledWith(
            expect.stringContaining("status: 422 Unprocessable Entity"),
        );
        expect(Logger.error).toHaveBeenCalledWith(
            expect.stringContaining("message: Validation failed"),
        );
        expect(Logger.error).toHaveBeenCalledWith(
            expect.stringContaining(
                'errors: {"name":["has already been taken"]}',
            ),
        );
    });

    it("logs datasource create failures with datasource name and response details", async () => {
        const config = createMockApiConfig();
        config.sbApi.post.mockRejectedValue({
            response: {
                status: 409,
                data: {
                    error: "Datasource slug already exists",
                },
            },
        });

        await createDatasource(
            {
                datasource: {
                    name: "colors-theme-dark",
                    slug: "colors-theme-dark",
                    dimensions: [],
                    datasource_entries: [],
                },
            },
            config,
        );

        expect(Logger.error).toHaveBeenCalledWith(
            expect.stringContaining(
                "Unable to create datasource 'colors-theme-dark'",
            ),
        );
        expect(Logger.error).toHaveBeenCalledWith(
            expect.stringContaining("status: 409"),
        );
        expect(Logger.error).toHaveBeenCalledWith(
            expect.stringContaining("error: Datasource slug already exists"),
        );
    });

    it("logs datasource update failures with datasource id and response details", async () => {
        const config = createMockApiConfig();
        config.sbApi.put.mockRejectedValue(new Error("Network unavailable"));

        await updateDatasource(
            {
                datasource: {
                    name: "colors-theme-dark",
                    slug: "colors-theme-dark",
                    dimensions: [],
                },
                datasourceToBeUpdated: {
                    id: 123,
                    dimensions: [],
                },
            },
            config,
        );

        expect(Logger.error).toHaveBeenCalledWith(
            expect.stringContaining(
                "Unable to update datasource 'colors-theme-dark' with id '123'",
            ),
        );
        expect(Logger.error).toHaveBeenCalledWith(
            expect.stringContaining("message: Network unavailable"),
        );
    });
});

describe("datasource entry fetching", () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it("fetches all datasource entry pages", async () => {
        const config = createMockApiConfig();

        config.sbApi.get.mockImplementation((path: string, params: any) => {
            if (path.includes("datasource_entries")) {
                const entriesByPage: Record<number, any[]> = {
                    1: [{ id: 1, name: "first", value: "first" }],
                    2: [{ id: 2, name: "second", value: "second" }],
                };

                return Promise.resolve({
                    data: {
                        datasource_entries:
                            entriesByPage[params.page as number] ?? [],
                    },
                    total: 2,
                    perPage: 1,
                });
            }

            return Promise.resolve({
                data: {
                    datasources: [
                        {
                            id: 123,
                            name: "colors-theme-dark",
                            slug: "colors-theme-dark",
                            dimensions: [],
                        },
                    ],
                },
                total: 1,
                perPage: 100,
            });
        });

        const result = await getDatasourceEntries(
            { datasourceName: "colors-theme-dark" },
            config,
        );

        expect(result).toEqual({
            datasource_entries: [
                { id: 1, name: "first", value: "first" },
                { id: 2, name: "second", value: "second" },
            ],
        });
        expect(config.sbApi.get).toHaveBeenCalledWith(
            "spaces/12345/datasource_entries/",
            expect.objectContaining({
                datasource_id: 123,
                page: 1,
                per_page: 100,
            }),
        );
        expect(config.sbApi.get).toHaveBeenCalledWith(
            "spaces/12345/datasource_entries/",
            expect.objectContaining({
                datasource_id: 123,
                page: 2,
                per_page: 100,
            }),
        );
    });
});
