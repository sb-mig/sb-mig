import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../src/utils/logger.js", () => ({
    default: {
        log: vi.fn(),
        success: vi.fn(),
        warning: vi.fn(),
        error: vi.fn(),
    },
}));

import {
    buildCopySpacePlanGateSummary,
    formatCopySpacePlanGate,
} from "../../src/api/copy/plan-gate.js";
import {
    readCopySpaceSnapshot,
    runCopySpace,
} from "../../src/api/copy/space-apply.js";
import {
    buildCopySpacePlan,
    buildCopySpaceSettingsBody,
    COPY_SPACE_RESOURCES,
    mergeEnvironmentsForTarget,
    parseCopySpaceOnly,
    pickCopySpaceSettings,
    planCopySpaceSettings,
    redactUrl,
} from "../../src/api/copy/space.js";
import { copyDescription } from "../../src/cli/cli-descriptions.js";
import Logger from "../../src/utils/logger.js";

const SECRET = "abc123XYZ";
const SOURCE_DOMAIN = `https://preview.example.com/api/preview?secret=${SECRET}&slug=home`;
const SOURCE_LOCATION = `https://localhost:3010/api/preview?secret=${SECRET}`;

/** A stub `sbApi` over two spaces; `put` records every body it is handed. */
const stubApi = ({
    source,
    target,
    rejectPutWith,
}: {
    source: Record<string, any>;
    target: Record<string, any>;
    rejectPutWith?: { status: number; data: unknown };
}) => {
    const get = vi.fn(async (path: string): Promise<any> => {
        if (path === "spaces/111") {
            return { data: { space: source } };
        }

        if (path === "spaces/222") {
            return { data: { space: target } };
        }

        throw new Error(`unexpected GET ${path}`);
    });
    const put = vi.fn(async (_path: string, _body?: any) => {
        if (rejectPutWith) {
            // The shape of a Storyblok client rejection: the response body is
            // echoed in the message and kept on the error.
            throw Object.assign(new Error(JSON.stringify(rejectPutWith.data)), {
                status: rejectPutWith.status,
                response: {
                    status: rejectPutWith.status,
                    data: rejectPutWith.data,
                },
            });
        }

        return { data: { space: {} } };
    });

    return { get, post: vi.fn(), put };
};

const run = async ({
    source,
    target,
    resources = ["settings"],
    dryRun = false,
    rejectPutWith,
}: {
    source: Record<string, any>;
    target: Record<string, any>;
    resources?: string[];
    dryRun?: boolean;
    rejectPutWith?: { status: number; data: unknown };
}) => {
    const sbApi = stubApi({ source, target, rejectPutWith });
    const shown: any[] = [];
    const result = await runCopySpace({
        sbApi,
        sourceSpaceId: "111",
        targetSpaceId: "222",
        resources: parseCopySpaceOnly(resources).resources,
        dryRun,
        concurrency: 1,
        showPlan: (plan) => {
            shown.push(plan);
        },
        confirm: async () => true,
    });

    return { sbApi, shown, result };
};

const settingsPuts = (sbApi: ReturnType<typeof stubApi>) =>
    sbApi.put.mock.calls.filter(
        ([path, body]) =>
            path === "spaces/222" && body?.space?.languages === undefined,
    );

const loggedStrings = () =>
    (["log", "success", "warning", "error"] as const).flatMap((method) =>
        (Logger[method] as unknown as ReturnType<typeof vi.fn>).mock.calls.map(
            (call) => call.map((argument) => String(argument)).join(" "),
        ),
    );

const emptySnapshot = () => ({
    languages: [],
    groups: [],
    components: [],
    presets: [],
    datasources: [],
    entriesByDatasource: new Map(),
});

const blankTarget = () => ({
    id: 222,
    use_translated_stories: false,
    show_stories_alternative_versions: false,
    hide_flag_icons: false,
    flag_icons_display_mode: "language",
    domain: "",
    environments: [],
    encode_preview_urls: false,
});

