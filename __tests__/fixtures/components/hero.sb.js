export default {
    name: "hero",
    display_name: "Hero",
    is_root: true,
    is_nestable: false,
    schema: {
        title: {
            type: "text",
            pos: 0
        },
        subtitle: {
            type: "text",
            pos: 1
        },
        image: {
            type: "asset",
            filetypes: ["images"],
            pos: 2
        }
    }
};


