import type { RequestBaseConfig } from "../utils/request.js";

export interface TreeNode {
    action: "update" | "create";
    id: number;
    parent_id: number | null;
    children?: TreeNode[];
    story: any;
}

export type Tree = TreeNode[];

export type TraverseAndCreate = (
    input: {
        tree: Tree;
        realParentId: number | null;
        defaultRoot?: any;
        spaceId: string;
    },
    config: RequestBaseConfig,
) => void;
