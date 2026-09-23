import chalk from "chalk";
import { describe, expect, it } from "vitest";

import {
    createProgress,
    finishActiveProgress,
    formatDuration,
    getActiveProgress,
    resolveProgressMode,
    type ProgressMode,
} from "../../src/utils/progress.js";

/** What the terminal would show: the colours are asserted on their own. */
// eslint-disable-next-line no-control-regex
const plainText = (text: string) => text.replace(/\u001b\[[0-9;]*m/g, "");

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
        const lines = plainText(io.written())
            .split("\n")
            .map((line) => line.split("\r").pop() ?? "");
        const failures = lines.filter((line) =>
            line.startsWith("✘ Failed to copy asset"),
        );

        expect(failures).toEqual([
            "✘ Failed to copy asset 'file-10.jpg'.",
            "✘ Failed to copy asset 'file-20.jpg'.",
            "✘ Failed to copy asset 'file-30.jpg'.",
        ]);
        // Each failure is written as one chunk, so nothing can interleave.
        expect(io.chunks.map(plainText)).toContain(
            "✘ Failed to copy asset 'file-10.jpg'.\n",
        );
        expect(io.written().trimEnd().endsWith("last: file-100.jpg")).toBe(
            true,
        );
        expect(io.written()).toContain("assets 100/100 (100%)");
    });

    it.each(["plain", "off"] as const)(
        "prints failures in %s mode too",
        (mode) => {
            const io = run({ mode, failAt: [7] });

            expect(plainText(io.written())).toContain(
                "✘ Failed to copy asset 'file-7.jpg'.\n",
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

describe("progress: the live line fits the terminal (lap 2, finding 2)", () => {
    const longName = "hfn_spring26_dubai_international_fair_00014.JPG";

    const drawAt = (columns: number) => {
        const io = harness();

        (io.stream as any).columns = columns;

        const progress = createProgress({
            label: "assets",
            total: 4766,
            stream: io.stream,
            mode: "line",
            now: io.now,
        });

        io.advance(1000);
        progress.tick({ name: longName });
        io.advance(1000);
        progress.tick({ name: longName, outcome: "metadata_failed" });
        progress.finish();

        return {
            rows: io
                .written()
                .split(/[\r\n]/)
                .filter(Boolean),
            progress,
        };
    };

    // Lap 2 finding 2 canary. Mutation that must turn it red: draw the line
    // without cutting it to the terminal width, so an 80-column window wraps
    // and every redraw leaves a stray line behind.
    it("never draws wider than the terminal, and keeps the counters", () => {
        // 80 columns: the window the maintainer reported wrapping in.
        const { rows } = drawAt(80);

        for (const row of rows) {
            expect(row.length).toBeLessThanOrEqual(79);
        }

        const last = rows[rows.length - 1] ?? "";

        // The file name gives up its characters first; the facts stay.
        expect(last).toContain("assets 2/4766");
        expect(last).toContain("ok 1");
        expect(last).toContain("metadata failed 1");
        expect(last).not.toContain(longName);
        expect(last).toContain("\u2026");
    });

    it("drops the name entirely when even a stub would not fit", () => {
        const { rows } = drawAt(60);

        for (const row of rows) {
            expect(row.length).toBeLessThanOrEqual(59);
        }

        const last = rows[rows.length - 1] ?? "";

        expect(last).toContain("ok 1");
        expect(last).toContain("metadata failed 1");
        expect(last).not.toContain("last:");
    });

    it("keeps the whole name when the terminal is wide enough", () => {
        const { rows } = drawAt(200);

        expect(rows[rows.length - 1]).toContain(longName);
    });

    it("says the same thing to a log file, whatever the terminal is", () => {
        const io = harness();

        (io.stream as any).columns = 40;

        const progress = createProgress({
            label: "assets",
            total: 10,
            stream: io.stream,
            mode: "plain",
            now: io.now,
        });

        progress.tick({ name: longName });
        progress.finish();

        // A log has no width: cutting it there would lose the name for good.
        expect(io.written()).toContain(longName);
    });
});

describe("progress: the row is always given back (lap 2, finding 3)", () => {
    // Lap 2 finding 3 canary. Mutation that must turn it red: leave the
    // active progress registered, so every later line redraws a dead one.
    it("clears the active progress when a phase is abandoned", () => {
        const io = harness();
        const progress = createProgress({
            label: "assets",
            total: 100,
            stream: io.stream,
            mode: "line",
            now: io.now,
        });

        io.advance(1000);
        progress.tick({ name: "file-1.jpg" });

        expect(getActiveProgress()).toBe(progress);

        // What a `finally` does after a phase throws.
        finishActiveProgress();

        expect(getActiveProgress()).toBeUndefined();
        expect(io.written().endsWith("\n")).toBe(true);

        // Idempotent: a phase that both finished and unwound says nothing new.
        const beforeSecondCall = io.written();

        finishActiveProgress();

        expect(io.written()).toBe(beforeSecondCall);
    });

    it("closes a line left open by an earlier phase before drawing", () => {
        const io = harness();
        const abandoned = createProgress({
            label: "shells",
            total: 10,
            stream: io.stream,
            mode: "line",
            now: io.now,
        });

        io.advance(1000);
        abandoned.tick({ name: "one" });

        const next = createProgress({
            label: "content",
            total: 10,
            stream: io.stream,
            mode: "line",
            now: io.now,
        });

        expect(getActiveProgress()).toBe(next);
        // The abandoned line ended before the new one started to draw.
        expect(io.written()).toContain("shells 1/10");
        expect(io.written().indexOf("\n")).toBeLessThan(
            io.written().indexOf("content 0/10"),
        );

        finishActiveProgress();
    });
});

describe("progress: a failure reads as a failure (lap 2, finding 5)", () => {
    it("marks and colours a failure the way Logger.error does", () => {
        const level = chalk.level;

        chalk.level = 1;

        try {
            const io = harness();
            const progress = createProgress({
                label: "assets",
                total: 2,
                stream: io.stream,
                mode: "line",
                now: io.now,
            });

            progress.fail("Asset 'a.jpg' could not be copied.");
            progress.finish();

            const failure = io.chunks.find((chunk) =>
                chunk.includes("could not be copied"),
            );

            expect(failure).toContain("\u001b[31m");
            expect(plainText(String(failure))).toBe(
                "✘ Asset 'a.jpg' could not be copied.\n",
            );
        } finally {
            chalk.level = level;
        }
    });
});
