import { describe, it, expect } from "vitest";

import { getFileName, getSizeFromURL } from "../../src/utils/string-utils.js";

describe("string-utils", () => {
    describe("getFileName", () => {
        describe("URL paths", () => {
            it("should extract filename from simple URL", () => {
                expect(getFileName("https://example.com/image.png")).toBe(
                    "image.png",
                );
            });

            it("should extract filename from complex URL", () => {
                expect(
                    getFileName(
                        "https://a.storyblok.com/f/12345/1920x1080/abc123/image.png",
                    ),
                ).toBe("image.png");
            });

            it("should extract filename with multiple dots", () => {
                expect(getFileName("https://example.com/file.test.js")).toBe(
                    "file.test.js",
                );
            });

            it("should handle URL with query parameters", () => {
                // Note: This function doesn't handle query params, just splits by /
                expect(getFileName("https://example.com/file.png?v=123")).toBe(
                    "file.png?v=123",
                );
            });
        });

        describe("file paths", () => {
            it("should extract filename from Unix path", () => {
                expect(getFileName("/path/to/file.txt")).toBe("file.txt");
            });

            it("should extract filename from relative path", () => {
                expect(getFileName("./src/components/hero.sb.js")).toBe(
                    "hero.sb.js",
                );
            });

            it("should return the string itself if no slashes", () => {
                expect(getFileName("simple.js")).toBe("simple.js");
            });
        });

        describe("edge cases", () => {
            it("should handle path ending with slash", () => {
                // pop() returns empty string for trailing slash
                expect(() =>
                    getFileName("https://example.com/folder/"),
                ).toThrow("File name couldn't be extracted from URL.");
            });

            it("should throw for empty string", () => {
                expect(() => getFileName("")).toThrow(
                    "File name couldn't be extracted from URL.",
                );
            });

            it("should handle filename with spaces", () => {
                expect(getFileName("https://example.com/my file.png")).toBe(
                    "my file.png",
                );
            });

            it("should handle filename with special characters", () => {
                expect(
                    getFileName("https://example.com/file-name_v2.png"),
                ).toBe("file-name_v2.png");
            });
        });

        describe("Storyblok asset URLs", () => {
            it("should extract filename from Storyblok CDN URL", () => {
                expect(
                    getFileName(
                        "https://a.storyblok.com/f/123456/1920x1080/abcdef/hero-image.jpg",
                    ),
                ).toBe("hero-image.jpg");
            });

            it("should extract filename from Storyblok thumbnail URL", () => {
                expect(
                    getFileName(
                        "https://a.storyblok.com/f/123456/100x100/xyz789/thumb.webp",
                    ),
                ).toBe("thumb.webp");
            });
        });
    });

    describe("getSizeFromURL", () => {
        describe("Storyblok asset URLs", () => {
            it("should extract size from standard Storyblok URL", () => {
                expect(
                    getSizeFromURL(
                        "https://a.storyblok.com/f/12345/1920x1080/abc123/image.png",
                    ),
                ).toBe("1920x1080");
            });

            it("should extract size from thumbnail URL", () => {
                expect(
                    getSizeFromURL(
                        "https://a.storyblok.com/f/12345/100x100/xyz789/thumb.jpg",
                    ),
                ).toBe("100x100");
            });

            it("should extract size from square image URL", () => {
                expect(
                    getSizeFromURL(
                        "https://a.storyblok.com/f/12345/500x500/hash123/avatar.png",
                    ),
                ).toBe("500x500");
            });

            it("should handle different aspect ratios", () => {
                expect(
                    getSizeFromURL(
                        "https://a.storyblok.com/f/12345/800x600/abc/landscape.jpg",
                    ),
                ).toBe("800x600");

                expect(
                    getSizeFromURL(
                        "https://a.storyblok.com/f/12345/600x800/xyz/portrait.jpg",
                    ),
                ).toBe("600x800");
            });
        });

        describe("edge cases", () => {
            it("should handle URLs with fewer segments", () => {
                // With only 3 segments, sizePos would be 0
                const result = getSizeFromURL("a/b/c");
                expect(result).toBe("a");
            });

            it("should handle URL with many segments", () => {
                expect(
                    getSizeFromURL(
                        "https://cdn.example.com/assets/images/1024x768/hash/file.png",
                    ),
                ).toBe("1024x768");
            });
        });

        describe("various file types", () => {
            it("should work with PNG files", () => {
                expect(
                    getSizeFromURL(
                        "https://a.storyblok.com/f/12345/1920x1080/abc/image.png",
                    ),
                ).toBe("1920x1080");
            });

            it("should work with JPEG files", () => {
                expect(
                    getSizeFromURL(
                        "https://a.storyblok.com/f/12345/1920x1080/abc/photo.jpeg",
                    ),
                ).toBe("1920x1080");
            });

            it("should work with WebP files", () => {
                expect(
                    getSizeFromURL(
                        "https://a.storyblok.com/f/12345/1920x1080/abc/image.webp",
                    ),
                ).toBe("1920x1080");
            });

            it("should work with SVG files", () => {
                expect(
                    getSizeFromURL(
                        "https://a.storyblok.com/f/12345/1920x1080/abc/icon.svg",
                    ),
                ).toBe("1920x1080");
            });
        });
    });
});
