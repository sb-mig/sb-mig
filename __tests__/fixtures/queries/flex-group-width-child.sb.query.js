const hasValue = (value) =>
    value !== undefined && value !== null && value !== "";

const directArrayChildren = (node) =>
    Object.values(node)
        .filter(Array.isArray)
        .flat()
        .filter((item) => item && typeof item === "object" && item.component);

export default {
    name: "flex-group-width-child",
    description:
        "Find flex groups with vertical or reverse direction and children with width.",

    match(node) {
        if (node.component !== "flex-group") {
            return null;
        }

        if (!["vertical", "reverse"].includes(node.direction)) {
            return null;
        }

        const childrenWithWidth = directArrayChildren(node).filter((child) =>
            hasValue(child.width),
        );

        if (childrenWithWidth.length === 0) {
            return null;
        }

        return {
            childMatches: childrenWithWidth.length,
            matchingChildUids: childrenWithWidth.map((child) => child._uid),
        };
    },
};
