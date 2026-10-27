import type { RequestBaseConfig } from "../utils/request.js";

import Logger from "../../utils/logger.js";
import { isWritten } from "../utils/write-response.js";

import { getComponentPresets } from "./componentPresets.js";
import { createPreset, createPresetOrThrow, updatePreset } from "./presets.js";

// Ids and timestamps belong to the space a file was exported from; a create
// payload must never carry them into the target space.
const REMOTE_ONLY_FIELDS = ["id", "space_id", "created_at", "updated_at"];

const stripRemoteIdentity = (source: any): any => {
    const payload = { ...source };
    for (const field of REMOTE_ONLY_FIELDS) {
        delete payload[field];
    }
    return payload;
};

type CreatePresetFn = (preset: any, config: RequestBaseConfig) => Promise<any>;

/**
 * Create or update a component's presets, matched to the remote ones by
 * name. Undefined when the component has no presets.
 */
const writePresets = async (
    res: any,
    all_presets: any,
    component: any,
    config: RequestBaseConfig,
    create: CreatePresetFn,
) => {
    const componentId = res.data.component.id;

    if (!(all_presets && all_presets.length > 0)) {
        Logger.warning("There are no presets for this component.");
        return undefined;
    }

    const all_presets_modified = all_presets.map((p: any) => {
        return { preset: { ...p.preset, component_id: componentId } };
    });
    Logger.log(`Checking preset for '${component.name}' component`);

    const allRemoteComponentPresets = await getComponentPresets(
        component.name,
        config,
    );

    const presetsToUpdate: any[] = [];
    const presetsToCreate: any[] = [];

    for (const componentPreset of all_presets_modified) {
        const shouldBeUpdated: any =
            allRemoteComponentPresets &&
            allRemoteComponentPresets.find(
                (remotePreset: any) =>
                    componentPreset.preset.name === remotePreset.preset.name,
            );
        if (shouldBeUpdated) {
            presetsToUpdate.push({
                ...componentPreset,
                // Spread first: a stale local preset id must never win over
                // the id of the remote preset we are updating.
                preset: {
                    ...componentPreset.preset,
                    id: shouldBeUpdated.preset.id,
                },
            });
        } else {
            presetsToCreate.push({
                ...componentPreset,
                preset: stripRemoteIdentity(componentPreset.preset),
            });
        }
    }

    const updated = await Promise.all(
        presetsToUpdate.map((preset) => {
            return updatePreset({ p: preset }, config);
        }),
    );

    const created = await Promise.allSettled(
        presetsToCreate.map((preset) => {
            return create(preset, config);
        }),
    );

    return {
        created: created.map((outcome, index) => ({
            name: String(presetsToCreate[index]?.preset?.name ?? "unknown"),
            outcome,
        })),
        updated,
    };
};

const _resolvePresets = async (
    res: any,
    all_presets: any,
    component: any,
    config: RequestBaseConfig,
) => {
    const written = await writePresets(
        res,
        all_presets,
        component,
        config,
        createPreset,
    );

    if (!written) return [];

    return [
        ...written.created.map(({ outcome }) =>
            outcome.status === "fulfilled" ? outcome.value : undefined,
        ),
        written.updated,
    ];
};

export type PresetFailure = { name: string; error: unknown };

/**
 * For the component sync: the same writes as `_resolvePresets`, but every
 * preset that could not be written comes back as a failure instead of a
 * log line. Never throws.
 */
export const resolvePresetsForSync = async (
    res: any,
    all_presets: any,
    component: any,
    config: RequestBaseConfig,
): Promise<PresetFailure[]> => {
    try {
        const written = await writePresets(
            res,
            all_presets,
            component,
            config,
            createPresetOrThrow,
        );

        if (!written) return [];

        return [
            ...written.created.flatMap(({ name, outcome }) =>
                outcome.status === "rejected"
                    ? [{ name, error: outcome.reason }]
                    : [],
            ),
            // updatePreset resolves `{ ok, data }`; a dropped connection
            // still says ok, so the answer itself is checked too.
            ...written.updated.flatMap((result: any) =>
                result?.ok === false
                    ? [{ name: String(result.name), error: result.error }]
                    : !isWritten(result?.data)
                      ? [
                            {
                                name: String(result?.name ?? "unknown"),
                                error: new Error(
                                    `update preset '${result?.name}': no confirmation from Storyblok${result?.data?.message ? ` (${String(result.data.message?.message ?? result.data.message)})` : ""}`,
                                ),
                            },
                        ]
                      : [],
            ),
        ];
    } catch (error) {
        Logger.error(
            `Unable to sync presets for '${component.name}': ${error instanceof Error ? error.message : String(error)}`,
        );
        return [{ name: "(all presets)", error }];
    }
};

export default _resolvePresets;