beforeEach(() => {
    vi.clearAllMocks();
});

describe("copy space settings: the resource (R1)", () => {
    // R1 canary. Mutation that must turn it red: remove `settings` from
    // COPY_SPACE_RESOURCES.
    it("accepts --only settings, includes it by default and names it in the error", () => {
        expect(parseCopySpaceOnly(["settings"]).resources).toEqual([
            "settings",
        ]);
        expect(parseCopySpaceOnly([]).resources).toEqual([
            "languages",
            "settings",
            "groups",
            "components",
            "presets",
            "datasources",
        ]);
        expect(
            parseCopySpaceOnly(["groups,settings,languages"]).resources,
        ).toEqual(["languages", "settings", "groups"]);
        expect(parseCopySpaceOnly(["workflows"]).error).toContain(
            "languages, settings, groups",
        );
        expect(COPY_SPACE_RESOURCES).toContain("settings");
    });
});

describe("copy space settings: reading (R3)", () => {
    // R3 canary. Mutation that must turn it red: drop the `options` fallback.
    it("reads each field top-level first, then from options, and leaves absent fields undefined", () => {
        const topLevel = pickCopySpaceSettings({
            use_translated_stories: true,
            flag_icons_display_mode: "country",
            domain: SOURCE_DOMAIN,
            environments: [{ name: "LOCALHOST", location: SOURCE_LOCATION }],
        });
        const optionsOnly = pickCopySpaceSettings({
            options: {
                use_translated_stories: true,
                flag_icons_display_mode: "country",
                domain: SOURCE_DOMAIN,
                environments: [
                    { name: "LOCALHOST", location: SOURCE_LOCATION },
                ],
            },
        });

        expect(optionsOnly).toEqual(topLevel);
        expect(topLevel.hide_flag_icons).toBeUndefined();
        expect("hide_flag_icons" in topLevel).toBe(false);
        expect(
            planCopySpaceSettings({ source: optionsOnly, target: {} }),
        ).toEqual(planCopySpaceSettings({ source: topLevel, target: {} }));
        // Top-level wins over options.
        expect(
            pickCopySpaceSettings({
                hide_flag_icons: false,
                options: { hide_flag_icons: true },
            }).hide_flag_icons,
        ).toBe(false);
    });

    // R3 canary. Mutation that must turn it red: read the space a second time
    // for the settings.
    it("reads spaces/<id> once when both languages and settings are in scope", async () => {
        const sbApi = stubApi({
            source: {
                languages: [{ code: "de", name: "German" }],
                use_translated_stories: true,
            },
            target: blankTarget(),
        });

        const snapshot = await readCopySpaceSnapshot({
            sbApi,
            spaceId: "111",
            resources: ["languages", "settings"],
        });

        expect(
            sbApi.get.mock.calls.filter(([path]) => path === "spaces/111"),
        ).toHaveLength(1);
        expect(snapshot.languages).toEqual([{ code: "de", name: "German" }]);
        expect(snapshot.settings?.use_translated_stories).toBe(true);
    });
});

describe("copy space settings: null is absent (lap 2, A)", () => {
    // Mutation that must turn it red: test `!== undefined` instead of
    // undefined-or-null in pickCopySpaceSettings.
    it("reads a top-level null as absent, falls back to options, and never keeps a null", () => {
        const settings = pickCopySpaceSettings({
            flag_icons_display_mode: null,
            domain: null,
            environments: null,
            hide_flag_icons: null,
            options: { flag_icons_display_mode: "country", domain: null },
        });

        expect(settings).toEqual({ flag_icons_display_mode: "country" });
        expect(Object.values(settings)).not.toContain(null);
    });

    // Mutation that must turn it red: guard the mirrored fields with
    // `=== undefined` instead of undefined-or-null in the planner.
    it("plans a null mirrored source as same and writes nothing for it", () => {
        const source = {
            flag_icons_display_mode: null,
            hide_flag_icons: null,
            encode_preview_urls: null,
        } as any;
        const target = {
            flag_icons_display_mode: "language",
            hide_flag_icons: true,
            encode_preview_urls: true,
        };
        const plan = planCopySpaceSettings({ source, target });

        expect(
            plan.fields
                .filter((entry) =>
                    [
                        "flag_icons_display_mode",
                        "hide_flag_icons",
                        "encode_preview_urls",
                    ].includes(entry.field),
                )
                .map((entry) => entry.outcome),
        ).toEqual(["same", "same", "same"]);
        expect(buildCopySpaceSettingsBody({ source, target })).toEqual({});
    });

    it("writes no null to the target when the source space answers null", async () => {
        const { sbApi } = await run({
            source: {
                use_translated_stories: null,
                flag_icons_display_mode: null,
                domain: null,
                environments: null,
                encode_preview_urls: null,
            },
            target: { ...blankTarget(), encode_preview_urls: true },
        });

        expect(settingsPuts(sbApi)).toEqual([]);
    });
});

