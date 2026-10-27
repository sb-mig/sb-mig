import { beforeEach, describe, expect, it, vi } from "vitest";

import { syncComponentsData } from "../../src/api/components/components.sync.js";
import localComponents from "../fixtures/after-create/local-components.json";
import space from "../fixtures/after-create/space.json";
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

/** The space right after `sync components --all --presets` created it. */
const configAfterCreate = () => {
    const config = createMockApiConfig();

    config.sbApi.get.mockImplementation((path: string) => {
        if (path.includes("component_groups")) {
            return Promise.resolve(
                createPaginatedResponse(
                    space.component_groups,
                    "component_groups",
                ),
            );
        }
        if (path.includes("presets")) {
            return Promise.resolve(
                createPaginatedResponse(space.presets, "presets"),
            );
        }
        return Promise.resolve(
            createPaginatedResponse(space.components, "components"),
        );
    });

    return config;
};

describe("a sync right after a sync (MAR-4738)", () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it("plans nothing: every component and every preset is unchanged", async () => {
        const config = configAfterCreate();

        const result = await syncComponentsData(
            {
                components: structuredClone(localComponents),
                presets: true,
                dryRun: true,
                strict: true,
            },
            config,
        );

        expect(result.errors).toEqual([]);
        expect(result.plan?.destructive).toEqual([]);
        expect(
            result.plan?.components.map((plan) => ({
                name: plan.name,
                action: plan.action,
                properties: plan.properties,
                fields: plan.fields,
                whitelist: plan.whitelist,
            })),
        ).toEqual(
            localComponents.map((component) => ({
                name: component.name,
                action: "unchanged",
                properties: [],
                fields: [],
                whitelist: [],
            })),
        );
        expect(
            result.plan?.components.flatMap((plan) => plan.presets ?? []),
        ).toEqual(
            space.presets.map((preset) => ({
                name: preset.name,
                action: "unchanged",
            })),
        );
        expect(config.sbApi.post).not.toHaveBeenCalled();
        expect(config.sbApi.put).not.toHaveBeenCalled();
    });

    it("still plans the overwrite of a preset an editor changed in the space", async () => {
        const config = configAfterCreate();
        const edited = structuredClone(space.presets);
        const divider = edited.find(
            (preset) => preset.component_id === 1204,
        ) as any;
        divider.preset.custom_classname = "edited-in-storyblok";
        config.sbApi.get.mockImplementation((path: string) =>
            Promise.resolve(
                path.includes("component_groups")
                    ? createPaginatedResponse(
                          space.component_groups,
                          "component_groups",
                      )
                    : path.includes("presets")
                      ? createPaginatedResponse(edited, "presets")
                      : createPaginatedResponse(space.components, "components"),
            ),
        );

        const result = await syncComponentsData(
            {
                components: structuredClone(localComponents),
                presets: true,
                dryRun: true,
            },
            config,
        );

        const presets = result.plan?.components.find(
            (plan) => plan.name === "sb-divider",
        )?.presets;
        expect(presets).toContainEqual({
            name: divider.name,
            action: "update",
            changedKeys: ["preset.custom_classname"],
        });
    });
});
