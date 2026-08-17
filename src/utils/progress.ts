import Logger from "./logger.js";

export type ProgressTracker = {
    tick: (
        delta?: number,
        counters?: Partial<Record<"skipped" | "failed", number>>,
    ) => void;
    finish: () => void;
};

const formatEta = (seconds: number): string => {
    if (!Number.isFinite(seconds) || seconds <= 0) return "";
    if (seconds < 60) return `${Math.ceil(seconds)}s`;
    if (seconds < 3600) return `${Math.ceil(seconds / 60)}m`;
    const hours = Math.floor(seconds / 3600);
    return `${hours}h ${Math.ceil((seconds - hours * 3600) / 60)}m`;
};

export const createProgressTracker = (options: {
    label: string;
    total: number;
    ratePerSecond?: () => number;
    log?: (line: string) => void;
    now?: () => number;
    intervalMs?: number;
}): ProgressTracker => {
    const log = options.log ?? ((line: string) => Logger.success(line));
    const now = options.now ?? (() => Date.now());
    const intervalMs = options.intervalMs ?? 1000;
    let done = 0;
    let skipped = 0;
    let failed = 0;
    let lastLogAt = -Infinity;

    const line = (): string => {
        const parts = [`${options.label} ${done}/${options.total}`];
        const rate = options.ratePerSecond?.() ?? 0;
        if (rate > 0) {
            const eta = formatEta((options.total - done) / rate);
            parts.push(
                `(${rate.toFixed(1)} req/s${eta ? `, ETA ${eta}` : ""})`,
            );
        }
        if (skipped > 0) parts.push(`skipped ${skipped}`);
        if (failed > 0) parts.push(`failed ${failed}`);
        return parts.join(" ");
    };

    return {
        tick: (delta = 1, counters) => {
            done += delta;
            skipped += counters?.skipped ?? 0;
            failed += counters?.failed ?? 0;
            if (now() - lastLogAt >= intervalMs) {
                lastLogAt = now();
                log(line());
            }
        },
        finish: () => log(line()),
    };
};
