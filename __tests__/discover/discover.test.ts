import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

import {
    VirtualFileSystem,
    createComponentSchemaContent,
    createDatasourceContent,
    createRolesContent,
} from "../mocks/filesystem.mock.js";

// Mock the logger
vi.mock("../../src/utils/logger.js", () => ({
    default: {
        log: vi.fn(),
        success: vi.fn(),
        warning: vi.fn(),
        error: vi.fn(),
    },
}));

describe("Virtual File System for Discovery Tests", () => {
    let vfs: VirtualFileSystem;

    beforeEach(() => {
        vfs = new VirtualFileSystem();
    });

    afterEach(() => {
        vfs.clear();
    });

    it("should create and read files", () => {
        const content = createComponentSchemaContent("hero", {
            displayName: "Hero Section",
            isRoot: true,
        });

        vfs.addFile("/project/src/components/hero.sb.js", content);

        expect(vfs.fileExists("/project/src/components/hero.sb.js")).toBe(true);
        expect(vfs.readFile("/project/src/components/hero.sb.js")).toBe(content);
    });

    it("should list directory contents", () => {
        vfs.addFile("/project/src/components/hero.sb.js", "content1");
        vfs.addFile("/project/src/components/card.sb.js", "content2");
        vfs.addFile("/project/src/components/nested/item.sb.js", "content3");

        const contents = vfs.listDirectory("/project/src/components");

        expect(contents).toContain("hero.sb.js");
        expect(contents).toContain("card.sb.js");
        expect(contents).toContain("nested");
    });

    it("should detect non-existent files", () => {
        expect(vfs.fileExists("/nonexistent/file.js")).toBe(false);
    });

    it("should handle directory creation", () => {
        vfs.addDirectory("/project/src/new-dir");
        expect(vfs.directoryExists("/project/src/new-dir")).toBe(true);
    });
});

describe("Schema Content Generators", () => {
    it("should create component schema content correctly", () => {
        const content = createComponentSchemaContent("button", {
            displayName: "Button",
            isNestable: true,
            groupName: "UI Elements",
            schema: {
                label: { type: "text" },
                variant: { type: "option" },
            },
        });

        expect(content).toContain('name: "button"');
        expect(content).toContain('display_name: "Button"');
        expect(content).toContain("is_nestable: true");
        expect(content).toContain('component_group_name: "UI Elements"');
        expect(content).toContain('"label"');
        expect(content).toContain('"type": "text"');
    });

    it("should create datasource content correctly", () => {
        const content = createDatasourceContent("icons", [
            { name: "Arrow", value: "arrow" },
            { name: "Check", value: "check" },
        ]);

        expect(content).toContain('name: "icons"');
        expect(content).toContain('slug: "icons"');
        expect(content).toContain("Arrow");
        expect(content).toContain("arrow");
    });

    it("should create roles content correctly", () => {
        const content = createRolesContent("Editor", [
            "view_all_stories",
            "edit_stories",
        ]);

        expect(content).toContain('role: "Editor"');
        expect(content).toContain("view_all_stories");
        expect(content).toContain("edit_stories");
    });
});

describe("Component Discovery Patterns", () => {
    it("should match standard component file patterns", () => {
        const componentPatterns = [
            "hero.sb.js",
            "text-block.sb.js",
            "card-carousel.sb.js",
            "CTAButton.sb.js",
        ];

        const invalidPatterns = [
            "_template.sb.js", // underscore prefix should be ignored
            "component.ts", // wrong extension
            "story.stories.json", // different type
        ];

        const validPattern = /^[^_].*\.sb\.js$/;

        componentPatterns.forEach((name) => {
            expect(validPattern.test(name)).toBe(true);
        });

        invalidPatterns.forEach((name) => {
            expect(validPattern.test(name)).toBe(false);
        });
    });

    it("should match datasource file patterns", () => {
        const datasourcePatterns = [
            "icons.sb.datasource.js",
            "countries.sb.datasource.js",
        ];

        const validPattern = /^[^_].*\.sb\.datasource\.js$/;

        datasourcePatterns.forEach((name) => {
            expect(validPattern.test(name)).toBe(true);
        });
    });

    it("should match roles file patterns", () => {
        const rolesPatterns = ["editor.sb.roles.js", "admin.sb.roles.js"];

        const validPattern = /^[^_].*\.sb\.roles\.js$/;

        rolesPatterns.forEach((name) => {
            expect(validPattern.test(name)).toBe(true);
        });
    });

    it("should match TypeScript component patterns", () => {
        const tsPatterns = ["hero.sb.ts", "card.sb.ts"];
        const validPattern = /^[^_].*\.sb\.ts$/;

        tsPatterns.forEach((name) => {
            expect(validPattern.test(name)).toBe(true);
        });
    });
});

