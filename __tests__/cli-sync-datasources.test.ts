import { beforeEach, describe, expect, it, vi } from "vitest";

const syncDatasources = vi.fn();
const compare = vi.fn(({ local, external }) => ({ local, external }));
const discoverDatasources = vi.fn();
const discoverManyDatasources = vi.fn();

vi.mock("../src/api/managementApi.js", () => ({
    managementApi: {
        datasources: {
            syncDatasources,
        },
    },
}));

vi.mock("../src/cli/utils/discover.js", () => ({
    compare,
    discoverDatasources,
    discoverManyDatasources,
    LOOKUP_TYPE: {
        fileName: "fileName",
    },
    SCOPE: {
        local: "local",
        external: "external",
    },
}));

const { syncAllDatasources, syncProvidedDatasources } = await import(
    "../src/cli/datasources/sync.js"
);

const tick = async () =>
    new Promise((resolve) => {
        setTimeout(resolve, 0);
    });

const createDeferred = () => {
    let resolve!: () => void;

    const promise = new Promise<void>((promiseResolve) => {
        resolve = promiseResolve;
    });

    return { promise, resolve };
};

describe("Datasource sync CLI helpers", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        compare.mockImplementation(({ local, external }) => ({
            local,
            external,
        }));
        discoverDatasources.mockResolvedValue([]);
        discoverManyDatasources.mockResolvedValue([]);
    });

    const expectSyncHelperToAwaitDatasourceSync = async (
        syncHelper: () => Promise<void>,
    ) => {
        const deferred = createDeferred();
        let helperResolved = false;

        syncDatasources.mockImplementation(async () => {
            await deferred.promise;
        });

        const helperPromise = syncHelper().then(() => {
            helperResolved = true;
        });

        await tick();

        expect(syncDatasources).toHaveBeenCalledTimes(1);
        expect(helperResolved).toBe(false);

        deferred.resolve();
        await helperPromise;

        expect(helperResolved).toBe(true);
    };

    it("awaits datasource sync for --all", async () => {
        await expectSyncHelperToAwaitDatasourceSync(() =>
            syncAllDatasources({} as any),
        );
    });

    it("awaits datasource sync for provided datasource names", async () => {
        await expectSyncHelperToAwaitDatasourceSync(() =>
            syncProvidedDatasources({ datasources: ["colors"] }, {} as any),
        );
    });
});
