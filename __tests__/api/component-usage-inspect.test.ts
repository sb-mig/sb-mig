import type { ComponentUsageQuery } from "../../src/api/inspect/component-usage.types.js";

import path from "path";

import { describe, expect, it } from "vitest";

import { loadComponentUsageQueryFromPath } from "../../src/api/inspect/component-usage-query.js";
import {
    inspectFetchedStories,
    inspectStoryContent,
} from "../../src/api/inspect/component-usage.js";

const story = {
    id: 100,
    name: "Home",
    slug: "home",
    full_slug: "home",
    is_folder: false,
    content: {
        _uid: "root",
        component: "page",
        body: [
            {
                _uid: "flex-1",
                component: "flex-group",
                direction: "vertical",
                body: [
                    {
                        _uid: "child-1",
                        component: "teaser",
                        width: "1/2",
                    },
                    {
                        _uid: "child-2",
                        component: "teaser",
                        width: "",
                    },
                ],
            },
            {
                _uid: "flex-2",
                component: "flex-group",
                direction: "horizontal",
                body: [
                    {
                        _uid: "child-3",
                        component: "teaser",
                        width: "1/3",
                    },
                ],
            },
        ],
    },
};

describe("component usage inspection", () => {
    it("walks nested Storyblok components and reports matcher details", async () => {
        const query: ComponentUsageQuery = {
            name: "flex-group-width-child",
            match(node) {
                if (node.component !== "flex-group") {
                    return null;
                }

                const children = Array.isArray(node.body) ? node.body : [];
                const childrenWithWidth = children.filter(
                    (child) => child.width,
                );

                if (
                    node.direction !== "vertical" ||
                    childrenWithWidth.length === 0
                ) {
                    return null;
                }

                return {
                    childMatches: childrenWithWidth.length,
                };
            },
        };

        const matches = await inspectStoryContent({ story, query });

        expect(matches).toEqual([
            {
                storyId: 100,
                storyName: "Home",
                storySlug: "home",
                storyFullSlug: "home",
                component: "flex-group",
                uid: "flex-1",
                path: "content.body[0]",
                parentComponent: "page",
                parentUid: "root",
                details: {
                    childMatches: 1,
                },
            },
        ]);
    });

    it("builds report totals and skips folders", async () => {
        const query: ComponentUsageQuery = {
            name: "all-flex",
            match(node) {
                return node.component === "flex-group";
            },
        };

        const report = await inspectFetchedStories({
            stories: [
                { story },
                {
                    story: {
                        id: 200,
                        name: "Folder",
                        slug: "folder",
                        full_slug: "folder",
                        is_folder: true,
                        content: {
                            component: "folder",
                        },
                    },
                },
            ],
            query,
            spaceId: "12345",
            filters: { all: true },
        });

        expect(report.queryName).toBe("all-flex");
        expect(report.spaceId).toBe("12345");
        expect(report.filters).toEqual({ all: true });
        expect(report.totals).toEqual({
            storiesScanned: 1,
            storiesMatched: 1,
            matches: 2,
        });
        expect(report.matches.map((match) => match.uid)).toEqual([
            "flex-1",
            "flex-2",
        ]);
    });

    it("loads a JS query file and applies the ticket query behavior", async () => {
        const queryPath = path.resolve(
            process.cwd(),
            "__tests__/fixtures/queries/flex-group-width-child.sb.query.js",
        );
        const query = await loadComponentUsageQueryFromPath(queryPath);
        const matches = await inspectStoryContent({ story, query });

        expect(query.name).toBe("flex-group-width-child");
        expect(matches).toHaveLength(1);
        expect(matches[0]?.details).toEqual({
            childMatches: 1,
            matchingChildUids: ["child-1"],
        });
    });
});