describe("copy space settings: outcomes (R4)", () => {
    const outcomeOf = (
        field: string,
        source: Record<string, any>,
        target: Record<string, any>,
    ) =>
        planCopySpaceSettings({ source, target }).fields.find(
            (entry) => entry.field === field,
        )?.outcome;

    // R4 canary. Mutations that must turn it red: make a capability flag
    // mirror the source (the `kept` rows); replace environments wholesale
    // instead of merging by name (the reordered and empty-source rows).
    it.each([
        [
            "capability flag turned on",
            "use_translated_stories",
            { use_translated_stories: true },
            { use_translated_stories: false },
            "change",
        ],
        [
            "capability flag absent in target",
            "show_stories_alternative_versions",
            { show_stories_alternative_versions: true },
            {},
            "change",
        ],
        [
            "capability flag never turned off",
            "use_translated_stories",
            { use_translated_stories: false },
            { use_translated_stories: true },
            "kept",
        ],
        [
            "capability flag kept when source lacks it",
            "show_stories_alternative_versions",
            {},
            { show_stories_alternative_versions: true },
            "kept",
        ],
        [
            "capability flag equal",
            "use_translated_stories",
            { use_translated_stories: true },
            { use_translated_stories: true },
            "same",
        ],
        [
            "capability flag off on both",
            "use_translated_stories",
            { use_translated_stories: false },
            { use_translated_stories: false },
            "same",
        ],
        [
            "mirrored boolean differs",
            "hide_flag_icons",
            { hide_flag_icons: false },
            { hide_flag_icons: true },
            "change",
        ],
        [
            "mirrored string differs",
            "flag_icons_display_mode",
            { flag_icons_display_mode: "country" },
            { flag_icons_display_mode: "language" },
            "change",
        ],
        [
            "mirrored equal",
            "encode_preview_urls",
            { encode_preview_urls: true },
            { encode_preview_urls: true },
            "same",
        ],
        [
            "mirrored source undefined",
            "encode_preview_urls",
            {},
            { encode_preview_urls: true },
            "same",
        ],
        [
            "domain differs",
            "domain",
            { domain: SOURCE_DOMAIN },
            { domain: "https://target.example.com/" },
            "change",
        ],
        [
            "domain equal",
            "domain",
            { domain: SOURCE_DOMAIN },
            { domain: SOURCE_DOMAIN },
            "same",
        ],
        [
            "domain empty source, target has one",
            "domain",
            { domain: "" },
            { domain: "https://target.example.com/" },
            "kept",
        ],
        ["domain empty on both", "domain", { domain: "" }, {}, "same"],
        [
            "environments differ",
            "environments",
            {
                environments: [
                    { name: "LOCALHOST", location: SOURCE_LOCATION },
                ],
            },
            {
                environments: [
                    { name: "PROD", location: "https://prod.example.com/" },
                ],
            },
            "change",
        ],
        [
            "environments reordered",
            "environments",
            {
                environments: [
                    { name: "A", location: "https://a.example.com/" },
                    { name: "B", location: "https://b.example.com/" },
                ],
            },
            {
                environments: [
                    { name: "B", location: "https://b.example.com/" },
                    { name: "A", location: "https://a.example.com/" },
                ],
            },
            "same",
        ],
        [
            "environments equal",
            "environments",
            {
                environments: [
                    { name: "A", location: "https://a.example.com/" },
                ],
            },
            {
                environments: [
                    { name: "A", location: "https://a.example.com/" },
                ],
            },
            "same",
        ],
        [
            "environments empty source, target has some",
            "environments",
            { environments: [] },
            {
                environments: [
                    { name: "A", location: "https://a.example.com/" },
                ],
            },
            "same",
        ],
        [
            "environments source only adds a name the target lacks",
            "environments",
            {
                environments: [
                    { name: "B", location: "https://b.example.com/" },
                ],
            },
            {
                environments: [
                    { name: "A", location: "https://a.example.com/" },
                ],
            },
            "change",
        ],
        [
            "environments empty on both",
            "environments",
            { environments: [] },
            { environments: [] },
            "same",
        ],
    ])("%s", (_label, field, source, target, expected) => {
        expect(outcomeOf(field, source, target)).toBe(expected);
    });

    it("counts every outcome and never writes a kept or same field", () => {
        const source = {
            use_translated_stories: true,
            show_stories_alternative_versions: false,
            hide_flag_icons: true,
            domain: SOURCE_DOMAIN,
            environments: [{ name: "LOCALHOST", location: SOURCE_LOCATION }],
        };
        const target = {
            use_translated_stories: false,
            show_stories_alternative_versions: true,
            hide_flag_icons: true,
            domain: "https://target.example.com/",
            environments: [
                { name: "PROD", location: "https://prod.example.com/" },
                { name: "LOCALHOST", location: "https://old.example.com/" },
            ],
        };
        const plan = planCopySpaceSettings({ source, target });

        expect({
            change: plan.change,
            same: plan.same,
            kept: plan.kept,
        }).toEqual({
            change: 3,
            same: 3,
            kept: 1,
        });
        // Merged by name: the target-only PROD stays, LOCALHOST is replaced.
        expect(buildCopySpaceSettingsBody({ source, target })).toEqual({
            use_translated_stories: true,
            domain: SOURCE_DOMAIN,
            environments: [
                { name: "PROD", location: "https://prod.example.com/" },
                { name: "LOCALHOST", location: SOURCE_LOCATION },
            ],
        });
    });
});

