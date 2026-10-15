import { createFakeStoryblok } from "./fake-storyblok.mjs";

// The agent tests run the built CLI against this project. Writes go to an
// in-memory Storyblok seeded from `state.json`; nothing leaves the machine.
export default {
    spaceId: "295911465792355",
    oauthToken: "fixture-oauth-token",
    sbApi: () => createFakeStoryblok(),
    // A resolver the dry-run must apply before it compares (MAR-4104).
    resolvers: [
        {
            match: ["hero"],
            fields: {
                component_whitelist: (whitelist) => [...whitelist, "promo"],
            },
        },
    ],
};
