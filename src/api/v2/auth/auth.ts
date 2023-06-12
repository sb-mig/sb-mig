import type {
    CurrentUserResult,
    GetCurrentUser,
    HasAccessToSpace,
} from "./auth.types.js";

import { getAllSpaces } from "../spaces/spaces.js";

export const getCurrentUser: GetCurrentUser = async (config) => {
    const { sbApi } = config;
    console.log("Trying to get current user current OAuthToken");

    const currentUser = await sbApi
        .get(`users/me`, {
            per_page: 100,
        })
        .then((res: CurrentUserResult) => {
            return res.data.user as CurrentUserResult["data"]["user"];
        })
        .catch((err) => {
            console.error(err);
            return err;
        });

    return currentUser;
};

export const hasAccessToSpace: HasAccessToSpace = async (args, config) => {
    const { spaceId } = args;
    const allSpaces = await getAllSpaces(config);
    const hasAccess = allSpaces.find(
        (space) => Number(space.id) === Number(spaceId)
    );

    return !!hasAccess;
};