describe("copy space settings: preview URLs merge by name (lap 2, B)", () => {
    const X = { name: "X", location: "https://x.example.com/old" };
    const xNew = { name: "X", location: "https://x.example.com/new" };
    const A = { name: "A", location: "https://a.example.com/" };

    // Mutation that must turn it red: replace the target's environments
    // wholesale with the source's (the target-only entry vanishes).
    it("keeps the target's order and its own names, replaces same names, appends new ones", () => {
        const target = {
            environments: [
                { name: "T", location: "https://t.example.com/" },
                X,
            ],
        };
        const source = { environments: [A, xNew] };

        expect(buildCopySpaceSettingsBody({ source, target })).toEqual({
            environments: [
                { name: "T", location: "https://t.example.com/" },
                xNew,
                A,
            ],
        });
        expect(mergeEnvironmentsForTarget({ source: [], target: [X] })).toEqual(
            { environments: [X], added: [], updated: [] },
        );
    });

    // Mutation that must turn it red: list every source name in the PLAN line
    // instead of the added and updated ones.
    it("plans target [X], source [A, X'] as body [X', A] and PLAN 1 -> 2 (added: A; updated: X)", () => {
        const source = { environments: [A, xNew] };
        const target = { environments: [X] };

        expect(buildCopySpaceSettingsBody({ source, target })).toEqual({
            environments: [xNew, A],
        });

        const lines = formatCopySpacePlanGate(
            buildCopySpacePlanGateSummary(
                buildCopySpacePlan({
                    sourceSpaceId: "111",
                    targetSpaceId: "222",
                    resources: ["settings"],
                    source: { ...emptySnapshot(), settings: source },
                    target: { ...emptySnapshot(), settings: target },
                }),
            ),
        );

        expect(lines).toContain(
            "    environments: 1 -> 2 (added: A; updated: X)",
        );
    });

    // Mutation that must turn it red (lap 2, E2): write the raw source
    // environments instead of entries reduced to name and location.
    it("writes each preview URL with exactly name and location", async () => {
        const { sbApi } = await run({
            source: {
                environments: [
                    {
                        name: "LOCALHOST",
                        location: SOURCE_LOCATION,
                        id: 7,
                        token: "extra-token-value",
                    },
                ],
            },
            target: blankTarget(),
        });
        const body = settingsPuts(sbApi)[0]?.[1];

        expect(
            body.space.environments.map((environment: object) =>
                Object.keys(environment).sort(),
            ),
        ).toEqual([["location", "name"]]);
    });
});

