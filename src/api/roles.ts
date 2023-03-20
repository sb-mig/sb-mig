import Logger from "../utils/logger.js";
import storyblokConfig from "../config/config.js";
import { sbApi } from "./config.js";
import {
    LOOKUP_TYPE,
    SCOPE,
    compare,
    discoverRoles,
    discoverManyRoles,
    OneComponent,
} from "../utils/discover.js";
import { getFileContentWithRequire } from "../utils/main.js";

const { spaceId } = storyblokConfig;

// POST
export const createRole = (role: any) => {
    sbApi
        .post(`spaces/${spaceId}/space_roles/`, {
            space_role: role,
        } as any)
        .then(() => {
            Logger.success(`Role '${role.role}' has been created.`);
        })
        .catch((err) => {
            Logger.error("error happened... :(");
            console.log(
                `${err.message} in migration of ${role.role} in createRole function`
            );
        });
};

// PUT
export const updateRole = (role: any) => {
    sbApi
        .put(`spaces/${spaceId}/space_roles/${role.id}`, {
            space_role: role,
        } as any)
        .then(() => {
            Logger.success(`Role '${role.role}' has been updated.`);
        })
        .catch((err) => {
            Logger.error("error happened... :(");
            console.log(
                `${err.message} in migration of ${role.role} in updateRole function`
            );
        });
};

// GET
export const getAllRoles = async () => {
    return sbApi
        .get(`spaces/${spaceId}/space_roles/`)
        .then(({ data }) => data)
        .catch((err) => {
            if (err.response.status === 404) {
                Logger.error(
                    `There is no roles in your Storyblok ${spaceId} space.`
                );
                return true;
            } else {
                Logger.error(err);
                return false;
            }
        });
};

// GET
export const getRole = async (roleName: string | undefined) => {
    Logger.log(`Trying to get '${roleName}' role.`);

    return getAllRoles()
        .then((res) =>
            res.space_roles.filter((role: any) => role.role === roleName)
        )
        .then((res) => {
            if (Array.isArray(res) && res.length === 0) {
                Logger.warning(`There is no role named '${roleName}'`);
                return false;
            }
            return res;
        })
        .catch((err) => Logger.error(err));
};

interface SyncRoles {
    specifiedRoles: OneComponent[];
}

export const syncRoles = async ({ specifiedRoles }: SyncRoles) => {
    const specifiedRolesContent = await Promise.all(
        specifiedRoles.map((roles) =>
            getFileContentWithRequire({ file: roles.p })
        )
    );

    const { space_roles } = await getAllRoles();

    const rolesToUpdate = [];
    const rolesToCreate = [];

    for (const role of specifiedRolesContent) {
        const shouldBeUpdated = space_roles.find(
            (remoteRole: any) => role.role === remoteRole.role
        );
        if (shouldBeUpdated) {
            rolesToUpdate.push({ id: shouldBeUpdated.id, ...role });
        } else {
            rolesToCreate.push(role);
        }
    }

    rolesToUpdate.map(async (role) => {
        await updateRole(role);
    });

    rolesToCreate.map(async (role) => {
        await createRole(role);
    });
};

export const syncAllRoles = async () => {
    // #1: discover all external .roles.sb.js files
    const allLocalSbComponentsSchemaFiles = discoverRoles({
        scope: SCOPE.local,
        type: LOOKUP_TYPE.fileName,
    });
    // #2: discover all local .roles.sb.js files
    const allExternalSbComponentsSchemaFiles = discoverRoles({
        scope: SCOPE.external,
        type: LOOKUP_TYPE.fileName,
    });
    // #3: compare results, prefare local ones (so we have to create final external paths array and local array of things to sync from where)
    const { local, external } = compare({
        local: allLocalSbComponentsSchemaFiles,
        external: allExternalSbComponentsSchemaFiles,
    });

    // #4: sync - do all stuff already done (groups resolving, and so on)
    syncRoles({ specifiedRoles: [...local, ...external] });
};

export const syncProvidedRoles = ({ roles }: { roles: string[] }) => {
    // #1: discover all external .sb.js files
    const allLocalSbComponentsSchemaFiles = discoverManyRoles({
        scope: SCOPE.local,
        type: LOOKUP_TYPE.fileName,
        fileNames: roles,
    });
    // #2: discover all local .sb.js files
    const allExternalSbComponentsSchemaFiles = discoverManyRoles({
        scope: SCOPE.external,
        type: LOOKUP_TYPE.fileName,
        fileNames: roles,
    });
    // #3: compare results, prefer local ones (so we have to create final external paths array and local array of things to sync from where)
    const { local, external } = compare({
        local: allLocalSbComponentsSchemaFiles,
        external: allExternalSbComponentsSchemaFiles,
    });
    // #4: sync - do all stuff already done (groups resolving, and so on)
    syncRoles({ specifiedRoles: [...local, ...external] });
};
