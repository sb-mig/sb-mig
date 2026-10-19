export default {
    name: "hero",
    display_name: "Hero",
    is_root: false,
    is_nestable: true,
    component_group_name: "Content",
    schema: {
        title: { type: "text", pos: 0 },
        headline: { type: "text", pos: 1 },
        items: {
            type: "bloks",
            pos: 2,
            restrict_components: true,
            component_whitelist: ["card"],
        },
    },
};
