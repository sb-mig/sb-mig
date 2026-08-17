# Copy Speed and Resume Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make `sb-mig copy` fast at 20,000-story scale and make a rerun after a failure redo only unfinished work.

**Architecture:** Keep the two copy phases (create shells, rewrite content). Add a shared adaptive rate limiter that wraps the Storyblok client, replace per-story target GET calls with one bulk prefetch, run tree levels and asset copies in parallel, and checkpoint the rewrite phase with `story_content` manifest entries so a resume skips completed stories.

**Tech Stack:** TypeScript (ESM, `.js` import suffixes), vitest, storyblok-js-client, node:crypto, node:fs/promises.

**Spec:** `docs/superpowers/specs/2026-08-17-copy-speed-resume-design.md`

## Global Constraints

- Default behavior must not change except speed and HTTP call count. New semantics only behind `--verify`, `--force-content`, `--rateLimit`.
- Default rate: 6 requests per second. `--rateLimit <n>` overrides the config `rateLimit` value.
- Manifest changes are additive only. Old manifests must load. Unknown entry types stay ignored.
- Report schemas gain only additive fields.
- Failure semantics stay: collect per-story failures, continue the run, exit non-zero, keep the 404 stale-mapping recovery.
- Conventional commits. No co-author lines. No AI attribution anywhere.
- All existing tests must pass without modification: `npm run test:unit`.
- Repo style: arrow-function consts, named exports, `import type` for types, 4-space indent.

---

### Task 1: Adaptive rate limiter

**Files:**
- Create: `src/utils/rate-limiter.ts`
- Test: `__tests__/utils/rate-limiter.test.ts`

**Interfaces:**
- Produces:
  ```ts
  export type AdaptiveLimiter = {
      schedule: <T>(fn: () => Promise<T>) => Promise<T>;
      penalize: (retryAfterMs?: number) => void; // 429 seen: halve rate, optional pause
      reward: () => void;                        // success: ramp rate back up
      currentRate: () => number;                 // requests per second now
      abort: () => void;                         // stop accepting new work
      aborted: () => boolean;
  };
  export const createAdaptiveLimiter = (options?: {
      targetRatePerSecond?: number; // default 6, also the max
      minRatePerSecond?: number;    // default 1
      now?: () => number;           // injectable clock (tests)
      sleep?: (ms: number) => Promise<void>; // injectable sleep (tests)
  }) => AdaptiveLimiter;
  export class CopyAbortedError extends Error {}
  ```
- Consumes: `delay` from `src/utils/async-utils.js`.

Semantics: token bucket. Tokens refill at `currentRate()` per second, bucket cap = 1 second of tokens. In-flight cap = `Math.max(2, Math.ceil(rate * 2))`. `penalize()` halves the rate (floor `minRatePerSecond`) and, when `retryAfterMs` is given, blocks new starts until that time passes. `reward()` raises the rate 10 percent, capped at `targetRatePerSecond`, at most once per 3 seconds. `schedule` after `abort()` rejects with `CopyAbortedError`.

- [ ] **Step 1: Write the failing tests**

```ts
// __tests__/utils/rate-limiter.test.ts
import { describe, it, expect } from "vitest";

import {
    createAdaptiveLimiter,
    CopyAbortedError,
} from "../../src/utils/rate-limiter.js";

const makeClock = () => {
    let time = 0;
    const pending: Array<{ at: number; resolve: () => void }> = [];
    return {
        now: () => time,
        sleep: (ms: number) =>
            new Promise<void>((resolve) => {
                pending.push({ at: time + ms, resolve });
            }),
        advance: async (ms: number) => {
            time += ms;
            for (const p of [...pending]) {
                if (p.at <= time) {
                    pending.splice(pending.indexOf(p), 1);
                    p.resolve();
                }
            }
            await Promise.resolve();
            await Promise.resolve();
        },
    };
};

describe("createAdaptiveLimiter", () => {
    it("runs at most rate*2 calls concurrently", async () => {
        const clock = makeClock();
        const limiter = createAdaptiveLimiter({
            targetRatePerSecond: 2,
            now: clock.now,
            sleep: clock.sleep,
        });
        let inFlight = 0;
        let maxInFlight = 0;
        const resolvers: Array<() => void> = [];
        const task = () => {
            inFlight++;
            maxInFlight = Math.max(maxInFlight, inFlight);
            return new Promise<void>((resolve) => {
                resolvers.push(() => {
                    inFlight--;
                    resolve();
                });
            });
        };
        const all = Promise.allSettled(
            Array.from({ length: 10 }, () => limiter.schedule(task)),
        );
        // burn enough virtual time for tokens to refill
        for (let index = 0; index < 20; index++) {
            await clock.advance(1000);
            resolvers.splice(0).forEach((resolve) => resolve());
        }
        await all;
        expect(maxInFlight).toBeLessThanOrEqual(4);
    });

    it("halves rate on penalize and ramps back on reward", async () => {
        const clock = makeClock();
        const limiter = createAdaptiveLimiter({
            targetRatePerSecond: 6,
            now: clock.now,
            sleep: clock.sleep,
        });
        limiter.penalize();
        expect(limiter.currentRate()).toBe(3);
        limiter.penalize();
        expect(limiter.currentRate()).toBe(1.5);
        await clock.advance(3001);
        limiter.reward();
        expect(limiter.currentRate()).toBeCloseTo(1.65);
        // reward is throttled: immediate second reward is a no-op
        limiter.reward();
        expect(limiter.currentRate()).toBeCloseTo(1.65);
    });

    it("never drops below minRatePerSecond or above target", () => {
        const clock = makeClock();
        const limiter = createAdaptiveLimiter({
            targetRatePerSecond: 6,
            minRatePerSecond: 2,
            now: clock.now,
            sleep: clock.sleep,
        });
        for (let index = 0; index < 10; index++) limiter.penalize();
        expect(limiter.currentRate()).toBe(2);
    });

    it("rejects new work after abort", async () => {
        const limiter = createAdaptiveLimiter({ targetRatePerSecond: 6 });
        limiter.abort();
        await expect(
            limiter.schedule(async () => "x"),
        ).rejects.toBeInstanceOf(CopyAbortedError);
    });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run __tests__/utils/rate-limiter.test.ts`
Expected: FAIL — cannot resolve `src/utils/rate-limiter.js`.

- [ ] **Step 3: Implement**

```ts
// src/utils/rate-limiter.ts
import { delay } from "./async-utils.js";

export class CopyAbortedError extends Error {
    constructor() {
        super("Copy run aborted.");
        this.name = "CopyAbortedError";
    }
}

export type AdaptiveLimiter = {
    schedule: <T>(fn: () => Promise<T>) => Promise<T>;
    penalize: (retryAfterMs?: number) => void;
    reward: () => void;
    currentRate: () => number;
    abort: () => void;
    aborted: () => boolean;
};

const REWARD_INTERVAL_MS = 3000;

export const createAdaptiveLimiter = (options?: {
    targetRatePerSecond?: number;
    minRatePerSecond?: number;
    now?: () => number;
    sleep?: (ms: number) => Promise<void>;
}): AdaptiveLimiter => {
    const targetRate = Math.max(1, options?.targetRatePerSecond ?? 6);
    const minRate = Math.max(0.5, options?.minRatePerSecond ?? 1);
    const now = options?.now ?? (() => Date.now());
    const sleep = options?.sleep ?? delay;

    let rate = targetRate;
    let tokens = targetRate;
    let lastRefillAt = now();
    let lastRewardAt = 0;
    let pausedUntil = 0;
    let inFlight = 0;
    let isAborted = false;

    const maxInFlight = () => Math.max(2, Math.ceil(rate * 2));

    const refill = () => {
        const elapsed = now() - lastRefillAt;
        if (elapsed <= 0) return;
        tokens = Math.min(rate, tokens + (elapsed / 1000) * rate);
        lastRefillAt = now();
    };

    const schedule = async <T>(fn: () => Promise<T>): Promise<T> => {
        for (;;) {
            if (isAborted) throw new CopyAbortedError();
            refill();
            const pauseLeft = pausedUntil - now();
            if (pauseLeft > 0) {
                await sleep(pauseLeft);
                continue;
            }
            if (tokens >= 1 && inFlight < maxInFlight()) break;
            await sleep(Math.max(50, 1000 / rate));
        }
        tokens -= 1;
        inFlight += 1;
        try {
            return await fn();
        } finally {
            inFlight -= 1;
        }
    };

    return {
        schedule,
        penalize: (retryAfterMs?: number) => {
            rate = Math.max(minRate, rate / 2);
            tokens = Math.min(tokens, rate);
            if (retryAfterMs && retryAfterMs > 0) {
                pausedUntil = Math.max(pausedUntil, now() + retryAfterMs);
            }
        },
        reward: () => {
            if (now() - lastRewardAt < REWARD_INTERVAL_MS) return;
            lastRewardAt = now();
            rate = Math.min(targetRate, rate * 1.1);
        },
        currentRate: () => rate,
        abort: () => {
            isAborted = true;
        },
        aborted: () => isAborted,
    };
};
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run __tests__/utils/rate-limiter.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/utils/rate-limiter.ts __tests__/utils/rate-limiter.test.ts
git commit -m "feat(copy): add adaptive rate limiter for management api calls"
```

---

### Task 2: Rate-limited Storyblok client wrapper with retries

**Files:**
- Create: `src/api/copy/limited-client.ts`
- Test: `__tests__/api/copy/limited-client.test.ts`

**Interfaces:**
- Consumes: `AdaptiveLimiter`, `CopyAbortedError` from `src/utils/rate-limiter.js`.
- Produces:
  ```ts
  export const wrapSbApiWithLimiter = (
      sbApi: any,
      limiter: AdaptiveLimiter,
      options?: { sleep?: (ms: number) => Promise<void> },
  ) => any; // same get/post/put/delete surface as StoryblokClient
  ```

Retry policy per call: on 429 retry up to 5 times, call `limiter.penalize(retryAfterMs)` each time (Retry-After header read from `err.response.headers["retry-after"]`, seconds → ms; fallback backoff `1000 * 2^attempt` plus jitter up to 250 ms). On 5xx or a no-status network error retry up to 3 times with the same backoff. Any other error rethrows at once. Call `limiter.reward()` on success. Every attempt goes through `limiter.schedule` so retries also respect the budget.

- [ ] **Step 1: Write the failing tests**

