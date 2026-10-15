import { beforeEach, describe, expect, it, vi } from "vitest";

import {
    createMockApiConfig,
    createPaginatedResponse,
} from "../mocks/storyblokClient.mock.js";

/**
 * MAR-4104: a sync an agent can trust. Every write that fails is counted,
 * the run goes on, and the plan says what changed — after resolvers.
 */

vi.mock("../../src/utils/logger.js", () => ({
    default: {
        log: vi.fn(),
        success: vi.fn(),
        warning: vi.fn(),
        error: vi.fn(),
    },
}));

const localFiles: Record<string, any> = {};

vi.mock("../../src/config/config.js", () => ({
    default: {
        spaceId: "12345",
        oauthToken: "mock-token",
        debug: false,
        resolvers: [
            {
                match: ["hero"],
                fields: {
                    component_whitelist: (whitelist: string[]) => [
                        ...whitelist,
                        "promo",
                    ],
                },
            },
        ],
    },
}));

vi.mock("../../src/cli/utils/discover.js", async (importOriginal) => ({
    ...(await importOriginal<Record<string, unknown>>()),
    discoverResolvers: vi.fn(async () => []),
}));

vi.mock("../../src/utils/files.js", async (importOriginal) => ({
    ...(await importOriginal<Record<string, unknown>>()),
    getFileContentWithRequire: vi.fn(({ file }: { file: string }) =>
        structuredClone(localFiles[file]),
    ),
}));

const { syncComponentsData } =
    await import("../../src/api/components/components.sync.js");
const { syncComponents } = await import("../../src/api/migrate.js");
const { syncDatasourcesData } =
    await import("../../src/api/datasources/datasources.js");

const rejection = (status: number, error: string) => ({
    message: error,
    status,
    response: { status, data: { error } },
});

const remoteComponents = [
    {
        id: 1,
        name: "hero",
        component_group_uuid: null,
        all_presets: [],
        schema: {
            title: { type: "text" },
            items: {
                type: "bloks",
                restrict_components: true,
                component_whitelist: ["card", "banner"],
            },
        },
    },
    {
        id: 2,
        name: "card",
        component_group_uuid: null,
        all_presets: [],
        schema: { title: { type: "text" } },
    },
];

const serveComponents = (
    config: ReturnType<typeof createMockApiConfig>,
    components = remoteComponents,
) => {
    config.sbApi.get.mockImplementation((path: string) => {
        if (path.includes("component_groups")) {
            return Promise.resolve(
                createPaginatedResponse([], "component_groups"),
            );
        }
        return Promise.resolve(
            createPaginatedResponse(components, "components"),
        );
    });
};

describe("component sync: plan", () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it("diffs the payload after resolvers, and writes nothing in a dry-run", async () => {
        const config = createMockApiConfig();
        serveComponents(config);
        localFiles["hero.sb.js"] = {
            name: "hero",
            schema: {
                headline: { type: "text" },
                items: {
                    type: "bloks",
                    restrict_components: true,
                    component_whitelist: ["card"],
                },
            },
        };

        const result = await syncComponents(
            [{ name: "hero.sb.js", p: "hero.sb.js" }],
            false,
            config,
            { dryRun: true },
        );

        expect(result.plan?.components).toEqual([
            expect.objectContaining({
                name: "hero",
                action: "update",
                fields: [
                    { field: "headline", change: "added", type: "text" },
                    { field: "title", change: "removed", type: "text" },
                ],
                // "promo" comes from the resolver in storyblok.config.
                whitelist: [
                    {
                        field: "items",
                        added: ["promo"],
                        removed: ["banner"],
                        restricted: { from: true, to: true },
                    },
                ],
            }),
        ]);
        expect(result.plan?.destructive?.map((d: any) => d.kind)).toEqual([
            "likely-rename",
            "whitelist-narrowed",
        ]);
        expect(config.sbApi.post).not.toHaveBeenCalled();
        expect(config.sbApi.put).not.toHaveBeenCalled();
        expect(config.sbApi.delete).not.toHaveBeenCalled();
    });

    it("plans --ssot against the space before removal, so dropped fields still show", async () => {
        const config = createMockApiConfig();
        serveComponents(config);

        const result = await syncComponentsData(
            {
                components: [
                    {
                        name: "hero",
                        schema: {
                            headline: { type: "text" },
                            items: {
                                type: "bloks",
                                restrict_components: true,
                                component_whitelist: ["card"],
                            },
                        },
                    },
                ],
                presets: false,
                ssot: true,
                dryRun: true,
            },
            config,
        );

        // SSOT deletes and recreates hero, so the sync counts a create...
        expect(result.created).toEqual(["hero"]);
        // ...but the plan diffs against what the space held before.
        expect(result.plan?.components).toEqual([
            expect.objectContaining({ name: "hero", action: "update" }),
        ]);
        expect(
            result.plan?.destructive?.map((d: any) => [d.kind, d.component]),
        ).toEqual([
            ["component-removed", "card"],
            ["likely-rename", "hero"],
            ["whitelist-narrowed", "hero"],
        ]);
        expect(config.sbApi.delete).not.toHaveBeenCalled();
        expect(config.sbApi.post).not.toHaveBeenCalled();
    });
});

