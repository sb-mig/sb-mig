import { describe, expect, it } from "vitest";

import {
    applyCopyMapWrites,
    assetKeyOf,
    buildCopyMaps,
    createEmptyCopyMaps,
    getCopyAssetMapWrites,
    buildCopyRelinkMaps,
    findAssetUrls,
    rewriteCopyReferences,
    scanStoryReferences,
    selectRelinkLedgerAssetMappings,
    type CopyManifestEntry,
} from "../../src/api/copy/index.js";
import { copyDescription } from "../../src/cli/cli-descriptions.js";

const SOURCE_SPACE = "111";
const HASH = "8d1a3e5f2b7c4d6e9a0b1c2d3e4f5a6b7c8d9e0f";
const OTHER_HASH = "1111111111222222222233333333334444444444";
const KEY = `/f/${SOURCE_SPACE}/1200x630/${HASH}/brochure.pdf`;
const OTHER_KEY = `/f/${SOURCE_SPACE}/800x400/${OTHER_HASH}/inline.jpg`;
const TARGET_KEY = `/f/222/1200x630/${HASH}/brochure.pdf`;
const TARGET_OTHER_KEY = `/f/222/800x400/${OTHER_HASH}/inline.jpg`;
const CDN = "https://a.storyblok.com";
const S3 = "https://s3.amazonaws.com/a.storyblok.com";

/** The ledger as `copy assets` writes it: library (s3) filenames. */
const assetLedger: CopyManifestEntry[] = [
    {
        type: "asset",
        source_space_id: SOURCE_SPACE,
        target_space_id: "222",
        action: "created",
        created_at: "2026-09-18T00:00:00.000Z",
        source_id: 900,
        target_id: 9000,
        source_filename: `${S3}${KEY}`,
        target_filename: `${CDN}${TARGET_KEY}`,
    },
    {
        type: "asset",
        source_space_id: SOURCE_SPACE,
        target_space_id: "222",
        action: "created",
        created_at: "2026-09-18T00:00:00.000Z",
        source_id: 901,
        target_id: 9001,
        source_filename: `${S3}${OTHER_KEY}`,
        target_filename: `${CDN}${TARGET_OTHER_KEY}`,
    },
];

const schemas = {
    page: {
        seo: { type: "custom", plugin: "seo-metatags" },
        body: { type: "bloks" },
        intro: { type: "richtext" },
        html: { type: "text" },
        file: { type: "multilink" },
    },
};

/** One story holding the same asset in every shape the real space writes. */
const story = () => ({
    id: 100,
    uuid: "story-uuid-100",
    full_slug: "blog/post",
    content: {
        _uid: "root",
        component: "page",
        seo: {
            plugin: "seo-metatags",
            og_image: `${CDN}${KEY}`,
            twitter_image: `${CDN}${OTHER_KEY}?utm_source=share`,
        },
        file: {
            linktype: "asset",
            id: "",
            href: `${CDN}${KEY}`,
            url: `${CDN}${KEY}`,
            cached_url: `${CDN}${KEY}`,
        },
        html: `<p><img src="${CDN}${OTHER_KEY}/m/800x0" alt="a"> and <img src="${CDN}${OTHER_KEY}"></p>`,
        html__i18n__de: `<a href="${CDN}${KEY}">DE</a>`,
        intro: {
            type: "doc",
            content: [
                {
                    type: "image",
                    attrs: { src: `${CDN}${KEY}`, alt: "hero" },
                },
                {
                    type: "paragraph",
                    content: [
                        {
                            type: "text",
                            text: "download",
                            marks: [
                                {
                                    type: "link",
                                    attrs: {
                                        href: `${CDN}${KEY}`,
                                        linktype: "asset",
                                    },
                                },
                            ],
                        },
                    ],
                },
            ],
        },
        body: [
            {
                _uid: "blok-1",
                component: "unknown-component",
                banner: `${CDN}${OTHER_KEY}`,
            },
            {
                _uid: "blok-2",
                component: "page",
                html: `<img src="https://a.storyblok.com/f/999/100x100/${HASH}/foreign.jpg">`,
            },
        ],
    },
});

const scan = () =>
    scanStoryReferences({
        story: story(),
        schemas,
        options: { sourceSpaceId: SOURCE_SPACE },
    });

