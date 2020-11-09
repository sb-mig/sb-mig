import Logger from "../utils/logger";
import storyblokConfig from "../config/config";
import { sbApi } from "./apiConfig";
import {
    LOOKUP_TYPE,
    SCOPE,
    discoverManyDatasources,
    discoverDatasources,
    getFilesContent,
    compare,
    discoverRoles,
} from "../utils/discover2";

const { spaceId } = storyblokConfig;

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
            } else {
                Logger.error(err);
                return false;
            }
        });
}

// GET
export const getRole = async (roleName: string) => {
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
}

export const syncAllRoles = async () => {
  // #1: discover all external .roles.sb.js files
  const allLocalSbComponentsSchemaFiles = discoverRoles({
    scope: SCOPE.local,
    type: LOOKUP_TYPE.fileName,
});
console.log("allLocalSbComponentsSchemaFiles", allLocalSbComponentsSchemaFiles)
// #2: discover all local .roles.sb.js files
const allExternalSbComponentsSchemaFiles = discoverRoles({
    scope: SCOPE.external,
    type: LOOKUP_TYPE.fileName,
});
console.log("allExternalSbComponentsSchemaFiles", allExternalSbComponentsSchemaFiles)
// #3: compare results, prefare local ones (so we have to create final external paths array and local array of things to sync from where)
const { local, external } = compare({
    local: allLocalSbComponentsSchemaFiles,
    external: allExternalSbComponentsSchemaFiles,
});

// #4: sync - do all stuff already done (groups resolving, and so on)
// TODO:
console.log({local, external})

  // const allRoles = await getAllRoles()
  // console.log("this is what is returned from getAllRoles: ", allRoles)
}

