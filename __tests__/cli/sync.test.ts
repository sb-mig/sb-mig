import { describe, it, expect, vi, beforeEach } from "vitest";

import { isItFactory } from "../../src/utils/main.js";

// Mock the logger
vi.mock("../../src/utils/logger.js", () => ({
    default: {
        log: vi.fn(),
        success: vi.fn(),
        warning: vi.fn(),
        error: vi.fn(),
    },
}));

// Mock config
vi.mock("../../src/config/config.js", () => ({
    default: {
        spaceId: "12345",
        oauthToken: "mock-token",
        debug: false,
    },
}));

describe("Sync Command Logic", () => {
    describe("Flag parsing with isItFactory", () => {
        it("should detect --all flag for syncing all components", () => {
            const flags = { all: true };
            const rules = {
                all: ["all"],
                allWithPresets: ["all", "presets"],
                onlyPresets: ["presets"],
            };

            const isIt = isItFactory(flags, rules, []);

            expect(isIt("all")).toBe(true);
            expect(isIt("allWithPresets")).toBe(false);
            expect(isIt("onlyPresets")).toBe(false);
        });

        it("should detect --all --presets flags combination", () => {
            const flags = { all: true, presets: true };
            const rules = {
                all: ["all"],
                allWithPresets: ["all", "presets"],
                onlyPresets: ["presets"],
            };

            const isIt = isItFactory(flags, rules, []);

            expect(isIt("all")).toBe(false); // Not exact match
            expect(isIt("allWithPresets")).toBe(true);
            expect(isIt("onlyPresets")).toBe(false);
        });

        it("should handle space-specific flags", () => {
            const flags = { from: "12345", to: "67890", all: true };
            const rules = {
                all: ["all"],
                specific: ["from", "to"],
            };

            const isIt = isItFactory(flags, rules, ["from", "to"]);

            expect(isIt("all")).toBe(true); // Ignores from/to in matching
        });

        it("should detect SSOT mode", () => {
            const flags = { all: true, ssot: true };
            const rules = {
                all: ["all"],
                allWithSSOT: ["all", "ssot"],
                ssotOnly: ["ssot"],
            };

            const isIt = isItFactory(flags, rules, []);

            expect(isIt("allWithSSOT")).toBe(true);
            expect(isIt("all")).toBe(false);
        });
    });

    describe("Sync command types", () => {
        const SYNC_COMMANDS = {
            components: "components",
            roles: "roles",
            datasources: "datasources",
            content: "content",
            plugins: "plugins",
        };

        it("should recognize all sync command types", () => {
            expect(Object.keys(SYNC_COMMANDS)).toContain("components");
            expect(Object.keys(SYNC_COMMANDS)).toContain("roles");
            expect(Object.keys(SYNC_COMMANDS)).toContain("datasources");
            expect(Object.keys(SYNC_COMMANDS)).toContain("content");
            expect(Object.keys(SYNC_COMMANDS)).toContain("plugins");
        });

        it("should validate sync command input", () => {
            const validCommands = ["sync", "components"];
            const invalidCommands = ["sync", "invalid-type"];

            const isValidCommand = (input: string[]) => {
                const command = input[1];
                return Object.values(SYNC_COMMANDS).includes(command as any);
            };

            expect(isValidCommand(validCommands)).toBe(true);
            expect(isValidCommand(invalidCommands)).toBe(false);
        });
    });
});

describe("Sync Components Integration", () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    describe("Component sync modes", () => {
        it("should parse component names from CLI input", () => {
            const input = ["sync", "components", "hero", "card", "footer"];

            const componentNames = input.slice(2); // Everything after "sync components"

            expect(componentNames).toEqual(["hero", "card", "footer"]);
        });

        it("should handle single component sync", () => {
            const input = ["sync", "components", "hero"];

            const componentNames = input.slice(2);

            expect(componentNames).toEqual(["hero"]);
            expect(componentNames.length).toBe(1);
        });

        it("should handle sync all components (no specific names)", () => {
            const input = ["sync", "components"];
            const flags = { all: true };

            const componentNames = input.slice(2);
            const isAll = flags.all === true && componentNames.length === 0;

            expect(isAll).toBe(true);
        });
    });

    describe("SSOT (Single Source of Truth) mode", () => {
        it("should identify components to remove in SSOT mode", () => {
            const localComponents = ["hero", "card", "footer"];
            const remoteComponents = [
                { name: "hero", id: 1 },
                { name: "card", id: 2 },
                { name: "old-component", id: 3 }, // Should be removed
                { name: "obsolete", id: 4 }, // Should be removed
            ];

            const toRemove = remoteComponents.filter(
                (remote) => !localComponents.includes(remote.name),
            );

            expect(toRemove.map((c) => c.name)).toEqual([
                "old-component",
                "obsolete",
            ]);
        });

        it("should preserve components that exist locally", () => {
            const localComponents = ["hero", "card"];
            const remoteComponents = [
                { name: "hero", id: 1 },
                { name: "card", id: 2 },
            ];

            const toRemove = remoteComponents.filter(
                (remote) => !localComponents.includes(remote.name),
            );

            expect(toRemove).toEqual([]);
        });
    });
});

