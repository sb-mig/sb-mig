import type { RequestBaseConfig } from "../utils/request.js";
import type { ISbResult } from "storyblok-js-client";

export interface Org {}
export interface CurrentUserResult extends ISbResult {
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

export type GetCurrentUser = (config: RequestBaseConfig) => Promise<any>;
export type HasAccessToSpace = (
    args: { spaceId: string },
    config: RequestBaseConfig,
) => Promise<boolean>;
