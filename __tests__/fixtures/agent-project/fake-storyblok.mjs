/**
 * A Storyblok Management API stand-in for the agent tests.
 *
 * - SBMIG_FAKE_STATE   the JSON file holding the space; writes update it.
 * - SBMIG_FAKE_WRITES  every write is appended here as one JSON line.
 * - SBMIG_FAKE_FAIL    comma-separated component/datasource names whose
 *                      create or update answers 422.
 */
import fs from "node:fs";

const env = (name) => process.env[name] ?? "";

const load = () => JSON.parse(fs.readFileSync(env("SBMIG_FAKE_STATE"), "utf8"));
const save = (state) =>
    fs.writeFileSync(env("SBMIG_FAKE_STATE"), JSON.stringify(state, null, 2));
const record = (method, path, body) => {
    if (env("SBMIG_FAKE_WRITES")) {
        fs.appendFileSync(
            env("SBMIG_FAKE_WRITES"),
            `${JSON.stringify({ method, path, body })}\n`,
        );
    }
};
const failing = () =>
    new Set(env("SBMIG_FAKE_FAIL").split(",").filter(Boolean));

const listing = (key, items) => ({
    data: { [key]: items },
    total: items.length,
    perPage: 100,
});

// The shape storyblok-js-client rejects with: a plain object, not an Error.
const rejection = (status, error) =>
    Promise.reject({
        message: error,
        status,
        response: {
            status,
            statusText: "Unprocessable Entity",
            data: { error },
        },
    });

const route = (path) => path.replace(/^spaces\/[^/]+\//, "").replace(/\/$/, "");
const nextId = (items) => Math.max(0, ...items.map((item) => item.id)) + 1;

export const createFakeStoryblok = () => ({
    async get(path, params = {}) {
        const state = load();
        const [resource, id] = route(path).split("/");

        switch (resource) {
            case "components":
                return listing("components", state.components);
            case "component_groups":
                return listing("component_groups", state.component_groups);
            case "datasources":
                return listing("datasources", state.datasources);
            case "presets":
                return {
                    data: {
                        preset: state.presets.find(
                            (preset) => String(preset.id) === id,
                        ),
                    },
                };
            case "datasource_entries": {
                const entries = state.datasource_entries
                    .filter(
                        (entry) =>
                            String(entry.datasource_id) ===
                            String(params.datasource_id),
                    )
                    .map(({ dimension_values, ...entry }) =>
                        params.dimension
                            ? {
                                  ...entry,
                                  dimension_value:
                                      dimension_values?.[params.dimension] ??
                                      null,
                              }
                            : entry,
                    );
                return listing("datasource_entries", entries);
            }
            default:
                return rejection(404, `fake: no GET route for ${path}`);
        }
    },

    async post(path, body) {
        record("POST", path, body);
        const state = load();
        const resource = route(path);

        if (resource === "components") {
            if (failing().has(body.component.name)) {
                return rejection(
                    422,
                    `fake: '${body.component.name}' is refused`,
                );
            }
            const component = {
                ...body.component,
                id: nextId(state.components),
                all_presets: [],
            };
            state.components.push(component);
            save(state);
            return { data: { component } };
        }

        if (resource === "component_groups") {
            const group = {
                ...body.component_group,
                id: nextId(state.component_groups),
                uuid: `group-${nextId(state.component_groups)}`,
            };
            state.component_groups.push(group);
            save(state);
            return { data: { component_group: group } };
        }

        if (resource === "datasources") {
            if (failing().has(body.datasource.name)) {
                return rejection(
                    422,
                    `fake: '${body.datasource.name}' is refused`,
                );
            }
            const datasource = {
                ...body.datasource,
                id: nextId(state.datasources),
            };
            state.datasources.push(datasource);
            save(state);
            return { data: { datasource } };
        }

        if (resource === "datasource_entries") {
            const entry = {
                ...body.datasource_entry,
                id: nextId(state.datasource_entries),
            };
            state.datasource_entries.push(entry);
            save(state);
            return { data: { datasource_entry: entry } };
        }

        if (resource === "presets") {
            const preset = { ...body.preset, id: nextId(state.presets) };
            state.presets.push(preset);
            save(state);
            return { data: { preset } };
        }

        return rejection(404, `fake: no POST route for ${path}`);
    },

    async put(path, body) {
        record("PUT", path, body);
        const state = load();
        const [resource, id] = route(path).split("/");

        if (resource === "components") {
            if (failing().has(body.component.name)) {
                return rejection(
                    422,
                    `fake: '${body.component.name}' is refused`,
                );
            }
            const index = state.components.findIndex(
                (component) => String(component.id) === id,
            );
            state.components[index] = {
                ...state.components[index],
                ...body.component,
            };
            save(state);
            return { data: { component: state.components[index] } };
        }

        if (resource === "datasources") {
            if (failing().has(body.datasource.name)) {
                return rejection(
                    422,
                    `fake: '${body.datasource.name}' is refused`,
                );
            }
            const index = state.datasources.findIndex(
                (datasource) => String(datasource.id) === id,
            );
            state.datasources[index] = {
                ...state.datasources[index],
                ...body.datasource,
            };
            save(state);
            return { data: { datasource: state.datasources[index] } };
        }

        if (resource === "datasource_entries") {
            const index = state.datasource_entries.findIndex(
                (entry) => String(entry.id) === id,
            );
            state.datasource_entries[index] = {
                ...state.datasource_entries[index],
                ...body.datasource_entry,
            };
            save(state);
            return { data: {} };
        }

        if (resource === "presets") {
            return { data: { preset: body.preset } };
        }

        return rejection(404, `fake: no PUT route for ${path}`);
    },

    async delete(path) {
        record("DELETE", path);
        const state = load();
        const [resource, id] = route(path).split("/");

        if (resource === "components" || resource === "component_groups") {
            state[resource] = state[resource].filter(
                (item) => String(item.id) !== id,
            );
            save(state);
            return { data: {} };
        }

        return rejection(404, `fake: no DELETE route for ${path}`);
    },
});
