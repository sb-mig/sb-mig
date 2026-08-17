export type LevelNode = {
    node: any;
    parent: LevelNode | null;
    targetId: number | null;
    skippedBranch: boolean;
};

export const collectTreeLevels = (tree: any[]): LevelNode[][] => {
    const levels: LevelNode[][] = [];
    let current: LevelNode[] = tree.map((node) => ({
        node,
        parent: null,
        targetId: null,
        skippedBranch: false,
    }));

    while (current.length > 0) {
        levels.push(current);
        current = current.flatMap((parent) =>
            (parent.node.children ?? []).map((child: any) => ({
                node: child,
                parent,
                targetId: null,
                skippedBranch: false,
            })),
        );
    }

    return levels;
};

export const flattenLevels = (levels: LevelNode[][]): LevelNode[] =>
    levels.flat();