```ts
// __tests__/api/copy/limited-client.test.ts
import { describe, it, expect, vi } from "vitest";

import { wrapSbApiWithLimiter } from "../../../src/api/copy/limited-client.js";
import { createAdaptiveLimiter } from "../../../src/utils/rate-limiter.js";

const instantSleep = () => Promise.resolve();

const makeLimiter = () =>
    createAdaptiveLimiter({ targetRatePerSecond: 1000, sleep: instantSleep });

const httpError = (status: number, headers: Record<string, string> = {}) =>
    Object.assign(new Error(`http ${status}`), {
        status,
        response: { status, headers },
    });

describe("wrapSbApiWithLimiter", () => {
    it("passes through successful calls and rewards the limiter", async () => {
        const limiter = makeLimiter();
        const reward = vi.spyOn(limiter, "reward");
        const sbApi = { get: vi.fn().mockResolvedValue({ data: { ok: 1 } }) };
        const wrapped = wrapSbApiWithLimiter(sbApi, limiter, {
            sleep: instantSleep,
        });
        const result = await wrapped.get("spaces/1/stories/", { page: 1 });
        expect(result).toEqual({ data: { ok: 1 } });
        expect(sbApi.get).toHaveBeenCalledWith("spaces/1/stories/", { page: 1 });
        expect(reward).toHaveBeenCalled();
    });

    it("retries a 429 up to 5 times, penalizes, honors retry-after", async () => {
        const limiter = makeLimiter();
        const penalize = vi.spyOn(limiter, "penalize");
        const sbApi = {
            put: vi
                .fn()
                .mockRejectedValueOnce(httpError(429, { "retry-after": "2" }))
                .mockRejectedValueOnce(httpError(429))
                .mockResolvedValue({ data: { done: true } }),
        };
        const wrapped = wrapSbApiWithLimiter(sbApi, limiter, {
            sleep: instantSleep,
        });
        const result = await wrapped.put("spaces/1/stories/5", {});
        expect(result).toEqual({ data: { done: true } });
        expect(sbApi.put).toHaveBeenCalledTimes(3);
        expect(penalize).toHaveBeenNthCalledWith(1, 2000);
    });

    it("gives up after 5 429 retries", async () => {
        const limiter = makeLimiter();
        const sbApi = { post: vi.fn().mockRejectedValue(httpError(429)) };
        const wrapped = wrapSbApiWithLimiter(sbApi, limiter, {
            sleep: instantSleep,
        });
        await expect(wrapped.post("x", {})).rejects.toMatchObject({
            status: 429,
        });
        expect(sbApi.post).toHaveBeenCalledTimes(6); // 1 + 5 retries
    });

    it("retries 5xx and network errors up to 3 times", async () => {
        const limiter = makeLimiter();
        const sbApi = {
            get: vi
                .fn()
                .mockRejectedValueOnce(httpError(503))
                .mockRejectedValueOnce(new Error("socket hang up"))
                .mockResolvedValue({ data: {} }),
        };
        const wrapped = wrapSbApiWithLimiter(sbApi, limiter, {
            sleep: instantSleep,
        });
        await expect(wrapped.get("x")).resolves.toEqual({ data: {} });
        expect(sbApi.get).toHaveBeenCalledTimes(3);
    });

    it("does not retry 4xx other than 429", async () => {
        const limiter = makeLimiter();
        const sbApi = { put: vi.fn().mockRejectedValue(httpError(422)) };
        const wrapped = wrapSbApiWithLimiter(sbApi, limiter, {
            sleep: instantSleep,
        });
        await expect(wrapped.put("x", {})).rejects.toMatchObject({
            status: 422,
        });
        expect(sbApi.put).toHaveBeenCalledTimes(1);
    });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run __tests__/api/copy/limited-client.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

```ts
// src/api/copy/limited-client.ts
import type { AdaptiveLimiter } from "../../utils/rate-limiter.js";

import { delay } from "../../utils/async-utils.js";

const MAX_RATE_LIMIT_RETRIES = 5;
const MAX_TRANSIENT_RETRIES = 3;

const resolveStatus = (error: any): number | undefined =>
    error?.status ?? error?.response?.status;

const resolveRetryAfterMs = (error: any): number | undefined => {
    const raw = error?.response?.headers?.["retry-after"];
    const seconds = Number(raw);
    return Number.isFinite(seconds) && seconds > 0
        ? seconds * 1000
        : undefined;
};

const backoffMs = (attempt: number): number =>
    1000 * 2 ** attempt + Math.floor(Math.random() * 250);

export const wrapSbApiWithLimiter = (
    sbApi: any,
    limiter: AdaptiveLimiter,
    options?: { sleep?: (ms: number) => Promise<void> },
): any => {
    const sleep = options?.sleep ?? delay;

    const call = async (method: string, args: any[]): Promise<any> => {
        let rateLimitRetries = 0;
        let transientRetries = 0;

        for (;;) {
            try {
                const result = await limiter.schedule(() =>
                    sbApi[method](...args),
                );
                limiter.reward();
                return result;
            } catch (error: any) {
                const status = resolveStatus(error);

                if (status === 429 && rateLimitRetries < MAX_RATE_LIMIT_RETRIES) {
                    rateLimitRetries += 1;
                    const retryAfterMs = resolveRetryAfterMs(error);
                    limiter.penalize(retryAfterMs);
                    await sleep(retryAfterMs ?? backoffMs(rateLimitRetries));
                    continue;
                }

                const isTransient =
                    status === undefined || (status >= 500 && status < 600);

                if (isTransient && transientRetries < MAX_TRANSIENT_RETRIES) {
                    transientRetries += 1;
                    await sleep(backoffMs(transientRetries));
                    continue;
                }

                throw error;
            }
        }
    };

    const wrapped: any = {};
    for (const method of ["get", "post", "put", "delete"]) {
        if (typeof sbApi[method] === "function") {
            wrapped[method] = (...args: any[]) => call(method, args);
        }
    }
    // Preserve everything else (e.g. internal fields other code reads).
    return new Proxy(wrapped, {
        get: (target, prop) =>
            prop in target ? target[prop as string] : (sbApi as any)[prop],
    });
};
```

Note: `CopyAbortedError` thrown by `limiter.schedule` has no `status`, so it counts as transient and gets up to 3 useless retries. Guard it: at the top of the `catch`, `if (error instanceof CopyAbortedError) throw error;` (import it from `../../utils/rate-limiter.js`). Include this guard in the implementation.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run __tests__/api/copy/limited-client.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add src/api/copy/limited-client.ts __tests__/api/copy/limited-client.test.ts
git commit -m "feat(copy): wrap storyblok client with rate limiter and retries"
```

---

### Task 3: Atomic manifest writes and serialized appends

**Files:**
- Modify: `src/api/copy/manifest.ts` (`writeManifest`, `appendManifestEntry`, `appendManifestEntries`)
- Test: `__tests__/api/copy/manifest-durability.test.ts`

**Interfaces:**
- Produces: same public signatures as today. Behavior change only: `writeManifest` writes `<file>.tmp-<pid>` then renames; all appends to one file chain through a per-file promise queue.

- [ ] **Step 1: Write the failing tests**

```ts
// __tests__/api/copy/manifest-durability.test.ts
import fs from "fs/promises";
import os from "os";
import path from "path";

import { describe, it, expect } from "vitest";

import {
    appendManifestEntry,
    loadManifest,
    writeManifest,
} from "../../../src/api/copy/manifest.js";

const tempFile = async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "sbmig-manifest-"));
    return path.join(dir, "manifest.jsonl");
};

const entry = (sourceId: number): any => ({
    type: "story",
    source_space_id: "1",
    target_space_id: "2",
    source_id: sourceId,
    target_id: sourceId + 1000,
    source_uuid: `u-${sourceId}`,
    target_uuid: `t-${sourceId}`,
    source_full_slug: `s/${sourceId}`,
    target_full_slug: `d/${sourceId}`,
    action: "created",
    created_at: "2026-08-17T00:00:00.000Z",
});

describe("manifest durability", () => {
    it("writeManifest leaves no temp file behind", async () => {
        const file = await tempFile();
        await writeManifest(file, [entry(1), entry(2)]);
        const files = await fs.readdir(path.dirname(file));
        expect(files).toEqual(["manifest.jsonl"]);
        expect(await loadManifest(file)).toHaveLength(2);
    });

    it("parallel appends produce valid jsonl with no lost lines", async () => {
        const file = await tempFile();
        await Promise.all(
            Array.from({ length: 200 }, (_, index) =>
                appendManifestEntry(file, entry(index)),
            ),
        );
        const entries = await loadManifest(file);
        expect(entries).toHaveLength(200);
        const ids = new Set(entries.map((item: any) => item.source_id));
        expect(ids.size).toBe(200);
    });
});
```

- [ ] **Step 2: Run tests to verify they fail or pass vacuously**

Run: `npx vitest run __tests__/api/copy/manifest-durability.test.ts`
Expected: both tests likely PASS already on POSIX (small atomic appends). That is fine — they lock the behavior. The real change (temp+rename, queue) is verified by reading the diff; the tests prevent regressions.

- [ ] **Step 3: Implement**

In `src/api/copy/manifest.ts`:

```ts
// Per-file promise chain so parallel workers never interleave partial lines
// and temp-file renames never race an append.
const fileQueues = new Map<string, Promise<unknown>>();

const enqueue = <T>(filePath: string, task: () => Promise<T>): Promise<T> => {
    const previous = fileQueues.get(filePath) ?? Promise.resolve();
    const next = previous.then(task, task);
    fileQueues.set(filePath, next);
    return next;
};
```

Rewrite the three write functions to use the queue, and make `writeManifest` atomic:

```ts
export const appendManifestEntry = async (
    filePath: string,
    entry: CopyManifestEntry,
): Promise<void> =>
    enqueue(filePath, async () => {
        await fs.mkdir(path.dirname(filePath), { recursive: true });
        await fs.appendFile(filePath, `${JSON.stringify(entry)}\n`, "utf8");
    });

export const appendManifestEntries = async (
    filePath: string,
    entries: CopyManifestEntry[],
): Promise<void> => {
    if (entries.length === 0) return;
    return enqueue(filePath, async () => {
        await fs.mkdir(path.dirname(filePath), { recursive: true });
        await fs.appendFile(
            filePath,
            entries.map((entry) => JSON.stringify(entry)).join("\n") + "\n",
            "utf8",
        );
    });
};

export const writeManifest = async (
    filePath: string,
    entries: CopyManifestEntry[],
): Promise<void> =>
    enqueue(filePath, async () => {
        await fs.mkdir(path.dirname(filePath), { recursive: true });
        const content =
            entries.length > 0
                ? entries.map((entry) => JSON.stringify(entry)).join("\n") +
                  "\n"
                : "";
        const tempPath = `${filePath}.tmp-${process.pid}`;
        await fs.writeFile(tempPath, content, "utf8");
        await fs.rename(tempPath, filePath);
    });
```

