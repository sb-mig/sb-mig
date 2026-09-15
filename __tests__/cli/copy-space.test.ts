import { mkdtemp, readFile, rm } from "fs/promises";
import { tmpdir } from "os";
import path from "path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
    askYesNo: vi.fn(),
}));

vi.mock("../../src/cli/helpers.js", () => ({
    askYesNo: mocks.askYesNo,
}));

vi.mock("../../src/cli/api-config.js", () => ({
    apiConfig: {
        spaceId: "111",
        rateLimit: 3,
        sbApi: {
            get: mocks.get,
            post: mocks.post,
            put: mocks.put,
        },
    },
}));

vi.mock("../../src/api/managementApi.js", () => ({
    managementApi: {
        stories: {},
        components: {},
        assets: {},
        datasources: {},
        presets: {},
        spaces: {},
    },
}));

vi.mock("../../src/utils/logger.js", () => ({
    default: {
        log: vi.fn(),
        success: vi.fn(),
        warning: vi.fn(),
        error: vi.fn(),
    },
}));

import { copyCommand } from "../../src/cli/commands/copy.js";
import Logger from "../../src/utils/logger.js";

type SpaceFixture = {
    space: Record<string, any>;
    component_groups: any[];
    components: any[];
    presets: any[];
    datasources: any[];
    /** Entries by datasource id; `dimension` reads get `dimension_value`. */
    entries: Record<number, any[]>;
};

const sourceSpace: SpaceFixture = {
    space: {
        id: 111,
        default_lang_name: "English",
        languages: [{ code: "de", name: "German" }],
    },
    component_groups: [
        {
            id: 12,
            uuid: "src-child",
            name: "Heroes",
            parent_id: 11,
            parent_uuid: "src-parent",
        },
        { id: 11, uuid: "src-parent", name: "Layout", parent_id: null },
    ],
    components: [
        {
            id: 501,
            name: "hero",
            space_id: 111,
            // Its default preset, by the source's own preset id.
            preset_id: 7,
            component_group_uuid: "src-child",
            schema: {
                body: {
                    id: "gen-1",
                    type: "bloks",
                    component_group_whitelist: ["src-parent"],
                },
            },
        },
    ],
    presets: [
        {
            id: 7,
            name: "Hero dark",
            component_id: 501,
            preset: { title: "Hi" },
        },
    ],
    datasources: [
        {
            id: 3,
            name: "colors",
            slug: "colors",
            dimensions: [{ id: 31, name: "user", entry_value: "user" }],
        },
    ],
    entries: {
        3: [
            {
                id: 301,
                name: "red",
                value: "#f00",
                dimension_value: "#e00",
            },
        ],
    },
};

const blankSpace = (): SpaceFixture => ({
    space: { id: 222, languages: [] },
    component_groups: [],
    components: [],
    presets: [],
    datasources: [],
    entries: {},
});

let spaces: Record<string, SpaceFixture>;
let createdIds: number;

/**
 * A small in-memory Storyblok: GETs answer from the fixtures, POSTs add to
 * them, so the reads that follow a write see what the write did.
 */
