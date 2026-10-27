import { copyFileSync, mkdtempSync, readFileSync, rmSync } from "fs";
import { tmpdir } from "os";
import path from "path";

import StoryblokClient from "storyblok-js-client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { syncComponentsData } from "../../src/api/components/components.sync.js";
import { syncDatasourcesData } from "../../src/api/datasources/datasources.js";
import { createMockApiConfig } from "../mocks/storyblokClient.mock.js";

/**
 * MAR-4104 review: faults a real space produces, played against the fake
 * Storyblok in `__tests__/fixtures/agent-project`. The real
 * storyblok-js-client runs on top, with a `fetch` that can throw, so what the
 * sync sees is exactly what the client hands it. Nothing leaves the machine.
 */

vi.mock("../../src/utils/logger.js", () => ({
    default: {
        log: vi.fn(),
        success: vi.fn(),
        warning: vi.fn(),
        error: vi.fn(),
    },
}));

const fixture = path.resolve(process.cwd(), "__tests__/fixtures/agent-project");
const { createFakeFetch } = await import(
    // @ts-expect-error -- a plain .mjs fixture without type declarations
    "../fixtures/agent-project/fake-storyblok.mjs"
);

let dir: string;

const state = () =>
    JSON.parse(readFileSync(path.join(dir, "state.json"), "utf8"));

const withFaults = (faults: Record<string, unknown>) => {
    process.env["SBMIG_FAKE_FAULTS"] = JSON.stringify(faults);
};

/** The real client, talking to the fake through a fetch that can throw. */
const realClientConfig = () =>
    createMockApiConfig({
        spaceId: "000000",
        sbApi: new StoryblokClient(
            {
                oauthToken: "fake-token",
                fetch: createFakeFetch(),
                rateLimit: 100,
            } as any,
            "https://mapi.storyblok.invalid/v1",
        ) as any,
    });

// The fixture's components as code holds them (see src/components).
const hero = {
    name: "hero",
    display_name: "Hero",
    is_root: false,
    is_nestable: true,
    component_group_name: "Content",
    schema: {
        title: { type: "text", pos: 0 },
        headline: { type: "text", pos: 1 },
        items: {
            type: "bloks",
            pos: 2,
            restrict_components: true,
            component_whitelist: ["card"],
        },
    },
};
const card = {
    name: "card",
    display_name: "Card",
    is_root: false,
    is_nestable: true,
    component_group_name: "Content",
    schema: { title: { type: "text", pos: 0 } },
};
const promo = {
    name: "promo",
    display_name: "Promo",
    is_root: false,
    is_nestable: true,
    component_group_name: "Marketing",
    schema: { label: { type: "text", pos: 0 } },
};

beforeEach(() => {
    vi.clearAllMocks();
    dir = mkdtempSync(path.join(tmpdir(), "sb-mig-faults-"));
    copyFileSync(
        path.join(fixture, "state.json"),
        path.join(dir, "state.json"),
    );
    process.env["SBMIG_FAKE_STATE"] = path.join(dir, "state.json");
    delete process.env["SBMIG_FAKE_WRITES"];
    delete process.env["SBMIG_FAKE_FAULTS"];
    delete process.env["SBMIG_FAKE_FAIL"];
});

afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
    delete process.env["SBMIG_FAKE_STATE"];
    delete process.env["SBMIG_FAKE_FAULTS"];
});

describe("a write whose connection drops (fetch throws)", () => {
    it("is a failed component, not a written one", async () => {
        withFaults({ "PUT card": "network" });

        const result = await syncComponentsData(
            {
                components: [hero, card, promo],
                presets: false,
                strict: true,
            },
            realClientConfig(),
        );

        expect(result.updated).toEqual(["hero"]);
        expect(result.created).toEqual(["promo"]);
        expect(result.errors).toEqual([
            {
                scope: "component",
                name: "card",
                message: expect.stringMatching(
                    /update component 'card': no confirmation from Storyblok.*ECONNRESET/,
                ),
            },
        ]);
    });

    it("is a failed group, preset, datasource and entry too", async () => {
        withFaults({
            "POST Marketing": "network",
            "POST Default": "network",
            "POST sizes": "network",
            "PUT datasource_entries/1": "network",
        });
        const config = realClientConfig();

        const components = await syncComponentsData(
            {
                components: [
                    {
                        ...promo,
                        all_presets: [{ preset: { name: "Default" } }],
                    },
                ],
                presets: true,
                strict: true,
            },
            config,
        );
        const datasources = await syncDatasourcesData(
            {
                datasources: [
                    {
                        name: "colors",
                        slug: "colors",
                        dimensions: [],
                        datasource_entries: [
                            { name: "red", value: "#ff0000" },
                            { name: "blue", value: "#00f" },
                        ],
                    },
                    {
                        name: "sizes",
                        slug: "sizes",
                        dimensions: [],
                        datasource_entries: [],
                    },
                ],
                strict: true,
            },
            config,
        );

        expect(
            [...components.errors, ...datasources.errors].map((error) => [
                error.scope,
                error.name,
            ]),
        ).toEqual([
            ["component-group", "Marketing"],
            ["preset", "promo/Default"],
            ["datasource-entry", "colors/red"],
            ["datasource", "sizes"],
        ]);
        expect(datasources.created).toEqual([]);
    });

    it("is a failed --ssot removal, and the component is updated in place", async () => {
        withFaults({ "DELETE components/2": "network" });

        const result = await syncComponentsData(
            {
                components: [hero, card, promo],
                presets: false,
                ssot: true,
                strict: true,
            },
            realClientConfig(),
        );

        // card is still there (the space says so), so it is updated.
        expect(result.updated).toEqual(["card"]);
        expect(result.errors).toEqual([
            expect.objectContaining({
                scope: "ssot-removal",
                name: "component 'card'",
            }),
        ]);
        expect(
            state()
                .components.map((c: any) => c.name)
                .sort(),
        ).toEqual(["card", "hero", "promo"]);
    });
});