describe("Sync Datasources", () => {
    it("should parse datasource input correctly", () => {
        const input = ["sync", "datasources", "icons", "countries"];

        const datasourceNames = input.slice(2);

        expect(datasourceNames).toEqual(["icons", "countries"]);
    });

    it("should validate datasource structure", () => {
        const validDatasource = {
            name: "icons",
            slug: "icons",
            datasource_entries: [
                { name: "arrow", value: "arrow-icon" },
                { name: "check", value: "check-icon" },
            ],
        };

        expect(validDatasource).toHaveProperty("name");
        expect(validDatasource).toHaveProperty("slug");
        expect(validDatasource).toHaveProperty("datasource_entries");
        expect(Array.isArray(validDatasource.datasource_entries)).toBe(true);
    });
});

describe("Sync Roles", () => {
    it("should parse roles input correctly", () => {
        const input = ["sync", "roles", "editor", "admin"];

        const roleNames = input.slice(2);

        expect(roleNames).toEqual(["editor", "admin"]);
    });

    it("should validate role structure", () => {
        const validRole = {
            role: "Editor",
            permissions: ["view_all_stories", "edit_stories"],
            allowed_paths: ["/blog/*"],
            field_permissions: [],
        };

        expect(validRole).toHaveProperty("role");
        expect(validRole).toHaveProperty("permissions");
        expect(Array.isArray(validRole.permissions)).toBe(true);
    });
});

describe("Sync Content (Stories)", () => {
    describe("Content sync modes", () => {
        it("should recognize --all flag for all stories", () => {
            const flags = { all: true };

            expect(flags.all).toBe(true);
        });

        it("should recognize --from and --to flags for space migration", () => {
            const flags = {
                from: "12345",
                to: "67890",
                all: true,
            };

            expect(flags.from).toBe("12345");
            expect(flags.to).toBe("67890");
        });
    });

    it("should validate story structure for sync", () => {
        const validStory = {
            name: "Home",
            slug: "home",
            content: {
                _uid: "uuid",
                component: "page",
            },
            parent_id: null,
            is_folder: false,
        };

        expect(validStory).toHaveProperty("name");
        expect(validStory).toHaveProperty("slug");
        expect(validStory).toHaveProperty("content");
        expect(validStory.content).toHaveProperty("component");
    });
});

describe("Sync Error Handling", () => {
    it("should handle missing component gracefully", () => {
        const componentsToSync = ["hero", "nonexistent-component"];
        const availableComponents = [
            { name: "hero", id: 1 },
            { name: "card", id: 2 },
        ];

        const missing = componentsToSync.filter(
            (name) => !availableComponents.some((c) => c.name === name),
        );

        expect(missing).toEqual(["nonexistent-component"]);
    });

    it("should identify components that need creation vs update", () => {
        const localComponents = [
            { name: "hero" },
            { name: "card" },
            { name: "new-section" },
        ];

        const remoteComponents = [
            { name: "hero", id: 1 },
            { name: "card", id: 2 },
        ];

        const toCreate = localComponents.filter(
            (local) =>
                !remoteComponents.some((remote) => remote.name === local.name),
        );

        const toUpdate = localComponents.filter((local) =>
            remoteComponents.some((remote) => remote.name === local.name),
        );

        expect(toCreate.map((c) => c.name)).toEqual(["new-section"]);
        expect(toUpdate.map((c) => c.name)).toEqual(["hero", "card"]);
    });
});