describe("asset URLs in strings: the key is the identity (R1)", () => {
    // R1 canary. Mutation that must turn it red: make the host part of the key
    // (return the whole URL, or prefix the key with the origin).
    it.each([
        [`${CDN}${KEY}`, SOURCE_SPACE, KEY, ""],
        [`${S3}${KEY}`, SOURCE_SPACE, KEY, ""],
        [`//a.storyblok.com${KEY}`, SOURCE_SPACE, KEY, ""],
        [`https://img2.storyblok.com/800x0${KEY}`, SOURCE_SPACE, KEY, ""],
        [`${CDN}${KEY}/m/800x0`, SOURCE_SPACE, KEY, "/m/800x0"],
        [
            `${CDN}${KEY}?utm_source=share`,
            SOURCE_SPACE,
            KEY,
            "?utm_source=share",
        ],
        [`${CDN}${KEY}#page=2`, SOURCE_SPACE, KEY, "#page=2"],
        [
            `${CDN}/f/${SOURCE_SPACE}/1200x630/${HASH}/pl%C3%A5n%20b.pdf`,
            SOURCE_SPACE,
            `/f/${SOURCE_SPACE}/1200x630/${HASH}/pl%C3%A5n%20b.pdf`,
            "",
        ],
    ])("reads %s", (url, spaceId, key, rest) => {
        expect(assetKeyOf(url)).toMatchObject({ spaceId, key, rest });
    });

    it("gives the s3 and the plain host form the same key", () => {
        expect(assetKeyOf(`${S3}${KEY}`)?.key).toBe(
            assetKeyOf(`${CDN}${KEY}`)?.key,
        );
    });

    it.each([
        ["https://example.com/files/brochure.pdf"],
        ["/local/brochure.pdf"],
        ["https://a.storyblok.com/about-us"],
        [""],
    ])("returns undefined for %s", (value) => {
        expect(assetKeyOf(value)).toBeUndefined();
    });

    // R1 canary. Mutation that must turn it red: return only the first URL of
    // a text, or lose the offsets that keep the surrounding bytes.
    it("finds every asset URL inside HTML with its own bounds", () => {
        const html = `<p><img src="${CDN}${KEY}"> text <img src="${S3}${OTHER_KEY}/m/800x0"></p>`;
        const found = findAssetUrls(html);

        expect(found.map((match) => match.key)).toEqual([KEY, OTHER_KEY]);
        expect(html.slice(found[0]!.keyStart, found[0]!.keyEnd)).toBe(KEY);
        expect(html.slice(found[1]!.start, found[1]!.end)).toBe(
            `${S3}${OTHER_KEY}/m/800x0`,
        );
        expect(findAssetUrls("no urls here")).toEqual([]);
    });
});

