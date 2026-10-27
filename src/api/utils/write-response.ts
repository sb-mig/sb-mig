/**
 * Whether a write really happened.
 *
 * storyblok-js-client 7.x rejects an HTTP error, but a write whose
 * connection fails (ECONNRESET, DNS, a timeout) *resolves* with
 * `{ message: error }` (dist/index.js, `_methodHandler`). Read as success,
 * that is a write reported done that never reached the space. A sync write
 * is done only when the answer carries data — and, where Storyblok sends the
 * written object back, that object under `key`.
 */
export const isWritten = (res: unknown, key?: string): boolean => {
    if (!res || typeof res !== "object") return false;

    const data = (res as { data?: unknown }).data;
    if (!data || typeof data !== "object") return false;

    return key === undefined || Boolean((data as Record<string, unknown>)[key]);
};

const describeCause = (cause: unknown): string => {
    if (cause instanceof Error) {
        const inner = (cause as Error & { cause?: unknown }).cause;
        return inner instanceof Error
            ? `${cause.message}: ${inner.message}`
            : cause.message;
    }
    return String(cause);
};

/** Returns `res` when the write happened; throws with what is known otherwise. */
export const checkWritten = <T = any>(
    res: T,
    what: string,
    key?: string,
): T => {
    if (isWritten(res, key)) return res;

    const cause = (res as { message?: unknown } | undefined)?.message;
    throw Object.assign(
        new Error(
            `${what}: no confirmation from Storyblok${cause ? ` (${describeCause(cause)})` : ""}`,
        ),
        { cause },
    );
};