describe("copy space settings: preview URL edge cases (lap 3, H I K)", () => {
    const a1 = { name: "a", location: "https://a.example.com/1" };
    const a2 = { name: "a", location: "https://a.example.com/2" };
    const a3 = { name: "a", location: "https://a.example.com/3" };

    const planLinesFor = (
        source: Record<string, any>,
        target: Record<string, any>,
    ) =>
        formatCopySpacePlanGate(
            buildCopySpacePlanGateSummary(
                buildCopySpacePlan({
                    sourceSpaceId: "111",
                    targetSpaceId: "222",
                    resources: ["settings"],
                    source: { ...emptySnapshot(), settings: source },
                    target: { ...emptySnapshot(), settings: target },
                }),
            ),
        );

    // H. Mutation that must turn it red: replace every target entry of a name
    // with the source's entry, instead of the first one only.
    it("replaces only the first target entry of a repeated name and keeps the rest", () => {
        const unchanged = {
            source: { environments: [a1] },
            target: { environments: [a1, a2] },
        };

        expect(
            mergeEnvironmentsForTarget({
                source: unchanged.source.environments,
                target: unchanged.target.environments,
            }),
        ).toEqual({ environments: [a1, a2], added: [], updated: [] });
        expect(
            planCopySpaceSettings(unchanged).fields.find(
                (entry) => entry.field === "environments",
            )?.outcome,
        ).toBe("same");
        expect(buildCopySpaceSettingsBody(unchanged)).toEqual({});

        const replaced = {
            source: { environments: [a3] },
            target: { environments: [a1, a2] },
        };

        expect(buildCopySpaceSettingsBody(replaced)).toEqual({
            environments: [a3, a2],
        });
        expect(
            planCopySpaceSettings(replaced).fields.find(
                (entry) => entry.field === "environments",
            )?.merge,
        ).toEqual({ count: 2, added: [], updated: ["a"] });
    });

    // I. Mutation that must turn it red: stop ignoring source entries without
    // a non-empty name and a non-empty location.
    it("ignores source entries without a name or a location, and never filters the target", () => {
        const blank = {
            source: {
                environments: [
                    null,
                    {},
                    { name: "", location: "" },
                    { name: "no-location", location: "" },
                    { name: "", location: "https://nameless.example.com/" },
                ],
            } as any,
            target: { environments: [] },
        };

        expect(
            planCopySpaceSettings(blank).fields.find(
                (entry) => entry.field === "environments",
            ),
        ).toEqual({
            field: "environments",
            outcome: "same",
            source: { count: 0, names: [] },
            target: { count: 0, names: [] },
            merge: { count: 0, added: [], updated: [] },
        });
        expect(buildCopySpaceSettingsBody(blank)).toEqual({});

        const blankTargetEntry = { name: "", location: "" };

        expect(
            mergeEnvironmentsForTarget({
                source: [a1],
                target: [blankTargetEntry],
            }).environments,
        ).toEqual([blankTargetEntry, a1]);
    });

    // K. Mutation that must turn it red: display names raw (in the plan's
    // names, added or updated) instead of on one line.
    it("prints a name with line breaks on one line and writes it byte-identical", () => {
        const trickyName =
            "LOCAL\nHOST\r\n    domain: none -> https://fake.example.com\u2028x";
        const plain = planLinesFor(
            {
                environments: [
                    { name: "LOCALHOST", location: SOURCE_LOCATION },
                ],
            },
            { environments: [] },
        );
        const tricky = planLinesFor(
            { environments: [{ name: trickyName, location: SOURCE_LOCATION }] },
            { environments: [] },
        );

        expect(tricky).toHaveLength(plain.length);
        expect(tricky.join("\n").split("\n")).toHaveLength(plain.length);
        expect(tricky).toContain(
            "    environments: 0 -> 1 (added: LOCAL HOST     domain: none -> https://fake.example.com x)",
        );

        const updatedLines = planLinesFor(
            { environments: [{ name: trickyName, location: SOURCE_LOCATION }] },
            {
                environments: [
                    { name: trickyName, location: "https://old.example.com/" },
                ],
            },
        );

        expect(updatedLines.join("\n").split("\n")).toHaveLength(plain.length);

        const plan = planCopySpaceSettings({
            source: {
                environments: [{ name: trickyName, location: SOURCE_LOCATION }],
            },
            target: {
                environments: [
                    {
                        name: `${trickyName}\t`,
                        location: "https://t.example.com/",
                    },
                ],
            },
        });
        const environments = plan.fields.find(
            (entry) => entry.field === "environments",
        );

        expect(JSON.stringify(environments)).not.toMatch(/\\[nrt]|\\u2028/);

        expect(
            buildCopySpaceSettingsBody({
                source: {
                    environments: [
                        { name: trickyName, location: SOURCE_LOCATION },
                    ],
                },
                target: { environments: [] },
            }),
        ).toEqual({
            environments: [{ name: trickyName, location: SOURCE_LOCATION }],
        });
    });
});

