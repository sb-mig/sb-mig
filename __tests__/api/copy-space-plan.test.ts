import type {
    CopySpaceComponent,
    CopySpaceGroup,
    CopySpaceSnapshot,
} from "../../src/api/copy/space.js";

import { describe, expect, it } from "vitest";

import {
    buildCopySpacePlanGateSummary,
    formatCopySpacePlanGate,
} from "../../src/api/copy/plan-gate.js";
import {
    buildCopySpacePlan,
    buildGroupNameMap,
    buildGroupPaths,
    mergeLanguagesForTarget,
    orderGroupsParentsFirst,
    parseCopySpaceOnly,
    remapComponentForTarget,
    remapPresetForTarget,
} from "../../src/api/copy/space.js";

const emptySnapshot = (): CopySpaceSnapshot => ({
    languages: [],
    groups: [],
    components: [],
    presets: [],
    datasources: [],
    entriesByDatasource: new Map(),
});

const sourceGroups: CopySpaceGroup[] = [
    // Deliberately child first: the order a space returns groups in is not a
    // promise that parents come first.
    {
        id: 12,
        uuid: "src-child",
        name: "Heroes",
        parent_id: 11,
        parent_uuid: "src-parent",
    },
    { id: 11, uuid: "src-parent", name: "Layout", parent_id: null },
];

const targetGroups: CopySpaceGroup[] = [
    { id: 91, uuid: "tgt-parent", name: "Layout", parent_id: null },
    {
        id: 92,
        uuid: "tgt-child",
        name: "Heroes",
        parent_id: 91,
        parent_uuid: "tgt-parent",
    },
];

describe("copy space: --only", () => {
    it("keeps the write order whatever order the names were typed in", () => {
        expect(parseCopySpaceOnly(["presets,groups", "languages"])).toEqual({
            resources: ["languages", "groups", "presets"],
        });
    });

    it("means every resource when absent", () => {
        expect(parseCopySpaceOnly([]).resources).toEqual([
            "languages",
            "settings",
            "groups",
            "components",
            "presets",
            "datasources",
        ]);
    });

    it("refuses a resource v1 does not copy", () => {
        expect(parseCopySpaceOnly(["workflows"]).error).toContain(
            "Unknown: workflows",
        );
    });
});

describe("copy space: groups", () => {
    // R8 (b) canary. Mutation that must turn it red: sort by depth descending
    // (children first) in orderGroupsParentsFirst, or return the input order.
    it("orders parents before children on a two-level fixture", () => {
        expect(
            orderGroupsParentsFirst(sourceGroups).map((group) => group.uuid),
        ).toEqual(["src-parent", "src-child"]);
    });

    it("identifies a nested group by its full path, not its bare name", () => {
        const paths = buildGroupPaths([
            ...sourceGroups,
            {
                id: 13,
                uuid: "src-other-heroes",
                name: "Heroes",
                parent_uuid: null,
            },
        ]);

        expect(paths.get("src-child")).toBe("Layout/Heroes");
        expect(paths.get("src-other-heroes")).toBe("Heroes");
    });

    it("does not loop on a group that names itself as its parent", () => {
        expect(
            buildGroupPaths([
                { uuid: "a", name: "Loop", parent_uuid: "a" },
            ]).get("a"),
        ).toBe("Loop");
    });
});