const installFakeStoryblok = () => {
    mocks.get.mockImplementation(async (url: string, params: any = {}) => {
        const match = url.match(/^spaces\/(\d+)\/?(.*)$/);
        const spaceId = match?.[1] as string;
        const rest = (match?.[2] ?? "").replace(/\/$/, "");
        const fixture = spaces[spaceId];

        if (!fixture) {
            throw new Error(`no such space ${spaceId}`);
        }

        if (rest === "") return { data: { space: fixture.space } };

        const single = rest.match(/^datasources\/(\d+)$/);

        if (single) {
            return {
                data: {
                    datasource: fixture.datasources.find(
                        (datasource) => datasource.id === Number(single[1]),
                    ),
                },
            };
        }

        if (rest === "datasource_entries") {
            const entries = (fixture.entries[params.datasource_id] ?? []).map(
                (entry) => {
                    const { dimension_value, ...plain } = entry;
                    return params.dimension
                        ? { ...plain, dimension_value }
                        : plain;
                },
            );

            return { data: { datasource_entries: entries } };
        }

        return { data: { [rest]: (fixture as any)[rest] } };
    });

    mocks.post.mockImplementation(async (url: string, body: any) => {
        const [, spaceId, collection] = url.match(
            /^spaces\/(\d+)\/([a-z_]+)\/?$/,
        ) as string[];
        const fixture = spaces[spaceId as string] as SpaceFixture;
        const id = (createdIds += 1);

        if (collection === "component_groups") {
            const parent = fixture.component_groups.find(
                (group) => group.id === body.component_group.parent_id,
            );
            const group = {
                id,
                uuid: `tgt-${id}`,
                name: body.component_group.name,
                parent_id: parent?.id ?? null,
                parent_uuid: parent?.uuid ?? null,
            };
            fixture.component_groups.push(group);
            return { data: { component_group: group } };
        }

        if (collection === "components") {
            fixture.components.push({ id, ...body.component });
            return { data: { component: { id } } };
        }

        if (collection === "presets") {
            fixture.presets.push({ id, ...body.preset });
            return { data: { preset: { id } } };
        }

        if (collection === "datasources") {
            const datasource = {
                id,
                name: body.datasource.name,
                slug: body.datasource.slug,
                dimensions: body.datasource.dimensions_attributes.map(
                    (dimension: any, index: number) => ({
                        id: id * 10 + index,
                        ...dimension,
                    }),
                ),
            };
            fixture.datasources.push(datasource);
            return { data: { datasource } };
        }

        if (collection === "datasource_entries") {
            const entry = { id, ...body.datasource_entry };
            const list = (fixture.entries[entry.datasource_id] ??= []);
            list.push(entry);
            return { data: { datasource_entry: entry } };
        }

        throw new Error(`unexpected POST ${url}`);
    });

    mocks.put.mockImplementation(async (url: string, body: any) => {
        const spaceWrite = url.match(/^spaces\/(\d+)$/);

        // The one PUT whose effect a later read depends on: the space's own
        // languages. Every other update keeps its name, which is all a rerun
        // plan matches on.
        if (spaceWrite && body?.space) {
            const fixture = spaces[spaceWrite[1] as string] as SpaceFixture;
            fixture.space = { ...fixture.space, ...body.space };
        }

        const componentWrite = url.match(/^spaces\/(\d+)\/components\/(\d+)$/);

        if (componentWrite && body?.component) {
            const fixture = spaces[componentWrite[1] as string] as SpaceFixture;
            const component = fixture.components.find(
                (item) => item.id === Number(componentWrite[2]),
            );

            if (component) {
                Object.assign(component, body.component);
            }
        }

        return { data: {} };
    });
};

const writeCalls = () => [
    ...mocks.post.mock.calls.map((call) => `POST ${call[0]}`),
    ...mocks.put.mock.calls.map((call) => `PUT ${call[0]}`),
];

const errorLines = () =>
    (Logger.error as unknown as ReturnType<typeof vi.fn>).mock.calls.map(
        (call) => String(call[0]),
    );

const logLines = () =>
    (Logger.log as unknown as ReturnType<typeof vi.fn>).mock.calls.map((call) =>
        String(call[0]),
    );

const runCopySpace = (flags: Record<string, unknown>) =>
    copyCommand({ input: ["copy", "space"], flags } as any);

let exitCodeBefore: typeof process.exitCode;
let tempDir: string;
let isTTY: boolean | undefined;

