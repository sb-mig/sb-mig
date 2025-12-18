import { describe, it, expect } from "vitest";

import { removeIdFromPreset } from "../../src/api/presets/presets.helper.js";

describe("preset-utils", () => {
    describe("removeIdFromPreset", () => {
        describe("basic functionality", () => {
            it("should remove id from preset", () => {
                const input = {
                    preset: {
                        id: 123,
                        name: "Default",
                        component: "hero",
                    },
                };

                const result = removeIdFromPreset(input);

                expect(result.preset.id).toBeUndefined();
                expect(result.preset.name).toBe("Default");
                expect(result.preset.component).toBe("hero");
            });

            it("should remove space_id from preset", () => {
                const input = {
                    preset: {
                        space_id: 456,
                        name: "Default",
                    },
                };

                const result = removeIdFromPreset(input);

                expect(result.preset.space_id).toBeUndefined();
                expect(result.preset.name).toBe("Default");
            });

            it("should remove component_id from preset", () => {
                const input = {
                    preset: {
                        component_id: 789,
                        name: "Default",
                    },
                };

                const result = removeIdFromPreset(input);

                expect(result.preset.component_id).toBeUndefined();
                expect(result.preset.name).toBe("Default");
            });
        });

        describe("removing all ID fields", () => {
            it("should remove all ID fields at once", () => {
                const input = {
                    preset: {
                        id: 123,
                        space_id: 456,
                        component_id: 789,
                        name: "Hero Preset",
                        component: "hero",
                        image: "https://example.com/image.png",
                    },
                };

                const result = removeIdFromPreset(input);

                expect(result.preset.id).toBeUndefined();
                expect(result.preset.space_id).toBeUndefined();
                expect(result.preset.component_id).toBeUndefined();
                expect(result.preset.name).toBe("Hero Preset");
                expect(result.preset.component).toBe("hero");
                expect(result.preset.image).toBe(
                    "https://example.com/image.png",
                );
            });
        });

        describe("preserving other properties", () => {
            it("should preserve all non-ID properties", () => {
                const input = {
                    preset: {
                        id: 1,
                        space_id: 2,
                        component_id: 3,
                        name: "Card Preset",
                        component: "card",
                        color: "#ffffff",
                        nested: {
                            value: "preserved",
                        },
                        array: [1, 2, 3],
                    },
                };

                const result = removeIdFromPreset(input);

                expect(result.preset.name).toBe("Card Preset");
                expect(result.preset.component).toBe("card");
                expect(result.preset.color).toBe("#ffffff");
                expect(result.preset.nested).toEqual({ value: "preserved" });
                expect(result.preset.array).toEqual([1, 2, 3]);
            });

            it("should preserve properties outside preset object", () => {
                const input = {
                    preset: {
                        id: 1,
                        name: "Test",
                    },
                    otherProp: "value",
                };

                const result = removeIdFromPreset(input);

                expect(result.otherProp).toBe("value");
            });
        });

        describe("mutation behavior", () => {
            it("should mutate the original object", () => {
                const input = {
                    preset: {
                        id: 123,
                        name: "Test",
                    },
                };

                const result = removeIdFromPreset(input);

                // The function mutates in place and returns the same reference
                expect(result).toBe(input);
                expect(input.preset.id).toBeUndefined();
            });
        });

        describe("edge cases", () => {
            it("should handle preset with no ID fields", () => {
                const input = {
                    preset: {
                        name: "Clean Preset",
                        component: "button",
                    },
                };

                const result = removeIdFromPreset(input);

                expect(result.preset.name).toBe("Clean Preset");
                expect(result.preset.component).toBe("button");
            });

            it("should handle preset with only ID fields", () => {
                const input = {
                    preset: {
                        id: 1,
                        space_id: 2,
                        component_id: 3,
                    },
                };

                const result = removeIdFromPreset(input);

                expect(Object.keys(result.preset)).toHaveLength(0);
            });

            it("should handle numeric string IDs", () => {
                const input = {
                    preset: {
                        id: "123",
                        space_id: "456",
                        component_id: "789",
                        name: "Test",
                    },
                };

                const result = removeIdFromPreset(input);

                expect(result.preset.id).toBeUndefined();
                expect(result.preset.space_id).toBeUndefined();
                expect(result.preset.component_id).toBeUndefined();
            });
        });

        describe("real-world Storyblok preset structure", () => {
            it("should handle complete Storyblok preset object", () => {
                const input = {
                    preset: {
                        id: 12345,
                        name: "Hero with Background",
                        slug: "hero-with-background",
                        component: "hero",
                        component_id: 67890,
                        space_id: 11111,
                        created_at: "2024-01-15T10:30:00.000Z",
                        updated_at: "2024-01-16T14:45:00.000Z",
                        image: "https://a.storyblok.com/f/12345/preview.png",
                        preset: {
                            title: "Welcome",
                            subtitle: "This is a preset subtitle",
                            background_color: "#1a1a2e",
                        },
                    },
                };

                const result = removeIdFromPreset(input);

                // IDs removed
                expect(result.preset.id).toBeUndefined();
                expect(result.preset.component_id).toBeUndefined();
                expect(result.preset.space_id).toBeUndefined();

                // Other fields preserved
                expect(result.preset.name).toBe("Hero with Background");
                expect(result.preset.slug).toBe("hero-with-background");
                expect(result.preset.component).toBe("hero");
                expect(result.preset.created_at).toBe(
                    "2024-01-15T10:30:00.000Z",
                );
                expect(result.preset.updated_at).toBe(
                    "2024-01-16T14:45:00.000Z",
                );
                expect(result.preset.image).toBe(
                    "https://a.storyblok.com/f/12345/preview.png",
                );
                expect(result.preset.preset).toEqual({
                    title: "Welcome",
                    subtitle: "This is a preset subtitle",
                    background_color: "#1a1a2e",
                });
            });
        });
    });
});
