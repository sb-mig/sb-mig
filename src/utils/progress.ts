/**
 * One progress primitive for every long phase of a copy.
 *
 * A phase knows its total before it starts, so the only question is how to say
 * where the run is. Three renderers answer it:
 *
 * - `line`  — one line redrawn in place, for a person at a terminal.
 * - `plain` — the same facts as whole lines, now and then, for CI and for a
 *             run piped into a file: a log must never hold a carriage return.
 * - `off`   — the start and the end, nothing in between.
 *
 * The facts are identical in all three; only their delivery differs.
 */

import chalk from "chalk";

export type ProgressMode = "line" | "plain" | "off";

export type ProgressModePreference = ProgressMode | "auto";

/** What happened to one item. `ok` is the default. */
export type ProgressOutcome = "ok" | "metadata_failed" | "failed" | "skipped";

export type ProgressStream = {
    write: (chunk: string) => unknown;
    isTTY?: boolean;
    /** How wide the terminal is, when it is a terminal. */
    columns?: number;
};

export type Progress = {
    tick: (item?: { name?: string; outcome?: ProgressOutcome }) => void;
    /** A failure line of its own, never inside the live line. */
    fail: (message: string) => void;
    /** Any line of its own: the live row is cleared first and redrawn after. */
    printLine: (text: string) => void;
    finish: () => void;
    /** What the renderer would show right now; the tests read this. */
    snapshot: () => string;
};

/**
 * The live line currently owning the terminal row, if any.
 *
 * Anything else that wants to print — a Logger line from deep inside a copy
 * phase — asks this first, so its text lands on a row of its own instead of
 * in the middle of a half-drawn progress line. Only `line` mode registers:
 * the other renderers own no row.
 */
let activeProgress: Progress | undefined;

export const getActiveProgress = (): Progress | undefined => activeProgress;

export const setActiveProgress = (progress: Progress | undefined): void => {
    activeProgress = progress;
};

/**
 * Give the terminal row back, whatever happened.
 *
 * A phase that throws between its first tick and its `finish` would otherwise
 * stay registered, and every line printed afterwards would redraw a dead
 * progress line under itself. Callers put this in a `finally`. Idempotent.
 */
export const finishActiveProgress = (): void => {
    const progress = activeProgress;

    activeProgress = undefined;
    progress?.finish();
};

const REDRAW_INTERVAL_MS = 100;
const PLAIN_EVERY_ITEMS = 50;
const PLAIN_EVERY_MS = 30_000;
const ETA_WINDOW = 50;
const ETA_MIN_ITEMS = 20;
/** Below this, a shortened file name says nothing, so the whole tail goes. */
const MIN_NAME_ROOM = 4;

/** Cut to fit, marking the cut. A line that wraps is a line that scrolls. */
const clampToWidth = (text: string, limit?: number): string =>
    limit !== undefined && text.length > limit
        ? `${text.slice(0, Math.max(0, limit - 1))}…`
        : text;

/**
 * `auto` follows the world: a person's terminal gets the live line, everything
 * else — CI, a pipe, a file — gets whole lines. `CI` wins over a TTY because a
 * CI runner can allocate one and still archive the output as a file.
 */
export const resolveProgressMode = ({
    preference = "auto",
    isTTY,
    ci,
}: {
    preference?: ProgressModePreference;
    isTTY?: boolean;
    ci?: string | undefined;
}): ProgressMode => {
    if (preference !== "auto") {
        return preference;
    }

    const inCi = ci !== undefined && ci !== "" && ci !== "false";

    return isTTY === true && !inCi ? "line" : "plain";
};

const pad = (value: number) => String(value).padStart(2, "0");

/** `45s`, `4m07`, `1h02` — short enough to sit on a busy line. */
export const formatDuration = (milliseconds: number): string => {
    const totalSeconds = Math.max(0, Math.round(milliseconds / 1000));

    if (totalSeconds < 60) {
        return `${totalSeconds}s`;
    }

    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;

    if (minutes < 60) {
        return `${minutes}m${pad(seconds)}`;
    }

    return `${Math.floor(minutes / 60)}h${pad(minutes % 60)}`;
};

