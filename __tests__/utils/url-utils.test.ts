import { describe, expect, it } from "vitest";

import { buildUrl } from "../../src/utils/url-utils.js";

describe("buildUrl", () => {
    it("builds URLs with encoded search params", () => {
        const url = buildUrl({
            baseUrl: "https://content-hub.example.com/api/hub/",
            pathname: "getStories",
            searchParams: {
                spaceId: "12345",
                storiesFilename: "folder/story name & draft?.json",
            },
        });

        expect(url.toString()).toBe(
            "https://content-hub.example.com/api/hub/getStories?spaceId=12345&storiesFilename=folder%2Fstory+name+%26+draft%3F.json",
        );
        expect(url.searchParams.get("storiesFilename")).toBe(
            "folder/story name & draft?.json",
        );
    });

    it("omits nullish search params without dropping empty strings", () => {
        const url = buildUrl({
            baseUrl: "https://localhost:3000",
            pathname: "/api/preview/preview",
            searchParams: {
                secret: "abc+123",
                slug: "",
                missing: undefined,
                empty: null,
            },
        });

        expect(url.toString()).toBe(
            "https://localhost:3000/api/preview/preview?secret=abc%2B123&slug=",
        );
    });

    it("appends the pathname consistently when the base URL has no trailing slash", () => {
        const url = buildUrl({
            baseUrl: "https://content-hub.example.com/api/hub",
            pathname: "/getStories",
            searchParams: {
                spaceId: "12345",
            },
        });

        expect(url.toString()).toBe(
            "https://content-hub.example.com/api/hub/getStories?spaceId=12345",
        );
    });
});