describe("copy space settings: redaction (R6, lap 2 C)", () => {
    // Mutation that must turn it red: append `url.pathname` (or the query
    // names) to what redactUrl returns.
    it("prints nothing after the origin, whatever shape the secret takes", () => {
        const shapes = [
            [
                "https://preview.example.com/api/preview?secret=QUERYSECRET1",
                "QUERYSECRET1",
            ],
            [
                "https://preview.example.com/api/preview?BARETOKEN22",
                "BARETOKEN22",
            ],
            ["https://preview.example.com/p?secret%3DENCODED333", "ENCODED333"],
            [
                "https://preview.example.com/PATHSECRET4444/preview",
                "PATHSECRET4444",
            ],
            ["https://preview.example.com/#FRAGMENT55555", "FRAGMENT55555"],
            [
                "https://user:PASSWORD666666@preview.example.com",
                "PASSWORD666666",
            ],
        ];

        for (const [url, secret] of shapes) {
            const printed = redactUrl(url!);

            expect(printed).toBe("https://preview.example.com/…");
            expect(printed).not.toContain(secret);
        }

        expect(redactUrl("https://target.example.com/")).toBe(
            "https://target.example.com",
        );
        expect(redactUrl("https://target.example.com")).toBe(
            "https://target.example.com",
        );
        expect(redactUrl("not a url ?secret=abc123XYZ")).toBe("<redacted>");
        expect(redactUrl("mailto:abc123XYZ@example.com")).toBe("<redacted>");
    });
});