- [ ] **Step 4: Run tests**

Run: `npx vitest run __tests__/api/copy/manifest-durability.test.ts && npm run test:unit`
Expected: PASS, no existing test broken.

- [ ] **Step 5: Commit**

```bash
git add src/api/copy/manifest.ts __tests__/api/copy/manifest-durability.test.ts
git commit -m "fix(copy): atomic manifest rewrites and serialized appends"
```

---

### Task 4: `story_content` checkpoint entry and content hash

**Files:**
- Modify: `src/api/copy/types.ts` (add entry type to the `CopyManifestEntry` union)
- Create: `src/api/copy/checkpoint.ts`
- Modify: `src/api/copy/index.ts` (re-export new functions)
- Modify: `src/api/copy/manifest.ts` (`getManifestEntrySourceKey` must key `story_content` separately from `story`)
- Test: `__tests__/api/copy/checkpoint.test.ts`

**Interfaces:**
- Produces:
  ```ts
  // types.ts addition
  export type CopyStoryContentManifestEntry = {
      type: "story_content";
      schema_version: 1;
      source_space_id: string;
      target_space_id: string;
      source_id: number;
      target_id: number;
      source_updated_at?: string;
      content_hash: string;      // "sha256:<hex>"
      unresolved_refs: number;
      created_at: string;
  };
  // checkpoint.ts
  export const computeContentHash = (input: {
      payload: any;
      publicationMode: string;
      publishLanguages?: string[];
  }) => string;
  export const buildContentCheckpointMap = (
      entries: CopyManifestEntry[],
  ) => Map<number, CopyStoryContentManifestEntry>;
  ```
- Consumes: `CopyManifestEntry` from `types.ts`.

`computeContentHash` must be deterministic: stable JSON stringify (recursive key sort for plain objects, arrays in order) over `{ payload, publicationMode, publishLanguages: [...].sort() }`, then `sha256` hex from `node:crypto`, prefixed `sha256:`. `buildContentCheckpointMap` keeps the last entry per `source_id` (JSONL last-wins, same as `buildCopyMaps`).

Dedupe key: today `getManifestEntrySourceKey` for non-story entries is `type:source_space:target_space:source_id`, so `story_content` already gets its own key namespace via `type`. Verify only — no change needed unless the story branch matches first (it matches on `entry.type === "story"`, so it does not).

- [ ] **Step 1: Write the failing tests**

```ts
// __tests__/api/copy/checkpoint.test.ts
import { describe, it, expect } from "vitest";

import {
    buildContentCheckpointMap,
    computeContentHash,
} from "../../../src/api/copy/checkpoint.js";

describe("computeContentHash", () => {
    it("is stable across key order", () => {
        const a = computeContentHash({
            payload: { content: { b: 1, a: [{ y: 2, x: 1 }] } },
            publicationMode: "preserve-layers",
            publishLanguages: ["en", "de"],
        });
        const b = computeContentHash({
            payload: { content: { a: [{ x: 1, y: 2 }], b: 1 } },
            publicationMode: "preserve-layers",
            publishLanguages: ["de", "en"],
        });
        expect(a).toBe(b);
        expect(a).toMatch(/^sha256:[0-9a-f]{64}$/);
    });

    it("changes when a mapped reference changes the payload", () => {
        const base = { content: { link: "uuid-old" } };
        const rewritten = { content: { link: "uuid-new" } };
        expect(
            computeContentHash({ payload: base, publicationMode: "save-only" }),
        ).not.toBe(
            computeContentHash({
                payload: rewritten,
                publicationMode: "save-only",
            }),
        );
    });

    it("changes when the publication mode changes", () => {
        const payload = { content: {} };
        expect(
            computeContentHash({ payload, publicationMode: "save-only" }),
        ).not.toBe(
            computeContentHash({ payload, publicationMode: "collapse-draft" }),
        );
    });
});

describe("buildContentCheckpointMap", () => {
    it("keeps the last checkpoint per source id and ignores other types", () => {
        const entries: any[] = [
            { type: "story", source_id: 1 },
            {
                type: "story_content",
                source_id: 1,
                content_hash: "sha256:old",
            },
            {
                type: "story_content",
                source_id: 1,
                content_hash: "sha256:new",
            },
            { type: "asset", source_id: 9 },
        ];
        const map = buildContentCheckpointMap(entries);
        expect(map.size).toBe(1);
        expect(map.get(1)?.content_hash).toBe("sha256:new");
    });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run __tests__/api/copy/checkpoint.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

```ts
// src/api/copy/checkpoint.ts
import type {
    CopyManifestEntry,
    CopyStoryContentManifestEntry,
} from "./types.js";

import crypto from "crypto";

const stableStringify = (value: any): string => {
    if (Array.isArray(value)) {
        return `[${value.map(stableStringify).join(",")}]`;
    }
    if (value && typeof value === "object") {
        const keys = Object.keys(value).sort();
        return `{${keys
            .map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`)
            .join(",")}}`;
    }
    return JSON.stringify(value) ?? "null";
};

export const computeContentHash = ({
    payload,
    publicationMode,
    publishLanguages,
}: {
    payload: any;
    publicationMode: string;
    publishLanguages?: string[];
}): string => {
    const canonical = stableStringify({
        payload,
        publicationMode,
        publishLanguages: [...(publishLanguages ?? [])].sort(),
    });

    return `sha256:${crypto.createHash("sha256").update(canonical).digest("hex")}`;
};

export const buildContentCheckpointMap = (
    entries: CopyManifestEntry[],
): Map<number, CopyStoryContentManifestEntry> => {
    const map = new Map<number, CopyStoryContentManifestEntry>();

    for (const entry of entries) {
        if ((entry as any).type === "story_content") {
            const checkpoint = entry as CopyStoryContentManifestEntry;
            map.set(Number(checkpoint.source_id), checkpoint);
        }
    }

    return map;
};
```

Add `CopyStoryContentManifestEntry` to `types.ts` (shape above) and add it to the `CopyManifestEntry` union. Re-export `computeContentHash`, `buildContentCheckpointMap`, and the type from `src/api/copy/index.ts`.

- [ ] **Step 4: Run tests**

Run: `npx vitest run __tests__/api/copy/checkpoint.test.ts && npm run typecheck`
Expected: PASS. Typecheck clean — if `buildCopyMaps` or dedupe switch on entry type exhaustively, extend those switches (they use `if` guards today, so they ignore the new type).

- [ ] **Step 5: Commit**

```bash
git add src/api/copy/checkpoint.ts src/api/copy/types.ts src/api/copy/index.ts __tests__/api/copy/checkpoint.test.ts
git commit -m "feat(copy): add story_content checkpoint entry and content hash"
```

---

### Task 5: Bulk target story prefetch

**Files:**
- Create: `src/api/copy/target-prefetch.ts`
- Modify: `src/api/copy/index.ts` (re-export)
- Test: `__tests__/api/copy/target-prefetch.test.ts`

**Interfaces:**
- Consumes: `getAllItemsWithPagination` from `src/api/utils/request.js`.
- Produces:
  ```ts
  export const prefetchTargetStories = async ({
      destination, // normalized destination root, "" for space root
      config,      // RequestBaseConfig with spaceId + (wrapped) sbApi
  }: {
      destination: string;
      config: { spaceId: string; sbApi: any };
  }) => Promise<Map<string, any>>; // full_slug -> story stub (no content)
  ```

When `destination` is not empty, pass `starts_with: destination` so only the relevant subtree pages through. Key the map by `full_slug`.

- [ ] **Step 1: Write the failing tests**

```ts
// __tests__/api/copy/target-prefetch.test.ts
import { describe, it, expect, vi } from "vitest";

import { prefetchTargetStories } from "../../../src/api/copy/target-prefetch.js";

const makeSbApi = (pages: any[][], total: number) => ({
    get: vi.fn().mockImplementation((_path: string, params: any) =>
        Promise.resolve({
            data: { stories: pages[(params.page ?? 1) - 1] ?? [] },
            total,
            perPage: params.per_page,
        }),
    ),
});

describe("prefetchTargetStories", () => {
    it("pages through the target list and maps by full_slug", async () => {
        const pageOne = Array.from({ length: 100 }, (_, index) => ({
            id: index,
            full_slug: `dest/story-${index}`,
        }));
        const pageTwo = [{ id: 100, full_slug: "dest/story-100" }];
        const sbApi = makeSbApi([pageOne, pageTwo], 101);
        const map = await prefetchTargetStories({
            destination: "dest",
            config: { spaceId: "2", sbApi },
        });
        expect(map.size).toBe(101);
        expect(map.get("dest/story-100")?.id).toBe(100);
        expect(sbApi.get).toHaveBeenCalledWith(
            "spaces/2/stories/",
            expect.objectContaining({ starts_with: "dest", page: 1 }),
        );
    });

    it("omits starts_with for the space root", async () => {
        const sbApi = makeSbApi([[]], 0);
        await prefetchTargetStories({
            destination: "",
            config: { spaceId: "2", sbApi },
        });
        const params = sbApi.get.mock.calls[0][1];
        expect("starts_with" in params).toBe(false);
    });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run __tests__/api/copy/target-prefetch.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

```ts
// src/api/copy/target-prefetch.ts
import { getAllItemsWithPagination } from "../utils/request.js";

