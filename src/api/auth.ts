import { sbApi } from "./config.js";
import storyblokConfig from "../config/config.js";
import { ISbResult } from "storyblok-js-client/src/interfaces";
import { getAllSpaces } from "./spaces.js";

interface Org {}
interface CurrentUserResult extends ISbResult {
    data: {
        user: {
            userid: string;
            email: string;
            organization: string;
            username?: string;
            use_username: boolean;
            alt_email: string;
            firstname: string;
            lastname: string;
            phone?: number;
            id: number;
            login_strategy: "password" | string;
            created_at: string;
            org_role: "member" | string;
            has_org: boolean;
            has_partner: boolean;
            org: Org[];
            timezone: "UTC" | string;
            avatar?: any;
            friendly_name: string;
            notified: any[];
            lang: string;
            partner_role: "partner_owner" | string;
            favourite_spaces: any[];
            role: "sso" | string;
            beta_user: boolean;
            track_statistics: boolean;
            is_editor: boolean;
            sso: boolean;
            job_role?: any;
        };
    };
}

export const getCurrentUser = async () => {
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

export const hasAccessToSpace = async ({ spaceId }: { spaceId: string }) => {
    const allSpaces = await getAllSpaces();
    const hasAccess = allSpaces.find(
        (space) => Number(space.id) === Number(spaceId)
    );

    return !!hasAccess;
};
