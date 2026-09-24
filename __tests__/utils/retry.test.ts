import { describe, expect, it, vi } from "vitest";

import {
    describeRetryReason,
    errorCodeOf,
    errorStatusOf,
    isTransientError,
    retryAttemptsOf,
    withRetry,
} from "../../src/utils/retry.js";

const socketError = (code: string, message = `read ${code}`) =>
    Object.assign(new Error(message), { code });

/** What Node's fetch throws: `fetch failed`, the socket error on `cause`. */
const fetchFailed = (code: string) =>
    Object.assign(new TypeError("fetch failed"), {
        cause: socketError(code),
    });

/**
 * What storyblok-js-client rejects a GET with when the connection drops
 * (measured against a closed port, MAR-3409): the fetch error wrapped as
 * `message`, no status anywhere.
 */
const clientWrappedDrop = (code: string) => ({
    message: Object.assign(new TypeError("fetch failed"), {
        cause: Object.assign(new Error(`connect ${code} 127.0.0.1:59999`), {
            code,
        }),
    }),
});

/** What storyblok-js-client rejects an HTTP error with. */
const clientHttpError = (status: number) => ({
    message: "Unprocessable",
    status,
    response: { status },
});

describe("retry: transient is a closed list (MAR-3355 R1)", () => {
    // R1 canary. Mutation that must turn it red: treat a 422 as transient.
    it.each([
        ["ECONNRESET on the error", true, socketError("ECONNRESET")],
        ["ETIMEDOUT", true, socketError("ETIMEDOUT")],
        ["ECONNABORTED", true, socketError("ECONNABORTED")],
        ["EPIPE", true, socketError("EPIPE")],
        ["EAI_AGAIN", true, socketError("EAI_AGAIN")],
        ["ENOTFOUND", true, socketError("ENOTFOUND")],
        ["ECONNREFUSED", true, socketError("ECONNREFUSED")],
        ["ECONNRESET on fetch's cause", true, fetchFailed("ECONNRESET")],
        ["socket hang up", true, new Error("socket hang up")],
        ["HTTP 429", true, clientHttpError(429)],
        ["HTTP 500", true, clientHttpError(500)],
        ["HTTP 502", true, clientHttpError(502)],
        ["HTTP 503", true, clientHttpError(503)],
        ["HTTP 504", true, clientHttpError(504)],
        ["S3 statusCode 503", true, { statusCode: 503 }],
        ["HTTP 422", false, clientHttpError(422)],
        ["HTTP 400", false, clientHttpError(400)],
        ["HTTP 401", false, clientHttpError(401)],
        ["HTTP 403", false, clientHttpError(403)],
        ["HTTP 404", false, clientHttpError(404)],
        ["an unknown socket code", false, socketError("EPERM")],
        ["a plain error", false, new Error("the payload is wrong")],
        ["the old bare string", false, "error"],
        ["nothing", false, undefined],
        // MAR-3409 R1: the client's wrapper is seen through...
        [
            "the client's wrapped ECONNREFUSED",
            true,
            clientWrappedDrop("ECONNREFUSED"),
        ],
        [
            "the client's wrapped ECONNRESET",
            true,
            clientWrappedDrop("ECONNRESET"),
        ],
        [
            "a wrapped fetch failed with no code",
            true,
            { message: new TypeError("fetch failed") },
        ],
        ["a bare fetch failed", true, { message: "fetch failed" }],
        // ...but never past an answer the server gave.
        [
            "a wrapper with a 422 and an object body",
            false,
            { message: { error: "Unprocessable" }, status: 422 },
        ],
        [
            "a wrapper with a 404 on its response",
            false,
            { message: { error: "Not found" }, response: { status: 404 } },
        ],
        [
            "a wrapper with a 503 and an object body",
            true,
            { message: { error: "busy" }, status: 503 },
        ],
        [
            "a wrapped plain error",
            false,
            { message: new Error("the payload is wrong") },
        ],
    ])("%s → transient: %s", (_name, expected, error) => {
        expect(isTransientError(error)).toBe(expected);
    });

    it("reads the code and the status wherever the client put them", () => {
        expect(errorCodeOf(fetchFailed("ECONNRESET"))).toBe("ECONNRESET");
        expect(errorStatusOf(clientHttpError(422))).toBe(422);
        expect(errorStatusOf({ response: { status: 503 } })).toBe(503);
        expect(errorStatusOf({ statusCode: 204 })).toBe(204);
    });

    it("says why in words a person reads", () => {
        expect(describeRetryReason(socketError("ECONNRESET"))).toBe(
            "read ECONNRESET",
        );
        // `fetch failed` says nothing; the socket error under it does.
        expect(describeRetryReason(fetchFailed("ECONNRESET"))).toBe(
            "read ECONNRESET",
        );
        expect(describeRetryReason({ status: 503 })).toBe("status 503");
        // MAR-3409 R2: the wrapped drop names its real cause, never
        // `[object Object]` and never an empty string.
        expect(describeRetryReason(clientWrappedDrop("ECONNREFUSED"))).toBe(
            "connect ECONNREFUSED 127.0.0.1:59999",
        );
        expect(
            describeRetryReason({
                message: Object.assign(new TypeError("fetch failed"), {
                    cause: { code: "ECONNREFUSED" },
                }),
            }),
        ).toBe("ECONNREFUSED");
        expect(errorCodeOf(clientWrappedDrop("ECONNREFUSED"))).toBe(
            "ECONNREFUSED",
        );
    });
});