describe("asset URLs in strings: the dimensions segment is optional (MAR-3353 R1)", () => {
    // The shape a migrated file is written with: no dimensions segment.
    // 189 of 4,766 files on a real library look like this.
    const SHORT_HASH = "4a4ecad472";
    const SHORT_KEY = `/f/${SOURCE_SPACE}/${SHORT_HASH}/hult_whistle_blower_policy.pdf`;
    const SHORT_IMAGE_KEY = `/f/${SOURCE_SPACE}/9a8555bcc0/logo.png`;

    // R1 canary. Mutation that must turn it red: make the dimensions segment
    // mandatory again (drop the short pattern).
    it.each([
        ["short PDF", `${CDN}${SHORT_KEY}`, "", SHORT_KEY, ""],
        ["short PNG", `${CDN}${SHORT_IMAGE_KEY}`, "", SHORT_IMAGE_KEY, ""],
        ["short on the s3 host", `${S3}${SHORT_KEY}`, "", SHORT_KEY, ""],
        [
            "short, protocol-relative",
            `//a.storyblok.com${SHORT_KEY}`,
            "",
            SHORT_KEY,
            "",
        ],
        [
            "short with a query tail",
            `${CDN}${SHORT_KEY}?cb=1`,
            "",
            SHORT_KEY,
            "?cb=1",
        ],
        [
            "short with a resize tail",
            `${CDN}${SHORT_IMAGE_KEY}/m/800x0`,
            "",
            SHORT_IMAGE_KEY,
            "/m/800x0",
        ],
        [
            "short behind the image service",
            `https://img2.storyblok.com/fit-in/600x0${SHORT_KEY}`,
            "",
            SHORT_KEY,
            "",
        ],
        ["long with dimensions", `${CDN}${KEY}`, "1200x630", KEY, ""],
        [
            "long with the x placeholder",
            `${CDN}/f/${SOURCE_SPACE}/x/2b7c4d6e9a/flyer.pdf`,
            "x",
            `/f/${SOURCE_SPACE}/x/2b7c4d6e9a/flyer.pdf`,
            "",
        ],
        [
            "long whose dimensions look like a hash",
            `${CDN}/f/${SOURCE_SPACE}/abcdef12/1234abcd/name.jpg`,
            "abcdef12",
            `/f/${SOURCE_SPACE}/abcdef12/1234abcd/name.jpg`,
            "",
        ],
    ])("reads a %s", (_label, url, dimensions, key, rest) => {
        expect(assetKeyOf(url)).toMatchObject({
            spaceId: SOURCE_SPACE,
            dimensions,
            key,
            rest,
        });
    });

    // R1 canary. Mutation that must turn it red: build the key from the parts
    // with an empty middle segment (`/f/<space>//<hash>/<name>`).
    it("writes the key exactly as the path was written", () => {
        const short = assetKeyOf(`${CDN}${SHORT_KEY}`);

        expect(short?.key).not.toContain("//");
        expect(short?.key).toBe(SHORT_KEY);

        // The bounds agree with the key in both shapes, so a rewrite replaces
        // exactly the path and nothing around it.
        const html = `<a href="${CDN}${SHORT_KEY}">policy</a> <img src="${CDN}${KEY}">`;

        expect(
            findAssetUrls(html).map((match) => [
                match.key,
                html.slice(match.keyStart, match.keyEnd),
            ]),
        ).toEqual([
            [SHORT_KEY, SHORT_KEY],
            [KEY, KEY],
        ]);
    });

    it("finds both shapes in one text, each once", () => {
        const html = `<p><a href="${CDN}${SHORT_KEY}">x</a> <img src="${CDN}${SHORT_IMAGE_KEY}/m/800x0"> <img src="${CDN}${KEY}"></p>`;

        expect(findAssetUrls(html).map((match) => match.key)).toEqual([
            SHORT_KEY,
            SHORT_IMAGE_KEY,
            KEY,
        ]);
    });

    it("still refuses a path that is neither shape", () => {
        // Two segments where the first is not a hash: nothing says which is
        // which, so it stays unrecognised, exactly as before.
        expect(
            assetKeyOf(`${CDN}/f/${SOURCE_SPACE}/x/hero.jpg`),
        ).toBeUndefined();
        expect(assetKeyOf(`${CDN}/f/${SOURCE_SPACE}/hero.jpg`)).toBeUndefined();
    });

    // R2 canary. Mutation that must turn it red: key the maps by a path built
    // with an empty middle segment.
    it("matches a short-form ledger line to a short-form URL in content", () => {
        const shortLedger: CopyManifestEntry[] = [
            {
                type: "asset",
                source_space_id: SOURCE_SPACE,
                target_space_id: "222",
                action: "created",
                created_at: "2026-09-23T00:00:00.000Z",
                source_id: 950,
                target_id: 9500,
                // The library answers the s3 host; the story holds its own.
                source_filename: `${S3}${SHORT_KEY}`,
                target_filename: `${CDN}/f/222/${SHORT_HASH}/hult_whistle_blower_policy.pdf`,
            },
        ];
        const maps = buildCopyMaps(shortLedger);

        expect(maps.assetKeys.get(SHORT_KEY)).toEqual({
            id: 9500,
            filename: `${CDN}/f/222/${SHORT_HASH}/hult_whistle_blower_policy.pdf`,
        });

        const result = rewriteCopyReferences({
            value: {
                html: `<p>Read the <a href="${CDN}${SHORT_KEY}">policy</a>.</p>`,
                link: {
                    linktype: "asset",
                    url: `${CDN}${SHORT_KEY}`,
                    cached_url: `${CDN}${SHORT_KEY}`,
                },
            },
            maps,
            schemas,
        });
        const value = result.value as any;

        expect(value.html).toBe(
            `<p>Read the <a href="${CDN}/f/222/${SHORT_HASH}/hult_whistle_blower_policy.pdf">policy</a>.</p>`,
        );
        expect(value.link.url).toBe(
            `${CDN}/f/222/${SHORT_HASH}/hult_whistle_blower_policy.pdf`,
        );
        expect(value.link.cached_url).toBe(value.link.url);
        expect(result.records).toHaveLength(3);
    });

    // R4 canary. Mutation that must turn it red: any change to the long-form
    // pattern. These are the keys the released version produced, verbatim.
    it.each([
        [
            `${CDN}/f/111/1200x630/2b7c4d6e9a/flyer.pdf`,
            "/f/111/1200x630/2b7c4d6e9a/flyer.pdf",
        ],
        [
            `${S3}/f/111/800x400/1111111111222222222233333333334444444444/inline.jpg`,
            "/f/111/800x400/1111111111222222222233333333334444444444/inline.jpg",
        ],
        [
            `${CDN}/f/12345/1920x1080/abc/image.png`,
            "/f/12345/1920x1080/abc/image.png",
        ],
        [
            `${CDN}/f/12345/500x500/hash123/avatar.png`,
            "/f/12345/500x500/hash123/avatar.png",
        ],
        [`${CDN}/f/1/x/h/photo.png`, "/f/1/x/h/photo.png"],
        [
            `${CDN}/f/123456/100x100/xyz789/thumb.webp`,
            "/f/123456/100x100/xyz789/thumb.webp",
        ],
    ])("keeps the released key of %s", (url, key) => {
        expect(assetKeyOf(url)?.key).toBe(key);
    });
});

