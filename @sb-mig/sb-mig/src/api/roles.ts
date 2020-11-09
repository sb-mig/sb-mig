import Logger from "../utils/logger";
import storyblokConfig from "../config/config";
import { sbApi } from "./apiConfig";
import {
    LOOKUP_TYPE,
    SCOPE,
    discoverManyDatasources,
    discoverDatasources,
    getFilesContent,
} from "../utils/discover2";

const { spaceId } = storyblokConfig;

// GET
export const getAllRoles = async () => {
  return sbApi
        .get(`spaces/${spaceId}/space_roles/`)
        .then(({ data }) => {
          // console.log("this is data from roles endpoint: ", data)
          console.log("this is data for 2 role user");
          console.log(data.space_roles[1])
          return data
        })
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

export const syncAllRoles = async () => {
  const allRoles = await getAllRoles()
  // console.log("this is what is returned from getAllRoles: ", allRoles)
}

