import { describe, expect, it } from "vitest";

import { redactDebugSecrets } from "../../src/cli/utils/debug-redaction.js";

describe("debug secret redaction", () => {
    it("masks env secrets in aliases, embedded strings, and property names", () => {
        const secret = "a.*[b](c)+$9876";
        expect(
            redactDebugSecrets(
                {
                    alias: secret,
                    url: `https://example.test/?value=${secret}`,
                    [secret]: "label",
                    visible: "a different value",
                },
                { CUSTOM_AUTH: secret },
            ),
        ).toEqual({
            alias: "••••9876",
            url: "https://example.test/?value=••••9876",
            "••••9876": "label",
            visible: "a different value",
        });
    });

    it("masks shared config credentials even when an alias precedes the sensitive key", () => {
        const shared = Object.freeze({ value: "shared-credential-5678" });
        const config = Object.freeze({
            alias: shared,
            authentication: shared,
            enabled: true,
        });
        expect(redactDebugSecrets(config, {})).toEqual({
            alias: { value: "••••5678" },
            authentication: { value: "••••5678" },
            enabled: true,
        });
        expect(shared.value).toBe("shared-credential-5678");
    });

    it("handles cycles and preserves ordinary config types", () => {
        const config: Record<string, unknown> = {
            token: "abc",
            password: 123456789,
            secret: "",
            apiKey: null,
            retries: 2,
            enabled: false,
            items: ["visible"],
        };
        config.self = config;
        expect(redactDebugSecrets(config, {})).toEqual({
            token: "••••",
            password: "••••6789",
            secret: "",
            apiKey: null,
            retries: 2,
            enabled: false,
            items: ["visible"],
            self: "[Circular]",
        });
    });
});

it("does not treat short flags or ordinary booleans and numbers as credentials", () => {
    expect(
        redactDebugSecrets(
            {
                nodeVersion: "v24.17.0",
                debug: false,
                flag: true,
                count: 1,
                numericAlias: 123456789,
                numericPassword: 123456789,
                shortAlias: "abc",
                token: "abc",
                booleanAlias: "false",
            },
            {
                CLAUDE_CODE_SDK_HAS_HOST_AUTH_REFRESH: "1",
                TOKENIZERS_PARALLELISM: "false",
            },
        ),
    ).toEqual({
        nodeVersion: "v24.17.0",
        debug: false,
        flag: true,
        count: 1,
        numericAlias: 123456789,
        numericPassword: "••••6789",
        shortAlias: "abc",
        token: "••••",
        booleanAlias: "••••alse",
    });
});

it("matches auth segments and authorization without masking author metadata", () => {
    expect(
        redactDebugSecrets(
            {
                metadataSelection: { author: true },
                author: "Marcin",
                authorName: "Marcin",
                auth: "credential-1234",
                auth_token: "credential-1234",
                authorization: "credential-1234",
                "x-auth": "credential-1234",
                xAuth: "credential-1234",
                authHeader: "credential-1234",
            },
            {},
        ),
    ).toEqual({
        metadataSelection: { author: true },
        author: "Marcin",
        authorName: "Marcin",
        auth: "••••1234",
        auth_token: "••••1234",
        authorization: "••••1234",
        "x-auth": "••••1234",
        xAuth: "••••1234",
        authHeader: "••••1234",
    });
});

it("masks URL credentials and sensitive query values under ordinary keys", () => {
    expect(
        redactDebugSecrets(
            {
                url: "https://longuser:longpassword@example.test/path?access_token=querySecret55&page=1",
                relative: "/path?x-auth=authSecret66&author=Marcin",
                encodedName: "https://example.test/?api%5Fkey=querySecret77",
            },
            {},
        ),
    ).toEqual({
        url: "https://••••user:••••word@example.test/path?access_token=••••et55&page=1",
        relative: "/path?x-auth=••••et66&author=Marcin",
        encodedName: "https://example.test/?api%5Fkey=••••et77",
    });
});

it("masks encoded known secrets, including lowercase percent escapes and form encoding", () => {
    const secret = "Fake /Proxy+Pass@55";
    expect(
        redactDebugSecrets(
            {
                uri: encodeURIComponent(secret),
                lowercase: encodeURIComponent(secret).replace(
                    /%[A-F\d]{2}/g,
                    (part) => part.toLowerCase(),
                ),
                form: new URLSearchParams({ value: secret }).toString(),
                embedded: `Bearer ${encodeURIComponent(secret)}`,
            },
            { PROXY_PASSWORD: secret },
        ),
    ).toEqual({
        uri: "••••s@55",
        lowercase: "••••s@55",
        form: "value=••••s@55",
        embedded: "Bearer ••••s@55",
    });
});
