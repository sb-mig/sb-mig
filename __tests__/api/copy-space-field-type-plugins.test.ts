import type {
    CopySpaceComponent,
    CopySpaceSnapshot,
} from "../../src/api/copy/space.js";

import { describe, expect, it } from "vitest";

import {
    buildCopySpacePlanGateSummary,
    formatCopySpacePlanGate,
} from "../../src/api/copy/plan-gate.js";
import {
    buildCopySpacePlan,
    collectFieldTypePlugins,
    formatMissingPluginFailures,
    groupMissingPluginFailures,
    parseCopySpaceOnly,
    parseMissingFieldTypePlugins,
} from "../../src/api/copy/space.js";

const emptySnapshot = (): CopySpaceSnapshot => ({
    languages: [],
    groups: [],
    components: [],
    presets: [],
    datasources: [],
    entriesByDatasource: new Map(),
});

const components: CopySpaceComponent[] = [
    {
        id: 1,
        name: "hero",
        schema: {
            seo: { type: "custom", field_type: "seo-metatags" },
            breakpoints: { type: "custom", field_type: "backpack-breakpoints" },
            title: { type: "text" },
        },
    },
    {
        id: 2,
        name: "teaser",
        schema: {
            breakpoints: { type: "custom", field_type: "backpack-breakpoints" },
        },
    },
    { id: 3, name: "plain", schema: { title: { type: "text" } } },
    { id: 4, name: "no-schema" },
];

const planWith = ({
    targetFieldTypes,
    only = [],
    source = components,
}: {
    targetFieldTypes?: Parameters<
        typeof buildCopySpacePlan
    >[0]["targetFieldTypes"];
    only?: string[];
    source?: CopySpaceComponent[];
}) =>
    buildCopySpacePlan({
        sourceSpaceId: "111",
        targetSpaceId: "222",
        resources: parseCopySpaceOnly(only).resources,
        source: { ...emptySnapshot(), components: source },
        target: emptySnapshot(),
        targetFieldTypes,
    });

const gateLines = (plan: ReturnType<typeof buildCopySpacePlan>) =>
    formatCopySpacePlanGate(buildCopySpacePlanGateSummary(plan));

describe("copy space: field-type plugins", () => {
    // MAR-3045 R4 canary. Mutation that must turn it red: skip `custom`
    // fields in collectFieldTypePlugins.
    it("collects every custom field's plugin with the components that use it", () => {
        expect(collectFieldTypePlugins(components)).toEqual([
            { name: "backpack-breakpoints", components: ["hero", "teaser"] },
            { name: "seo-metatags", components: ["hero"] },
        ]);
    });

    it("names what a readable target lacks and says the run refuses", () => {
        const plan = planWith({
            targetFieldTypes: {
                readable: true,
                assigned: ["backpack-breakpoints"],
            },
        });

        expect(plan.fieldTypePlugins).toMatchObject({
            used: [
                {
                    name: "backpack-breakpoints",
                    components: ["hero", "teaser"],
                },
                { name: "seo-metatags", components: ["hero"] },
            ],
            target: { readable: true },
            missing: [{ name: "seo-metatags", components: ["hero"] }],
        });
        expect(gateLines(plan)).toContain(
            "  field-type plugins missing in target: seo-metatags (1 component)",
        );
        expect(
            gateLines(plan).some((line) =>
                line.includes("--allow-missing-plugins"),
            ),
        ).toBe(true);
    });

    it("says every plugin is assigned when a readable target has them all", () => {
        const plan = planWith({
            targetFieldTypes: {
                readable: true,
                assigned: ["backpack-breakpoints", "seo-metatags", "other"],
            },
        });

        expect(plan.fieldTypePlugins?.missing).toEqual([]);
        expect(gateLines(plan)).toContain(
            "  field-type plugins: all 2 the source uses are assigned to space 222",
        );
    });

    it("lists what the source uses when the target cannot be read", () => {
        const plan = planWith({
            targetFieldTypes: {
                readable: false,
                status: 403,
                message: "This endpoint does not support this token type",
            },
        });

        expect(plan.fieldTypePlugins?.missing).toEqual([]);
        expect(gateLines(plan)).toContain(
            "  field-type plugins the source uses: backpack-breakpoints (2 components), seo-metatags (1 component) — the target must have them assigned",
        );
    });

    it("treats a target it never read as not readable", () => {
        const plan = planWith({});

        expect(plan.fieldTypePlugins?.target).toMatchObject({
            readable: false,
        });
        expect(
            gateLines(plan).some((line) =>
                line.startsWith("  field-type plugins the source uses:"),
            ),
        ).toBe(true);
    });

    it("says nothing when components are not copied or none uses a plugin", () => {
        const withoutComponents = planWith({ only: ["groups"] });
        const withoutPlugins = planWith({
            source: [{ id: 3, name: "plain", schema: {} }],
        });

        for (const plan of [withoutComponents, withoutPlugins]) {
            expect(plan.fieldTypePlugins).toBeUndefined();
            expect(
                gateLines(plan).some((line) =>
                    line.includes("field-type plugins"),
                ),
            ).toBe(false);
        }
    });

    it("reads the plugin names out of Storyblok's rejection", () => {
        expect(
            parseMissingFieldTypePlugins(
                '{"error":"The following field-type plugin(s) are not available in this space: seo-metatags, backpack-breakpoints. Install the corresponding app (and, if required, upgrade your plan) to use them."}',
            ),
        ).toEqual(["seo-metatags", "backpack-breakpoints"]);
        expect(
            parseMissingFieldTypePlugins('{"name":["has already been taken"]}'),
        ).toBeUndefined();
    });

    it("groups plugin rejections by plugin for the summary", () => {
        const rejection = (plugins: string) =>
            `{"error":"The following field-type plugin(s) are not available in this space: ${plugins}. Install the corresponding app (and, if required, upgrade your plan) to use them."}`;
        const grouped = groupMissingPluginFailures([
            {
                resource: "components",
                name: "hero",
                message: rejection("seo-metatags"),
            },
            {
                resource: "components",
                name: "teaser",
                message: rejection("seo-metatags"),
            },
            {
                resource: "components",
                name: "card",
                message: rejection("seo-metatags, backpack-breakpoints"),
            },
            { resource: "components", name: "other", message: "boom" },
            {
                resource: "presets",
                name: "x/y",
                message: rejection("seo-metatags"),
            },
        ]);

        expect(grouped).toEqual({
            components: 3,
            plugins: [
                { name: "seo-metatags", components: 3 },
                { name: "backpack-breakpoints", components: 1 },
            ],
        });
        expect(formatMissingPluginFailures(grouped)).toBe(
            "components not written: 3 — missing plugins: seo-metatags (3), backpack-breakpoints (1)",
        );
    });
});
