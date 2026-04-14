import { describe, expect, it } from "vitest";

import {
    extendMigrationMapperWithAliases,
    parseMigrationComponentAliasFlags,
    parseMigrationComponentOverrideFlags,
    resolveMigrationComponentsToMigrate,
} from "../../src/api/data-migration/migration-component-scope.js";

describe("migration component scope", () => {
    it("parses repeatable alias flags", () => {
        expect(
            parseMigrationComponentAliasFlags([
                "colorPickerModeValues:sb-button=sb-open-drift-button",
                "colorPickerModeValues:sb-section=sb-tour-page-section,sb-tour-page-hero",
            ]),
        ).toEqual({
            colorPickerModeValues: {
                "sb-button": ["sb-open-drift-button"],
                "sb-section": [
                    "sb-tour-page-section",
                    "sb-tour-page-hero",
                ],
            },
        });
    });

    it("parses per-migration component overrides", () => {
        expect(
            parseMigrationComponentOverrideFlags([
                "colorPickerModeValues:sb-button,sb-open-drift-button",
            ]),
        ).toEqual({
            colorPickerModeValues: ["sb-button", "sb-open-drift-button"],
        });
    });

    it("extends a mapper with alias component names", () => {
        const mapper = {
            "sb-button": (data: unknown) => data,
        };

        const extended = extendMigrationMapperWithAliases(mapper, {
            "sb-button": ["sb-open-drift-button"],
        });

        expect(extended["sb-button"]).toBe(mapper["sb-button"]);
        expect(extended["sb-open-drift-button"]).toBe(mapper["sb-button"]);
    });

    it("prefers per-migration overrides over the mapper key list", () => {
        const mapper = {
            "sb-button": (data: unknown) => data,
            "sb-open-drift-button": (data: unknown) => data,
        };

        expect(
            resolveMigrationComponentsToMigrate({
                mapper,
                migrationName: "colorPickerModeValues",
                perMigrationOverrides: {
                    colorPickerModeValues: [
                        "sb-button",
                        "sb-open-drift-button",
                    ],
                },
            }),
        ).toEqual(["sb-button", "sb-open-drift-button"]);
    });

    it("throws when an override references an unknown component", () => {
        expect(() =>
            resolveMigrationComponentsToMigrate({
                mapper: {
                    "sb-button": (data: unknown) => data,
                },
                migrationName: "colorPickerModeValues",
                perMigrationOverrides: {
                    colorPickerModeValues: ["sb-open-drift-button"],
                },
            }),
        ).toThrow(/unknown components/);
    });
});
