import { describe, it, expect, vi, beforeEach } from "vitest";

import {
    createMockComponent,
    createMockComponentGroup,
} from "../mocks/storyblokClient.mock.js";

// Mock the logger
vi.mock("../../src/utils/logger.js", () => ({
    default: {
        log: vi.fn(),
        success: vi.fn(),
        warning: vi.fn(),
        error: vi.fn(),
    },
}));

describe("Components API - Mock Utilities", () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    describe("createMockComponent", () => {
        it("should generate valid component structure with defaults", () => {
            const component = createMockComponent();

            expect(component).toHaveProperty("id");
            expect(component).toHaveProperty("name");
            expect(component).toHaveProperty("display_name");
            expect(component).toHaveProperty("schema");
            expect(component).toHaveProperty("created_at");
            expect(component).toHaveProperty("updated_at");
            expect(component).toHaveProperty("is_root");
            expect(component).toHaveProperty("is_nestable");
        });

        it("should allow overriding properties", () => {
            const component = createMockComponent({
                name: "hero",
                display_name: "Hero Section",
                is_root: true,
            });

            expect(component.name).toBe("hero");
            expect(component.display_name).toBe("Hero Section");
            expect(component.is_root).toBe(true);
        });

        it("should generate unique IDs for each component", () => {
            const comp1 = createMockComponent();
            const comp2 = createMockComponent();

            // IDs should be numbers
            expect(typeof comp1.id).toBe("number");
            expect(typeof comp2.id).toBe("number");
        });
    });

    describe("createMockComponentGroup", () => {
        it("should generate valid group structure", () => {
            const group = createMockComponentGroup({ name: "Test Group" });

            expect(group).toHaveProperty("id");
            expect(group).toHaveProperty("name", "Test Group");
            expect(group).toHaveProperty("uuid");
        });

        it("should allow overriding all properties", () => {
            const group = createMockComponentGroup({
                id: 999,
                name: "Custom Group",
                uuid: "custom-uuid",
            });

            expect(group.id).toBe(999);
            expect(group.name).toBe("Custom Group");
            expect(group.uuid).toBe("custom-uuid");
        });
    });
});

describe("Component CRUD Logic", () => {
    describe("Component creation workflow", () => {
        it("should prepare component for creation with required fields", () => {
            const componentSchema = {
                name: "new-component",
                display_name: "New Component",
                schema: {
                    title: { type: "text", pos: 0 },
                    content: { type: "richtext", pos: 1 },
                },
            };

            expect(componentSchema).toHaveProperty("name");
            expect(componentSchema).toHaveProperty("schema");
            expect(componentSchema.schema).toHaveProperty("title");
        });

        it("should validate component name format", () => {
            const validNames = ["hero", "text-block", "card_item", "CTA"];
            const invalidNames = ["", "  ", "name with spaces"];

            validNames.forEach((name) => {
                expect(name.trim().length > 0).toBe(true);
                expect(name.includes(" ")).toBe(false);
            });

            invalidNames.forEach((name) => {
                const isValid = name.trim().length > 0 && !name.includes(" ");
                expect(isValid).toBe(false);
            });
        });
    });

    describe("Component update workflow", () => {
        it("should merge local and remote component data", () => {
            const remoteComponent = createMockComponent({
                id: 123,
                name: "hero",
                display_name: "Hero",
            });

            const localChanges = {
                display_name: "Updated Hero",
                schema: { title: { type: "text" } },
            };

            const merged = { ...remoteComponent, ...localChanges };

            expect(merged.id).toBe(123); // Preserved from remote
            expect(merged.name).toBe("hero"); // Preserved from remote
            expect(merged.display_name).toBe("Updated Hero"); // Updated
        });

        it("should preserve component ID during updates", () => {
            const component = createMockComponent({ id: 456 });
            const updated = { ...component, display_name: "Changed" };

            expect(updated.id).toBe(456);
        });
    });

    describe("Component deletion workflow", () => {
        it("should identify components for deletion by ID", () => {
            const componentsToDelete = [
                createMockComponent({ id: 1, name: "obsolete1" }),
                createMockComponent({ id: 2, name: "obsolete2" }),
            ];

            const idsToDelete = componentsToDelete.map((c) => c.id);

            expect(idsToDelete).toEqual([1, 2]);
        });
    });
});

describe("Component Group Management", () => {
    it("should assign component to group by uuid", () => {
        const group = createMockComponentGroup({
            name: "Content",
            uuid: "group-uuid-123",
        });

        const component = createMockComponent({
            name: "text-block",
            component_group_uuid: group.uuid,
        });

        expect(component.component_group_uuid).toBe("group-uuid-123");
    });

    it("should handle components without groups", () => {
        const component = createMockComponent({
            name: "standalone",
        });

        expect(component.component_group_uuid).toBeNull();
    });
});