describe("copy space settings: the write (R2, R5, R7)", () => {
    // R2 canary. Mutation that must turn it red: spread the source space into
    // the settings write body.
    it("writes only allowlisted keys, never tokens, hooks or the plan", async () => {
        const { sbApi } = await run({
            source: {
                use_translated_stories: true,
                first_token: "first-token-value",
                story_published_hook: "https://hooks.example.com/published",
                webhook_token: "webhook-token-value",
                plan: "enterprise",
                owner_id: 42,
            },
            target: blankTarget(),
        });

        expect(settingsPuts(sbApi)).toEqual([
            ["spaces/222", { space: { use_translated_stories: true } }],
        ]);
    });

    // R5 canary. Mutation that must turn it red: write the redacted form of a
    // URL instead of the source value.
    it("copies domain and every location byte-identical, query string included", async () => {
        const { sbApi } = await run({
            source: {
                domain: SOURCE_DOMAIN,
                environments: [
                    { name: "LOCALHOST", location: SOURCE_LOCATION },
                ],
            },
            target: blankTarget(),
        });

        expect(settingsPuts(sbApi)).toEqual([
            [
                "spaces/222",
                {
                    space: {
                        domain: SOURCE_DOMAIN,
                        environments: [
                            { name: "LOCALHOST", location: SOURCE_LOCATION },
                        ],
                    },
                },
            ],
        ]);
    });

    // R7 canary. Mutation that must turn it red: always PUT all seven fields.
    it("writes nothing when nothing changes, exactly the changed key otherwise, and nothing on a dry-run", async () => {
        const equal = await run({
            source: blankTarget(),
            target: blankTarget(),
        });

        expect(settingsPuts(equal.sbApi)).toEqual([]);

        const oneFlag = await run({
            source: {
                ...blankTarget(),
                show_stories_alternative_versions: true,
            },
            target: blankTarget(),
        });

        expect(settingsPuts(oneFlag.sbApi)).toEqual([
            [
                "spaces/222",
                { space: { show_stories_alternative_versions: true } },
            ],
        ]);

        const dryRun = await run({
            source: { ...blankTarget(), use_translated_stories: true },
            target: blankTarget(),
            dryRun: true,
        });

        expect(dryRun.sbApi.put).not.toHaveBeenCalled();
        expect(dryRun.result.applied).toBe(false);
    });

    it("writes languages first and settings second, in one space PUT each", async () => {
        const { sbApi } = await run({
            source: {
                languages: [{ code: "de", name: "German" }],
                use_translated_stories: true,
            },
            target: { ...blankTarget(), languages: [] },
            resources: ["languages", "settings"],
        });

        expect(
            sbApi.put.mock.calls.map(([, body]) => Object.keys(body.space)),
        ).toEqual([["languages"], ["use_translated_stories"]]);
    });

    // Mutation that must turn it red (lap 2, E1): move the settings step after
    // the groups, or after the datasources.
    it("writes the settings before the first component group", async () => {
        const writes: string[] = [];
        const group = { id: 1, uuid: "g-1", name: "Layout", parent_id: null };
        const sbApi = stubApi({
            source: { ...blankTarget(), use_translated_stories: true },
            target: blankTarget(),
        });

        sbApi.get.mockImplementation(async (path: string) => {
            if (path === "spaces/111") {
                return {
                    data: {
                        space: {
                            ...blankTarget(),
                            use_translated_stories: true,
                        },
                    },
                };
            }

            if (path === "spaces/222") {
                return { data: { space: blankTarget() } };
            }

            if (path === "spaces/111/component_groups/") {
                return { data: { component_groups: [group] }, total: 1 };
            }

            if (path === "spaces/222/component_groups/") {
                return { data: { component_groups: [] }, total: 0 };
            }

            throw new Error(`unexpected GET ${path}`);
        });
        sbApi.put.mockImplementation(async (path: string) => {
            writes.push(`PUT ${path}`);

            return { data: { space: {} } };
        });
        sbApi.post.mockImplementation(async (path: string) => {
            writes.push(`POST ${path}`);

            return { data: { component_group: { ...group, id: 9 } } };
        });

        await runCopySpace({
            sbApi,
            sourceSpaceId: "111",
            targetSpaceId: "222",
            resources: parseCopySpaceOnly(["settings,groups"]).resources,
            dryRun: false,
            concurrency: 1,
            showPlan: () => undefined,
            confirm: async () => true,
        });

        const settingsWrite = writes.indexOf("PUT spaces/222");
        const firstGroupWrite = writes.findIndex((write) =>
            write.includes("component_groups"),
        );

        expect(settingsWrite).toBeGreaterThan(-1);
        expect(firstGroupWrite).toBeGreaterThan(-1);
        expect(settingsWrite).toBeLessThan(firstGroupWrite);
    });

    it("records a rejected settings write as a failure of the settings resource and carries on", async () => {
        const { result } = await run({
            source: { ...blankTarget(), use_translated_stories: true },
            target: blankTarget(),
            rejectPutWith: { status: 403, data: { error: "Forbidden" } },
        });

        expect(result.applied).toBe(true);
        expect(result.failures).toEqual([
            {
                resource: "settings",
                name: "settings",
                message: "settings write rejected: 403 (error)",
            },
        ]);
    });
});