describe("asset URLs in strings: the maps know assets by key (R2)", () => {
    // R2 canary. Mutation that must turn it red: key `assetKeys` by the raw
    // `source_filename` instead of by its asset key.
    it("finds an s3-form ledger line by the key of the plain-form URL", () => {
        const maps = buildCopyMaps(assetLedger);

        expect(maps.assetKeys.get(assetKeyOf(`${CDN}${KEY}`)!.key)).toEqual({
            id: 9000,
            filename: `${CDN}${TARGET_KEY}`,
        });
        expect(maps.assetFilenames.has(`${CDN}${KEY}`)).toBe(false);
    });

    it("fills the relink maps by key as well", () => {
        const maps = buildCopyRelinkMaps({
            storyMappings: [],
            assetMappings: [
                {
                    sourceId: 900,
                    sourceFilename: `${S3}${KEY}`,
                    targetId: 9000,
                    targetFilename: `${CDN}${TARGET_KEY}`,
                },
            ],
        });

        expect(maps.assetKeys.get(KEY)?.filename).toBe(`${CDN}${TARGET_KEY}`);
    });
});

describe("asset URLs in strings: the scanner sees them everywhere (R3)", () => {
    // R3 canary. Mutation that must turn it red: scan only schema-known
    // fields (drop the schema-blind walk), or keep the walk but skip plugin
    // objects / components without a schema.
    it("records every string occurrence of a source-space asset, with its path", () => {
        const stringReferences = scan().assetReferences.filter(
            (reference) => reference.shape === "string",
        );

        expect(
            stringReferences.map((reference) => [
                reference.path,
                reference.assetKey,
            ]),
        ).toEqual([
            ["content.seo.og_image", KEY],
            ["content.seo.twitter_image", OTHER_KEY],
            ["content.file.href", KEY],
            ["content.file.url", KEY],
            ["content.file.cached_url", KEY],
            ["content.html", OTHER_KEY],
            ["content.html", OTHER_KEY],
            ["content.html__i18n__de", KEY],
            ["content.intro.content[0].attrs.src", KEY],
            ["content.intro.content[1].content[0].marks[0].attrs.href", KEY],
            ["content.body[0].banner", OTHER_KEY],
        ]);
        expect(stringReferences[0]?.filename).toBe(`${CDN}${KEY}`);
    });

    it("keeps a foreign space's URL out of the references", () => {
        expect(
            scan()
                .assetReferences.map((reference) => reference.assetKey ?? "")
                .filter((key) => key.startsWith("/f/999/")),
        ).toEqual([]);
    });

    it("scans no string when the scan does not know its own space", () => {
        const blind = scanStoryReferences({ story: story(), schemas });

        expect(
            blind.assetReferences.filter(
                (reference) => reference.shape === "string",
            ),
        ).toEqual([]);
    });
});

