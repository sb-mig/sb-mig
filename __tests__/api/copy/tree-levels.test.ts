import { describe, it, expect } from "vitest";

import {
    collectTreeLevels,
    flattenLevels,
} from "../../../src/api/copy/tree-levels.js";

const node = (id: number, children: any[] = []) => ({
    story: { id },
    children,
});

describe("collectTreeLevels", () => {
    it("groups nodes by depth with parent links", () => {
        const tree = [
            node(1, [node(2, [node(4)]), node(3)]),
            node(5),
        ];
        const levels = collectTreeLevels(tree);
        expect(levels.map((level) => level.map((n) => n.node.story.id))).toEqual(
            [[1, 5], [2, 3], [4]],
        );
        const levelTwo = levels[1];
        expect(levelTwo[0].parent?.node.story.id).toBe(1);
        expect(levels[2][0].parent?.node.story.id).toBe(2);
        expect(levels[0][0].parent).toBeNull();
    });

    it("flattenLevels preserves parent-before-child order", () => {
        const tree = [node(1, [node(2)])];
        const flat = flattenLevels(collectTreeLevels(tree));
        expect(flat.map((n) => n.node.story.id)).toEqual([1, 2]);
    });
});
