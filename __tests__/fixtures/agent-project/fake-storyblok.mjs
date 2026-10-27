/**
 * A Storyblok Management API stand-in for the agent tests.
 *
 * - SBMIG_FAKE_STATE   the JSON file holding the space; writes update it.
 * - SBMIG_FAKE_WRITES  every write is appended here as one JSON line.
 * - SBMIG_FAKE_FAIL    comma-separated component/datasource names whose
 *                      create or update answers 422.
 * - SBMIG_FAKE_FAULTS  a JSON object of per-request faults. A key is
 *                      "<METHOD> <route>" (route like "components/1") or
 *                      "<METHOD> <name>" (the component, group, datasource or
 *                      entry name in the body). A value is one of:
 *                        "network"          the connection drops: nothing is
 *                                           written, no answer comes back
 *                        "commit-then-504"  the write is applied, then the
 *                                           gateway answers 504
 *                        "<status>"         nothing is written, that status
 *                                           comes back (e.g. "404")
 *                      A value may also be a list, one entry per matching
 *                      request in order, the last one repeating; "ok" means
 *                      no fault (e.g. ["ok", "500"]: the first listing
 *                      answers, every later one fails).
 *
 * Two ways in: `createFakeStoryblok()` behaves like a storyblok-js-client
 * instance (the CLI tests plug it in through `sbApi`), and `createFakeFetch()`
 * is a `fetch` for the real storyblok-js-client.
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
const faults = () =>
    env("SBMIG_FAKE_FAULTS") ? JSON.parse(env("SBMIG_FAKE_FAULTS")) : {};

const route = (path) =>
    path
        .replace(/^.*\/v1\//, "")
        .replace(/^\//, "")
        .replace(/^spaces\/[^/]+\//, "")
        .replace(/\/$/, "");
const nextId = (items) => Math.max(0, ...items.map((item) => item.id)) + 1;

const nameIn = (body) =>
    body?.component?.name ??
    body?.component_group?.name ??
    body?.datasource?.name ??
    body?.datasource_entry?.name ??
    body?.preset?.name;

const calls = new Map();

const pick = (key, value) => {
    if (!Array.isArray(value)) return value;

    const index = calls.get(key) ?? 0;
    calls.set(key, index + 1);
    const chosen = value[Math.min(index, value.length - 1)];
    return chosen === "ok" ? undefined : chosen;
};

const faultFor = (method, path, body) => {
    const configured = faults();
    const name = nameIn(body);
    const byRoute = `${method} ${route(path)}`;
    const byName = name !== undefined ? `${method} ${name}` : undefined;

    if (byRoute in configured) return pick(byRoute, configured[byRoute]);
    if (byName && byName in configured) return pick(byName, configured[byName]);

    return ["POST", "PUT"].includes(method) && name && failing().has(name)
        ? "422"
        : undefined;
};

const ok = (body, extra = {}) => ({ status: 200, body, ...extra });
const status = (code, error) => ({ status: code, body: { error } });

/** Apply one request to the space. HTTP level: a status and a JSON body. */
const apply = (method, path, params = {}) => {
    const state = load();
    const [resource, id] = route(path).split("/");

    if (method === "GET") {
        const listing = (key, items) =>
            ok({ [key]: items }, { total: items.length });

        switch (resource) {
            case "components":
                return listing("components", state.components);
            case "component_groups":
                return listing("component_groups", state.component_groups);
            case "datasources":
                return listing("datasources", state.datasources);
            case "presets":
                return ok({
                    preset: state.presets.find(
                        (preset) => String(preset.id) === id,
                    ),
                });
            case "datasource_entries":
                return listing(
                    "datasource_entries",
                    state.datasource_entries
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
                                          dimension_values?.[
                                              params.dimension
                                          ] ?? null,
                                  }
                                : entry,
                        ),
                );
            default:
                return status(404, `fake: no GET route for ${path}`);
        }
    }

    const body = params;
    const write = (result) => {
        save(state);
        return result;
    };
    const indexById = (items) =>
        items.findIndex((item) => String(item.id) === id);

    if (method === "POST") {
        switch (resource) {
            case "components": {
                const component = {
                    ...body.component,
                    id: nextId(state.components),
                    all_presets: [],
                };
                state.components.push(component);
                return write(ok({ component }));
            }
            case "component_groups": {
                const group = {
                    ...body.component_group,
                    id: nextId(state.component_groups),
                    uuid: `group-${nextId(state.component_groups)}`,
                };
                state.component_groups.push(group);
                return write(ok({ component_group: group }));
            }
            case "datasources": {
                const datasource = {
                    ...body.datasource,
                    id: nextId(state.datasources),
                };
                state.datasources.push(datasource);
                return write(ok({ datasource }));
            }
            case "datasource_entries": {
                const entry = {
                    ...body.datasource_entry,
                    id: nextId(state.datasource_entries),
                };
                state.datasource_entries.push(entry);
                return write(ok({ datasource_entry: entry }));
            }
            case "presets": {
                const preset = { ...body.preset, id: nextId(state.presets) };
                state.presets.push(preset);
                return write(ok({ preset }));
            }
            default:
                return status(404, `fake: no POST route for ${path}`);
        }
    }

    if (method === "PUT") {
        switch (resource) {
            case "components": {
                const index = indexById(state.components);
                if (index < 0) return status(404, "fake: no such component");
                state.components[index] = {
                    ...state.components[index],
                    ...body.component,
                };
                return write(ok({ component: state.components[index] }));
            }
            case "datasources": {
                const index = indexById(state.datasources);
                if (index < 0) return status(404, "fake: no such datasource");
                state.datasources[index] = {
                    ...state.datasources[index],
                    ...body.datasource,
                };
                return write(ok({ datasource: state.datasources[index] }));
            }
            case "datasource_entries": {
                const index = indexById(state.datasource_entries);
                if (index < 0) return status(404, "fake: no such entry");
                state.datasource_entries[index] = {
                    ...state.datasource_entries[index],
                    ...body.datasource_entry,
                };
                // Storyblok answers an entry update with 204 No Content.
                return write({ status: 204, body: undefined });
            }
            case "presets":
                return ok({ preset: body.preset });
            default:
                return status(404, `fake: no PUT route for ${path}`);
        }
    }

    if (method === "DELETE") {
        if (resource === "components" || resource === "component_groups") {
            const index = indexById(state[resource]);
            if (index < 0) return status(404, `fake: no such ${resource}`);
            const [removed] = state[resource].splice(index, 1);
            return write(ok({ [resource.replace(/s$/, "")]: removed }));
        }
        return status(404, `fake: no DELETE route for ${path}`);
    }

    return status(405, `fake: ${method} is not supported`);
};

