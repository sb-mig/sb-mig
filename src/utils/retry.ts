/**
 * Retrying one network step after a transient failure — and only then.
 *
 * A multi-hour copy over thousands of files meets dropped connections; each
 * used to fail its file outright and cost a full rerun. A step that failed
 * for a transient reason is tried again after a short pause. A real refusal
 * (a 4xx, a 422) is final at once: trying it again cannot change the answer.
 */
import { delay } from "./async-utils.js";

/** Node socket codes that mean "the network dropped", not "the server said no". */
export const TRANSIENT_ERROR_CODES: ReadonlySet<string> = new Set([
    "ECONNRESET",
    "ETIMEDOUT",
    "ECONNABORTED",
    "EPIPE",
    "EAI_AGAIN",
    "ENOTFOUND",
    "ECONNREFUSED",
]);

/** HTTP answers that mean "not now", never "not this". */
export const TRANSIENT_HTTP_STATUSES: ReadonlySet<number> = new Set([
    429, 500, 502, 503, 504,
]);

/** Up to two retries (three attempts), after 1 s and then 3 s. */
export const RETRY_DELAYS_MS: readonly number[] = [1000, 3000];

const asRecord = (value: unknown): Record<string, any> | undefined =>
    value !== null && typeof value === "object"
        ? (value as Record<string, any>)
        : undefined;

/**
 * The Node error code of a failure, wherever the layer above put it: on the
 * error itself (a socket error), or on its `cause` (Node's `fetch` throws
 * `TypeError: fetch failed` and keeps the socket error there).
 */
export const errorCodeOf = (error: unknown): string | undefined => {
    const record = asRecord(error);
    const code = record?.["code"] ?? asRecord(record?.["cause"])?.["code"];

    return typeof code === "string" ? code : undefined;
};

/** The HTTP status of a failure, in any of the shapes our clients use. */
export const errorStatusOf = (error: unknown): number | undefined => {
    const record = asRecord(error);
    const status =
        record?.["status"] ??
        record?.["statusCode"] ??
        asRecord(record?.["response"])?.["status"];
    const number = Number(status);

    return Number.isFinite(number) && number > 0 ? number : undefined;
};

const messageOf = (error: unknown): string | undefined => {
    const record = asRecord(error);
    const message = record?.["message"];

    return typeof message === "string" ? message : undefined;
};

/**
 * R1 — transient is a closed list: a dropped-network code, a `socket hang up`,
 * or a "not now" HTTP status. Everything else is final.
 */
export const isTransientError = (error: unknown): boolean => {
    const code = errorCodeOf(error);

    if (code && TRANSIENT_ERROR_CODES.has(code)) {
        return true;
    }

    const status = errorStatusOf(error);

    if (status !== undefined) {
        return TRANSIENT_HTTP_STATUSES.has(status);
    }

    const causeMessage = messageOf(asRecord(error)?.["cause"]);

    return (
        messageOf(error) === "socket hang up" ||
        causeMessage === "socket hang up"
    );
};

/** `read ECONNRESET`, `status 503`, … — what a person reads in the retry line. */
export const describeRetryReason = (error: unknown): string => {
    const cause = asRecord(error)?.["cause"];
    const message = messageOf(cause) ?? messageOf(error);
    const status = errorStatusOf(error);

    if (message && message !== "fetch failed") {
        return message;
    }

    if (status !== undefined) {
        return `status ${status}`;
    }

    return errorCodeOf(error) ?? message ?? String(error);
};

/**
 * How many attempts a step made before its error escaped. A failure record
 * says it, so "failed" is never mistaken for "failed once".
 */
export const RETRY_ATTEMPTS = Symbol.for("sb-mig.retryAttempts");

export const retryAttemptsOf = (error: unknown): number | undefined => {
    const attempts = asRecord(error)?.[RETRY_ATTEMPTS as any];

    return typeof attempts === "number" ? attempts : undefined;
};

const markAttempts = (error: unknown, attempts: number): unknown => {
    const record = asRecord(error);

    if (record && Object.isExtensible(record)) {
        Object.defineProperty(record, RETRY_ATTEMPTS, {
            value: attempts,
            enumerable: false,
            configurable: true,
        });
    }

    return error;
};

/**
 * Run one network step; on a transient failure, pause and run the SAME step
 * again, up to `delays.length` more times. A final failure, or the last
 * transient one, escapes with the number of attempts made.
 *
 * Wrap one step, never a chain: a chain that retries from the top re-runs
 * the steps that already succeeded — the create among them.
 */
export const withRetry = async <T>(
    run: () => Promise<T>,
    {
        step,
        subject,
        onRetry,
        isRetryable = isTransientError,
        delays = RETRY_DELAYS_MS,
        sleep = delay,
    }: {
        /** `download`, `upload`, `finish`, … */
        step: string;
        /** The file the step is working on, for the retry line. */
        subject: string;
        onRetry: (line: string) => void;
        isRetryable?: (error: unknown) => boolean;
        delays?: readonly number[];
        sleep?: (milliseconds: number) => Promise<void>;
    },
): Promise<T> => {
    const retries = delays.length;

    for (let attempt = 1; ; attempt += 1) {
        try {
            return await run();
        } catch (error) {
            if (attempt > retries || !isRetryable(error)) {
                throw markAttempts(error, attempt);
            }

            onRetry(
                `retrying ${step} for '${subject}' (${attempt}/${retries}) after ${describeRetryReason(error)}`,
            );
            await sleep(delays[attempt - 1] ?? 0);
        }
    }
};