describe("asset URLs in strings: the rewriter rewrites what the ledger proves (R5)", () => {
    const rewrite = () =>
        rewriteCopyReferences({
            value: story().content,
            maps: buildCopyMaps(assetLedger),
            schemas,
        });

    // R5 canary. Mutation that must turn it red: look the target up by the
    // exact `source_filename` instead of by key (the s3-form ledger line then
    // never matches the plain-form content).
    it("re-points every mapped occurrence and leaves every other byte alone", () => {
        const result = rewrite();
        const value = result.value as any;

        expect(value.seo.og_image).toBe(`${CDN}${TARGET_KEY}`);
        expect(value.seo.twitter_image).toBe(
            `${CDN}${TARGET_OTHER_KEY}?utm_source=share`,
        );
        expect(value.file.href).toBe(`${CDN}${TARGET_KEY}`);
        expect(value.html).toBe(
            `<p><img src="${CDN}${TARGET_OTHER_KEY}/m/800x0" alt="a"> and <img src="${CDN}${TARGET_OTHER_KEY}"></p>`,
        );
        expect(value.html__i18n__de).toBe(
            `<a href="${CDN}${TARGET_KEY}">DE</a>`,
        );
        expect(value.intro.content[0].attrs.src).toBe(`${CDN}${TARGET_KEY}`);
        expect(value.intro.content[1].content[0].marks[0].attrs.href).toBe(
            `${CDN}${TARGET_KEY}`,
        );
        expect(value.body[0].banner).toBe(`${CDN}${TARGET_OTHER_KEY}`);
    });

    it("leaves a foreign space's URL and an unmapped asset exactly as written", () => {
        const foreign = `<img src="https://a.storyblok.com/f/999/100x100/${HASH}/foreign.jpg">`;
        const result = rewrite();

        expect((result.value as any).body[1].html).toBe(foreign);

        const unmapped = rewriteCopyReferences({
            value: { html: `<img src="${CDN}${OTHER_KEY}">` },
            maps: buildCopyMaps([assetLedger[0]!]),
            schemas,
        });

        expect((unmapped.value as any).html).toBe(
            `<img src="${CDN}${OTHER_KEY}">`,
        );
        expect(unmapped.records).toEqual([]);
    });

    it("writes one record per replaced occurrence", () => {
        const result = rewrite();
        const stringRecords = result.records.filter(
            (record) => record.field === "string",
        );

        expect(stringRecords).toHaveLength(11);
        expect(stringRecords[0]).toEqual({
            type: "asset",
            path: "$.seo.og_image",
            sourceValue: `${CDN}${KEY}`,
            targetValue: `${CDN}${TARGET_KEY}`,
            field: "string",
        });
        expect(
            stringRecords.every((record) =>
                String(record.targetValue).includes("/f/222/"),
            ),
        ).toBe(true);
    });

    // R5 canary. Mutation that must turn it red: drop the key lookup from the
    // asset object rewrite, so an object without an id keeps the source file.
    it("re-points an asset object that carries only a filename", () => {
        const result = rewriteCopyReferences({
            value: { image: { fieldtype: "asset", filename: `${CDN}${KEY}` } },
            maps: buildCopyMaps(assetLedger),
            schemas,
        });

        expect((result.value as any).image.filename).toBe(
            `${CDN}${TARGET_KEY}`,
        );
        expect(result.records[0]?.field).toBe("filename");
    });
});

describe("asset URLs in strings: one walk for both passes (lap 2, A)", () => {
    /** A URL in every place the two passes used to disagree about. */
    const awkward = () => ({
        component: "page",
        intro: {
            type: "doc",
            content: [
                {
                    type: "paragraph",
                    content: [
                        {
                            type: "text",
                            text: "link",
                            marks: [
                                {
                                    type: "link",
                                    attrs: {
                                        href: `${CDN}${KEY}`,
                                        // Nested inside a link's attrs: the
                                        // rewriter used to visit top-level
                                        // attr strings only.
                                        custom: { download: `${CDN}${KEY}` },
                                        story: { url: `${CDN}${OTHER_KEY}` },
                                    },
                                },
                            ],
                        },
                    ],
                },
                {
                    type: "blok",
                    attrs: {
                        // Not `body`, so the blok rewriter never looked here.
                        caption: `${CDN}${OTHER_KEY}`,
                        body: [{ component: "card", image: `${CDN}${KEY}` }],
                    },
                },
                {
                    type: "blok",
                    // `body` that is not an array at all.
                    attrs: { body: { image: `${CDN}${KEY}` } },
                },
            ],
        },
        // Strings inside an array (lap 2, G4).
        gallery: [`${CDN}${KEY}`, "not a url", `${CDN}${OTHER_KEY}`],
    });

    // A canary. Mutation that must turn it red: give the rewriter its own
    // walk again (skip a richtext link's attrs, or visit only top-level attr
    // strings).
    it("counts exactly the paths the rewrite reaches", () => {
        const scanned = scanStoryReferences({
            story: { id: 1, uuid: "u", full_slug: "s", content: awkward() },
            schemas: { page: { intro: { type: "richtext" } } },
            options: { sourceSpaceId: SOURCE_SPACE },
        })
            .assetReferences.filter((reference) => reference.shape === "string")
            .map((reference) => reference.path.replace(/^content/, "$"));
        const rewritten = rewriteCopyReferences({
            value: awkward(),
            maps: buildCopyMaps(assetLedger),
            schemas: { page: { intro: { type: "richtext" } } },
        });
        const rewrittenPaths = rewritten.records
            .filter((record) => record.field === "string")
            .map((record) => record.path);

        expect(scanned.length).toBe(8);
        expect(new Set(rewrittenPaths)).toEqual(new Set(scanned));
        expect(JSON.stringify(rewritten.value)).not.toContain(
            `/f/${SOURCE_SPACE}/`,
        );
    });

    // A canary. Mutation that must turn it red: let the string pass visit the
    // `filename` of an asset object the object rule already rewrote.
    it("rewrites an asset object's filename once, by the object rule only", () => {
        // A ledger where the first file's target is the second file's source.
        const chained = [
            {
                ...assetLedger[0]!,
                source_id: 900,
                target_id: 9000,
                source_filename: `${CDN}${KEY}`,
                target_filename: `${CDN}${OTHER_KEY}`,
            },
            {
                ...assetLedger[0]!,
                source_id: 901,
                target_id: 9001,
                source_filename: `${CDN}${OTHER_KEY}`,
                target_filename: `${CDN}${TARGET_OTHER_KEY}`,
            },
        ];
        const result = rewriteCopyReferences({
            value: {
                image: {
                    fieldtype: "asset",
                    id: 900,
                    filename: `${CDN}${KEY}`,
                },
            },
            maps: buildCopyMaps(chained),
            schemas,
        });
        const image = (result.value as any).image;

        // The id says 9000, so the file name must be 9000's file too.
        expect(image.id).toBe(9000);
        expect(image.filename).toBe(`${CDN}${OTHER_KEY}`);
    });
});

