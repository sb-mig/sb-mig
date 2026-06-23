import { describe, expect, it } from "vitest";

import { buildCopyAssetsGraph } from "../../src/api/copy/assets.js";

describe("copy assets graph", () => {
    it("plans asset folders before assets and preserves folder paths", () => {
        const graph = buildCopyAssetsGraph({
            sourceSpaceId: "source-space",
            targetSpaceId: "target-space",
            generatedAt: "2026-06-23T10:00:00.000Z",
            assetFolders: [
                {
                    id: 20,
                    name: "Nested",
                    parent_id: 10,
                },
                {
                    id: 10,
                    name: "Root",
                    parent_id: null,
                },
            ],
            assets: [
                {
                    id: 200,
                    filename: "https://a.storyblok.com/f/123/nested/image.jpg",
                    space_id: 123,
                    created_at: "2026-06-23T10:00:00.000Z",
                    updated_at: "2026-06-23T10:00:00.000Z",
                    asset_folder_id: 20,
                    deleted_at: null,
                    content_length: 100,
                    content_type: "image/jpg",
                    alt: "",
                    copyright: "",
                    title: "",
                    focus: "",
                    ext_id: null,
                    expire_at: null,
                    source: "",
                    internal_tag_ids: [],
                    locked: false,
                    is_private: false,
                    publish_at: null,
                    meta_data: {},
                    internal_tags_list: [],
                },
            ],
        });

        expect(graph).toMatchObject({
            schemaVersion: 1,
            sourceSpaceId: "source-space",
            targetSpaceId: "target-space",
            generatedAt: "2026-06-23T10:00:00.000Z",
            scope: {
                command: "copy assets",
            },
            assetFolders: [
                {
                    type: "asset_folder",
                    sourceId: 10,
                    sourcePath: "Root",
                    targetPath: "Root",
                    sourceParentId: null,
                    action: "create",
                },
                {
                    type: "asset_folder",
                    sourceId: 20,
                    sourcePath: "Root/Nested",
                    targetPath: "Root/Nested",
                    sourceParentId: 10,
                    action: "create",
                },
            ],
            assets: [
                {
                    type: "asset",
                    sourceId: 200,
                    sourceFilename:
                        "https://a.storyblok.com/f/123/nested/image.jpg",
                    targetFilename:
                        "https://a.storyblok.com/f/123/nested/image.jpg",
                    sourceAssetFolderId: 20,
                    action: "create",
                },
            ],
            warnings: [],
        });
        expect(graph.limitations).toContain("apply_not_implemented");
        expect(graph.limitations).toContain(
            "target_asset_identity_not_resolved",
        );
    });
});
