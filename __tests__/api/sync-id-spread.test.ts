import { beforeEach, describe, expect, it, vi } from "vitest";

const { getComponentPresetsMock, updatePresetMock, createPresetMock } =
    vi.hoisted(() => ({
        getComponentPresetsMock: vi.fn(),
        updatePresetMock: vi.fn(),
        createPresetMock: vi.fn(),
    }));

vi.mock("../../src/api/presets/componentPresets.js", () => ({
    getComponentPresets: getComponentPresetsMock,
}));

vi.mock("../../src/api/presets/presets.js", () => ({
    updatePreset: updatePresetMock,
    createPreset: createPresetMock,
    getPreset: vi.fn(),
    getAllPresets: vi.fn(),
    updatePresets: vi.fn(),
}));

vi.mock("../../src/utils/logger.js", () => ({
    default: {
        log: vi.fn(),
        success: vi.fn(),
        warning: vi.fn(),
        error: vi.fn(),
    },
}));

import { syncComponentsData } from "../../src/api/components/components.sync.js";
import {
    createDatasourceEntry,
    updateDatasourceEntry,
} from "../../src/api/datasources/datasource-entries.js";
import _resolvePresets from "../../src/api/presets/resolvePresets.js";
import Logger from "../../src/utils/logger.js";
import {
    createMockApiConfig,
    createPaginatedResponse,
} from "../mocks/storyblokClient.mock.js";

// A component/preset file exported from another space keeps that space's
// bookkeeping fields. These are the ones that must never steer a write.
const FOREIGN_IDENTITY = {
    id: 999,
    space_id: 111,
    created_at: "2024-01-01T00:00:00.000Z",
    updated_at: "2024-01-02T00:00:00.000Z",
};

describe("sync components: local ids never override the remote id", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        vi.spyOn(console, "log").mockImplementation(() => undefined);
    });

    const setupComponentsGet = (config: any, remoteComponents: any[]) => {
        config.sbApi.get.mockImplementation((path: string) => {
            if (path.includes("component_groups")) {
                return Promise.resolve(
                    createPaginatedResponse([], "component_groups"),
                );
            }
            return Promise.resolve(
                createPaginatedResponse(remoteComponents, "components"),
            );
        });
        config.sbApi.put.mockResolvedValue({ data: {} });
        config.sbApi.post.mockResolvedValue({ data: {} });
    };

    // R4 (a)
    it("updates the matched remote component when the local file carries a foreign id", async () => {
        const config = createMockApiConfig();
        setupComponentsGet(config, [{ id: 42, name: "hero" }]);

        await syncComponentsData(
            {
                components: [
                    {
                        ...FOREIGN_IDENTITY,
                        name: "hero",
                        schema: { title: { type: "text" } },
                    },
                ],
                presets: false,
            },
            config,
        );

        expect(config.sbApi.put).toHaveBeenCalledTimes(1);
        const [url, body] = config.sbApi.put.mock.calls[0] as [string, any];
        expect(url).toBe("spaces/12345/components/42");
        expect(body.component.id).toBe(42);
    });

    it("strips space-bound identifiers from the component create payload", async () => {
        const config = createMockApiConfig();
        setupComponentsGet(config, []);

        await syncComponentsData(
            {
                components: [
                    {
                        ...FOREIGN_IDENTITY,
                        name: "hero",
                        schema: { title: { type: "text" } },
                    },
                ],
                presets: false,
            },
            config,
        );

        expect(config.sbApi.post).toHaveBeenCalledTimes(1);
        const [url, body] = config.sbApi.post.mock.calls[0] as [string, any];
        expect(url).toBe("spaces/12345/components/");
        expect(body.component).not.toHaveProperty("id");
        expect(body.component).not.toHaveProperty("space_id");
        expect(body.component).not.toHaveProperty("created_at");
        expect(body.component).not.toHaveProperty("updated_at");
        expect(body.component.name).toBe("hero");
    });
});