describe("asset URLs in strings: one writer of an asset mapping (lap 2, B)", () => {
    // B canary. Mutation that must turn it red: write only two of the three
    // maps in getCopyAssetMapWrites.
    it("writes the id, the file name and the key together", () => {
        const maps = createEmptyCopyMaps();

        applyCopyMapWrites(
            maps,
            getCopyAssetMapWrites({
                sourceId: 900,
                sourceFilename: `${S3}${KEY}`,
                targetId: 9000,
                targetFilename: `${CDN}${TARGET_KEY}`,
            }),
        );

        expect(maps.assetIds.get(900)).toEqual({
            id: 9000,
            filename: `${CDN}${TARGET_KEY}`,
        });
        expect(maps.assetFilenames.get(`${S3}${KEY}`)).toBe(
            `${CDN}${TARGET_KEY}`,
        );
        expect(maps.assetKeys.get(KEY)).toEqual({
            id: 9000,
            filename: `${CDN}${TARGET_KEY}`,
        });
    });

    it("writes no key for a file name that is not an asset URL", () => {
        const maps = createEmptyCopyMaps();

        applyCopyMapWrites(
            maps,
            getCopyAssetMapWrites({
                sourceId: 5,
                sourceFilename: "a.png",
                targetId: 6,
                targetFilename: "b.png",
            }),
        );

        expect(maps.assetKeys.size).toBe(0);
        expect(maps.assetFilenames.get("a.png")).toBe("b.png");
    });
});

describe("asset URLs in strings: the text around a URL (lap 2, C, E, F)", () => {
    // C canary. Mutation that must turn it red: allow a trailing `.` in the
    // file name.
    it("leaves a sentence's punctuation out of the file name", () => {
        const sentence = `See ${CDN}${KEY}. Next`;

        expect(assetKeyOf(`${CDN}${KEY}.`)?.key).toBe(KEY);
        expect(findAssetUrls(sentence).map((match) => match.key)).toEqual([
            KEY,
        ]);
        expect(
            findAssetUrls(`${CDN}${KEY}, ${CDN}${OTHER_KEY}.`).map(
                (match) => match.key,
            ),
        ).toEqual([KEY, OTHER_KEY]);

        const result = rewriteCopyReferences({
            value: { text: sentence },
            maps: buildCopyMaps(assetLedger),
            schemas,
        });

        expect((result.value as any).text).toBe(
            `See ${CDN}${TARGET_KEY}. Next`,
        );
    });

    // E canary. Mutation that must turn it red: bar the image service's own
    // filter segments between the host and `/f/`.
    it("reads the legacy image service's filter form", () => {
        expect(
            assetKeyOf(`//img2.storyblok.com/600x0/filters:format(webp)${KEY}`)
                ?.key,
        ).toBe(KEY);
        expect(
            assetKeyOf(`https://img2.storyblok.com/fit-in/200x200${KEY}`)?.key,
        ).toBe(KEY);
    });

    // F canary. Mutation that must turn it red: leave a richtext image node's
    // `attrs.id` at the source asset's id.
    it("re-points a richtext image node's id with its src", () => {
        const result = rewriteCopyReferences({
            value: {
                type: "doc",
                content: [
                    {
                        type: "image",
                        attrs: { id: 900, src: `${CDN}${KEY}`, alt: "x" },
                    },
                ],
            },
            maps: buildCopyMaps(assetLedger),
            schemas,
        });
        const attrs = (result.value as any).content[0].attrs;

        expect(attrs).toMatchObject({ id: 9000, src: `${CDN}${TARGET_KEY}` });
        expect(
            result.records.filter((record) => record.field === "id"),
        ).toHaveLength(1);
    });
});

