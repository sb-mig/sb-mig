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

const emptyResult = () => ({
    created: [],
    updated: [],
    skipped: [],
    errors: [],
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
        syncDatasources.mockResolvedValue(emptyResult());
    });

    const expectSyncHelperToAwaitDatasourceSync = async (
        syncHelper: () => Promise<unknown>,
    ) => {
        const deferred = createDeferred();
        let helperResolved = false;

        syncDatasources.mockImplementation(async () => {
            await deferred.promise;
            return emptyResult();
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

    it("passes dry-run through for --all datasource sync", async () => {
        await syncAllDatasources({} as any, { dryRun: true });

        expect(syncDatasources).toHaveBeenCalledWith(
            {
                providedDatasources: [],
                dryRun: true,
            },
            {},
        );
    });

    it("passes dry-run through for provided datasource names", async () => {
        await syncProvidedDatasources(
            { datasources: ["colors"], dryRun: true },
            {} as any,
        );

        expect(syncDatasources).toHaveBeenCalledWith(
            {
                providedDatasources: [],
                dryRun: true,
            },
            {},
        );
    });

    it("reports a named datasource with no file as an error", async () => {
        discoverManyDatasources.mockImplementation(async ({ scope }) =>
            scope === "local"
                ? ["src/datasources/colors.sb.datasource.js"]
                : [],
        );
        compare.mockImplementation(({ local, external }) => ({
            local: local.map((p: string) => ({
                name: p.split("/").pop(),
                p,
            })),
            external,
        }));

        const result = await syncProvidedDatasources(
            { datasources: ["colors", "sizes"] },
            {} as any,
        );

        expect(result.errors).toEqual([
            {
                scope: "datasource",
                name: "sizes",
                message: "No datasource file found for 'sizes'.",
            },
        ]);
    });
});