export const prefetchTargetStories = async ({
    destination,
    config,
}: {
    destination: string;
    config: { spaceId: string; sbApi: any };
}): Promise<Map<string, any>> => {
    const { spaceId, sbApi } = config;
    const baseParams = destination ? { starts_with: destination } : {};

    const stories = await getAllItemsWithPagination({
        apiFn: ({ per_page, page }: { per_page: number; page: number }) =>
            sbApi.get(`spaces/${spaceId}/stories/`, {
                ...baseParams,
                per_page,
                page,
            }),
        params: { spaceId },
        itemsKey: "stories",
    });

    return new Map(
        stories.map((story: any) => [String(story.full_slug), story] as const),
    );
};
```

- [ ] **Step 4: Run tests**

Run: `npx vitest run __tests__/api/copy/target-prefetch.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/api/copy/target-prefetch.ts src/api/copy/index.ts __tests__/api/copy/target-prefetch.test.ts
git commit -m "feat(copy): bulk prefetch of target stories"
```

---

### Task 6: Level-order tree walk helper

**Files:**
- Create: `src/api/copy/tree-levels.ts`
- Modify: `src/api/copy/index.ts` (re-export)
- Test: `__tests__/api/copy/tree-levels.test.ts`

**Interfaces:**
- Produces:
  ```ts
  export type LevelNode = {
      node: any;               // tree node ({ story, children })
      parent: LevelNode | null;
      targetId: number | null; // filled by the executor after creation
      skippedBranch: boolean;  // parent failed -> whole branch skipped
  };
  export const collectTreeLevels = (tree: any[]) => LevelNode[][];
  export const flattenLevels = (levels: LevelNode[][]) => LevelNode[];
  ```

`collectTreeLevels(tree)[0]` holds root nodes with `parent: null`. Every node at level N+1 points at its parent `LevelNode` at level N, so an executor resolves `parentTargetId` as `parent?.targetId ?? realParentId` and can propagate `skippedBranch`.

- [ ] **Step 1: Write the failing tests**

```ts
// __tests__/api/copy/tree-levels.test.ts
import { describe, it, expect } from "vitest";

import {
    collectTreeLevels,
    flattenLevels,
} from "../../../src/api/copy/tree-levels.js";

const node = (id: number, children: any[] = []) => ({
    story: { id },
    children,
});

