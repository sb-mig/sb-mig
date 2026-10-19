const isSecretKey = (key: string) =>
    /token|secret|key|password|auth(?!or(?!iz))/i.test(key);
const mask = (value: string) =>
    `••••${value.length > 4 ? value.slice(-4) : ""}`;
const decode = (value: string) => {
    try {
        return decodeURIComponent(value.replace(/\+/g, " "));
    } catch {
        return value;
    }
};
const percentCase = (value: string) =>
    value.replace(/%[\da-f]{2}/gi, (part) => part.toUpperCase());

/** Sanitize before formatting, so JSON and text share the same disclosure rules. */
export const redactDebugSecrets = (
    value: unknown,
    env: NodeJS.ProcessEnv,
): unknown => {
    const secrets = new Set<string>();
    const remember = (entry: unknown) => {
        if (typeof entry === "string" && entry.length > 4) secrets.add(entry);
    };
    for (const [key, entry] of Object.entries(env)) {
        if (isSecretKey(key)) remember(entry);
    }

    // Also protect aliases and embedded copies of config-only credentials.
    const visited = [new WeakSet<object>(), new WeakSet<object>()];
    const collect = (entry: unknown, sensitive = false): void => {
        if (entry && typeof entry === "object") {
            const seen = visited[sensitive ? 1 : 0]!;
            if (seen.has(entry)) return;
            seen.add(entry);
            for (const [key, child] of Object.entries(entry)) {
                collect(child, sensitive || isSecretKey(key));
            }
        } else if (sensitive) remember(entry);
    };
    collect(value);

    const replacements = new Map<string, string>();
    for (const secret of secrets) {
        for (const encoded of [
            secret,
            JSON.stringify(secret).slice(1, -1),
            encodeURIComponent(secret),
            encodeURI(secret),
            new URLSearchParams({ value: secret }).toString().slice(6),
        ]) {
            replacements.set(percentCase(encoded), mask(secret));
        }
    }
    const pattern = [...replacements.keys()]
        .sort((a, b) => b.length - a.length)
        .map((secret) =>
            secret
                .replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
                .replace(/%[\dA-F]{2}/g, (part) =>
                    part.replace(
                        /[A-F]/g,
                        (hex) => `[${hex}${hex.toLowerCase()}]`,
                    ),
                ),
        )
        .join("|");
    const matcher = pattern ? new RegExp(pattern, "g") : null;
    const scrub = (text: string) => {
        const urlsMasked = text
            .replace(
                /(\b[a-z][a-z\d+.-]*:\/\/)([^\s/?#]+)@/gi,
                (_match, scheme: string, userinfo: string) =>
                    `${scheme}${userinfo
                        .split(":")
                        .map((part) => mask(decode(part)))
                        .join(":")}@`,
            )
            .replace(
                /([?&#;]([^=&#;\s]+)=)([^&#;\s]*)/g,
                (_match, prefix: string, key: string, entry: string) =>
                    `${prefix}${isSecretKey(decode(key)) ? mask(decode(entry)) : entry}`,
            );
        return matcher
            ? urlsMasked.replace(
                  matcher,
                  (match) => replacements.get(percentCase(match))!,
              )
            : urlsMasked;
    };
    const ancestors = new WeakSet<object>();
    const redact = (entry: unknown, sensitive = false): unknown => {
        if (entry === null || entry === undefined) return entry;
        if (typeof entry === "object") {
            if (ancestors.has(entry)) return "[Circular]";
            ancestors.add(entry);
            const result = Array.isArray(entry)
                ? entry.map((child) => redact(child, sensitive))
                : Object.fromEntries(
                      Object.entries(entry).map(([key, child]) => [
                          scrub(key),
                          redact(child, sensitive || isSecretKey(key)),
                      ]),
                  );
            ancestors.delete(entry);
            return result;
        }
        if (sensitive) return String(entry) ? mask(String(entry)) : "";
        if (typeof entry === "string") return scrub(entry);
        if (typeof entry === "function") return "[Function]";
        if (typeof entry === "bigint" || typeof entry === "symbol")
            return scrub(String(entry));
        return entry;
    };
    return redact(value);
};