describe("asset URLs in strings: host forms and counts (lap 2, G2, G3)", () => {
    // G2 canary. Mutation that must turn it red: rebuild the URL on the plain
    // CDN host instead of replacing the key inside the URL as written.
    it("keeps the host form each occurrence was written with", () => {
        const result = rewriteCopyReferences({
            value: {
                s3: `${S3}${KEY}`,
                protocolRelative: `//a.storyblok.com${OTHER_KEY}`,
                img2: `https://img2.storyblok.com/600x0/filters:format(webp)${KEY}`,
            },
            maps: buildCopyMaps(assetLedger),
            schemas,
        });
        const value = result.value as any;

        expect(value.s3).toBe(`${S3}${TARGET_KEY}`);
        expect(value.protocolRelative).toBe(
            `//a.storyblok.com${TARGET_OTHER_KEY}`,
        );
        expect(value.img2).toBe(
            `https://img2.storyblok.com/600x0/filters:format(webp)${TARGET_KEY}`,
        );
    });

    // G3 canary. Mutation that must turn it red: stop skipping the `filename`
    // of an object already recorded as an asset object.
    it("counts an asset object in an asset field exactly once", () => {
        const references = scanStoryReferences({
            story: {
                id: 1,
                uuid: "u",
                full_slug: "s",
                content: {
                    component: "page",
                    hero: {
                        fieldtype: "asset",
                        id: 900,
                        filename: `${CDN}${KEY}`,
                    },
                },
            },
            schemas: { page: { hero: { type: "asset" } } },
            options: { sourceSpaceId: SOURCE_SPACE },
        }).assetReferences;

        expect(references).toHaveLength(1);
        expect(references[0]).toMatchObject({
            shape: "object",
            assetId: 900,
            assetKey: KEY,
        });
    });
});

describe("asset URLs in strings: an object takes one entry whole (lap 3, I)", () => {
    // I canary. Mutation that must turn it red: take only the file name from
    // the key entry and leave the object's id alone.
    it("gives an object found by its path the target's id as well as its name", () => {
        const result = rewriteCopyReferences({
            value: {
                image: {
                    fieldtype: "asset",
                    // The id a story stored before the file was replaced: it
                    // is in no ledger line. Only the path finds this asset.
                    id: 123456,
                    filename: `${CDN}${KEY}`,
                },
            },
            maps: buildCopyMaps(assetLedger),
            schemas,
        });
        const image = (result.value as any).image;

        expect(image).toMatchObject({
            id: 9000,
            filename: `${CDN}${TARGET_KEY}`,
        });
        expect(
            result.records.map((record) => [record.field, record.targetValue]),
        ).toEqual([
            ["id", 9000],
            ["filename", `${CDN}${TARGET_KEY}`],
        ]);
    });

    it("still takes both values from the id entry when the id is known", () => {
        const result = rewriteCopyReferences({
            value: {
                image: { fieldtype: "asset", id: 900, filename: "stale.jpg" },
            },
            maps: buildCopyMaps(assetLedger),
            schemas,
        });

        expect((result.value as any).image).toMatchObject({
            id: 9000,
            filename: `${CDN}${TARGET_KEY}`,
        });
    });

    // I canary. Mutation that must turn it red: record an id rewrite even when
    // the ledger entry names the id the object already holds.
    it("records no id rewrite when the entry maps that id to itself", () => {
        // A ledger line whose source and target ids are the same file in the
        // same space — what a same-space copy, or a rerun of one, writes.
        const selfMapping: CopyManifestEntry[] = [
            {
                type: "asset",
                source_space_id: SOURCE_SPACE,
                target_space_id: SOURCE_SPACE,
                action: "created",
                created_at: "2026-09-18T00:00:00.000Z",
                source_id: 900,
                target_id: 900,
                source_filename: `${S3}${KEY}`,
                target_filename: `${CDN}${KEY}`,
            },
        ];
        const result = rewriteCopyReferences({
            value: {
                image: {
                    fieldtype: "asset",
                    id: 900,
                    filename: `${CDN}${KEY}`,
                },
            },
            maps: buildCopyMaps(selfMapping),
            schemas,
        });

        expect((result.value as any).image).toMatchObject({
            id: 900,
            filename: `${CDN}${KEY}`,
        });
        expect(result.records).toEqual([]);
    });

    it("records nothing for an object whose id and name are already the target's", () => {
        const result = rewriteCopyReferences({
            value: {
                image: {
                    fieldtype: "asset",
                    id: 9000,
                    filename: `${CDN}${TARGET_KEY}`,
                },
            },
            maps: buildCopyMaps(assetLedger),
            schemas,
        });

        expect(result.records).toEqual([]);
    });
});