describe("copy space", () => {
    beforeEach(async () => {
        vi.clearAllMocks();
        spaces = {
            "111": structuredClone(sourceSpace),
            "222": blankSpace(),
        };
        createdIds = 9000;
        installFakeStoryblok();
        exitCodeBefore = process.exitCode;
        tempDir = await mkdtemp(path.join(tmpdir(), "sb-mig-copy-space-"));
        isTTY = process.stdin.isTTY;
    });

    afterEach(async () => {
        process.exitCode = exitCodeBefore;
        Object.defineProperty(process.stdin, "isTTY", {
            value: isTTY,
            configurable: true,
        });
        await rm(tempDir, { recursive: true, force: true });
    });

    // R8 (e) canary. Mutation that must turn it red: delete the
    // `String(sourceSpace) === String(targetSpace)` guard in copy.ts.
    it("refuses to copy a space onto itself", async () => {
        await runCopySpace({ from: "111", to: "111", yes: true });

        expect(errorLines()[0]).toContain("both resolve to space 111");
        expect(process.exitCode).toBe(1);
        expect(mocks.get).not.toHaveBeenCalled();
        expect(writeCalls()).toEqual([]);
    });

    it("refuses an unknown --only resource before reading anything", async () => {
        await runCopySpace({ from: "111", to: "222", only: "workflows" });

        expect(errorLines()[0]).toContain("Unknown: workflows");
        expect(process.exitCode).toBe(1);
        expect(mocks.get).not.toHaveBeenCalled();
    });

    // R8 (f) canary. Mutation that must turn it red: drop `dryRun ||` from the
    // early return in runCopySpace.
    it("prints the plan and makes zero writes under --dry-run", async () => {
        const outputPath = path.join(tempDir, "plan.json");

        await runCopySpace({
            from: "111",
            to: "222",
            dryRun: true,
            // --yes on purpose: the gate would open, so only --dry-run stands
            // between this run and a write.
            yes: true,
            outputPath,
        });

        expect(writeCalls()).toEqual([]);
        expect(mocks.askYesNo).not.toHaveBeenCalled();
        expect(logLines()).toContain("PLAN");
        expect(logLines()).toContain(
            "  components: 1 create, 0 update, 0 skip",
        );

        const plan = JSON.parse(await readFile(outputPath, "utf8"));

        expect(plan).toMatchObject({
            command: "copy space",
            sourceSpaceId: "111",
            targetSpaceId: "222",
            groups: { create: ["Layout", "Layout/Heroes"] },
            components: { create: ["hero"] },
            presets: { create: ["hero/Hero dark"] },
            datasources: { create: ["colors"] },
            entries: { create: ["colors/red"] },
        });
    });

    // R8 (g) canary. Mutation that must turn it red: call applyCopySpace
    // without awaiting confirm() in runCopySpace.
    it("refuses to write without a terminal and without --yes", async () => {
        Object.defineProperty(process.stdin, "isTTY", {
            value: false,
            configurable: true,
        });

        await runCopySpace({ from: "111", to: "222" });

        expect(errorLines().join("\n")).toContain(
            "Refusing to write without confirmation",
        );
        expect(process.exitCode).toBe(1);
        expect(writeCalls()).toEqual([]);
    });

    it("writes in ruled order, reading the source and writing only the target", async () => {
        await runCopySpace({ from: "111", to: "222", yes: true });

        expect(process.exitCode).toBeUndefined();

        // Reads never touch the target with a write, writes never touch the
        // source.
        expect(writeCalls().every((call) => call.includes(" spaces/222"))).toBe(
            true,
        );

        const firstWriteOf = (fragment: string) =>
            mocks.put.mock.invocationCallOrder
                .map((order, index) => ({
                    order,
                    url: String(mocks.put.mock.calls[index]?.[0]),
                }))
                .concat(
                    mocks.post.mock.invocationCallOrder.map((order, index) => ({
                        order,
                        url: String(mocks.post.mock.calls[index]?.[0]),
                    })),
                )
                .filter(({ url }) =>
                    fragment === "space"
                        ? url === "spaces/222"
                        : url.includes(fragment),
                )
                .map(({ order }) => order)
                .sort((left, right) => left - right)[0] as number;

        const order = [
            firstWriteOf("space"),
            firstWriteOf("component_groups"),
            firstWriteOf("/components"),
            firstWriteOf("presets"),
            firstWriteOf("datasources/"),
            firstWriteOf("datasource_entries"),
        ];

        expect(order).toEqual([...order].sort((left, right) => left - right));
    });

    it("sends the languages body the Management API documents", async () => {
        await runCopySpace({
            from: "111",
            to: "222",
            yes: true,
            only: "languages",
        });

        expect(mocks.put).toHaveBeenCalledWith("spaces/222", {
            space: {
                languages: [{ code: "de", name: "German" }],
                default_lang_name: "English",
            },
        });
    });

    it("lands the target with nested groups, a remapped whitelist and a remapped preset", async () => {
        await runCopySpace({ from: "111", to: "222", yes: true });

        const target = spaces["222"] as SpaceFixture;
        const layout = target.component_groups.find(
            (group) => group.name === "Layout",
        );
        const heroes = target.component_groups.find(
            (group) => group.name === "Heroes",
        );

        // The child was created under the parent the run had just created.
        expect(heroes?.parent_id).toBe(layout?.id);

        const hero = target.components.find(
            (component) => component.name === "hero",
        );

        expect(hero.component_group_uuid).toBe(heroes?.uuid);
        expect(hero.schema.body.component_group_whitelist).toEqual([
            layout?.uuid,
        ]);
        expect(hero.schema.body).not.toHaveProperty("id");
        expect(hero).not.toHaveProperty("space_id");

        expect(target.presets[0]).toMatchObject({
            name: "Hero dark",
            component_id: hero.id,
        });

        // The dimension value was written against the target's own dimension.
        const createdDatasource = target.datasources[0];
        const dimensionPut = mocks.put.mock.calls.find(
            (call) => call[1]?.dimension_id !== undefined,
        );

        expect(dimensionPut?.[1]).toMatchObject({
            datasource_entry: { name: "red", dimension_value: "#e00" },
            dimension_id: createdDatasource.dimensions[0].id,
        });
    });

    it("plans a rerun against the landed target as zero creates", async () => {
        await runCopySpace({ from: "111", to: "222", yes: true });

        vi.clearAllMocks();
        installFakeStoryblok();

        const outputPath = path.join(tempDir, "rerun.json");

        await runCopySpace({
            from: "111",
            to: "222",
            dryRun: true,
            outputPath,
        });

        const plan = JSON.parse(await readFile(outputPath, "utf8"));
        const creates = [
            plan.languages.add,
            plan.groups.create,
            plan.components.create,
            plan.presets.create,
            plan.datasources.create,
            plan.entries.create,
        ].flat();

        expect(creates).toEqual([]);
        expect(writeCalls()).toEqual([]);
    });

    it("collects a failed write, carries on, and exits 1 at the end", async () => {
        mocks.post.mockImplementationOnce(async () => {
            throw Object.assign(new Error("Unprocessable"), {
                response: { data: { name: ["has already been taken"] } },
            });
        });

        await runCopySpace({
            from: "111",
            to: "222",
            yes: true,
            only: "groups,components",
        });

        expect(process.exitCode).toBe(1);
        expect(
            errorLines().some((line) =>
                line.includes("has already been taken"),
            ),
        ).toBe(true);
        // The parent group failed, so its child was not created at the root,
        // but the component was still written.
        expect(
            mocks.post.mock.calls.filter((call) =>
                String(call[0]).includes("/components/"),
            ),
        ).toHaveLength(1);
        expect(
            errorLines().some((line) =>
                line.includes("copy space finished with 2 failed writes"),
            ),
        ).toBe(true);
    });

    it("never issues a DELETE and never writes to a target-only resource", async () => {
        (spaces["222"] as SpaceFixture).components.push({
            id: 1,
            name: "target-only",
        });

        await runCopySpace({ from: "111", to: "222", yes: true });

        expect(
            writeCalls().some((call) => call.includes("/components/1")),
        ).toBe(false);
    });
    /* ------------------------------------------------------------------ *
     * Round 3 findings
     * ------------------------------------------------------------------ */

    // F1 canary. Mutation that must turn it red: skip the default-preset
    // restore step in applyCopySpace.
    it("restores a component's default preset to the target's own preset id", async () => {
        const outputPath = path.join(tempDir, "applied.json");

        await runCopySpace({ from: "111", to: "222", yes: true, outputPath });

        const target = spaces["222"] as SpaceFixture;
        const hero = target.components.find(
            (component) => component.name === "hero",
        );
        const createBody = mocks.post.mock.calls.find((call) =>
            String(call[0]).endsWith("/components/"),
        )?.[1];

        // The create payload never carries the source's preset id.
        expect(createBody.component).not.toHaveProperty("preset_id");
        // After the presets step it points at the preset the run created.
        expect(hero.preset_id).toBe(target.presets[0].id);
        expect(hero.preset_id).not.toBe(7);
        expect(mocks.put).toHaveBeenCalledWith(
            `spaces/222/components/${hero.id}`,
            { component: { preset_id: target.presets[0].id } },
        );
        expect(process.exitCode).toBeUndefined();
    });

    it("prints the default preset count in the PLAN block", async () => {
        await runCopySpace({ from: "111", to: "222", dryRun: true });

        expect(logLines()).toContain(
            "  default presets: 1 restored, 0 not restorable",
        );
    });

    const matchedColorsTarget = ({
        dimensionValue,
        entryValue = "user",
    }: {
        dimensionValue: string | null;
        entryValue?: string;
    }) => {
        const target = spaces["222"] as SpaceFixture;

        target.datasources = [
            {
                id: 30,
                name: "colors",
                slug: "colors",
                dimensions: [
                    { id: 3001, name: "user", entry_value: entryValue },
                ],
            },
        ];
        target.entries = {
            30: [
                {
                    id: 3010,
                    name: "red",
                    value: "#f00",
                    dimension_value: dimensionValue,
                },
            ],
        };
    };

    const dimensionPuts = () =>
        mocks.put.mock.calls.filter(
            (call) => call[1]?.dimension_id !== undefined,
        );

    // F2 canary. Mutation that must turn it red: in readEntries, drop empty
    // dimension values again (skip `null` / `""`).
    it("clears a target translation the source has cleared", async () => {
        (
            (spaces["111"] as SpaceFixture).entries[3] as any[]
        )[0].dimension_value = "";
        matchedColorsTarget({ dimensionValue: "STALE" });

        await runCopySpace({
            from: "111",
            to: "222",
            yes: true,
            only: "datasources",
        });

        expect(dimensionPuts()).toHaveLength(1);
        expect(dimensionPuts()[0]?.[1]).toMatchObject({
            datasource_entry: { name: "red", dimension_value: "" },
            dimension_id: 3001,
        });
    });

    // F2 canary. Mutation that must turn it red: write every dimension value
    // without comparing it to the target's.
    it("spends no dimension write when the target already holds the value", async () => {
        matchedColorsTarget({ dimensionValue: "#e00" });

        await runCopySpace({
            from: "111",
            to: "222",
            yes: true,
            only: "datasources",
        });

        expect(dimensionPuts()).toHaveLength(0);
    });

    // F3 canary. Mutation that must turn it red: send only the dimensions the
    // target is missing in `dimensions_attributes`.
    it("updates a matched dimension's entry_value under the target dimension id", async () => {
        matchedColorsTarget({ dimensionValue: "#e00", entryValue: "user-old" });

        await runCopySpace({
            from: "111",
            to: "222",
            yes: true,
            only: "datasources",
        });

        const datasourcePut = mocks.put.mock.calls.find(
            (call) => call[0] === "spaces/222/datasources/30",
        );

        expect(datasourcePut?.[1].datasource.dimensions_attributes).toEqual([
            { id: 3001, name: "user", entry_value: "user" },
        ]);
    });

    // F4 canary. Mutation that must turn it red: call readAll for the groups
    // refresh without the guard.
    it("keeps the failure report when a read after the first write fails", async () => {
        const fakeGet = mocks.get.getMockImplementation() as (
            url: string,
            params?: any,
        ) => Promise<any>;

        mocks.get.mockImplementation(async (url: string, params?: any) => {
            if (mocks.post.mock.calls.length > 0) {
                throw Object.assign(new Error("Service Unavailable"), {
                    response: { data: { error: "503 Service Unavailable" } },
                });
            }

            return fakeGet(url, params);
        });

        const outputPath = path.join(tempDir, "applied-after-5xx.json");

        await runCopySpace({ from: "111", to: "222", yes: true, outputPath });

        expect(process.exitCode).toBe(1);

        const report = JSON.parse(await readFile(outputPath, "utf8"));
        const refreshFailures = report.applied.failures.filter(
            (failure: any) => failure.name === "refresh",
        );

        expect(refreshFailures.map((failure: any) => failure.resource)).toEqual(
            ["groups", "components", "datasources"],
        );
        // The run carried on from what it already knew.
        expect(
            mocks.post.mock.calls.some((call) =>
                String(call[0]).endsWith("/presets/"),
            ),
        ).toBe(true);
        expect(dimensionPuts()).toHaveLength(1);
        expect(
            (spaces["222"] as SpaceFixture).components.find(
                (component) => component.name === "hero",
            )?.preset_id,
        ).toBe((spaces["222"] as SpaceFixture).presets[0].id);
    });
    /* ------------------------------------------------------------------ *
     * Round 6: a default preset is only restored onto writes that landed
     * ------------------------------------------------------------------ */

    /**
     * A target that already carries `hero` and its `Hero dark` preset, so the
     * run UPDATES both, with `hero` still pointing at a third preset of its own.
     */
    const targetWithHeroAndPreset = () => {
        const target = spaces["222"] as SpaceFixture;

        target.components = [{ id: 9001, name: "hero", preset_id: 9003 }];
        target.presets = [
            {
                id: 9002,
                name: "Hero dark",
                component_id: 9001,
                preset: { title: "STALE" },
            },
        ];
    };

    const presetIdRestores = () =>
        mocks.put.mock.calls.filter(
            (call) => call[1]?.component?.preset_id !== undefined,
        );

    const failWritesTo = (
        predicate: (url: string, body: any) => boolean,
        message: string,
    ) => {
        const fakePut = mocks.put.getMockImplementation() as (
            url: string,
            body?: any,
        ) => Promise<any>;

        mocks.put.mockImplementation(async (url: string, body?: any) => {
            if (predicate(url, body)) {
                throw Object.assign(new Error("Unprocessable"), {
                    response: { data: { error: message } },
                });
            }

            return fakePut(url, body);
        });
    };

    // F8 (a) canary. Mutation that must turn it red: seed presetsWritten from
    // target.presets again, so an existing preset counts as written before its
    // update has run.
    it("does not restore a default preset whose preset update was rejected", async () => {
        targetWithHeroAndPreset();
        failWritesTo(
            (url) => url === "spaces/222/presets/9002",
            "preset rejected",
        );

        await runCopySpace({
            from: "111",
            to: "222",
            yes: true,
            only: "components,presets",
        });

        // The component is left pointing at its own preset, not switched to a
        // preset whose update never landed.
        expect(presetIdRestores()).toEqual([]);
        expect(
            (spaces["222"] as SpaceFixture).components.find(
                (component) => component.name === "hero",
            )?.preset_id,
        ).toBe(9003);
        expect(
            errorLines().some(
                (line) =>
                    line.includes("hero@preset_id") &&
                    line.includes("Hero dark") &&
                    line.includes("was not written"),
            ),
        ).toBe(true);
        expect(process.exitCode).toBe(1);
    });

    // F8 (b) canary. Mutation that must turn it red: drop the componentsWritten
    // check from the restore step.
    it("does not restore a default preset onto a component whose update was rejected", async () => {
        targetWithHeroAndPreset();
        // Reject the schema write only; a restore PUT to the same URL would
        // still go through, which is exactly what must not happen.
        failWritesTo(
            (url, body) =>
                url === "spaces/222/components/9001" &&
                body?.component?.preset_id === undefined,
            "component rejected",
        );

        await runCopySpace({
            from: "111",
            to: "222",
            yes: true,
            only: "components,presets",
        });

        expect(presetIdRestores()).toEqual([]);
        expect(
            (spaces["222"] as SpaceFixture).components.find(
                (component) => component.name === "hero",
            )?.preset_id,
        ).toBe(9003);
        expect(
            errorLines().some(
                (line) =>
                    line.includes("hero@preset_id") &&
                    line.includes("component") &&
                    line.includes("was not written"),
            ),
        ).toBe(true);
        expect(process.exitCode).toBe(1);
    });

    /* ------------------------------------------------------------------ *
     * MAR-3045: field-type plugins
     * ------------------------------------------------------------------ */

    /** Gives the source's `hero` a custom field backed by `seo-metatags`. */
    const heroUsesSeoPlugin = () => {
        const hero = (spaces["111"] as SpaceFixture).components[0];

        hero.schema = {
            ...hero.schema,
            seo: { id: "gen-2", type: "custom", field_type: "seo-metatags" },
        };
    };

    /** Answers `GET field_types` with a list, or with the 403 a space token gets. */
    const targetFieldTypes = (answer: "unreadable" | any[]) => {
        const fakeGet = mocks.get.getMockImplementation() as (
            url: string,
            params?: any,
        ) => Promise<any>;

        mocks.get.mockImplementation(async (url: string, params?: any) => {
            if (url === "field_types") {
                if (answer === "unreadable") {
                    throw Object.assign(new Error("Forbidden"), {
                        status: 403,
                        response: {
                            data: {
                                error: "This endpoint does not support this token type",
                            },
                        },
                    });
                }

                return { data: { field_types: answer } };
            }

            return fakeGet(url, params);
        });
    };

    const componentWrites = () =>
        writeCalls().filter((call) => call.includes("/components"));

    // MAR-3045 R4 canary. Mutation that must turn it red: drop the missing
    // plugins refusal from runCopySpace.
    it("refuses to write when the readable target lacks a plugin the source uses", async () => {
        heroUsesSeoPlugin();
        targetFieldTypes([
            { name: "seo-metatags", space_ids: [999] },
            { name: "backpack-breakpoints", space_ids: [222] },
        ]);

        await runCopySpace({ from: "111", to: "222", yes: true });

        expect(logLines()).toContain(
            "  field-type plugins missing in target: seo-metatags (1 component)",
        );
        expect(process.exitCode).toBe(1);
        expect(writeCalls()).toEqual([]);
        expect(
            errorLines().some(
                (line) =>
                    line.includes("seo-metatags") &&
                    line.includes("--allow-missing-plugins"),
            ),
        ).toBe(true);
    });

    it("writes anyway with --allow-missing-plugins", async () => {
        heroUsesSeoPlugin();
        targetFieldTypes([{ name: "seo-metatags", space_ids: [999] }]);

        await runCopySpace({
            from: "111",
            to: "222",
            yes: true,
            only: "components",
            allowMissingPlugins: true,
        });

        expect(componentWrites()).toEqual(["POST spaces/222/components/"]);
    });

    it("writes when the target has every plugin assigned", async () => {
        heroUsesSeoPlugin();
        targetFieldTypes([{ name: "seo-metatags", space_ids: [111, 222] }]);

        await runCopySpace({
            from: "111",
            to: "222",
            yes: true,
            only: "components",
        });

        expect(componentWrites()).toEqual(["POST spaces/222/components/"]);
        expect(process.exitCode).not.toBe(1);
    });

    it("lists the plugins and proceeds when the target's plugins cannot be read", async () => {
        heroUsesSeoPlugin();
        targetFieldTypes("unreadable");

        await runCopySpace({
            from: "111",
            to: "222",
            yes: true,
            only: "components",
        });

        expect(logLines()).toContain(
            "  field-type plugins the source uses: seo-metatags (1 component) — the target must have them assigned",
        );
        expect(componentWrites()).toEqual(["POST spaces/222/components/"]);
    });

    it("never reads field types when no component uses a plugin", async () => {
        await runCopySpace({ from: "111", to: "222", dryRun: true });

        expect(
            mocks.get.mock.calls.some((call) => call[0] === "field_types"),
        ).toBe(false);
    });

    // MAR-3045 R4 canary. Mutation that must turn it red: log every plugin
    // rejection on its own line again instead of grouping them.
    it("groups plugin rejections by plugin in the summary and keeps each in the report", async () => {
        const custom = (fieldType: string) => ({
            type: "custom",
            field_type: fieldType,
        });

        (spaces["111"] as SpaceFixture).components = [
            { id: 501, name: "hero", schema: { seo: custom("seo-metatags") } },
            {
                id: 502,
                name: "teaser",
                schema: { seo: custom("seo-metatags") },
            },
            {
                id: 503,
                name: "card",
                schema: {
                    seo: custom("seo-metatags"),
                    bp: custom("backpack-breakpoints"),
                },
            },
        ];
        targetFieldTypes("unreadable");

        const pluginsIn: Record<string, string> = {
            hero: "seo-metatags",
            teaser: "seo-metatags",
            card: "seo-metatags, backpack-breakpoints",
        };

        mocks.post.mockImplementation(async (url: string, body: any) => {
            throw Object.assign(new Error("Unprocessable"), {
                response: {
                    data: {
                        error: `The following field-type plugin(s) are not available in this space: ${pluginsIn[body.component.name]}. Install the corresponding app (and, if required, upgrade your plan) to use them.`,
                    },
                },
            });
        });

        const outputPath = path.join(tempDir, "plugins.json");

        await runCopySpace({
            from: "111",
            to: "222",
            yes: true,
            only: "components",
            outputPath,
        });

        expect(process.exitCode).toBe(1);
        expect(errorLines()).toContain(
            "components not written: 3 — missing plugins: seo-metatags (3), backpack-breakpoints (1)",
        );
        // No red line per component for this reason.
        expect(
            errorLines().filter((line) =>
                line.startsWith("copy space: components '"),
            ),
        ).toEqual([]);

        const report = JSON.parse(await readFile(outputPath, "utf8"));

        expect(
            report.applied.failures.map((failure: any) => [
                failure.name,
                failure.missingPlugins,
            ]),
        ).toEqual(
            expect.arrayContaining([
                ["hero", ["seo-metatags"]],
                ["teaser", ["seo-metatags"]],
                ["card", ["seo-metatags", "backpack-breakpoints"]],
            ]),
        );
    });

    /* ------------------------------------------------------------------ *
     * MAR-3046: entry names Storyblok rejects
     * ------------------------------------------------------------------ */

    // MAR-3046 R3 canary. Mutation that must turn it red: drop the `^[-=@]`
    // check, so the entry is planned and written like any other.
    it("never writes an entry named --x and still writes a plain name", async () => {
        (spaces["111"] as SpaceFixture).entries[3]?.push({
            id: 302,
            name: "--x",
            value: "1",
            dimension_value: "2",
        });

        const outputPath = path.join(tempDir, "entries.json");

        await runCopySpace({
            from: "111",
            to: "222",
            yes: true,
            only: "datasources",
            outputPath,
        });

        const entryWrites = [
            ...mocks.post.mock.calls,
            ...mocks.put.mock.calls,
        ].filter((call) => String(call[0]).includes("datasource_entries"));

        expect(
            entryWrites.some(
                (call) => call[1]?.datasource_entry?.name === "--x",
            ),
        ).toBe(false);
        expect(
            entryWrites.some(
                (call) => call[1]?.datasource_entry?.name === "red",
            ),
        ).toBe(true);
        expect(logLines()).toContain(
            "  entries Storyblok will reject: colors 1 of 2",
        );
        expect(logLines()).toContain("  entries: 1 create, 0 update, 1 skip");
        expect(process.exitCode).not.toBe(1);

        const report = JSON.parse(await readFile(outputPath, "utf8"));

        expect(report.entriesStoryblokWillReject).toEqual([
            { datasource: "colors", count: 1, total: 2, names: ["--x"] },
        ]);
        expect(report.entries.skip).toEqual([
            {
                name: "colors/--x",
                reason: "name starts with a character Storyblok rejects (-, =, @)",
            },
        ]);
    });
});