describe("component sync: failures", () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it("counts a failed update, keeps going, and reports it (one of three writes fails)", async () => {
        const config = createMockApiConfig();
        serveComponents(config);
        config.sbApi.put.mockImplementation((path: string, body: any) =>
            body.component.name === "card"
                ? Promise.reject(rejection(422, "card is refused"))
                : Promise.resolve({ data: { component: body.component } }),
        );
        config.sbApi.post.mockImplementation((_path: string, body: any) =>
            Promise.resolve({
                data: { component: { ...body.component, id: 3 } },
            }),
        );

        const result = await syncComponentsData(
            {
                components: [
                    { name: "hero", schema: {} },
                    { name: "card", schema: {} },
                    { name: "promo", schema: {} },
                ],
                presets: false,
            },
            config,
        );

        expect(config.sbApi.put).toHaveBeenCalledTimes(2);
        expect(config.sbApi.post).toHaveBeenCalledTimes(1);
        expect(result.updated).toEqual(["hero"]);
        expect(result.created).toEqual(["promo"]);
        expect(result.errors).toEqual([
            {
                scope: "component",
                name: "card",
                message: expect.stringContaining("card is refused"),
            },
        ]);
    });

    it("reports a preset that fails without failing its component", async () => {
        const config = createMockApiConfig();
        serveComponents(config, []);
        config.sbApi.post.mockImplementation((path: string, body: any) => {
            if (path.includes("presets")) {
                return Promise.reject(rejection(422, "preset is refused"));
            }
            return Promise.resolve({
                data: { component: { ...body.component, id: 5 } },
            });
        });

        const result = await syncComponentsData(
            {
                components: [
                    {
                        name: "promo",
                        schema: {},
                        all_presets: [{ preset: { name: "Default" } }],
                    },
                ],
                presets: true,
            },
            config,
        );

        expect(result.created).toEqual(["promo"]);
        expect(result.errors).toEqual([
            expect.objectContaining({
                scope: "preset",
                name: "promo/Default",
            }),
        ]);
    });

    it("reports a component group that cannot be created", async () => {
        const config = createMockApiConfig();
        serveComponents(config, []);
        config.sbApi.post.mockImplementation((path: string, body: any) =>
            path.includes("component_groups")
                ? Promise.reject(rejection(500, "groups are down"))
                : Promise.resolve({
                      data: { component: { ...body.component, id: 5 } },
                  }),
        );

        const result = await syncComponentsData(
            {
                components: [
                    {
                        name: "promo",
                        component_group_name: "Marketing",
                        schema: {},
                    },
                ],
                presets: false,
            },
            config,
        );

        expect(result.created).toEqual(["promo"]);
        expect(result.errors).toEqual([
            expect.objectContaining({
                scope: "component-group",
                name: "Marketing",
            }),
        ]);
    });

    it("stops a strict run when the space cannot be listed, before any write", async () => {
        const config = createMockApiConfig();
        config.sbApi.get.mockImplementation((path: string) =>
            path.includes("component_groups")
                ? Promise.resolve(
                      createPaginatedResponse([], "component_groups"),
                  )
                : Promise.reject(rejection(401, "Unauthorized")),
        );

        await expect(
            syncComponentsData(
                {
                    components: [
                        {
                            name: "hero",
                            component_group_name: "New",
                            schema: {},
                        },
                    ],
                    presets: false,
                    strict: true,
                },
                config,
            ),
        ).rejects.toBeDefined();
        expect(config.sbApi.post).not.toHaveBeenCalled();
        expect(config.sbApi.put).not.toHaveBeenCalled();
    });

    it("keeps the api-v2 contract when not strict: resolves, and records the failed listing", async () => {
        const config = createMockApiConfig();
        config.sbApi.get.mockImplementation((path: string) =>
            path.includes("component_groups")
                ? Promise.resolve(
                      createPaginatedResponse([], "component_groups"),
                  )
                : Promise.reject(rejection(401, "Unauthorized")),
        );
        config.sbApi.post.mockImplementation((_path: string, body: any) =>
            Promise.resolve({
                data: { component: { ...body.component, id: 9 } },
            }),
        );

        const result = await syncComponentsData(
            { components: [{ name: "hero", schema: {} }], presets: false },
            config,
        );

        expect(result.created).toEqual(["hero"]);
        expect(result.errors).toEqual([
            expect.objectContaining({ scope: "listing", name: "components" }),
        ]);
    });
});