describe("--ssot: a DELETE that commits, then answers 504", () => {
    it("re-reads the space, finds the component gone, and creates it again", async () => {
        withFaults({ "DELETE components/1": "commit-then-504" });

        const result = await syncComponentsData(
            {
                components: [hero, card],
                presets: false,
                ssot: true,
                strict: true,
            },
            realClientConfig(),
        );

        expect(result.created.sort()).toEqual(["card", "hero"]);
        expect(result.errors).toEqual([]);
        expect(
            result.plan?.components?.map((c: any) => [c.name, c.recreated]),
        ).toEqual([
            ["hero", true],
            ["card", true],
        ]);
        expect(
            state()
                .components.map((c: any) => c.name)
                .sort(),
        ).toEqual(["card", "hero"]);
    });

    it("creates it on the 404 when the space cannot be re-read either", async () => {
        withFaults({
            "DELETE components/1": "commit-then-504",
            // The first listing answers; the re-read after the removals fails.
            "GET components": ["ok", "403"],
        });

        const result = await syncComponentsData(
            {
                components: [hero, card],
                presets: false,
                ssot: true,
                strict: true,
            },
            realClientConfig(),
        );

        expect(result.created.sort()).toEqual(["card", "hero"]);
        expect(result.errors).toEqual([]);
        expect(
            state()
                .components.map((c: any) => c.name)
                .sort(),
        ).toEqual(["card", "hero"]);
    });
});

describe("--ssot guard (strict, as the CLI runs it)", () => {
    it("refuses when no schema files were found, before removing anything", async () => {
        const config = realClientConfig();

        await expect(
            syncComponentsData(
                { components: [], presets: false, ssot: true, strict: true },
                config,
            ),
        ).rejects.toThrow(/Refusing --ssot: no component schema files/);
        expect(state().components).toHaveLength(3);
        expect(state().component_groups).toHaveLength(1);
    });

    it("refuses when none of the space's components is in the schema files", async () => {
        await expect(
            syncComponentsData(
                {
                    components: [{ name: "unrelated", schema: {} }],
                    presets: false,
                    ssot: true,
                    strict: true,
                },
                realClientConfig(),
            ),
        ).rejects.toThrow(/none of the 3 component\(s\) in the space/);
        expect(state().components).toHaveLength(3);
    });
});

describe("--ssot dry-run plan", () => {
    it("lists the space-only components and groups it would delete", async () => {
        const result = await syncComponentsData(
            {
                components: [{ ...card, component_group_name: undefined }],
                presets: false,
                ssot: true,
                dryRun: true,
                strict: true,
            },
            realClientConfig(),
        );

        expect(
            result.plan?.destructive?.map((d: any) => [
                d.kind,
                d.component ?? d.group,
            ]),
        ).toEqual([
            ["group-removed", "Content"],
            ["component-removed", "hero"],
            ["component-removed", "legacy"],
        ]);
        expect(state().components).toHaveLength(3);
    });
});

describe("a failed datasource listing", () => {
    const colors = {
        name: "colors",
        slug: "colors",
        dimensions: [],
        datasource_entries: [],
    };

    it("fails a strict (CLI) run instead of planning every datasource as new", async () => {
        withFaults({ "GET datasources": "404" });

        await expect(
            syncDatasourcesData(
                { datasources: [colors], dryRun: true, strict: true },
                realClientConfig(),
            ),
        ).rejects.toBeDefined();
    });

    it("keeps api-v2 as it was: a 404 reads as no datasources", async () => {
        withFaults({ "GET datasources": "404" });

        const result = await syncDatasourcesData(
            { datasources: [colors], dryRun: true },
            realClientConfig(),
        );

        expect(result.created).toEqual(["colors"]);
    });
});
