import type { ApiClient } from "../../src/api-v2/client.js";

import { describe, it, expect, beforeEach } from "vitest";


import { configToClient } from "../../src/api-v2/requestConfig.js";
import {
    getAllRoles,
    getRole,
    createRole,
    updateRole,
    syncRoles,
} from "../../src/api-v2/roles/index.js";
import {
    createMockApiConfig,
    createMockRole,
    createPaginatedResponse,
    type MockStoryblokClient,
} from "../mocks/storyblokClient.mock.js";

describe("api-v2/roles", () => {
    let client: ApiClient;
    let sbApi: MockStoryblokClient;

    beforeEach(() => {
        client = configToClient(createMockApiConfig({ spaceId: "777" }));
        sbApi = client.sbApi as unknown as MockStoryblokClient;
    });

    describe("getAllRoles", () => {
        it("fetches space_roles for the client's space", async () => {
            const roles = [createMockRole({ role: "Editor" })];
            sbApi.get.mockResolvedValue(
                createPaginatedResponse(roles, "space_roles"),
            );

            const result = await getAllRoles(client);

            expect(sbApi.get).toHaveBeenCalledWith(
                "spaces/777/space_roles/",
                expect.objectContaining({ per_page: 100, page: 1 }),
            );
            expect(result).toEqual(roles);
        });

        it("returns an empty list when the space has no roles (404)", async () => {
            sbApi.get.mockRejectedValue({ response: { status: 404 } });

            const result = await getAllRoles(client);

            expect(result).toEqual([]);
        });
    });

    describe("getRole", () => {
        it("returns the matching role", async () => {
            const editor = createMockRole({ role: "Editor" });
            const admin = createMockRole({ role: "Admin" });
            sbApi.get.mockResolvedValue(
                createPaginatedResponse([editor, admin], "space_roles"),
            );

            const result = await getRole(client, "Admin");

            expect(result).toEqual([admin]);
        });

        it("returns false when no role matches", async () => {
            sbApi.get.mockResolvedValue(
                createPaginatedResponse(
                    [createMockRole({ role: "Editor" })],
                    "space_roles",
                ),
            );

            const result = await getRole(client, "Nope");

            expect(result).toBe(false);
        });
    });

    describe("createRole / updateRole", () => {
        it("POSTs a new role wrapped in space_role", async () => {
            sbApi.post.mockResolvedValue({ data: { space_role: { id: 1 } } });

            await createRole(client, { role: "Editor" });

            expect(sbApi.post).toHaveBeenCalledWith("spaces/777/space_roles/", {
                space_role: { role: "Editor" },
            });
        });

        it("PUTs an existing role by id", async () => {
            sbApi.put.mockResolvedValue({ data: {} });

            await updateRole(client, { id: 42, role: "Editor" });

            expect(sbApi.put).toHaveBeenCalledWith("spaces/777/space_roles/42", {
                space_role: { id: 42, role: "Editor" },
            });
        });
    });

    describe("syncRoles", () => {
        beforeEach(() => {
            // remote space already has an "Editor" role
            sbApi.get.mockResolvedValue(
                createPaginatedResponse(
                    [createMockRole({ id: 10, role: "Editor" })],
                    "space_roles",
                ),
            );
            sbApi.post.mockResolvedValue({ data: {} });
            sbApi.put.mockResolvedValue({ data: {} });
        });

        it("updates existing, creates new, skips invalid", async () => {
            const result = await syncRoles(client, {
                roles: [
                    { role: "Editor" }, // exists -> update
                    { role: "Reviewer" }, // new -> create
                    { foo: "bar" }, // invalid -> skip
                ],
            });

            expect(result.updated).toEqual(["Editor"]);
            expect(result.created).toEqual(["Reviewer"]);
            expect(result.skipped).toEqual(["unknown"]);
            expect(result.errors).toEqual([]);
            expect(sbApi.put).toHaveBeenCalledTimes(1);
            expect(sbApi.post).toHaveBeenCalledTimes(1);
        });

        it("does not write in dryRun mode but still reports the plan", async () => {
            const result = await syncRoles(client, {
                roles: [{ role: "Editor" }, { role: "Reviewer" }],
                dryRun: true,
            });

            expect(result.updated).toEqual(["Editor"]);
            expect(result.created).toEqual(["Reviewer"]);
            expect(sbApi.put).not.toHaveBeenCalled();
            expect(sbApi.post).not.toHaveBeenCalled();
        });
    });
});