describe("component sync: --ssot", () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it("recreates every component when the space cannot be listed after the removals", async () => {
        const config = createMockApiConfig();
        let componentReads = 0;
        let groupReads = 0;

        // Only the first listing of each kind answers; every later one fails.
        config.sbApi.get.mockImplementation((path: string) => {
            if (path.includes("component_groups")) {
                return ++groupReads === 1
                    ? Promise.resolve(
                          createPaginatedResponse(
                              [
                                  {
                                      id: 1,
                                      uuid: "uuid-content",
                                      name: "Content",
                                  },
                              ],
                              "component_groups",
                          ),
                      )
                    : Promise.reject(rejection(500, "groups are down"));
            }
            return ++componentReads === 1
                ? Promise.resolve(
                      createPaginatedResponse(remoteComponents, "components"),
                  )
                : Promise.reject(rejection(500, "components are down"));
        });
        config.sbApi.delete.mockResolvedValue({ data: {} });
        config.sbApi.post.mockImplementation((path: string, body: any) =>
            Promise.resolve({
                data: path.includes("component_groups")
                    ? {
                          component_group: {
                              ...body.component_group,
                              uuid: "uuid-new",
                          },
                      }
                    : { component: { ...body.component, id: 10 } },
            }),
        );

        const result = await syncComponentsData(
            {
                components: [
                    {
                        name: "hero",
                        component_group_name: "Content",
                        schema: {},
                    },
                    { name: "card", schema: {} },
                ],
                presets: false,
                ssot: true,
                strict: true,
            },
            config,
        );

        expect(config.sbApi.delete).toHaveBeenCalledTimes(3);
        expect(result.created).toEqual(["hero", "card"]);
        expect(result.errors).toEqual([]);
        // The removed group is created again, and hero is put back in it.
        expect(config.sbApi.post).toHaveBeenCalledWith(
            "spaces/12345/components/",
            {
                component: expect.objectContaining({
                    name: "hero",
                    component_group_uuid: "uuid-new",
                }),
            },
        );
        expect(componentReads).toBe(1);
    });

    it("updates a component whose removal failed instead of creating it twice", async () => {
        const config = createMockApiConfig();
        serveComponents(config);
        config.sbApi.delete.mockImplementation((path: string) =>
            path.endsWith("/components/1")
                ? Promise.reject(rejection(422, "in use"))
                : Promise.resolve({ data: {} }),
        );
        config.sbApi.put.mockImplementation((_path: string, body: any) =>
            Promise.resolve({ data: { component: body.component } }),
        );
        config.sbApi.post.mockImplementation((_path: string, body: any) =>
            Promise.resolve({
                data: { component: { ...body.component, id: 10 } },
            }),
        );

        const result = await syncComponentsData(
            {
                components: [
                    { name: "hero", schema: {} },
                    { name: "card", schema: {} },
                ],
                presets: false,
                ssot: true,
            },
            config,
        );

        expect(result.updated).toEqual(["hero"]);
        expect(result.created).toEqual(["card"]);
        expect(result.errors).toEqual([
            expect.objectContaining({
                scope: "ssot-removal",
                name: "component 'hero'",
            }),
        ]);
    });
});

describe("public api contracts (unchanged from beta)", () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it("updateComponent and createComponentsGroup still log and resolve on failure", async () => {
        const { updateComponent, createComponentsGroup } =
            await import("../../src/api/components/components.js");
        const config = createMockApiConfig();
        config.sbApi.put.mockRejectedValue(rejection(422, "refused"));
        config.sbApi.post.mockRejectedValue(rejection(422, "refused"));

        await expect(
            updateComponent({ id: 1, name: "hero" }, false, config),
        ).resolves.toBeUndefined();
        await expect(
            createComponentsGroup("Content", config),
        ).resolves.toBeUndefined();
    });

    it("createPreset resolves the response, and undefined on failure", async () => {
        const { createPreset } =
            await import("../../src/api/presets/presets.js");
        const config = createMockApiConfig();
        const response = { data: { preset: { id: 1, name: "Default" } } };
        config.sbApi.post.mockResolvedValueOnce(response);
        config.sbApi.post.mockRejectedValueOnce(rejection(422, "refused"));
        vi.spyOn(console, "log").mockImplementation(() => undefined);

        await expect(
            createPreset({ preset: { name: "Default" } }, config),
        ).resolves.toBe(response);
        await expect(
            createPreset({ preset: { name: "Default" } }, config),
        ).resolves.toBeUndefined();
    });
});