describe("retry: one step, tried again after a pause (MAR-3355 R2)", () => {
    const harness = () => {
        const lines: string[] = [];
        const pauses: number[] = [];

        return {
            lines,
            pauses,
            options: {
                step: "upload",
                subject: "photo.jpg",
                onRetry: (line: string) => lines.push(line),
                sleep: async (milliseconds: number) => {
                    pauses.push(milliseconds);
                },
            },
        };
    };

    it("tries a transient failure again, pausing 1 s, and says so once", async () => {
        const io = harness();
        const run = vi
            .fn()
            .mockRejectedValueOnce(socketError("ECONNRESET"))
            .mockResolvedValueOnce("done");

        await expect(withRetry(run, io.options)).resolves.toBe("done");
        expect(run).toHaveBeenCalledTimes(2);
        expect(io.pauses).toEqual([1000]);
        expect(io.lines).toEqual([
            "retrying upload for 'photo.jpg' (1/2) after read ECONNRESET",
        ]);
    });

    it("gives up after three attempts, pausing 1 s then 3 s, and says how many", async () => {
        const io = harness();
        const run = vi.fn().mockRejectedValue(socketError("ECONNRESET"));
        const error: any = await withRetry(run, io.options).catch((e) => e);

        expect(run).toHaveBeenCalledTimes(3);
        expect(io.pauses).toEqual([1000, 3000]);
        expect(io.lines).toEqual([
            "retrying upload for 'photo.jpg' (1/2) after read ECONNRESET",
            "retrying upload for 'photo.jpg' (2/2) after read ECONNRESET",
        ]);
        expect(error.code).toBe("ECONNRESET");
        expect(retryAttemptsOf(error)).toBe(3);
    });

    it("fails a refusal at once, with no pause and no retry line", async () => {
        const io = harness();
        const run = vi.fn().mockRejectedValue(clientHttpError(422));
        const error: any = await withRetry(run, io.options).catch((e) => e);

        expect(run).toHaveBeenCalledTimes(1);
        expect(io.pauses).toEqual([]);
        expect(io.lines).toEqual([]);
        expect(error.status).toBe(422);
        expect(retryAttemptsOf(error)).toBe(1);
    });

    it("asks the caller's own rule when it has one", async () => {
        const io = harness();
        const run = vi.fn().mockRejectedValue(socketError("ECONNRESET"));

        await withRetry(run, { ...io.options, isRetryable: () => false }).catch(
            () => undefined,
        );

        expect(run).toHaveBeenCalledTimes(1);
    });
});
