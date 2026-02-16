import type { SyncRoles } from "./roles.types.js";

import { getFileContentWithRequire } from "../../utils/files.js";

import { syncRolesData } from "./roles.js";

export const syncRoles: SyncRoles = async ({ specifiedRoles }, config) => {
    const specifiedRolesContent = await Promise.all(
        specifiedRoles.map((roles) =>
            getFileContentWithRequire({ file: roles.p }),
        ),
    );

    await syncRolesData({ roles: specifiedRolesContent }, config);
};
