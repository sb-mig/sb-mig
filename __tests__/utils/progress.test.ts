import { describe, expect, it } from "vitest";

import {
    createProgress,
    formatDuration,
    resolveProgressMode,
    type ProgressMode,
} from "../../src/utils/progress.js";

/** A stream that remembers every byte, and a clock the test moves by hand. */
const harness = ({
    isTTY = true,
    step = 100,
}: { isTTY?: boolean; step?: number } = {}) => {
    const chunks: string[] = [];
    let clock = 0;

    return {
        stream: {
            write: (chunk: string) => chunks.push(chunk),
            isTTY,
        },
        now: () => clock,
        advance: (milliseconds: number) => {
            clock += milliseconds;
        },
        tickClock: () => {
            clock += step;
        },
        written: () => chunks.join(""),
        chunks,
    };
};

const run = ({
    mode,
    total = 100,
    step = 100,
    isTTY = true,
    failAt = [] as number[],
}: {
    mode: ProgressMode;
    total?: number;
    step?: number;
    isTTY?: boolean;
    failAt?: number[];
}) => {
    const io = harness({ isTTY, step });
    const progress = createProgress({
        label: "assets",
        total,
        stream: io.stream,
        mode,
        now: io.now,
    });

    for (let index = 1; index <= total; index += 1) {
        io.tickClock();
        progress.tick({ name: `file-${index}.jpg` });

        if (failAt.includes(index)) {
            progress.fail(`Failed to copy asset 'file-${index}.jpg'.`);
        }
    }

    progress.finish();

    return { ...io, progress };
};

describe("progress: one primitive, three renderers (R1)", () => {
    // R1 canary. Mutation that must turn it red: end every redraw with a
    // newline in `line` mode, so a terminal scrolls instead of updating.
    it("redraws one line in place and ends it exactly once", () => {
        const io = run({ mode: "line" });
        const written = io.written();

        expect(written).toContain("\r");
        expect(written.split("\n")).toHaveLength(2);
        expect(written.endsWith("\n")).toBe(true);
        expect(written.trimEnd().endsWith("last: file-100.jpg")).toBe(true);
        expect(written).toContain("assets 100/100 (100%)");
    });

    // R1 canary. Mutation that must turn it red: drop the item heartbeat, or
    // write a carriage return in `plain` mode.
    it("writes whole lines every 50 items in plain mode, and no carriage return", () => {
        // 100 ms per item: the item rule fires long before the 30-second one.
        const io = run({ mode: "plain" });
        const written = io.written();
        const lines = written.split("\n").filter(Boolean);

        expect(written).not.toContain("\r");
        // start, 50, 100, finish
        expect(lines).toHaveLength(4);
        expect(lines[0]).toContain("assets 0/100 (0%)");
        expect(lines[1]).toContain("assets 50/100 (50%)");
        expect(lines[3]).toContain("assets 100/100 (100%)");
    });

    // R1 canary. Mutation that must turn it red: drop the 30-second heartbeat
    // so a slow phase says nothing between items.
    it("says it is alive on time even when items are slow", () => {
        // 10 items, 31 seconds apart: too few for the item heartbeat.
        const io = run({ mode: "plain", total: 10, step: 31_000 });
        const lines = io.written().split("\n").filter(Boolean);

        // start + one per slow item + finish
        expect(lines).toHaveLength(12);
    });

    it("says only the start and the end when progress is off", () => {
        const io = run({ mode: "off" });
        const lines = io.written().split("\n").filter(Boolean);

        expect(lines).toHaveLength(2);
        expect(io.written()).not.toContain("\r");
    });

    it("shows an ETA only once it has seen enough items", () => {
        const io = harness();
        const progress = createProgress({
            label: "assets",
            total: 100,
            stream: io.stream,
            mode: "off",
            now: io.now,
        });

        for (let index = 0; index < 19; index += 1) {
            io.advance(1000);
            progress.tick();
        }

        expect(progress.snapshot()).not.toContain("left");

        io.advance(1000);
        progress.tick();

        expect(progress.snapshot()).toContain("~1m20 left");
    });

    it("counts each outcome under its own name", () => {
        const io = harness();
        const progress = createProgress({
            label: "assets",
            total: 4,
            stream: io.stream,
            mode: "off",
            now: io.now,
        });

        progress.tick({ outcome: "ok" });
        progress.tick({ outcome: "metadata_failed" });
        progress.tick({ outcome: "failed" });
        progress.tick({ outcome: "skipped", name: "last.jpg" });

        expect(progress.snapshot()).toBe(
            "assets 4/4 (100%) · 0s elapsed · ok 1 · metadata failed 1 · skipped 1 · failed 1 · last: last.jpg",
        );
    });
});

describe("progress: the mode comes from the world (R2)", () => {
    // R2 canary. Mutation that must turn it red: ignore `CI`, so a CI runner
    // with a TTY writes carriage returns into the build log.
    it.each([
        [{ isTTY: true, ci: undefined }, "line"],
        [{ isTTY: true, ci: "true" }, "plain"],
        [{ isTTY: false, ci: undefined }, "plain"],
        [{ isTTY: false, ci: "true" }, "plain"],
    ])("resolves auto from %j", (world, expected) => {
        expect(resolveProgressMode(world)).toBe(expected);
    });

    it.each(["line", "plain", "off"] as const)(
        "honours a forced %s whatever the world says",
        (preference) => {
            expect(
                resolveProgressMode({ preference, isTTY: false, ci: "true" }),
            ).toBe(preference);
        },
    );

    it("treats an empty or false CI variable as no CI", () => {
        expect(resolveProgressMode({ isTTY: true, ci: "" })).toBe("line");
        expect(resolveProgressMode({ isTTY: true, ci: "false" })).toBe("line");
    });
});

describe("progress: a failure is never hidden and never breaks the line (R3)", () => {
    // R3 canary. Mutation that must turn it red: print the failure straight to
    // the stream without clearing the live line first, so the message lands
    // inside a partial progress line.
    it("prints each failure whole, on its own line, in line mode", () => {
        const io = run({ mode: "line", failAt: [10, 20, 30] });
        const lines = io
            .written()
            .split("\n")
            .map((line) => line.split("\r").pop() ?? "");
        const failures = lines.filter((line) =>
            line.startsWith("Failed to copy asset"),
        );

        expect(failures).toEqual([
            "Failed to copy asset 'file-10.jpg'.",
            "Failed to copy asset 'file-20.jpg'.",
            "Failed to copy asset 'file-30.jpg'.",
        ]);
        // Each failure is written as one chunk, so nothing can interleave.
        expect(io.chunks).toContain("Failed to copy asset 'file-10.jpg'.\n");
        expect(io.written().trimEnd().endsWith("last: file-100.jpg")).toBe(
            true,
        );
        expect(io.written()).toContain("assets 100/100 (100%)");
    });

    it.each(["plain", "off"] as const)(
        "prints failures in %s mode too",
        (mode) => {
            const io = run({ mode, failAt: [7] });

            expect(io.written()).toContain(
                "Failed to copy asset 'file-7.jpg'.\n",
            );
            expect(io.written()).not.toContain("\r");
        },
    );
});

describe("progress: the clock reads short", () => {
    it.each([
        [0, "0s"],
        [45_000, "45s"],
        [247_000, "4m07"],
        [3_720_000, "1h02"],
    ])("formats %i ms as %s", (milliseconds, expected) => {
        expect(formatDuration(milliseconds)).toBe(expected);
    });
});