describe("copy space: components", () => {
    const groupMap = buildGroupNameMap({ sourceGroups, targetGroups });
    const component: CopySpaceComponent = {
        id: 501,
        space_id: 1,
        created_at: "2026-09-01T00:00:00.000Z",
        updated_at: "2026-09-02T00:00:00.000Z",
        all_presets: [{ id: 1 }],
        name: "hero",
        display_name: "Hero",
        is_root: false,
        component_group_uuid: "src-child",
        schema: {
            title: { id: "generated-field-id-1", type: "text", pos: 0 },
            body: {
                id: "generated-field-id-2",
                type: "bloks",
                pos: 1,
                restrict_type: "groups",
                component_group_whitelist: ["src-child", "src-gone"],
            },
        },
    };

    // R8 (a) canary. Mutation that must turn it red: push `sourceUuid` instead
    // of `target.uuid` in remapComponentForTarget (i.e. remove the remap).
    it("rewrites a whitelisted group to the target group of the same path", () => {
        const { payload } = remapComponentForTarget({ component, groupMap });

        expect(payload.schema.body.component_group_whitelist).toEqual([
            "tgt-child",
        ]);
    });

    it("drops and reports a whitelisted group the target does not have", () => {
        const { droppedWhitelistGroups } = remapComponentForTarget({
            component,
            groupMap,
        });

        expect(droppedWhitelistGroups).toEqual([
            {
                component: "hero",
                field: "body",
                sourceGroupUuid: "src-gone",
            },
        ]);
    });

    // R8 (d) canary. Mutation that must turn it red: remove the
    // `delete fieldWithoutId.id` line, or stop filtering COMPONENT_GENERATED_KEYS.
    it("strips the generated field ids and space-scoped keys", () => {
        const { payload } = remapComponentForTarget({ component, groupMap });

        expect(payload.schema.title).toEqual({ type: "text", pos: 0 });
        expect(payload.schema.body).not.toHaveProperty("id");

        for (const key of [
            "id",
            "space_id",
            "created_at",
            "updated_at",
            "all_presets",
        ]) {
            expect(payload).not.toHaveProperty(key);
        }

        expect(payload).toMatchObject({
            name: "hero",
            display_name: "Hero",
            is_root: false,
        });
    });

    it("points the component's own group at the target group", () => {
        expect(
            remapComponentForTarget({ component, groupMap }).payload
                .component_group_uuid,
        ).toBe("tgt-child");
    });

    it("clears the group rather than keeping a source uuid the target lacks", () => {
        const remap = remapComponentForTarget({
            component: { ...component, component_group_uuid: "src-gone" },
            groupMap,
        });

        expect(remap.payload.component_group_uuid).toBeNull();
        expect(remap.missingGroup).toEqual({ sourceGroupUuid: "src-gone" });
    });

    it("never mutates the source component it was given", () => {
        const before = JSON.stringify(component);

        remapComponentForTarget({ component, groupMap });

        expect(JSON.stringify(component)).toBe(before);
    });
});

describe("copy space: presets", () => {
    const sourceComponentNameById = new Map([[501, "hero"]]);
    const targetComponentIdByName = new Map([["hero", 9001]]);

    // R8 (c) canary. Mutation that must turn it red: remove
    // `payload.component_id = targetComponentId` in remapPresetForTarget.
    it("sets component_id to the target component of the same name", () => {
        const remap = remapPresetForTarget({
            preset: {
                id: 7,
                space_id: 1,
                name: "Hero dark",
                component_id: 501,
                preset: { title: "Welcome" },
            },
            sourceComponentNameById,
            targetComponentIdByName,
        });

        expect(remap.payload).toEqual({
            name: "Hero dark",
            component_id: 9001,
            preset: { title: "Welcome" },
        });
    });

    it("reports image and icon as source-space URLs without rewriting them", () => {
        const image = "https://a.storyblok.com/f/111/hero.png";
        const remap = remapPresetForTarget({
            preset: { name: "Hero", component_id: 501, image, icon: null },
            sourceComponentNameById,
            targetComponentIdByName,
        });

        expect(remap.payload?.image).toBe(image);
        expect(remap.sourceAssetUrls).toEqual([image]);
    });

    it("skips a preset whose component the target does not have", () => {
        const remap = remapPresetForTarget({
            preset: { name: "Hero", component_id: 501 },
            sourceComponentNameById,
            targetComponentIdByName: new Map(),
        });

        expect(remap.payload).toBeUndefined();
        expect(remap.skipReason).toContain("does not exist in the target");
    });
});

describe("copy space: languages", () => {
    it("keeps every target-only language, because v1 never deletes", () => {
        const merged = mergeLanguagesForTarget({
            source: [
                { code: "de", name: "German" },
                { code: "pl", name: "Polish" },
            ],
            target: [
                { code: "fr", name: "French" },
                { code: "de", name: "Deutsch" },
            ],
        });

        expect(merged.languages).toEqual([
            { code: "fr", name: "French" },
            { code: "de", name: "German" },
            { code: "pl", name: "Polish" },
        ]);
        expect(merged.add).toEqual(["pl"]);
        expect(merged.update).toEqual(["de"]);
    });
});

