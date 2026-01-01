export default {
    name: "card",
    display_name: "Card",
    is_root: false,
    is_nestable: true,
    component_group_name: "Content",
    schema: {
        title: {
            type: "text",
            pos: 0
        },
        description: {
            type: "textarea",
            pos: 1
        },
        link: {
            type: "multilink",
            pos: 2
        }
    }
};