describe("collectTreeLevels", () => {
    it("groups nodes by depth with parent links", () => {
        const tree = [
            node(1, [node(2, [node(4)]), node(3)]),
            node(5),
        ];
        const levels = collectTreeLevels(tree);
        expect(levels.map((level) => level.map((n) => n.node.story.id))).toEqual(
            [[1, 5], [2, 3], [4]],
        );
        const levelTwo = levels[1];
        expect(levelTwo[0].parent?.node.story.id).toBe(1);
        expect(levels[2][0].parent?.node.story.id).toBe(2);
        expect(levels[0][0].parent).toBeNull();
    });

    it("flattenLevels preserves parent-before-child order", () => {
        const tree = [node(1, [node(2)])];
        const flat = flattenLevels(collectTreeLevels(tree));
        expect(flat.map((n) => n.node.story.id)).toEqual([1, 2]);
    });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run __tests__/api/copy/tree-levels.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

```ts
// src/api/copy/tree-levels.ts
export type LevelNode = {
    node: any;
    parent: LevelNode | null;
    targetId: number | null;
    skippedBranch: boolean;
};

export const collectTreeLevels = (tree: any[]): LevelNode[][] => {
    const levels: LevelNode[][] = [];
    let current: LevelNode[] = tree.map((node) => ({
        node,
        parent: null,
        targetId: null,
        skippedBranch: false,
    }));

    while (current.length > 0) {
        levels.push(current);
        current = current.flatMap((parent) =>
            (parent.node.children ?? []).map((child: any) => ({
                node: child,
                parent,
                targetId: null,
                skippedBranch: false,
            })),
        );
    }

    return levels;
};

export const flattenLevels = (levels: LevelNode[][]): LevelNode[] =>
    levels.flat();
```

- [ ] **Step 4: Run tests**

Run: `npx vitest run __tests__/api/copy/tree-levels.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/api/copy/tree-levels.ts src/api/copy/index.ts __tests__/api/copy/tree-levels.test.ts
git commit -m "feat(copy): level-order tree walk helper"
```

---

### Task 7: Progress reporter

**Files:**
- Create: `src/utils/progress.ts`
- Test: `__tests__/utils/progress.test.ts`

**Interfaces:**
- Produces:
  ```ts
  export type ProgressTracker = {
      tick: (delta?: number, counters?: Partial<Record<"skipped" | "failed", number>>) => void;
      finish: () => void;
  };
  export const createProgressTracker = (options: {
      label: string;              // e.g. "stories: rewrite"
      total: number;
      ratePerSecond?: () => number; // limiter.currentRate for the ETA
      log?: (line: string) => void; // default Logger.success
      now?: () => number;
      intervalMs?: number;        // default 1000
  }) => ProgressTracker;
  ```

`tick` accumulates. At most one log line per `intervalMs`, plus one final line from `finish()`. Line format: `stories: rewrite 4213/20000 (6.0 req/s, ETA 44m) skipped 3900 failed 2` — ETA = remaining items / rate, formatted `Xs`/`Xm`/`Xh Ym`, omitted when `ratePerSecond` is absent or 0.

- [ ] **Step 1: Write the failing tests**

```ts
// __tests__/utils/progress.test.ts
import { describe, it, expect, vi } from "vitest";

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
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run __tests__/utils/progress.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

```ts
// src/utils/progress.ts
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
            parts.push(`(${rate.toFixed(1)} req/s${eta ? `, ETA ${eta}` : ""})`);
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
```

- [ ] **Step 4: Run tests**

Run: `npx vitest run __tests__/utils/progress.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/utils/progress.ts __tests__/utils/progress.test.ts
git commit -m "feat(copy): throttled progress tracker with rate and eta"
```

---

### Task 8: Parallel shell phase with prefetch and trust-by-default

**Files:**
- Modify: `src/cli/commands/copy.ts` (`createStoriesAndWriteManifests`, `findTargetConflicts`, `getValidMappedTargetStory` call sites)
- Test: `__tests__/cli/copy-shell-phase.test.ts`

**Interfaces:**
- Consumes: `collectTreeLevels`, `prefetchTargetStories`, `mapWithConcurrency`, `ProgressTracker`.
- Produces: `createStoriesAndWriteManifests` gains parameters, exported for tests:
  ```ts
  export const createStoriesAndWriteManifests = async (args: {
      tree: any[];
      realParentId: number | null;
      sourceStoryById: Map<number, any>;
      targetSlugBySourceSlug: Map<string, string>;
      sourceSpace: string;
      targetSpace: string;
      manifestRoot?: string;
      targetStoriesBySlug: Map<string, any>; // from prefetchTargetStories
      verify: boolean;
      writeConcurrency: number;              // default ceil(rate*2)
      apiConfig: any;                        // config with the wrapped sbApi
      progress?: ProgressTracker;
  }) => Promise<CopyStoriesApplySummary & { failures: ShellFailure[] }>;
  export type ShellFailure = {
      sourceId: number;
      fullSlug: string;
      stage: "create-shell";
      message: string;
  };
  ```

Behavior:

1. `levels = collectTreeLevels(tree)`. For each level, run nodes through `mapWithConcurrency(level, writeConcurrency, ...)`.
2. Per node: if `parent?.skippedBranch`, mark `skippedBranch = true`, record nothing, return. Parent target id = `parent?.targetId ?? realParentId`.
3. Mapped story (`copyMaps.storyIds` hit): default trust — set `targetId`, count `storiesMatched`, **no API call**. With `verify: true`, check the prefetch map: mapped `targetFullSlug` present and its `id` equals the mapped id → trust; otherwise log the existing stale-mapping warning, drop the mapping, fall through to create-or-match.
4. Unmapped story: look up `targetFullSlug` in `targetStoriesBySlug` (replaces the per-story `getStoryBySlug`). Hit → write `matched_by_target_key` manifest entry. Miss → `createStory` shell (through the wrapped client), write `created` entry. Add the created story to `targetStoriesBySlug` so a later duplicate slug in the same run matches instead of failing.
5. Create failure → push a `ShellFailure`, set `skippedBranch = true` on the node (descendants skip, same as today's `continue`).
6. After all levels: dedupe manifests, log, return summary plus failures (failures merge into the final report; a shell failure alone must still make apply exit non-zero — carry them into the rewrite-phase failure list).

`findTargetConflicts` (dry-run) is rewritten to take `targetStoriesBySlug` and intersect locally — no HTTP. Keep the function name and the log lines about conflict counts. Delete `TARGET_CONFLICT_CHECK_CONCURRENCY`.

- [ ] **Step 1: Write the failing tests**

Mock `managementApi` at the module boundary. The test drives `createStoriesAndWriteManifests` directly with a temp `manifestRoot`.

```ts
// __tests__/cli/copy-shell-phase.test.ts
import fs from "fs/promises";
import os from "os";
import path from "path";

import { describe, it, expect, vi, beforeEach } from "vitest";

const createStory = vi.fn();
vi.mock("../../src/api/managementApi.js", () => ({
    managementApi: {
        stories: {
            createStory: (...args: any[]) => createStory(...args),
        },
    },
}));

const { createStoriesAndWriteManifests } = await import(
    "../../src/cli/commands/copy.js"
);
const { loadManifest, getDefaultCopyManifestPaths } = await import(
    "../../src/api/copy/index.js"
);

const story = (id: number, slug: string, isFolder = false) => ({
    id,
    uuid: `uuid-${id}`,
    full_slug: slug,
    slug: slug.split("/").at(-1),
    name: slug,
    is_folder: isFolder,
    content: { component: "page" },
});

const treeNode = (s: any, children: any[] = []) => ({
    id: s.id,
    story: s,
    children,
});

describe("createStoriesAndWriteManifests (parallel shell phase)", () => {
    let manifestRoot: string;

    beforeEach(async () => {
        manifestRoot = await fs.mkdtemp(path.join(os.tmpdir(), "sbmig-shell-"));
        createStory.mockReset();
        let nextId = 1000;
        createStory.mockImplementation((payload: any) =>
            Promise.resolve({
                story: {
                    id: ++nextId,
                    uuid: `t-uuid-${nextId}`,
                    full_slug: payload.slug,
                    parent_id: payload.parent_id ?? null,
                },
            }),
        );
    });

    it("creates parents before children and writes manifest entries", async () => {
        const folder = story(1, "src", true);
        const child = story(2, "src/page");
        const summary = await createStoriesAndWriteManifests({
            tree: [treeNode(folder, [treeNode(child)])],
            realParentId: null,
            sourceStoryById: new Map([
                [1, folder],
                [2, child],
            ]),
            targetSlugBySourceSlug: new Map([
                ["src", "src"],
                ["src/page", "src/page"],
            ]),
            sourceSpace: "1",
            targetSpace: "2",
            manifestRoot,
            targetStoriesBySlug: new Map(),
            verify: false,
            writeConcurrency: 4,
            apiConfig: { spaceId: "2", sbApi: {} },
        });
        expect(summary.storiesCreated + summary.storyFoldersPlanned).toBeGreaterThan(0);
        // child call happened after parent call and carries the parent target id
        const childCall = createStory.mock.calls.find(
            (call) => call[0].slug === "page",
        );
        expect(childCall?.[0].parent_id).toBeGreaterThan(1000);
        const paths = getDefaultCopyManifestPaths({
            sourceSpaceId: "1",
            targetSpaceId: "2",
            rootDir: manifestRoot,
        });
        expect(await loadManifest(paths.stories)).toHaveLength(2);
    });

    it("matches against the prefetch map without any api call", async () => {
        const src = story(1, "src");
        await createStoriesAndWriteManifests({
            tree: [treeNode(src)],
            realParentId: null,
            sourceStoryById: new Map([[1, src]]),
            targetSlugBySourceSlug: new Map([["src", "src"]]),
            sourceSpace: "1",
            targetSpace: "2",
            manifestRoot,
            targetStoriesBySlug: new Map([
                ["src", { id: 77, uuid: "t-77", full_slug: "src" }],
            ]),
            verify: false,
            writeConcurrency: 4,
            apiConfig: { spaceId: "2", sbApi: {} },
        });
        expect(createStory).not.toHaveBeenCalled();
    });

    it("a failed parent skips its branch but the run continues", async () => {
        createStory.mockRejectedValueOnce(new Error("boom"));
        const badParent = story(1, "bad", true);
        const orphan = story(2, "bad/child");
        const sibling = story(3, "ok");
        const result = await createStoriesAndWriteManifests({
            tree: [
                treeNode(badParent, [treeNode(orphan)]),
                treeNode(sibling),
            ],
            realParentId: null,
            sourceStoryById: new Map([
                [1, badParent],
                [2, orphan],
                [3, sibling],
            ]),
            targetSlugBySourceSlug: new Map([
                ["bad", "bad"],
                ["bad/child", "bad/child"],
                ["ok", "ok"],
            ]),
            sourceSpace: "1",
            targetSpace: "2",
            manifestRoot,
            targetStoriesBySlug: new Map(),
            verify: false,
            writeConcurrency: 4,
            apiConfig: { spaceId: "2", sbApi: {} },
        });
        expect(result.failures).toHaveLength(1);
        expect(result.failures[0].fullSlug).toBe("bad");
        // sibling still created, orphan not attempted
        const slugs = createStory.mock.calls.map((call) => call[0].slug);
        expect(slugs).toContain("ok");
        expect(slugs).not.toContain("child");
    });
});
```

Note: today `createStory` in `stories.ts` swallows errors (`catch(console.error)` → resolves `undefined`), so a rejected mock exercises the copy-level "no id" failure path. The existing code already throws on a missing `targetStory.id` — keep that check; it converts both a rejection and an `undefined` result into a `ShellFailure`.

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run __tests__/cli/copy-shell-phase.test.ts`
Expected: FAIL — `createStoriesAndWriteManifests` is not exported (and lacks the new parameters).

- [ ] **Step 3: Implement**

Rewrite `createStoriesAndWriteManifests` in `src/cli/commands/copy.ts` per the behavior list above. Export it (`export const createStoriesAndWriteManifests = ...`). Core loop:

```ts
const levels = collectTreeLevels(tree);

for (const level of levels) {
    await mapWithConcurrency(level, writeConcurrency, async (levelNode) => {
        if (levelNode.parent?.skippedBranch) {
            levelNode.skippedBranch = true;
            return;
        }
        const parentTargetId = levelNode.parent?.targetId ?? realParentId;
        const sourceStory = sourceStoryById.get(
            Number(levelNode.node.id ?? levelNode.node.story.id),
        );
        // ... mapped / prefetch-match / create logic from the behavior list,
        // ending with levelNode.targetId = <target id> on success or
        // levelNode.skippedBranch = true + failures.push(...) on error.
    });
}
```

Manifest-entry writing, `copyMaps` updates, and counters keep the exact code that exists today — move it into the per-node function. `getValidMappedTargetStory` keeps its name but now takes `targetStoriesBySlug` and does map lookups only, and only runs when `verify` is true. Update `findTargetConflicts` to a synchronous filter over the prefetch map. Keep every log message that exists today.

- [ ] **Step 4: Run tests**

Run: `npx vitest run __tests__/cli/copy-shell-phase.test.ts && npm run typecheck && npm run test:unit`
Expected: PASS. The copy command call site does not compile yet if the new parameters are required — pass them from `copyCommand` in this same task (prefetch called once before the phase, `verify: Boolean(flags["verify"])`, `writeConcurrency: 12`, `apiConfig` unchanged for now — the wrapped client lands in Task 11).

- [ ] **Step 5: Commit**

```bash
git add src/cli/commands/copy.ts __tests__/cli/copy-shell-phase.test.ts
git commit -m "feat(copy): parallel level-order shell phase with bulk target prefetch"
```

---

### Task 9: Parallel rewrite phase with checkpoints

**Files:**
- Modify: `src/cli/commands/copy.ts` (`rewriteCopiedStoryContents`)
- Test: `__tests__/cli/copy-rewrite-phase.test.ts`

**Interfaces:**
- Consumes: `flattenLevels`, `collectTreeLevels`, `computeContentHash`, `buildContentCheckpointMap`, `appendCopyManifestEntry`, `mapWithConcurrency`.
- Produces: `rewriteCopiedStoryContents` exported, gains parameters:
  ```ts
  export const rewriteCopiedStoryContents = async (args: {
      // existing parameters stay:
      tree; realParentId; sourceStoryById; targetSlugBySourceSlug;
      publication; publishedLayerRecordBySourceId;
      sourceSpace; targetSpace; manifestRoot;
      // new:
      forceContent: boolean;
      writeConcurrency: number;
      progress?: ProgressTracker;
  }) => Promise<{
      updatedStories: number;
      rewrittenReferences: number;
      skippedStories: number;   // new, additive
      failures: RewriteFailure[];
  }>;
  ```

Behavior per story (parallel over `flattenLevels(collectTreeLevels(tree))`, filtered to nodes with a `targetStoryId` in the maps — parenting already exists after the shell phase, so order does not matter):

1. Build the rewritten payload (existing `buildRewrittenStoryPayload`).
2. Compute `hash = computeContentHash({ payload: rewrittenPayload, publicationMode: publication.mode, publishLanguages: publication.resolvedPublishLanguages })`. For the preserve-layers dance, hash the pair: `payload: { current: currentPayload, publishedLayer: publishedLayerPayload ?? null }`.
3. If not `forceContent` and `checkpoints.get(sourceId)?.content_hash === hash` → `skippedStories += 1`, progress `tick(1, { skipped: 1 })`, return. Zero API calls.
4. Otherwise run today's `writeStory` sequence unchanged (update / preserve-layers dance / publish / 404 shell recovery / `assertStoryUpdateSucceeded`).
5. On success append a `story_content` checkpoint:
   ```ts
   const checkpointEntry: CopyStoryContentManifestEntry = {
       type: "story_content",
       schema_version: 1,
       source_space_id: sourceSpace,
       target_space_id: targetSpace,
       source_id: Number(sourceStory.id),
       target_id: Number(targetStoryId),
       source_updated_at: sourceStory.updated_at,
       content_hash: hash,
       unresolved_refs: countUnresolvedRefs(rewriteRecords),
       created_at: new Date().toISOString(),
   };
   await appendCopyManifestEntry({
       combinedPath: manifestPaths.combined,
       resourcePath: manifestPaths.stories,
       entry: checkpointEntry,
   });
   ```
   `countUnresolvedRefs`: `rewriteCopyReferences` returns `records`; count records whose status is not a successful map and not `preserved_external` (check `src/api/copy/reference-rewriter.ts` for the exact record shape while implementing — the count feeds the Task 10 fast path, `preserved_external` does not count).
6. On failure push to `failures` as today. The end-of-phase summary, error log, and the final `throw` when `failures.length > 0` stay unchanged.

One shared-state caution: `maps.storyIds` mutations from the 404 recovery path now happen under concurrency. `Map.set`/`delete` are synchronous, so this is safe in Node — no locking needed. The recovery path (`createOrMatchReplacementShell`) keeps its `getStoryBySlug` call: it is rare, and correctness beats one saved GET.

- [ ] **Step 1: Write the failing tests**

```ts
// __tests__/cli/copy-rewrite-phase.test.ts
import fs from "fs/promises";
import os from "os";
import path from "path";

import { describe, it, expect, vi, beforeEach } from "vitest";

const updateStory = vi.fn();
const getAllComponents = vi.fn().mockResolvedValue([]);
vi.mock("../../src/api/managementApi.js", () => ({
    managementApi: {
        stories: {
            updateStory: (...args: any[]) => updateStory(...args),
        },
        components: {
            getAllComponents: (...args: any[]) => getAllComponents(...args),
        },
    },
}));

const { rewriteCopiedStoryContents } = await import(
    "../../src/cli/commands/copy.js"
);
const { appendManifestEntry, getDefaultCopyManifestPaths, loadManifest } =
    await import("../../src/api/copy/index.js");

const story = (id: number) => ({
    id,
    uuid: `uuid-${id}`,
    full_slug: `s/${id}`,
    slug: String(id),
    name: `s${id}`,
    is_folder: false,
    published: false,
    unpublished_changes: false,
    updated_at: "2026-08-17T00:00:00.000Z",
    content: { component: "page", _uid: "u", title: `t${id}` },
});

const baseArgs = (manifestRoot: string, stories: any[]) => ({
    tree: stories.map((s) => ({ id: s.id, story: s, children: [] })),
    realParentId: null,
    sourceStoryById: new Map(stories.map((s) => [s.id, s])),
    targetSlugBySourceSlug: new Map(
        stories.map((s) => [s.full_slug, s.full_slug]),
    ),
    publication: { mode: "save-only" as const },
    publishedLayerRecordBySourceId: new Map(),
    sourceSpace: "1",
    targetSpace: "2",
    manifestRoot,
    forceContent: false,
    writeConcurrency: 4,
});

const seedShellMapping = async (manifestRoot: string, s: any) => {
    const paths = getDefaultCopyManifestPaths({
        sourceSpaceId: "1",
        targetSpaceId: "2",
        rootDir: manifestRoot,
    });
    await appendManifestEntry(paths.combined, {
        type: "story",
        source_space_id: "1",
        target_space_id: "2",
        source_id: s.id,
        target_id: s.id + 1000,
        source_uuid: s.uuid,
        target_uuid: `t-${s.uuid}`,
        source_full_slug: s.full_slug,
        target_full_slug: s.full_slug,
        action: "created",
        created_at: "2026-08-17T00:00:00.000Z",
    } as any);
};

describe("rewriteCopiedStoryContents (checkpointed)", () => {
    let manifestRoot: string;

    beforeEach(async () => {
        manifestRoot = await fs.mkdtemp(
            path.join(os.tmpdir(), "sbmig-rewrite-"),
        );
        updateStory.mockReset();
        updateStory.mockResolvedValue({ ok: true, stage: "update" });
    });

    it("updates every story on the first run and writes checkpoints", async () => {
        const stories = [story(1), story(2)];
        for (const s of stories) await seedShellMapping(manifestRoot, s);
        const result = await rewriteCopiedStoryContents(
            baseArgs(manifestRoot, stories),
        );
        expect(result.updatedStories).toBe(2);
        expect(result.skippedStories).toBe(0);
        expect(updateStory).toHaveBeenCalledTimes(2);
        const paths = getDefaultCopyManifestPaths({
            sourceSpaceId: "1",
            targetSpaceId: "2",
            rootDir: manifestRoot,
        });
        const checkpoints = (await loadManifest(paths.combined)).filter(
            (entry: any) => entry.type === "story_content",
        );
        expect(checkpoints).toHaveLength(2);
    });

    it("skips checkpointed stories on the second run with zero api calls", async () => {
        const stories = [story(1)];
        await seedShellMapping(manifestRoot, stories[0]);
        await rewriteCopiedStoryContents(baseArgs(manifestRoot, stories));
        updateStory.mockClear();
        const second = await rewriteCopiedStoryContents(
            baseArgs(manifestRoot, stories),
        );
        expect(second.skippedStories).toBe(1);
        expect(second.updatedStories).toBe(0);
        expect(updateStory).not.toHaveBeenCalled();
    });

    it("re-updates when the source content changed", async () => {
        const s = story(1);
        await seedShellMapping(manifestRoot, s);
        await rewriteCopiedStoryContents(baseArgs(manifestRoot, [s]));
        updateStory.mockClear();
        const edited = { ...s, content: { ...s.content, title: "changed" } };
        const result = await rewriteCopiedStoryContents(
            baseArgs(manifestRoot, [edited]),
        );
        expect(result.updatedStories).toBe(1);
        expect(updateStory).toHaveBeenCalledTimes(1);
    });

    it("--force-content ignores checkpoints", async () => {
        const s = story(1);
        await seedShellMapping(manifestRoot, s);
        await rewriteCopiedStoryContents(baseArgs(manifestRoot, [s]));
        updateStory.mockClear();
        const result = await rewriteCopiedStoryContents({
            ...baseArgs(manifestRoot, [s]),
            forceContent: true,
        });
        expect(result.updatedStories).toBe(1);
    });

    it("a failed story gets no checkpoint and the phase still throws at the end", async () => {
        const stories = [story(1), story(2)];
        for (const s of stories) await seedShellMapping(manifestRoot, s);
        updateStory
            .mockResolvedValueOnce({
                ok: false,
                status: 422,
                response: "nope",
            })
            .mockResolvedValue({ ok: true });
        await expect(
            rewriteCopiedStoryContents(baseArgs(manifestRoot, stories)),
        ).rejects.toThrow(/1 story/);
        const paths = getDefaultCopyManifestPaths({
            sourceSpaceId: "1",
            targetSpaceId: "2",
            rootDir: manifestRoot,
        });
        const checkpoints = (await loadManifest(paths.combined)).filter(
            (entry: any) => entry.type === "story_content",
        );
        expect(checkpoints).toHaveLength(1);
    });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run __tests__/cli/copy-rewrite-phase.test.ts`
Expected: FAIL — function not exported / no checkpoint behavior.

- [ ] **Step 3: Implement**

Rewrite `rewriteCopiedStoryContents` per the behavior list. Replace the recursive `walk` with:

```ts
const levelNodes = flattenLevels(collectTreeLevels(tree)).filter(
    (levelNode) => {
        const sourceId = Number(
            levelNode.node.id ?? levelNode.node.story?.id,
        );
        return sourceStoryById.get(sourceId)?.id !== undefined;
    },
);

await mapWithConcurrency(levelNodes, writeConcurrency, async (levelNode) => {
    // resolve sourceStory, targetStoryId from maps (or createOrMatchReplacementShell),
    // then the checkpoint-skip / writeStory / checkpoint-append logic.
});
```

The `writeStory`, `createOrMatchReplacementShell`, 404-recovery, and failure-collection code moves inside the mapper unchanged. Parent target id for a replacement shell: `levelNode.parent?.targetId ?? maps.storyIds.get(parentSourceId) ?? realParentId` — the shell phase already ran, so `maps.storyIds` has every parent.

- [ ] **Step 4: Run tests**

Run: `npx vitest run __tests__/cli/copy-rewrite-phase.test.ts && npm run typecheck && npm run test:unit`
Expected: PASS. Update the `copyCommand` call site with `forceContent: Boolean(flags["forceContent"] ?? flags["force-content"])` and `writeConcurrency: 12`.

- [ ] **Step 5: Commit**

```bash
git add src/cli/commands/copy.ts __tests__/cli/copy-rewrite-phase.test.ts
git commit -m "feat(copy): parallel rewrite phase with content checkpoints"
```

---

### Task 10: Resume fast path — skip source content fetch

**Files:**
- Modify: `src/api/stories/stories.ts` (export `getAllStoriesWithoutContent`, extracted from `getAllStories`)
- Create: `src/api/copy/resume-partition.ts`
- Modify: `src/cli/commands/copy.ts` (source fetch in the `stories` case)
- Modify: `src/api/copy/index.ts` (re-export)
- Test: `__tests__/api/copy/resume-partition.test.ts`

**Interfaces:**
- Produces:
  ```ts
  // stories.ts — extraction, no behavior change for getAllStories
  export const getAllStoriesWithoutContent = async (args, config) => any[]; // list stubs
  // resume-partition.ts
  export type ResumePartition = {
      fastPathSourceIds: Set<number>; // skip content fetch AND rewrite
      needsContentIds: Set<number>;
  };
  export const partitionStoriesForResume = (input: {
      listStories: any[]; // stubs with id + updated_at
      checkpoints: Map<number, CopyStoryContentManifestEntry>;
      verify: boolean;
      forceContent: boolean;
  }) => ResumePartition;
  ```
- Consumes: `buildContentCheckpointMap` (Task 4).

Fast-path rule (spec section 5): a story goes to `fastPathSourceIds` only when a checkpoint exists AND `checkpoint.source_updated_at === story.updated_at` AND `checkpoint.unresolved_refs === 0` AND not `verify` AND not `forceContent`. Everything else goes to `needsContentIds`.

Wiring in `copyCommand` (stories case, both dry-run and apply):

1. Fetch list stubs with `getAllStoriesWithoutContent` (same selection logic as `getStoriesForSelection`, so extract the selection wrapper: `getStoriesForSelection` gains an option `{ contentFor: Set<number> | "all" }` — root story still fetched fully via `getStoryBySlug` as today).
2. Load the manifest once, build checkpoints, partition.
3. Fetch full content (existing `getStoryById` concurrency, routed through the wrapped client) only for `needsContentIds`.
4. Fast-path stories join the tree as stubs — the shell phase needs no content for mapped stories, and the rewrite phase receives a `fastPathSourceIds` set and counts them as `skippedStories` without recomputing hashes.
5. Dry-run: report `storiesSkipped = fastPathSourceIds.size` in the summary (additive field) and log one line: `Resume: N stories already up to date (checkpointed).`
6. `--with-assets`: the reference scan runs over stories with content only. Fast-path stories resolved all references at checkpoint time, so their assets are already in the manifest. Add this reasoning as a code comment at the scan call site — it is a correctness argument, not obvious.

- [ ] **Step 1: Write the failing tests**

```ts
// __tests__/api/copy/resume-partition.test.ts
import { describe, it, expect } from "vitest";

import { partitionStoriesForResume } from "../../../src/api/copy/resume-partition.js";

const checkpoint = (sourceId: number, overrides: any = {}) => ({
    type: "story_content" as const,
    schema_version: 1 as const,
    source_space_id: "1",
    target_space_id: "2",
    source_id: sourceId,
    target_id: sourceId + 1000,
    source_updated_at: "2026-08-17T00:00:00.000Z",
    content_hash: "sha256:x",
    unresolved_refs: 0,
    created_at: "2026-08-17T00:00:00.000Z",
    ...overrides,
});

const stub = (id: number, updated_at = "2026-08-17T00:00:00.000Z") => ({
    id,
    updated_at,
});

describe("partitionStoriesForResume", () => {
    const checkpoints = new Map([
        [1, checkpoint(1)],
        [2, checkpoint(2, { unresolved_refs: 3 })],
        [3, checkpoint(3)],
    ]);

    it("fast-paths unchanged, fully-resolved, checkpointed stories", () => {
        const partition = partitionStoriesForResume({
            listStories: [
                stub(1),                              // fast path
                stub(2),                              // unresolved refs -> content
                stub(3, "2026-08-18T00:00:00.000Z"), // edited -> content
                stub(4),                              // no checkpoint -> content
            ],
            checkpoints,
            verify: false,
            forceContent: false,
        });
        expect([...partition.fastPathSourceIds]).toEqual([1]);
        expect([...partition.needsContentIds].sort()).toEqual([2, 3, 4]);
    });

    it("verify and forceContent disable the fast path", () => {
        for (const flags of [
            { verify: true, forceContent: false },
            { verify: false, forceContent: true },
        ]) {
            const partition = partitionStoriesForResume({
                listStories: [stub(1)],
                checkpoints,
                ...flags,
            });
            expect(partition.fastPathSourceIds.size).toBe(0);
        }
    });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run __tests__/api/copy/resume-partition.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

```ts
// src/api/copy/resume-partition.ts
import type { CopyStoryContentManifestEntry } from "./types.js";

export type ResumePartition = {
    fastPathSourceIds: Set<number>;
    needsContentIds: Set<number>;
};

export const partitionStoriesForResume = ({
    listStories,
    checkpoints,
    verify,
    forceContent,
}: {
    listStories: any[];
    checkpoints: Map<number, CopyStoryContentManifestEntry>;
    verify: boolean;
    forceContent: boolean;
}): ResumePartition => {
    const fastPathSourceIds = new Set<number>();
    const needsContentIds = new Set<number>();

    for (const story of listStories) {
        const sourceId = Number(story.id);
        const checkpoint = checkpoints.get(sourceId);
        const eligible =
            !verify &&
            !forceContent &&
            checkpoint !== undefined &&
            checkpoint.unresolved_refs === 0 &&
            checkpoint.source_updated_at !== undefined &&
            checkpoint.source_updated_at === story.updated_at;

        (eligible ? fastPathSourceIds : needsContentIds).add(sourceId);
    }

    return { fastPathSourceIds, needsContentIds };
};
```

Extract `getAllStoriesWithoutContent` in `stories.ts` (the pagination block that already exists inside `getAllStories`; `getAllStories` then calls it and fetches content — zero behavior change). Wire the partition into `copyCommand` per the list above. In `rewriteCopiedStoryContents`, accept `fastPathSourceIds?: Set<number>` and short-circuit those stories as skipped before payload building (a stub has no content to rewrite).

- [ ] **Step 4: Run tests**

Run: `npx vitest run __tests__/api/copy/resume-partition.test.ts && npm run typecheck && npm run test:unit`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/api/copy/resume-partition.ts src/api/stories/stories.ts src/cli/commands/copy.ts src/api/copy/index.ts __tests__/api/copy/resume-partition.test.ts
git commit -m "feat(copy): resume fast path skips source content fetch"
```

---

### Task 11: Parallel asset copy and conditional target fetch

**Files:**
- Modify: `src/cli/commands/copy.ts` (`copyAssetsAndWriteManifests`)
- Test: `__tests__/cli/copy-assets-phase.test.ts`

**Interfaces:**
- Consumes: `mapWithConcurrency`, `ProgressTracker`.
- Produces: same signature plus `{ writeConcurrency: number; progress?: ProgressTracker }`.

Behavior:

1. Asset folders: keep sequential order by level — group `graph.assetFolders` by parent depth (compute depth from `sourceParentId` chains via a `Map<sourceId, folder>`), process each depth level with `mapWithConcurrency`.
2. Assets: replace the `for` loop with `mapWithConcurrency(assetsToProcess, writeConcurrency, ...)`. The 4-call sequence per asset (download, create+finalize, metadata, manifest append) stays inside one mapper call. An asset failure records a warning in `graph.errors` and continues (today an asset throw aborts the command — collect instead, throw at phase end when errors exist, matching the story-phase pattern; this is a strict improvement in resumability and stays non-zero-exit).
3. Skip the target-space `getAllAssets`/`getAllAssetFolders` fetch when every graph asset and folder already has a manifest mapping (`copyMaps` hit) — log `All selected assets already mapped; skipping target asset fetch.`.

- [ ] **Step 1: Write the failing tests**

```ts
// __tests__/cli/copy-assets-phase.test.ts
import fs from "fs/promises";
import os from "os";
import path from "path";

import { describe, it, expect, vi, beforeEach } from "vitest";

const getAllAssets = vi.fn();
const getAllAssetFolders = vi.fn();
const downloadAsset = vi.fn();
const createAssetAndFinalize = vi.fn();
const updateAsset = vi.fn();
const createAssetFolder = vi.fn();
vi.mock("../../src/api/managementApi.js", () => ({
    managementApi: {
        assets: {
            getAllAssets: (...a: any[]) => getAllAssets(...a),
            getAllAssetFolders: (...a: any[]) => getAllAssetFolders(...a),
            downloadAsset: (...a: any[]) => downloadAsset(...a),
            createAssetAndFinalize: (...a: any[]) =>
                createAssetAndFinalize(...a),
            updateAsset: (...a: any[]) => updateAsset(...a),
            createAssetFolder: (...a: any[]) => createAssetFolder(...a),
        },
    },
}));

const { copyAssetsAndWriteManifests } = await import(
    "../../src/cli/commands/copy.js"
);
const { buildCopyAssetsGraph } = await import(
    "../../src/api/copy/index.js"
);

const asset = (id: number) => ({
    id,
    filename: `https://a.storyblok.com/f/1/1x1/h${id}/file-${id}.png`,
    asset_folder_id: null,
});