describe("copy space: the plan", () => {
    const source: CopySpaceSnapshot = {
        languages: [{ code: "de", name: "German" }],
        groups: sourceGroups,
        components: [
            {
                id: 501,
                name: "hero",
                component_group_uuid: "src-child",
                schema: {
                    body: {
                        type: "bloks",
                        component_group_whitelist: ["src-parent"],
                    },
                },
            },
            { id: 502, name: "teaser" },
        ],
        presets: [{ id: 1, name: "Hero dark", component_id: 501 }],
        datasources: [{ id: 3, name: "colors", slug: "colors" }],
        entriesByDatasource: new Map([
            [
                "colors",
                [
                    { name: "red", value: "#f00" },
                    { name: "blue", value: "#00f" },
                ],
            ],
        ]),
    };

    it("plans every resource as a create against a blank target", () => {
        const plan = buildCopySpacePlan({
            sourceSpaceId: "111",
            targetSpaceId: "222",
            resources: parseCopySpaceOnly([]).resources,
            source,
            target: emptySnapshot(),
        });

        expect(plan.languages).toEqual({ total: 1, add: ["de"], update: [] });
        expect(plan.groups?.create).toEqual(["Layout", "Layout/Heroes"]);
        expect(plan.components?.create).toEqual(["hero", "teaser"]);
        expect(plan.presets?.create).toEqual(["hero/Hero dark"]);
        expect(plan.datasources?.create).toEqual(["colors"]);
        expect(plan.entries?.create).toEqual(["colors/red", "colors/blue"]);
        // The run creates the whitelisted group itself, so nothing is dropped.
        expect(plan.droppedWhitelistGroups).toEqual([]);
    });

    // R8 (h) canary. Mutation that must turn it red: push every name onto
    // `create` in buildCopySpacePlan (ignore the target when matching).
    it("plans zero creates against a target that already matches", () => {
        const target: CopySpaceSnapshot = {
            languages: [{ code: "de", name: "German" }],
            groups: targetGroups,
            components: [
                { id: 9001, name: "hero" },
                { id: 9002, name: "teaser" },
            ],
            presets: [{ id: 70, name: "Hero dark", component_id: 9001 }],
            datasources: [{ id: 30, name: "colors", slug: "colors" }],
            entriesByDatasource: new Map([
                [
                    "colors",
                    [
                        { name: "red", value: "#f00" },
                        { name: "blue", value: "#00f" },
                    ],
                ],
            ]),
        };
        const plan = buildCopySpacePlan({
            sourceSpaceId: "111",
            targetSpaceId: "222",
            resources: parseCopySpaceOnly([]).resources,
            source,
            target,
        });

        const creates = [
            plan.languages?.add,
            plan.groups?.create,
            plan.components?.create,
            plan.presets?.create,
            plan.datasources?.create,
            plan.entries?.create,
        ].flatMap((list) => list ?? []);

        expect(creates).toEqual([]);
        expect(plan.components?.update).toEqual(["hero", "teaser"]);
        expect(plan.entries?.update).toEqual(["colors/red", "colors/blue"]);
    });

    it("never plans anything for a resource that exists only in the target", () => {
        const target = emptySnapshot();
        target.components = [{ id: 1, name: "target-only" }];

        const plan = buildCopySpacePlan({
            sourceSpaceId: "111",
            targetSpaceId: "222",
            resources: ["components"],
            source,
            target,
        });

        expect(JSON.stringify(plan)).not.toContain("target-only");
    });

    it("reports a whitelisted group dropped when groups are not copied", () => {
        const plan = buildCopySpacePlan({
            sourceSpaceId: "111",
            targetSpaceId: "222",
            resources: ["components"],
            source,
            target: emptySnapshot(),
        });

        expect(plan.droppedWhitelistGroups).toEqual([
            {
                component: "hero",
                field: "body",
                sourceGroupUuid: "src-parent",
                groupPath: "Layout",
            },
        ]);
    });

    it("skips a preset whose component will not exist in the target", () => {
        const plan = buildCopySpacePlan({
            sourceSpaceId: "111",
            targetSpaceId: "222",
            resources: ["presets"],
            source,
            target: emptySnapshot(),
        });

        expect(plan.presets?.create).toEqual([]);
        expect(plan.presets?.skip).toEqual([
            {
                name: "hero/Hero dark",
                reason: "component 'hero' does not exist in the target space",
            },
        ]);
    });
});