describe("copy space settings: no secret leaves the process (R6)", () => {
    const source = {
        use_translated_stories: true,
        domain: SOURCE_DOMAIN,
        environments: [{ name: "LOCALHOST", location: SOURCE_LOCATION }],
    };

    // R6 canary. Mutation that must turn it red: store the raw `domain` in the
    // plan.
    it("keeps the secret out of the plan, the PLAN lines and every log line, and inside the write", async () => {
        const { sbApi, shown, result } = await run({
            source,
            target: blankTarget(),
        });

        expect(shown).toHaveLength(1);
        expect(JSON.stringify(shown[0])).not.toContain(SECRET);
        expect(
            formatCopySpacePlanGate(
                buildCopySpacePlanGateSummary(shown[0]),
            ).join("\n"),
        ).not.toContain(SECRET);
        expect(loggedStrings().join("\n")).not.toContain(SECRET);
        expect(JSON.stringify(result.failures)).not.toContain(SECRET);
        expect(JSON.stringify(settingsPuts(sbApi))).toContain(SECRET);
    });

    // R6 canary (lap 2, D). Mutation that must turn it red: append
    // describeError(error) to the settings failure message.
    it("keeps the secret out of a rejected write's failure and log line, in any encoding", async () => {
        const { sbApi, result } = await run({
            source,
            target: blankTarget(),
            rejectPutWith: {
                status: 422,
                data: {
                    domain: [`${SOURCE_DOMAIN} is not allowed`],
                    environments: [
                        encodeURIComponent(SOURCE_LOCATION),
                        JSON.stringify(SOURCE_LOCATION).replaceAll("/", "\\/"),
                    ],
                },
            },
        });

        expect(result.failures).toEqual([
            {
                resource: "settings",
                name: "settings",
                message: "settings write rejected: 422 (domain, environments)",
            },
        ]);
        expect(JSON.stringify(result.failures)).not.toContain(SECRET);
        expect(loggedStrings().join("\n")).not.toContain(SECRET);
        expect(JSON.stringify(settingsPuts(sbApi))).toContain(SECRET);
    });
});

describe("copy space settings: the help (R9)", () => {
    it("lists settings under --only and names the space settings, the flag rule and the redaction", () => {
        expect(copyDescription).toContain(
            "--only          Restrict copy space to some of: languages, settings, groups, components, presets, datasources.",
        );
        expect(copyDescription).toMatch(
            /copy space writes languages, space settings[^\n]*into the target Storyblok space/,
        );
        expect(copyDescription).toMatch(/Copy a space's schema[^\n]*settings/);
        expect(copyDescription).toContain(
            "copy space never turns off use_translated_stories or show_stories_alternative_versions",
        );
        expect(copyDescription).toContain(
            "preview URLs that exist only in the target are kept",
        );
        // J. Mutation that must turn it red: restore the lap-2 wording.
        expect(copyDescription).toContain(
            "the domain is shown by its origin (scheme, host and port) only, preview URLs are shown by name and count and their locations never",
        );
        expect(copyDescription).not.toContain("scheme and host)");
        expect(copyDescription).not.toContain("query-string values redacted");
        expect(copyDescription).not.toContain("?");
    });
});