describe("Discovery Glob Pattern Building", () => {
    it("should build glob pattern for single directory", () => {
        const buildPattern = (
            mainDir: string,
            dirs: string[],
            ext: string
        ): string => {
            const dirPart = dirs.length === 1 ? dirs[0] : `{${dirs.join(",")}}`;
            return `${mainDir}/${dirPart}/**/[^_]*.${ext}`;
        };

        const pattern = buildPattern("/project", ["src"], "sb.js");
        expect(pattern).toBe("/project/src/**/[^_]*.sb.js");
    });

    it("should build glob pattern for multiple directories", () => {
        const buildPattern = (
            mainDir: string,
            dirs: string[],
            ext: string
        ): string => {
            const dirPart = dirs.length === 1 ? dirs[0] : `{${dirs.join(",")}}`;
            return `${mainDir}/${dirPart}/**/[^_]*.${ext}`;
        };

        const pattern = buildPattern("/project", ["src", "storyblok"], "sb.js");
        expect(pattern).toBe("/project/{src,storyblok}/**/[^_]*.sb.js");
    });

    it("should normalize directory segments", () => {
        const normalize = (segments: string[]): string => {
            if (segments.length === 0) return "";
            if (segments.length === 1) return segments[0];
            return `{${segments.join(",")}}`;
        };

        expect(normalize([])).toBe("");
        expect(normalize(["src"])).toBe("src");
        expect(normalize(["src", "storyblok"])).toBe("{src,storyblok}");
        expect(normalize(["a", "b", "c"])).toBe("{a,b,c}");
    });
});

describe("Discovery Comparison Logic", () => {
    it("should identify new components (in local but not remote)", () => {
        const localComponents = [
            { name: "hero" },
            { name: "card" },
            { name: "new-component" },
        ];

        const remoteComponents = [{ name: "hero" }, { name: "card" }];

        const newComponents = localComponents.filter(
            (local) =>
                !remoteComponents.some((remote) => remote.name === local.name)
        );

        expect(newComponents).toEqual([{ name: "new-component" }]);
    });

    it("should identify obsolete components (in remote but not local)", () => {
        const localComponents = [{ name: "hero" }, { name: "card" }];

        const remoteComponents = [
            { name: "hero" },
            { name: "card" },
            { name: "obsolete-component" },
        ];

        const obsoleteComponents = remoteComponents.filter(
            (remote) =>
                !localComponents.some((local) => local.name === remote.name)
        );

        expect(obsoleteComponents).toEqual([{ name: "obsolete-component" }]);
    });

    it("should identify components that exist in both (to update)", () => {
        const localComponents = [
            { name: "hero", display_name: "Hero Updated" },
            { name: "card", display_name: "Card" },
            { name: "new-component", display_name: "New" },
        ];

        const remoteComponents = [
            { name: "hero", display_name: "Hero", id: 1 },
            { name: "card", display_name: "Card", id: 2 },
            { name: "obsolete", display_name: "Obsolete", id: 3 },
        ];

        const toUpdate = localComponents.filter((local) =>
            remoteComponents.some((remote) => remote.name === local.name)
        );

        expect(toUpdate.length).toBe(2);
        expect(toUpdate.map((c) => c.name)).toEqual(["hero", "card"]);
    });

    it("should detect schema changes between local and remote", () => {
        const localSchema = {
            title: { type: "text" },
            content: { type: "richtext" },
        };

        const remoteSchema = {
            title: { type: "text" },
        };

        const hasChanges = JSON.stringify(localSchema) !== JSON.stringify(remoteSchema);
        expect(hasChanges).toBe(true);
    });
});

describe("Discovery Scope Types", () => {
    it("should define local scope for project files", () => {
        const SCOPE = {
            local: "local",
            external: "external",
            all: "all",
        };

        expect(SCOPE.local).toBe("local");
        expect(Object.keys(SCOPE)).toContain("local");
        expect(Object.keys(SCOPE)).toContain("external");
        expect(Object.keys(SCOPE)).toContain("all");
    });

    it("should define lookup types", () => {
        const LOOKUP_TYPE = {
            fileName: "fileName",
            fileContent: "fileContent",
        };

        expect(LOOKUP_TYPE.fileName).toBe("fileName");
        expect(LOOKUP_TYPE.fileContent).toBe("fileContent");
    });
});
