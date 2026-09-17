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
    buildCopySpaceSettingsBody,
    COPY_SPACE_RESOURCES,
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
    rejectPutWith?: string;
}) => {
    const get = vi.fn(async (path: string) => {
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
            throw Object.assign(new Error(rejectPutWith), {
                response: { data: { error: rejectPutWith } },
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
    rejectPutWith?: string;
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
    // mirror the source (the `kept` rows); merge environments by name instead of
    // replacing the list.
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
            "change",
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
            "kept",
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
        // The target's list is replaced as a whole, never merged by name.
        expect(buildCopySpaceSettingsBody({ source, target })).toEqual({
            use_translated_stories: true,
            domain: SOURCE_DOMAIN,
            environments: [{ name: "LOCALHOST", location: SOURCE_LOCATION }],
        });
    });
});

describe("copy space settings: redaction (R6)", () => {
    it("keeps origin and path, names the query parameters, and hides their values", () => {
        expect(redactUrl(SOURCE_DOMAIN)).toBe(
            "https://preview.example.com/api/preview?<secret,slug redacted>",
        );
        expect(redactUrl("https://target.example.com/")).toBe(
            "https://target.example.com/",
        );
        expect(redactUrl("not a url ?secret=abc123XYZ")).toBe("<redacted>");
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

    it("records a rejected settings write as a failure of the settings resource and carries on", async () => {
        const { result } = await run({
            source: { ...blankTarget(), use_translated_stories: true },
            target: blankTarget(),
            rejectPutWith: "Forbidden",
        });

        expect(result.applied).toBe(true);
        expect(result.failures).toEqual([
            expect.objectContaining({ resource: "settings", name: "settings" }),
        ]);
    });
});

describe("copy space settings: no secret leaves the process (R6)", () => {
    const source = {
        use_translated_stories: true,
        domain: SOURCE_DOMAIN,
        environments: [{ name: "LOCALHOST", location: SOURCE_LOCATION }],
    };

    // R6 canaries. Mutations that must turn them red: store the raw `domain`
    // in the plan; drop the replace of raw URLs in the failure message.
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

    it("keeps the secret out of a rejected write's failure and log line", async () => {
        const { sbApi, result } = await run({
            source,
            target: blankTarget(),
            rejectPutWith: `The preview URL ${SOURCE_DOMAIN} and ${SOURCE_LOCATION} are not allowed`,
        });

        expect(result.failures).toHaveLength(1);
        expect(result.failures[0]?.message).toContain(
            "https://preview.example.com/api/preview?<secret,slug redacted>",
        );
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
        expect(copyDescription).toContain("query-string values redacted");
        expect(copyDescription).not.toContain("?");
    });
});