describe("copyAssetsAndWriteManifests (parallel)", () => {
    let manifestRoot: string;

    beforeEach(async () => {
        manifestRoot = await fs.mkdtemp(path.join(os.tmpdir(), "sbmig-assets-"));
        for (const mock of [
            getAllAssets,
            getAllAssetFolders,
            downloadAsset,
            createAssetAndFinalize,
            updateAsset,
            createAssetFolder,
        ])
            mock.mockReset();
        getAllAssets.mockResolvedValue({ assets: [] });
        getAllAssetFolders.mockResolvedValue({ asset_folders: [] });
        downloadAsset.mockResolvedValue("/tmp/file.png");
        createAssetAndFinalize.mockImplementation(({ payload }: any) =>
            Promise.resolve({
                id: Math.floor(Math.random() * 100000),
                filename: payload.filename.replace("/f/1/", "/f/2/"),
            }),
        );
    });

    it("copies assets in parallel and reports created counts", async () => {
        const sourceAssets = [asset(1), asset(2), asset(3)];
        const graph = buildCopyAssetsGraph({
            sourceSpaceId: "1",
            targetSpaceId: "2",
            assets: sourceAssets,
            assetFolders: [],
        });
        const report = await copyAssetsAndWriteManifests({
            sourceSpace: "1",
            targetSpace: "2",
            selection: { type: "all" },
            input: {},
            graph,
            sourceAssets,
            sourceAssetFolders: [],
            manifestRoot,
            writeConcurrency: 4,
        });
        expect(report.summary.assetsCreated).toBe(3);
        expect(createAssetAndFinalize).toHaveBeenCalledTimes(3);
    });

    it("one failed asset does not abort the others", async () => {
        createAssetAndFinalize
            .mockRejectedValueOnce(new Error("upload failed"))
            .mockImplementation(({ payload }: any) =>
                Promise.resolve({ id: 9, filename: payload.filename }),
            );
        const sourceAssets = [asset(1), asset(2)];
        const graph = buildCopyAssetsGraph({
            sourceSpaceId: "1",
            targetSpaceId: "2",
            assets: sourceAssets,
            assetFolders: [],
        });
        await expect(
            copyAssetsAndWriteManifests({
                sourceSpace: "1",
                targetSpace: "2",
                selection: { type: "all" },
                input: {},
                graph,
                sourceAssets,
                sourceAssetFolders: [],
                manifestRoot,
                writeConcurrency: 4,
            }),
        ).rejects.toThrow(/1 asset/);
        expect(createAssetAndFinalize).toHaveBeenCalledTimes(2);
    });

    it("skips the target asset fetch when everything is already mapped", async () => {
        // First run to populate the manifest.
        const sourceAssets = [asset(1)];
        const graph = buildCopyAssetsGraph({
            sourceSpaceId: "1",
            targetSpaceId: "2",
            assets: sourceAssets,
            assetFolders: [],
        });
        await copyAssetsAndWriteManifests({
            sourceSpace: "1",
            targetSpace: "2",
            selection: { type: "all" },
            input: {},
            graph,
            sourceAssets,
            sourceAssetFolders: [],
            manifestRoot,
            writeConcurrency: 4,
        });
        getAllAssets.mockClear();
        // Second run: all mapped.
        const graphTwo = buildCopyAssetsGraph({
            sourceSpaceId: "1",
            targetSpaceId: "2",
            assets: sourceAssets,
            assetFolders: [],
        });
        await copyAssetsAndWriteManifests({
            sourceSpace: "1",
            targetSpace: "2",
            selection: { type: "all" },
            input: {},
            graph: graphTwo,
            sourceAssets,
            sourceAssetFolders: [],
            manifestRoot,
            writeConcurrency: 4,
        });
        expect(getAllAssets).not.toHaveBeenCalled();
    });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run __tests__/cli/copy-assets-phase.test.ts`
Expected: FAIL — not exported / sequential behavior.

- [ ] **Step 3: Implement**

Export `copyAssetsAndWriteManifests`, apply the three behavior changes. Failure collection: wrap the per-asset body in try/catch, push `{ code: "asset_copy_failed", message, sourceId }` into `graph.errors`, and after the loop throw `new Error(\`Asset copy finished but ${failedCount} asset(s) failed.\`)` when `failedCount > 0` — after the manifest dedupe and report write, mirroring the story phase.

- [ ] **Step 4: Run tests**

Run: `npx vitest run __tests__/cli/copy-assets-phase.test.ts && npm run test:unit`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/cli/commands/copy.ts __tests__/cli/copy-assets-phase.test.ts
git commit -m "feat(copy): parallel asset copy with per-asset failure isolation"
```

---

### Task 12: Wire flags, limiter, SIGINT, and exit summary into copyCommand

**Files:**
- Modify: `src/cli/commands/copy.ts` (`copyCommand` — both `stories` and `assets` cases)
- Modify: `src/cli/cli-descriptions.ts` (document `--rateLimit`, `--verify`, `--force-content` under copy)
- Test: `__tests__/cli/copy-command-flags.test.ts`

**Interfaces:**
- Consumes: everything above.
- Produces: `copyCommand` behavior — flags parsed, one limiter + wrapped client per invocation, progress trackers per phase, SIGINT handler, exit summary.

Wiring at the top of each copy case:

```ts
const rateLimit = Number(readStringFlag(flags, ["rateLimit"]) ?? "") ||
    Number((apiConfig as any).rateLimit) || 6;
const verify = Boolean(flags["verify"]);
const forceContent = Boolean(
    flags["forceContent"] ?? flags["force-content"],
);
const limiter = createAdaptiveLimiter({ targetRatePerSecond: rateLimit });
const copyApiConfig = {
    ...apiConfig,
    sbApi: wrapSbApiWithLimiter(apiConfig.sbApi, limiter),
};
const writeConcurrency = Math.max(2, Math.ceil(rateLimit * 2));
```

Every `{ ...apiConfig, spaceId: ... }` spread inside the copy phases becomes `{ ...copyApiConfig, spaceId: ... }` (pass `copyApiConfig` down as the `apiConfig` parameter added in Tasks 8–11).

SIGINT:

```ts
const onSigint = () => {
    Logger.warning(
        "Interrupt received. Finishing in-flight requests, then stopping. Run the same command again to resume.",
    );
    limiter.abort();
};
process.once("SIGINT", onSigint);
try {
    // ... phases ...
} finally {
    process.removeListener("SIGINT", onSigint);
}
```

Phases treat `CopyAbortedError` per item as a skip-silently case (not a failure). After an aborted run, print the pending count and the exact resume command (reuse `buildCopyCommand({ ..., dryRun: false })`) and exit with code 130 (`process.exitCode = 130`).

Exit summary (apply mode, always printed at the end, also on failure):

```
Copy summary
  stories:        created 120  matched 19880  skipped 19850  failed 3
  asset folders:  created 4    matched 12
  assets:         created 210  matched 890    failed 1
Resume: sb-mig copy stories --from 1 --to 2 --source src --mode subtree
```

Print the `Resume:` line only when failures or an abort happened. Add `storiesSkipped` to `CopyStoriesApplySummary` (additive).

- [ ] **Step 1: Write the failing test**

```ts
// __tests__/cli/copy-command-flags.test.ts
import { describe, it, expect, vi } from "vitest";

// Unit-test the flag resolution helpers, exported from copy.ts.
const { resolveCopyRuntimeOptions } = await import(
    "../../src/cli/commands/copy.js"
);

describe("resolveCopyRuntimeOptions", () => {
    it("defaults to rate 6, no verify, no forceContent", () => {
        const options = resolveCopyRuntimeOptions({}, {});
        expect(options.rateLimit).toBe(6);
        expect(options.verify).toBe(false);
        expect(options.forceContent).toBe(false);
        expect(options.writeConcurrency).toBe(12);
    });

    it("flag overrides config rateLimit", () => {
        const options = resolveCopyRuntimeOptions(
            { rateLimit: "3" },
            { rateLimit: 10 },
        );
        expect(options.rateLimit).toBe(3);
        expect(options.writeConcurrency).toBe(6);
    });

    it("config rateLimit applies when no flag is set", () => {
        const options = resolveCopyRuntimeOptions({}, { rateLimit: 10 });
        expect(options.rateLimit).toBe(10);
    });

    it("parses verify and force-content in both spellings", () => {
        expect(
            resolveCopyRuntimeOptions({ verify: true }, {}).verify,
        ).toBe(true);
        expect(
            resolveCopyRuntimeOptions({ "force-content": true }, {})
                .forceContent,
        ).toBe(true);
        expect(
            resolveCopyRuntimeOptions({ forceContent: true }, {}).forceContent,
        ).toBe(true);
    });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run __tests__/cli/copy-command-flags.test.ts`
Expected: FAIL — `resolveCopyRuntimeOptions` not exported.

- [ ] **Step 3: Implement**

```ts
export const resolveCopyRuntimeOptions = (
    flags: Record<string, any>,
    config: { rateLimit?: number },
): {
    rateLimit: number;
    verify: boolean;
    forceContent: boolean;
    writeConcurrency: number;
} => {
    const flagRate = Number(readStringFlag(flags, ["rateLimit"]) ?? "");
    const rateLimit =
        (Number.isFinite(flagRate) && flagRate > 0 ? flagRate : 0) ||
        (config.rateLimit && config.rateLimit > 0 ? config.rateLimit : 0) ||
        6;

    return {
        rateLimit,
        verify: Boolean(flags["verify"]),
        forceContent: Boolean(flags["forceContent"] ?? flags["force-content"]),
        writeConcurrency: Math.max(2, Math.ceil(rateLimit * 2)),
    };
};
```

Then the wiring, SIGINT handler, and summary printer (`printCopySummary(summaryData)` — a small local function building the aligned lines with `padEnd`). Update `cli-descriptions.ts` copy help text with the three flags.

- [ ] **Step 4: Run tests**

Run: `npx vitest run __tests__/cli/copy-command-flags.test.ts && npm run typecheck && npm run test:unit`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/cli/commands/copy.ts src/cli/cli-descriptions.ts __tests__/cli/copy-command-flags.test.ts
git commit -m "feat(copy): rate limit flag, sigint-safe abort, exit summary"
```

---

### Task 13: End-to-end resume integration test

**Files:**
- Test: `__tests__/cli/copy-resume-e2e.test.ts`

**Interfaces:**
- Consumes: `copyCommand` from `src/cli/commands/copy.js` with `managementApi` and `api-config` mocked; an in-memory fake target space.

Scenario coverage (one `describe`, shared fake):

1. **First run** copies a 6-story tree (2 folders, 4 stories): 6 creates, 6 updates, manifest has 6 story entries + 6 checkpoints.
2. **Crash mid-run**: make `updateStory` fail hard (mock rejects) after 3 successes on the first run — run throws, 3 checkpoints exist.
3. **Resume**: rerun with all mocks healthy — only the 3 unfinished stories get `updateStory` calls, zero `createStory` calls (all shells mapped), summary shows `skippedStories: 3`.
4. **Source edit between runs**: bump one story's `updated_at` + content in the fake source, rerun — exactly that story gets one `updateStory` call.

Build the fake:

```ts
const makeFakeSpaces = () => {
    const targetStories = new Map<string, any>(); // full_slug -> story
    let nextId = 5000;
    return {
        targetStories,
        createStory: (payload: any) => {
            const id = ++nextId;
            const parentSlug = [...targetStories.values()].find(
                (s) => s.id === payload.parent_id,
            )?.full_slug;
            const full_slug = parentSlug
                ? `${parentSlug}/${payload.slug}`
                : payload.slug;
            const story = {
                id,
                uuid: `t-${id}`,
                full_slug,
                parent_id: payload.parent_id ?? null,
                is_folder: payload.is_folder,
            };
            targetStories.set(full_slug, story);
            return Promise.resolve({ story });
        },
        updateStory: vi.fn(() => Promise.resolve({ ok: true })),
        listStories: (params: any) => {
            const stories = [...targetStories.values()].filter(
                (s) =>
                    !params.starts_with ||
                    s.full_slug.startsWith(params.starts_with),
            );
            return Promise.resolve({
                data: { stories },
                total: stories.length,
                perPage: params.per_page,
            });
        },
    };
};
```

Mock `../../src/api/managementApi.js` with the fake, mock `../../src/cli/api-config.js` exporting `{ apiConfig: { spaceId: "1", sbApi: { get: fake.listStories-backed router } }, sbApi: ... }` where the `sbApi.get` router answers `spaces/1/stories/` (source list) from a fixed source-story fixture and `spaces/2/stories/` (target list) from the fake. Source content fetch (`getStoryById`) answers from the fixture. Use `--manifestRoot` pointed at a temp dir. Drive everything through:

```ts
await copyCommand({
    input: ["copy", "stories"],
    flags: {
        from: "1",
        to: "2",
        source: "src",
        mode: "subtree",
        manifestRoot,
        publicationMode: "save-only",
    },
} as any);
```

Assertion style: count mock calls between runs (`updateStory.mock.calls.length`), read manifests with `loadManifest`, and filter checkpoint entries. This test is the spec's acceptance test — if a step is hard to satisfy, fix the implementation, not the test.

- [ ] **Step 1: Write the test (fails against any regression)**

Full file as described. Expect ~200 lines. Write all four scenarios.

- [ ] **Step 2: Run it**

Run: `npx vitest run __tests__/cli/copy-resume-e2e.test.ts`
Expected: PASS if Tasks 8–12 are correct. Any failure here is an implementation bug from an earlier task — fix it there, rerun that task's tests, then this one.

- [ ] **Step 3: Run the full suite**

Run: `npm run test:unit && npm run typecheck && npm run lint`
Expected: all green.

- [ ] **Step 4: Commit**

```bash
git add __tests__/cli/copy-resume-e2e.test.ts
git commit -m "test(copy): end-to-end resume scenarios"
```

---

### Task 14: Docs

**Files:**
- Modify: `README.md` (copy command section: `--rateLimit`, `--verify`, `--force-content`, resume behavior, checkpoint file note)

**Interfaces:** none.

- [ ] **Step 1: Write the docs**

Add to the copy section of `README.md` (match the existing flag-table or list style used there — read the section first):

```markdown
#### Speed and resume

The copy command sends requests in parallel through an adaptive rate
limiter. The default budget is 6 requests per second. Use
`--rateLimit <n>` to change it. The limiter backs off automatically on
429 responses and recovers on success.

Every successful story write is checkpointed in
`.sb-mig/copy/<source>/<target>/manifest.jsonl`. When a copy fails or is
interrupted (Ctrl-C), run the same command again: completed stories and
assets are skipped, and only unfinished work runs. A story edited in the
source space after a copy is detected and copied again.

- `--verify` — re-check every mapped story and checkpoint against the
  target space instead of trusting the local manifest.
- `--force-content` — ignore content checkpoints and rewrite every story.

Known limitation: target assets match by file name. Two target assets
with the same file name block the match, and a rerun after a partial
asset copy can upload a duplicate.
```

- [ ] **Step 2: Check the docs-site rule**

The repo `AGENTS.md` requires canonical-docs links to stay accurate. These flags are new package behavior, not a domain or strategy change, so only note: the `sb-mig-landing` docs need a matching update in the same workstream — flag this in the PR description.

- [ ] **Step 3: Commit**

```bash
git add README.md
git commit -m "docs(copy): document rate limit, verify, and resume behavior"
```

---

## Final verification

- [ ] `npm run test:unit` — all green.
- [ ] `npm run typecheck` — clean.
- [ ] `npm run lint` — clean (`--max-warnings=0`).
- [ ] `npm run build` — clean.
- [ ] Manual smoke (optional, needs real spaces): `sb-mig copy stories --from <a> --to <b> --source <slug> --dry-run` — confirm the dry-run reports checkpointed stories as skipped on a second run.
- [ ] PR: push branch to the user's fork of `sb-mig/sb-mig`, open PR to upstream. PR body: summary, spec link, flag docs, note for `sb-mig-landing` docs update. No AI attribution.