export const createProgress = ({
    label,
    total,
    stream,
    mode,
    now = () => Date.now(),
}: {
    label: string;
    total: number;
    stream: ProgressStream;
    mode: ProgressMode;
    /** Injectable clock: the heartbeat and the ETA are time, not item count. */
    now?: () => number;
}): Progress => {
    // A phase that never finished (it threw) still owns the terminal row.
    // Close it before this one draws, so no dead line is redrawn underneath.
    finishActiveProgress();

    const startedAt = now();
    const durations: number[] = [];
    const counts: Record<ProgressOutcome, number> = {
        ok: 0,
        metadata_failed: 0,
        failed: 0,
        skipped: 0,
    };
    let done = 0;
    let lastItemAt = startedAt;
    let lastRenderAt = 0;
    let lastPlainAt = startedAt;
    let lastPlainDone = 0;
    let lastName = "";
    let liveLineLength = 0;
    let finished = false;

    const eta = (): string | undefined => {
        if (done < ETA_MIN_ITEMS || done >= total) {
            return undefined;
        }

        const average =
            durations.reduce((sum, value) => sum + value, 0) /
            (durations.length || 1);

        return formatDuration(average * (total - done));
    };

    const describe = (limit?: number): string => {
        const percent = total > 0 ? Math.floor((done / total) * 100) : 100;
        const parts = [
            `${label} ${done}/${total} (${percent}%)`,
            `${formatDuration(now() - startedAt)} elapsed`,
        ];
        const left = eta();

        if (left) {
            parts.push(`~${left} left`);
        }

        parts.push(`ok ${counts.ok}`);

        if (counts.metadata_failed > 0) {
            parts.push(`metadata failed ${counts.metadata_failed}`);
        }

        if (counts.skipped > 0) {
            parts.push(`skipped ${counts.skipped}`);
        }

        if (counts.failed > 0) {
            parts.push(`failed ${counts.failed}`);
        }

        const base = parts.join(" · ");

        if (!lastName) {
            return clampToWidth(base, limit);
        }

        const tail = ` · last: ${lastName}`;

        if (limit === undefined || base.length + tail.length <= limit) {
            return `${base}${tail}`;
        }

        // The counters are what the phase is for; the file name is the first
        // thing asked to give up its characters.
        const room = limit - base.length - " · last: ".length;

        return room >= MIN_NAME_ROOM
            ? `${base} · last: ${lastName.slice(0, room - 1)}…`
            : clampToWidth(base, limit);
    };

    /**
     * The widest a redrawn line may be. One column is left free: a line that
     * fills the last column wraps, and a wrapped line cannot be redrawn — every
     * `\r` then leaves the overflow behind as a new line.
     */
    const liveWidth = (): number | undefined => {
        const columns = stream.columns;

        return typeof columns === "number" && columns > 1
            ? columns - 1
            : undefined;
    };

    /** Blank the live line so something else may own the terminal row. */
    const clearLive = () => {
        if (mode !== "line" || liveLineLength === 0) {
            return;
        }

        stream.write(`\r${" ".repeat(liveLineLength)}\r`);
        liveLineLength = 0;
    };

    const drawLive = (force: boolean) => {
        const at = now();

        if (!force && at - lastRenderAt < REDRAW_INTERVAL_MS) {
            return;
        }

        const text = describe(liveWidth());
        const padding =
            liveLineLength > text.length
                ? " ".repeat(liveLineLength - text.length)
                : "";

        stream.write(`\r${text}${padding}`);
        liveLineLength = text.length;
        lastRenderAt = at;
    };

    const writePlain = () => {
        stream.write(`${describe()}\n`);
        lastPlainAt = now();
        lastPlainDone = done;
    };

    if (total > 0 || mode !== "line") {
        if (mode === "line") {
            drawLive(true);
        } else {
            writePlain();
        }
    }

    const progress: Progress = {
        tick: (item) => {
            const at = now();

            done += 1;
            counts[item?.outcome ?? "ok"] += 1;
            durations.push(at - lastItemAt);

            if (durations.length > ETA_WINDOW) {
                durations.shift();
            }

            lastItemAt = at;

            if (item?.name) {
                lastName = item.name;
            }

            if (mode === "line") {
                drawLive(done === total);
                return;
            }

            if (mode !== "plain") {
                return;
            }

            // Whichever comes first: enough items, or enough time. A slow
            // phase must still say it is alive.
            if (
                done - lastPlainDone >= PLAIN_EVERY_ITEMS ||
                at - lastPlainAt >= PLAIN_EVERY_MS
            ) {
                writePlain();
            }
        },
        fail: (message) => {
            // The same mark and colour `Logger.error` gives a failure, so a
            // failure reads the same whether a progress line owns the row.
            progress.printLine(chalk.red(`✘ ${message}`));
        },
        printLine: (text) => {
            clearLive();
            stream.write(`${text}\n`);

            if (mode === "line") {
                drawLive(true);
            }
        },
        finish: () => {
            if (finished) {
                return;
            }

            finished = true;

            if (activeProgress === progress) {
                setActiveProgress(undefined);
            }

            if (mode === "line") {
                drawLive(true);
                stream.write("\n");
                liveLineLength = 0;
                return;
            }

            writePlain();
        },
        snapshot: () => describe(mode === "line" ? liveWidth() : undefined),
    };

    if (mode === "line") {
        // Whoever prints next has a row to borrow and give back.
        setActiveProgress(progress);
    }

    return progress;
};