describe("datasource sync", () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    const serveDatasources = (
        config: ReturnType<typeof createMockApiConfig>,
    ) => {
        config.sbApi.get.mockImplementation((path: string, params: any) => {
            if (path.includes("datasource_entries")) {
                const entries = [
                    { id: 11, name: "red", value: "#f00" },
                    { id: 12, name: "blue", value: "#00f" },
                ];
                return Promise.resolve(
                    createPaginatedResponse(
                        params.dimension
                            ? entries.map((entry) => ({
                                  ...entry,
                                  dimension_value:
                                      entry.name === "blue" ? "#001" : null,
                              }))
                            : entries,
                        "datasource_entries",
                    ),
                );
            }
            return Promise.resolve(
                createPaginatedResponse(
                    [
                        {
                            id: 1,
                            name: "colors",
                            slug: "colors",
                            dimensions: [
                                { id: 7, name: "dark", entry_value: "dark" },
                            ],
                        },
                    ],
                    "datasources",
                ),
            );
        });
    };

    const colors = {
        name: "colors",
        slug: "colors",
        dimensions: [{ name: "dark", entry_value: "dark" }],
        datasource_entries: [
            { name: "red", value: "#ff0000" },
            { name: "blue", value: "#00f", dimension_values: { dark: "#003" } },
            { name: "green", value: "#0f0" },
        ],
    };

    it("plans entries, dimension values included, without writing", async () => {
        const config = createMockApiConfig();
        serveDatasources(config);

        const result = await syncDatasourcesData(
            { datasources: [colors], dryRun: true },
            config,
        );

        expect(result.plan?.datasources).toEqual([
            {
                name: "colors",
                slug: "colors",
                action: "update",
                properties: [],
                dimensionsAdded: [],
                entries: [
                    {
                        name: "red",
                        action: "update",
                        value: {
                            property: "value",
                            from: "#f00",
                            to: "#ff0000",
                        },
                    },
                    {
                        name: "blue",
                        action: "update",
                        dimensionValues: [
                            { property: "dark", from: "#001", to: "#003" },
                        ],
                    },
                    { name: "green", action: "create" },
                ],
                unchangedEntries: 0,
            },
        ]);
        expect(config.sbApi.get).toHaveBeenCalledWith(
            "spaces/12345/datasource_entries/",
            expect.objectContaining({ datasource_id: 1, dimension: "dark" }),
        );
        expect(config.sbApi.post).not.toHaveBeenCalled();
        expect(config.sbApi.put).not.toHaveBeenCalled();
    });

    it("reports a failed datasource and a failed entry, and syncs the rest", async () => {
        const config = createMockApiConfig();
        serveDatasources(config);
        config.sbApi.post.mockImplementation((path: string, body: any) => {
            if (path.includes("datasources")) {
                return Promise.reject(rejection(422, "slug taken"));
            }
            if (body.datasource_entry?.name === "green") {
                return Promise.reject(rejection(422, "green is refused"));
            }
            return Promise.resolve({
                data: {
                    datasource_entry: { ...body.datasource_entry, id: 99 },
                },
            });
        });
        config.sbApi.put.mockImplementation((path: string, body: any) =>
            Promise.resolve({
                data: path.includes("datasources/")
                    ? { datasource: { ...body.datasource, id: 1 } }
                    : {},
            }),
        );

        const result = await syncDatasourcesData(
            {
                datasources: [
                    { name: "sizes", slug: "sizes", dimensions: [] },
                    colors,
                ],
            },
            config,
        );

        expect(result.updated).toEqual(["colors"]);
        expect(result.created).toEqual([]);
        expect(result.errors).toEqual([
            expect.objectContaining({ scope: "datasource", name: "sizes" }),
            expect.objectContaining({
                scope: "datasource-entry",
                name: "colors/green",
                message: expect.stringContaining("green is refused"),
            }),
        ]);
        // red and blue were still written, blue's dimension value too.
        expect(config.sbApi.put).toHaveBeenCalledWith(
            "spaces/12345/datasource_entries/12",
            expect.objectContaining({ dimension_id: 7 }),
        );
    });

    it("reports a dimension value that fails instead of leaving it running", async () => {
        const config = createMockApiConfig();
        serveDatasources(config);
        config.sbApi.put.mockImplementation((path: string, body: any) => {
            if (body.dimension_id) {
                return Promise.reject(rejection(500, "dimension down"));
            }
            return Promise.resolve({
                data: path.includes("datasources/")
                    ? { datasource: { ...body.datasource, id: 1 } }
                    : {},
            });
        });
        config.sbApi.post.mockResolvedValue({
            data: { datasource_entry: { id: 99 } },
        });

        const result = await syncDatasourcesData(
            { datasources: [colors] },
            config,
        );

        expect(result.errors).toEqual([
            expect.objectContaining({
                scope: "datasource-entry",
                name: "colors/blue",
                message: expect.stringContaining("dimension 'dark'"),
            }),
        ]);
    });
});
