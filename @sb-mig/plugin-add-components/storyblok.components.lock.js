module.exports = {
    "@ef-sbc/web-ui-blockquote": {
        name: "@ef-sbc/web-ui-blockquote",
        scope: "@ef-sbc",
        location: "node_modules",
        locationPath: "node_modules/@ef-sbc/web-ui-blockquote",
        isInstalled: false,
        isLinkedInComponentFile: true,
        isComponentStyleImported: false,
        links: {
            "src/components/components.js": {
                "// --- sb-mig scoped component imports ---": `import * as ScopedWebUiBlockquote from "@ef-sbc/web-ui-blockquote";`,
                "// --- sb-mig scoped component list ---": `ScopedWebUiBlockquote.ComponentList`,
            },
            "src/styles/_ef-sbc.scss": {
                "// --- sb-mig scoped component styles imports ---": `@import '@ef-sbc/web-ui-blockquote/src/web-ui-blockquote.scss';`,
            },
        },
    },
    "@ef-sbc/web-ui-button": {
        name: "@ef-sbc/web-ui-button",
        scope: "@ef-sbc",
        location: "node_modules",
        locationPath: "node_modules/@ef-sbc/web-ui-button",
        isInstalled: false,
        isLinkedInComponentFile: true,
        isComponentStyleImported: false,
        links: {
            "src/components/components.js": {
                "// --- sb-mig scoped component imports ---": `import * as ScopedWebUiButton from "@ef-sbc/web-ui-button";`,
                "// --- sb-mig scoped component list ---": `ScopedWebUiButton.ComponentList`,
            },
        },
    },
    "@ef-sbc/web-ui-card": {
        name: "@ef-sbc/web-ui-card",
        scope: "@ef-sbc",
        location: "local",
        locationPath: "src/components/web-ui-card",
        isInstalled: false,
        isLinkedInComponentFile: true,
        isComponentStyleImported: false,
        links: {
            "src/components/components.js": {
                "// --- sb-mig scoped component imports ---": `import * as ScopedWebUiCard from "./web-ui-card";`,
                "// --- sb-mig scoped component list ---": `ScopedWebUiCard.ComponentList`,
            },
        },
    },
    "@ef-sbc/web-ui-section": {
        name: "@ef-sbc/web-ui-section",
        scope: "@ef-sbc",
        location: "node_modules",
        locationPath: "node_modules/@ef-sbc/web-ui-section",
        isInstalled: false,
        isLinkedInComponentFile: true,
        isComponentStyleImported: false,
        links: {
            "src/components/components.js": {
                "// --- sb-mig scoped component imports ---": `import * as ScopedWebUiSection from "@ef-sbc/web-ui-section";`,
                "// --- sb-mig scoped component list ---": `ScopedWebUiSection.ComponentList`,
            },
            "src/styles/_ef-sbc.scss": {
                "// --- sb-mig scoped component styles imports ---": `@import '@ef-sbc/web-ui-section/src/web-ui-section.scss';`,
            },
        },
    },
};