describe("asset URLs in strings: the prefix bound and the tail guard (lap 3, J)", () => {
    // J canary. Mutation that must turn it red: tighten the prefix bound back
    // to two or three segments.
    it("reads up to six image-service segments and stops past that", () => {
        const four = `https://img2.storyblok.com/fit-in/600x0/smart/filters:format(webp)${KEY}`;
        const three = `https://img2.storyblok.com/600x0/smart/filters:format(webp)${KEY}`;
        const seven = `https://img2.storyblok.com/a/b/c/d/e/f/g${KEY}`;

        expect(assetKeyOf(four)?.key).toBe(KEY);
        expect(assetKeyOf(three)?.key).toBe(KEY);
        expect(assetKeyOf(seven)).toBeUndefined();
        // A single segment longer than the old 64-character bound still reads.
        expect(
            assetKeyOf(
                `https://img2.storyblok.com/filters:format(webp):quality(80):focal(${"1".repeat(80)})${KEY}`,
            )?.key,
        ).toBe(KEY);
    });

    // J canary. Mutation that must turn it red: trim the file name even when
    // something follows it (drop the `rest.length === 0` guard).
    it("only trims punctuation when the file name ends the URL", () => {
        const withQuery = `${CDN}/f/${SOURCE_SPACE}/1200x630/${HASH}/a.pdf.?x=1`;
        const parsed = assetKeyOf(withQuery);

        expect(parsed?.key).toBe(`/f/${SOURCE_SPACE}/1200x630/${HASH}/a.pdf.`);
        expect(parsed?.rest).toBe("?x=1");

        const found = findAssetUrls(withQuery);

        expect(found[0]?.url).toBe(withQuery);
        expect(withQuery.slice(found[0]!.keyStart, found[0]!.keyEnd)).toBe(
            parsed?.key,
        );

        // And a real key with a query and a sentence's full stop after it:
        // both survive the rewrite untouched.
        const sentence = `${CDN}${KEY}?utm_source=x. Next`;
        const result = rewriteCopyReferences({
            value: { text: sentence },
            maps: buildCopyMaps(assetLedger),
            schemas,
        });

        expect((result.value as any).text).toBe(
            `${CDN}${TARGET_KEY}?utm_source=x. Next`,
        );
    });
});

describe("asset URLs in strings: a record is only written where a value was (lap 3, K)", () => {
    // K canary. Mutation that must turn it red: visit a string passed as the
    // whole value, whose `replace` cannot write anywhere.
    it("records nothing for a bare string value nothing holds", () => {
        const result = rewriteCopyReferences({
            value: `${CDN}${KEY}`,
            maps: buildCopyMaps(assetLedger),
            schemas,
        });

        expect(result.records).toEqual([]);
        expect(result.value).toBe(`${CDN}${KEY}`);
    });
});

describe("asset URLs in strings: relink repairs them (R6)", () => {
    // R6 canary. Mutation that must turn it red: select ledger asset mappings
    // by the source id and the verbatim source filename only.
    it("selects a mapping when the target content mentions only the asset URL", () => {
        const selected = selectRelinkLedgerAssetMappings({
            entries: assetLedger,
            targetContents: [
                { seo: { og_image: `${CDN}${KEY}` }, component: "page" },
            ],
        });

        expect(selected.map((mapping) => mapping.sourceId)).toEqual([900]);
    });

    it("selects nothing when the content mentions no asset at all", () => {
        expect(
            selectRelinkLedgerAssetMappings({
                entries: assetLedger,
                targetContents: [{ title: "nothing to see" }],
            }),
        ).toEqual([]);
    });
});

describe("asset URLs in strings: the help says it (R8)", () => {
    it("states the rule in the copy help", () => {
        expect(copyDescription).toContain(
            "count asset URLs written into text, HTML, link and plugin fields as asset references",
        );
        expect(copyDescription).toContain(
            "Only URLs of the source space are touched, and only when the ledger proves that file was copied",
        );
    });
});
