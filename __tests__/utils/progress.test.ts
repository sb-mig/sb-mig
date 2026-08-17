import { describe, it, expect } from "vitest";

import { createProgressTracker } from "../../src/utils/progress.js";

describe("createProgressTracker", () => {
    it("throttles to one line per interval and always logs finish", () => {
        let time = 0;
        const lines: string[] = [];
        const tracker = createProgressTracker({
            label: "stories: rewrite",
            total: 100,
            now: () => time,
            log: (line) => lines.push(line),
            intervalMs: 1000,
        });
        tracker.tick(); // first tick logs immediately
        tracker.tick();
        tracker.tick(); // still inside the interval: silent
        time = 1001;
        tracker.tick(); // new interval: logs
        tracker.finish();
        expect(lines).toHaveLength(3);
        expect(lines[1]).toContain("4/100");
        expect(lines[2]).toContain("4/100");
    });

    it("includes rate, eta, and counters", () => {
        const lines: string[] = [];
        const tracker = createProgressTracker({
            label: "assets",
            total: 10,
            ratePerSecond: () => 5,
            now: () => 0,
            log: (line) => lines.push(line),
        });
        tracker.tick(2, { skipped: 1, failed: 1 });
        expect(lines[0]).toContain("assets 2/10");
        expect(lines[0]).toContain("5.0 req/s");
        expect(lines[0]).toContain("skipped 1");
        expect(lines[0]).toContain("failed 1");
    });
});