/**
 * One request with its fault applied. Resolves to `{ status, body, total? }`,
 * or to `{ network: Error }` when the connection drops.
 */
const handle = (method, path, params) => {
    if (method !== "GET") record(method, path, params);

    const fault = faultFor(method, path, params);

    if (fault === "network") {
        return {
            network: Object.assign(new TypeError("fetch failed"), {
                cause: Object.assign(new Error("read ECONNRESET"), {
                    code: "ECONNRESET",
                }),
            }),
        };
    }

    if (fault === "commit-then-504") {
        apply(method, path, params);
        return status(504, "Gateway Timeout");
    }

    if (fault !== undefined) {
        return status(Number(fault), `fake: refused (${fault})`);
    }

    return apply(method, path, params);
};

/**
 * What storyblok-js-client 7.2.1 does with an answer: a 2xx resolves with
 * `{ data, headers, status }`, anything else rejects with `{ message,
 * status, response }` — and a dropped connection on a write *resolves* with
 * `{ message: error }` (dist/index.js, `_methodHandler`). GETs reject on it.
 */
export const createFakeStoryblok = () => {
    const call = async (method, path, params = {}) => {
        const answer = handle(method, path, params);

        if (answer.network) {
            if (method === "GET")
                return Promise.reject({ message: answer.network });
            return { message: answer.network };
        }

        if (answer.status < 200 || answer.status > 206) {
            return Promise.reject({
                message: answer.body?.error,
                status: answer.status,
                response: {
                    status: answer.status,
                    statusText: "Error",
                    data: answer.body,
                },
            });
        }

        return {
            data: answer.body ?? {},
            ...(answer.total !== undefined
                ? { total: answer.total, perPage: 100 }
                : {}),
            status: answer.status,
        };
    };

    return {
        get: (path, params) => call("GET", path, params),
        post: (path, body) => call("POST", path, body),
        put: (path, body) => call("PUT", path, body),
        delete: (path, body) => call("DELETE", path, body),
    };
};

/** A `fetch` over the same space, for the real storyblok-js-client. */
export const createFakeFetch =
    () =>
    async (url, init = {}) => {
        const method = String(init.method ?? "GET").toUpperCase();
        const parsed = new URL(url);
        const params =
            method === "GET"
                ? Object.fromEntries(parsed.searchParams.entries())
                : init.body
                  ? JSON.parse(init.body)
                  : {};
        const answer = handle(method, parsed.pathname, params);

        if (answer.network) throw answer.network;

        return new Response(
            answer.status === 204 ? null : JSON.stringify(answer.body ?? {}),
            {
                status: answer.status,
                headers: {
                    "content-type": "application/json",
                    ...(answer.total !== undefined
                        ? { total: String(answer.total), "per-page": "100" }
                        : {}),
                },
            },
        );
    };