describe("copy space: round 3 findings", () => {
    // F5 canary. Mutation that must turn it red: in buildCopySpacePlan's
    // projected groups, always set parent_uuid to `planned:<parent_uuid>`
    // instead of the existing target parent's uuid.
    it("does not report a whitelist as dropped when a new child group sits under an existing parent", () => {
        const source: CopySpaceSnapshot = {
            ...emptySnapshot(),
            groups: sourceGroups,
            components: [
                {
                    id: 501,
                    name: "hero",
                    schema: {
                        body: {
                            type: "bloks",
                            component_group_whitelist: ["src-child"],
                        },
                    },
                },
            ],
        };
        const target: CopySpaceSnapshot = {
            ...emptySnapshot(),
            // `Layout` already exists under its own uuid; `Layout/Heroes` is new.
            groups: [
                { id: 91, uuid: "tgt-parent", name: "Layout", parent_id: null },
            ],
        };

        const plan = buildCopySpacePlan({
            sourceSpaceId: "111",
            targetSpaceId: "222",
            resources: ["groups", "components"],
            source,
            target,
        });

        expect(plan.groups?.update).toEqual(["Layout"]);
        expect(plan.groups?.create).toEqual(["Layout/Heroes"]);
        expect(plan.droppedWhitelistGroups).toEqual([]);
    });

    // F6 canary. Mutation that must turn it red: remove "preset_id",
    // "internal_tag_ids" or "internal_tags_list" from COMPONENT_GENERATED_KEYS.
    it("never carries the source default preset id or source internal tag ids", () => {
        const { payload } = remapComponentForTarget({
            component: {
                id: 1,
                name: "hero",
                preset_id: 7,
                internal_tag_ids: ["12"],
                internal_tags_list: [{ id: 12, name: "legacy" }],
            },
            groupMap: buildGroupNameMap({ sourceGroups: [], targetGroups: [] }),
        });

        expect(payload).not.toHaveProperty("preset_id");
        expect(payload).not.toHaveProperty("internal_tag_ids");
        expect(payload).not.toHaveProperty("internal_tags_list");
        expect(payload.name).toBe("hero");
    });

    // F6 canary. Mutation that must turn it red: stop collecting
    // componentsWithSourceImageUrls / componentsWithInternalTags in the plan.
    it("counts components whose image points at the source space and components with internal tags", () => {
        const plan = buildCopySpacePlan({
            sourceSpaceId: "111",
            targetSpaceId: "222",
            resources: ["components"],
            source: {
                ...emptySnapshot(),
                components: [
                    {
                        id: 1,
                        name: "with-image",
                        image: "https://a.storyblok.com/f/111/a.png",
                        internal_tag_ids: ["3"],
                    },
                    {
                        id: 2,
                        name: "no-image",
                        image: null,
                        internal_tags_list: [],
                    },
                    { id: 3, name: "plain" },
                ],
            },
            target: emptySnapshot(),
        });

        expect(plan.componentsWithSourceImageUrls).toEqual(["with-image"]);
        expect(plan.componentsWithInternalTags).toBe(1);
    });

    // F1: which default presets a run can restore, decided before any write.
    it("plans restoring a default preset only when components and presets are both copied", () => {
        const source: CopySpaceSnapshot = {
            ...emptySnapshot(),
            components: [
                { id: 501, name: "hero", preset_id: 7 },
                { id: 502, name: "teaser", preset_id: 999 },
                { id: 503, name: "plain" },
            ],
            presets: [{ id: 7, name: "Hero dark", component_id: 501 }],
        };

        const full = buildCopySpacePlan({
            sourceSpaceId: "111",
            targetSpaceId: "222",
            resources: ["components", "presets"],
            source,
            target: emptySnapshot(),
        });

        expect(full.defaultPresets?.restore).toEqual(["hero"]);
        expect(full.defaultPresets?.notRestorable).toEqual([
            {
                name: "teaser",
                reason: "its default preset (id 999) is not in the source space",
            },
        ]);

        const componentsOnly = buildCopySpacePlan({
            sourceSpaceId: "111",
            targetSpaceId: "222",
            resources: ["components"],
            source,
            target: emptySnapshot(),
        });

        expect(componentsOnly.defaultPresets?.restore).toEqual([]);
        expect(
            componentsOnly.defaultPresets?.notRestorable.map(
                (item) => item.name,
            ),
        ).toEqual(["hero", "teaser"]);
    });

    it("prints component images, internal tags and default presets beside the preset line", () => {
        const plan = buildCopySpacePlan({
            sourceSpaceId: "111",
            targetSpaceId: "222",
            resources: parseCopySpaceOnly([]).resources,
            source: {
                ...emptySnapshot(),
                components: [
                    {
                        id: 501,
                        name: "hero",
                        preset_id: 7,
                        image: "https://a.storyblok.com/f/111/hero.png",
                        internal_tag_ids: ["4"],
                    },
                ],
                presets: [{ id: 7, name: "Hero dark", component_id: 501 }],
            },
            target: emptySnapshot(),
        });
        const lines = formatCopySpacePlanGate(
            buildCopySpacePlanGateSummary(plan),
        );

        expect(lines).toContain(
            "  component images: 1 keep URLs that point at space 111",
        );
        expect(lines).toContain(
            "  internal tags: not copied (1 component had tags)",
        );
        expect(lines).toContain(
            "  default presets: 1 restored, 0 not restorable",
        );
        expect(lines[lines.length - 1]).toContain("internal tags");
    });
});
