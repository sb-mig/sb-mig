import { describe, expect, it } from "vitest";

import {
    runMigrationPipelineInMemory,
    type PreparedMigrationConfig,
} from "../../src/api/data-migration/component-data-migration.js";

describe("component data migration", () => {
    it("treats mapper output as authoritative when fields are renamed", () => {
        const sourceCard = {
            _uid: "card-1",
            component: "sb-content-card",
        };

        const itemsToMigrate = [
            {
                story: {
                    full_slug: "test/story",
                    content: {
                        _uid: "carousel-1",
                        component: "sb-card-carousel",
                        content: [sourceCard],
                        custom_classname: "align-content-center",
                    },
                },
            },
        ];

        const preparedMigrationConfig: PreparedMigrationConfig = {
            migrationConfigName: "rename-carousel-content-to-slides",
            migrationConfigPath:
                "/test/rename-carousel-content-to-slides.sb.migration.cjs",
            migrationConfigFileContent: {
                "sb-card-carousel": (data) => ({
                    wasReplaced: true,
                    data: {
                        _uid: data._uid,
                        component: "sb-carousel",
                        slides: data.content,
                    },
                }),
            },
            componentsToMigrate: ["sb-card-carousel"],
            validator: null,
        };

        const result = runMigrationPipelineInMemory({
            itemType: "story",
            itemsToMigrate,
            preparedMigrationConfigs: [preparedMigrationConfig],
        });

        expect(result.finalItems[0].story.content).toEqual({
            _uid: "carousel-1",
            component: "sb-carousel",
            slides: [sourceCard],
        });
        expect(result.finalItems[0].story.content).not.toHaveProperty(
            "content",
        );
        expect(result.finalItems[0].story.content).not.toHaveProperty(
            "custom_classname",
        );
    });
});
