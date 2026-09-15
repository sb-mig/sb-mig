import type { CopySpaceSnapshot } from "../../src/api/copy/space.js";

import { describe, expect, it } from "vitest";

import {
    buildCopySpacePlanGateSummary,
    formatCopySpacePlanGate,
} from "../../src/api/copy/plan-gate.js";
import {
    buildCopySpacePlan,
    parseCopySpaceOnly,
} from "../../src/api/copy/space.js";

const emptySnapshot = (): CopySpaceSnapshot => ({
    languages: [],
    groups: [],
    components: [],
    presets: [],
    datasources: [],
    entriesByDatasource: new Map(),
});

const REASON = "name starts with a character Storyblok rejects (-, =, @)";

const planFor = ({
    entries,
    targetEntries,
}: {
    entries: Record<string, string[]>;
    targetEntries?: Record<string, string[]>;
}) => {
    const snapshot = (byDatasource: Record<string, string[]>) => ({
        ...emptySnapshot(),
        datasources: Object.keys(byDatasource).map((name, index) => ({
            id: index + 1,
            name,
            slug: name,
        })),
        entriesByDatasource: new Map(
            Object.entries(byDatasource).map(([name, names]) => [
                name,
                names.map((entryName) => ({ name: entryName, value: "1" })),
            ]),
        ),
    });

    return buildCopySpacePlan({
        sourceSpaceId: "111",
        targetSpaceId: "222",
        resources: parseCopySpaceOnly(["datasources"]).resources,
        source: snapshot(entries),
        target: targetEntries ? snapshot(targetEntries) : emptySnapshot(),
    });
};

const gateLines = (plan: ReturnType<typeof buildCopySpacePlan>) =>
    formatCopySpacePlanGate(buildCopySpacePlanGateSummary(plan));

describe("copy space: entry names Storyblok rejects", () => {
    // MAR-3046 R3 canary. Mutation that must turn it red: drop the
    // `^[-=@]` check from the entries plan.
    it("plans an entry named --x as a skip with its reason", () => {
        const plan = planFor({ entries: { colors: ["--x", "red"] } });

        expect(plan.entries?.create).toEqual(["colors/red"]);
        expect(plan.entries?.skip).toEqual([
            { name: "colors/--x", reason: REASON },
        ]);
        expect(plan.entriesStoryblokWillReject).toEqual([
            { datasource: "colors", count: 1, total: 2, names: ["--x"] },
        ]);
        expect(gateLines(plan)).toContain(
            "  entries Storyblok will reject: colors 1 of 2",
        );
    });

    it("skips names starting with -, = or @ and nothing else", () => {
        const plan = planFor({
            entries: {
                formulas: ["=SUM", "@home", "-1", "a-b", "b=c", "x@y", "plain"],
            },
        });

        expect(plan.entries?.skip.map((skip) => skip.name)).toEqual([
            "formulas/=SUM",
            "formulas/@home",
            "formulas/-1",
        ]);
        expect(plan.entries?.create).toEqual([
            "formulas/a-b",
            "formulas/b=c",
            "formulas/x@y",
            "formulas/plain",
        ]);
    });

    it("skips a rejected name even when the target already holds it", () => {
        const plan = planFor({
            entries: { colors: ["@home", "red"] },
            targetEntries: { colors: ["@home", "red"] },
        });

        expect(plan.entries?.update).toEqual(["colors/red"]);
        expect(plan.entries?.skip).toEqual([
            { name: "colors/@home", reason: REASON },
        ]);
    });

    it("prints one count per datasource and never renames", () => {
        const plan = planFor({
            entries: {
                colors: ["--x", "red", "blue"],
                sizes: ["=s", "=m", "l"],
                plain: ["one"],
            },
        });

        expect(plan.entriesStoryblokWillReject).toEqual([
            { datasource: "colors", count: 1, total: 3, names: ["--x"] },
            { datasource: "sizes", count: 2, total: 3, names: ["=s", "=m"] },
        ]);
        expect(gateLines(plan)).toContain(
            "  entries Storyblok will reject: colors 1 of 3, sizes 2 of 3",
        );
        expect(plan.entries?.create).toEqual([
            "colors/red",
            "colors/blue",
            "sizes/l",
            "plain/one",
        ]);
    });

    it("says nothing when no entry name is rejected", () => {
        const plan = planFor({ entries: { colors: ["red"] } });

        expect(plan.entriesStoryblokWillReject).toEqual([]);
        expect(
            gateLines(plan).some((line) =>
                line.includes("entries Storyblok will reject"),
            ),
        ).toBe(false);
    });
});