describe("resolve presets: local ids never override the remote preset id", () => {
    const localPresets = [
        {
            preset: {
                ...FOREIGN_IDENTITY,
                name: "dark",
                preset: { title: "Dark" },
            },
        },
    ];

    beforeEach(() => {
        vi.clearAllMocks();
    });

    // R4 (b)
    it("updates the matched remote preset when the local preset carries a foreign id", async () => {
        const config = createMockApiConfig();
        getComponentPresetsMock.mockResolvedValue([
            { preset: { id: 77, name: "dark" } },
        ]);
        updatePresetMock.mockResolvedValue({ ok: true });

        await _resolvePresets(
            { data: { component: { id: 42 } } },
            localPresets,
            { name: "hero" },
            config,
        );

        expect(updatePresetMock).toHaveBeenCalledTimes(1);
        const [{ p }] = updatePresetMock.mock.calls[0] as [any];
        expect(p.preset.id).toBe(77);
        expect(p.preset.component_id).toBe(42);
    });

    it("strips space-bound identifiers from the preset create payload", async () => {
        const config = createMockApiConfig();
        getComponentPresetsMock.mockResolvedValue([]);
        createPresetMock.mockResolvedValue({});

        await _resolvePresets(
            { data: { component: { id: 42 } } },
            localPresets,
            { name: "hero" },
            config,
        );

        expect(createPresetMock).toHaveBeenCalledTimes(1);
        const [created] = createPresetMock.mock.calls[0] as [any];
        expect(created.preset).not.toHaveProperty("id");
        expect(created.preset).not.toHaveProperty("space_id");
        expect(created.preset).not.toHaveProperty("created_at");
        expect(created.preset).not.toHaveProperty("updated_at");
        expect(created.preset.name).toBe("dark");
        expect(created.preset.component_id).toBe(42);
    });
});

describe("datasource entry dimensions land on the right entry", () => {
    const currentDatasource = {
        datasource: {
            id: 123,
            name: "colors",
            dimensions: [{ id: 9, name: "dark" }],
        },
    };
    const datasourceEntry = {
        name: "brand-primary",
        value: "#006BD6",
        dimension_values: { dark: "#000000" },
    };

    beforeEach(() => {
        vi.clearAllMocks();
        vi.spyOn(console, "log").mockImplementation(() => undefined);
    });

    // R4 (c)
    it("writes dimension values to the entry the create call returned", async () => {
        const config = createMockApiConfig();
        config.sbApi.post.mockResolvedValue({
            data: {
                datasource_entry: {
                    id: 555,
                    name: "brand-primary",
                    value: "#006BD6",
                    datasource_id: 123,
                },
            },
        });
        config.sbApi.put.mockResolvedValue({ data: {} });

        await createDatasourceEntry(
            { data: currentDatasource, datasourceEntry },
            config,
        );

        expect(config.sbApi.post).toHaveBeenCalledTimes(1);
        expect(config.sbApi.put).toHaveBeenCalledTimes(1);

        const [url, params] = config.sbApi.put.mock.calls[0] as [string, any];
        expect(url).toBe("spaces/12345/datasource_entries/555");
        expect(params.datasource_entry.id).toBe(555);
        expect(params.datasource_entry.datasource_id).toBe(123);
        expect(params.datasource_entry.dimension_value).toBe("#000000");
        expect(params.dimension_id).toBe(9);
    });

    // R4 (d)
    it("skips the dimension write and warns when the created entry has no id", async () => {
        const config = createMockApiConfig();
        config.sbApi.post.mockResolvedValue({
            data: { datasource_entry: { name: "brand-primary" } },
        });
        config.sbApi.put.mockResolvedValue({ data: {} });

        await createDatasourceEntry(
            { data: currentDatasource, datasourceEntry },
            config,
        );

        expect(config.sbApi.put).not.toHaveBeenCalled();
        expect(Logger.warning).toHaveBeenCalledTimes(1);
        expect(Logger.warning).toHaveBeenCalledWith(
            expect.stringContaining("brand-primary"),
        );
    });

    // R3: the update path keeps writing to the entry id it already knows.
    it("keeps using the known entry id on the update path", async () => {
        const config = createMockApiConfig();
        config.sbApi.put.mockResolvedValue({ data: {} });

        await updateDatasourceEntry(
            {
                data: currentDatasource,
                datasourceEntry,
                datasourceToBeUpdated: { id: 321 },
            },
            config,
        );

        const dimensionCalls = (
            config.sbApi.put.mock.calls as [string, any][]
        ).filter(([, params]) => params?.dimension_id !== undefined);

        expect(dimensionCalls).toHaveLength(1);
        const [url, params] = dimensionCalls[0];
        expect(url).toBe("spaces/12345/datasource_entries/321");
        expect(params.datasource_entry.id).toBe(321);
        expect(params.datasource_entry.datasource_id).toBe(123);
    });
});
