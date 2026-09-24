import type {
    CreateAsset,
    CreateAssetAndFinalize,
    GetAllAssets,
    GetAssetById,
    GetAssetByName,
    MigrateAsset,
    RequestSignedUploadUrl,
    SBAsset,
    SignedUploadPayload,
    UpdateAsset,
    UploadFile,
    DownloadAsset,
    FinishAssetUpload,
} from "./assets.types.js";

import fs from "fs";
import https from "https";
import path from "path";

import FormData from "form-data";

import { createDir, isDirectoryExists } from "../../utils/files.js";
import Logger from "../../utils/logger.js";
import { errorCodeOf, errorStatusOf, withRetry } from "../../utils/retry.js";
import { getFileName, getSizeFromURL } from "../../utils/string-utils.js";
import { getAllItemsWithPagination } from "../utils/request.js";

/** Every retry says so, through the Logger, so a live progress line lends it the row. */
const logRetry = (line: string) => Logger.warning(line);

/**
 * storyblok-js-client answers a request that never got a response — a reset
 * socket, a DNS miss — by RESOLVING `{ message: <the fetch error> }` instead of
 * throwing. Left alone, that reads as a success with no data. This turns it
 * back into the thrown error it is, with the socket's own `code` kept, so the
 * retry can tell a dropped connection from a refusal.
 */
export const throwIfUnanswered = <T>(result: T): T => {
    const record = result as any;

    if (
        record !== null &&
        typeof record === "object" &&
        !("data" in record) &&
        !("status" in record) &&
        record.message !== null &&
        typeof record.message === "object"
    ) {
        const inner = record.message;
        const reason =
            (typeof inner?.cause?.message === "string"
                ? inner.cause.message
                : undefined) ??
            (typeof inner?.message === "string" ? inner.message : undefined) ??
            "the request got no answer";

        throw Object.assign(new Error(reason), {
            code: errorCodeOf(inner),
            cause: inner,
        });
    }

    return result;
};

/**
 * The only answers to the signed-URL POST worth asking again: the server
 * refused before doing anything. A socket error is NOT one of them — the POST
 * may already have created the asset record, and a second POST would leave a
 * duplicate in the target.
 */
const isRefusedBeforeCreate = (error: unknown): boolean => {
    const status = errorStatusOf(error);

    return status === 429 || status === 503;
};

const isStoryblokSize = (size: string | undefined): size is string =>
    Boolean(size && /^\d+x\d+$/i.test(size));

const prepareSignedUploadPayload = (
    payload: SignedUploadPayload,
): SignedUploadPayload => {
    const { filename, asset_folder_id, id, size, validate_upload } = payload;
    const inferredSize = isStoryblokSize(size)
        ? size
        : isStoryblokSize(getSizeFromURL(filename))
          ? getSizeFromURL(filename)
          : undefined;

    return {
        filename: getFileName(filename),
        ...(asset_folder_id === undefined || asset_folder_id === null
            ? {}
            : { asset_folder_id }),
        ...(id === undefined ? {} : { id }),
        ...(inferredSize ? { size: inferredSize } : {}),
        ...(validate_upload === undefined ? {} : { validate_upload }),
    };
};

// GET
export const getAllAssets: GetAllAssets = async (args, config) => {
    const { spaceId, search, quiet } = args;
    const { sbApi } = config;

    const assets = await getAllItemsWithPagination({
        quiet,
        apiFn: ({ per_page, page }) =>
            sbApi
                .get(`spaces/${spaceId}/assets/`, {
                    // @ts-ignore TODO: have to submit ISSUE to storyblok-js-client (in documentation it is search, in typescript its search_term STORYBLOK_ISSUE
                    search: search ? search : "",
                    per_page,
                    page,
                })
                .catch((err) => {
                    if (err.response?.status === 404) {
                        Logger.error(
                            `There is no assets in your Storyblok ${spaceId} space.`,
                        );
                        return { data: { assets: [] }, total: 0, perPage: 100 };
                    }

                    Logger.error(err);
                    throw err;
                }),
        params: {},
        itemsKey: "assets",
    });

    return { assets };
};

export const getAssetByName: GetAssetByName = async (
    { spaceId, fileName },
    config,
) => {
    const result = await getAllAssets({ spaceId, search: fileName }, config);
    if (result.assets.length === 1) {
        return result.assets[0];
    } else {
        return undefined;
    }
};

const requestSignedUploadUrl: RequestSignedUploadUrl = (
    { spaceId, payload },
    config,
) => {
    const { sbApi, debug } = config;
    const signedUploadPayload = prepareSignedUploadPayload(payload);

    // This POST creates the asset record. It is asked again only when the
    // server refused outright (429/503); any other failure is final, because
    // a second POST after a lost answer can leave a second asset behind.
    return withRetry(
        () =>
            sbApi
                .post(`spaces/${spaceId}/assets/`, signedUploadPayload)
                .then(throwIfUnanswered)
                .then((signedResponseObject) => {
                    if (debug) {
                        Logger.log(
                            `Signed upload URL has been requested for ${signedUploadPayload.filename}.`,
                        );
                    }
                    return (signedResponseObject as any as { data: any }).data; // this is very bad... but storyblok-js-client types are pretty broken
                }),
        {
            step: "signed-URL request",
            subject: signedUploadPayload.filename,
            onRetry: logRetry,
            isRetryable: isRefusedBeforeCreate,
        },
    ).catch((err) => {
        // The same line as before, and then the failure is the caller's:
        // resolving `undefined` here only moved the crash to the upload.
        Logger.log(err);
        throw err;
    });
};

const uploadFile: UploadFile = ({
    signedResponseObject,
    pathToFile,
    quiet,
}) => {
    const file = pathToFile;

    // One attempt: a fresh form every time (a submitted form's file stream is
    // spent), always to the SAME signed URL with the SAME fields — S3 accepts
    // a second upload to one signed POST, so a retry never asks Storyblok for
    // a new asset record.
    const submitOnce = () =>
        new Promise<void>((resolve, reject) => {
            const form = new FormData();

            // apply all fields from the signed response object to the second request
            for (const key in signedResponseObject.fields) {
                form.append(key, signedResponseObject.fields[key]);
            }

            // also append the file read stream
            form.append("file", fs.createReadStream(file));

            form.submit(signedResponseObject.post_url, (err, res) => {
                if (err) {
                    reject(err);
                    return;
                }

                const statusCode = res?.statusCode;
                if (statusCode === 204) {
                    if (!quiet) {
                        Logger.upload(`Asset uploaded ${getFileName(file)}`);
                    }
                    resolve();
                    return;
                }

                reject(
                    Object.assign(
                        new Error(
                            `Asset upload failed with status code ${
                                statusCode ?? "unknown"
                            }`,
                        ),
                        { status: statusCode },
                    ),
                );
            });
        });

    return withRetry(submitOnce, {
        step: "upload",
        subject: getFileName(file),
        onRetry: logRetry,
    });
};

const getSignedUploadAssetId = (signedResponseObject: any): number => {
    const assetId = Number(
        signedResponseObject?.id ?? signedResponseObject?.asset?.id,
    );

    if (!Number.isFinite(assetId)) {
        throw new Error(
            "Signed upload response did not include an asset id, so upload cannot be finalized.",
        );
    }

    return assetId;
};

const normalizeFinishedUploadAsset = (finishedUpload: any): SBAsset => {
    const asset =
        finishedUpload?.asset ?? finishedUpload?.data?.asset ?? finishedUpload;

    if (!asset?.id || !asset?.filename) {
        throw new Error(
            "Finish upload response did not include a target asset id and filename.",
        );
    }

    return asset as SBAsset;
};

export const finishAssetUpload: FinishAssetUpload = async (
    { spaceId, assetId },
    config,
) => {
    const { sbApi } = config;

    // Finishing twice is harmless (measured: the same asset answers both), so
    // a transient failure is asked again.
    return withRetry<any>(
        () =>
            (sbApi as any)
                .get(`spaces/${spaceId}/assets/${assetId}/finish_upload`, {})
                .then(throwIfUnanswered)
                .then(({ data }: any) => data),
        {
            step: "finish",
            subject: `asset ${assetId}`,
            onRetry: logRetry,
        },
    ).catch((err: any) => {
        Logger.error(err);
        throw err;
    });
};

export const downloadAsset: DownloadAsset = async (args, config) => {
    const { debug, sbmigWorkingDirectory } = config;
    const { payload, quiet } = args;
    if (!sbmigWorkingDirectory) {
        throw Error("sbmigWorkingDirectory is not defined");
    }
    const fileName = getFileName(payload.filename);
    const fileUrl = payload.filename;
    const downloadedAssetsFolder = path.join(
        sbmigWorkingDirectory,
        "downloadedAssets",
    );
    if (!quiet) {
        Logger.log(
            `Downloading ${fileName} asset ${
                debug ? `from ${fileUrl} to ${downloadedAssetsFolder}` : ""
            }`,
        );
    }

    if (!isDirectoryExists(downloadedAssetsFolder)) {
        await createDir(downloadedAssetsFolder);
    }

    const downloadOnce = () =>
        new Promise<string>((resolve, reject) => {
            const request = https.get(fileUrl, (response) => {
                const statusCode = response.statusCode ?? 0;

                // An error page is not the file: saving it would upload the
                // page as the asset. A 5xx is worth asking again; a 4xx is not.
                if (statusCode >= 400) {
                    response.resume();
                    reject(
                        Object.assign(
                            new Error(
                                `Asset download failed with status code ${statusCode}`,
                            ),
                            { status: statusCode },
                        ),
                    );
                    return;
                }

                const file = fs.createWriteStream(
                    path.join(downloadedAssetsFolder, fileName),
                );

                file.on("error", reject);
                response.on("error", reject);
                response.pipe(file);
                file.on("finish", () => {
                    file.close();
                    if (!quiet) {
                        Logger.download(
                            `Asset downloaded to ${path.join(
                                downloadedAssetsFolder,
                                fileName,
                            )}`,
                        );
                    }
                    resolve(path.join(downloadedAssetsFolder, fileName));
                });
            });

            request.on("error", reject);
        });

    return withRetry(downloadOnce, {
        step: "download",
        subject: fileName,
        onRetry: logRetry,
    }).catch((error) => {
        Logger.error(`Error downloading image: ${error?.message ?? error}`);
        // The real error, with its code: the string "error" told the caller
        // nothing and could never be retried.
        throw error;
    });
};

export const migrateAsset: MigrateAsset = async (
    { migrateTo, payload, syncDirection },
    config,
) => {
    const pathToFile = await downloadAsset({ payload }, config);
    if (syncDirection === "fromSpaceToSpace") {
        const signedResponseObject = await requestSignedUploadUrl(
            {
                spaceId: migrateTo,
                payload,
            },
            config,
        );
        if (pathToFile) {
            await uploadFile({ signedResponseObject, pathToFile });
        }
    }

    return true;
};

export const createAsset: CreateAsset = async (
    { spaceId, pathToFile, payload = {}, quiet },
    config,
) => {
    const signedResponseObject = await requestSignedUploadUrl(
        {
            spaceId,
            payload: {
                ...payload,
                filename: payload.filename ?? pathToFile,
            },
        },
        config,
    );

    await uploadFile({ signedResponseObject, pathToFile, quiet });

    return signedResponseObject;
};

export const createAssetAndFinalize: CreateAssetAndFinalize = async (
    { spaceId, pathToFile, payload = {}, quiet },
    config,
) => {
    const signedResponseObject = await createAsset(
        {
            quiet,
            spaceId,
            pathToFile,
            payload: {
                ...payload,
                filename: payload.filename ?? pathToFile,
                validate_upload: payload.validate_upload ?? 1,
            },
        },
        config,
    );
    const assetId = getSignedUploadAssetId(signedResponseObject);
    const finishedUpload = await finishAssetUpload(
        {
            spaceId,
            assetId,
        },
        config,
    );

    return normalizeFinishedUploadAsset(finishedUpload);
};

export const updateAsset: UpdateAsset = async (
    { spaceId, assetId, payload, quiet },
    config,
) => {
    const { sbApi } = config;

    if (!quiet) {
        Logger.log(`Trying to update asset with id ${assetId}.`);
    }

    return sbApi
        .put(`spaces/${spaceId}/assets/${assetId}`, payload)
        .then((res: any) => {
            if (!quiet) {
                Logger.success(`Asset '${assetId}' has been updated.`);
            }
            return res.data;
        })
        .catch((err: any) => {
            Logger.error(
                `${err.message} in updateAsset function for asset ${assetId}`,
            );
            throw err;
        });
};

// GET
export const getAssetById: GetAssetById = async (
    { spaceId, assetId },
    config,
) => {
    const { sbApi } = config;
    Logger.log(`Trying to get '${assetId}' asset.`);

    return sbApi
        .get(`spaces/${spaceId}/assets/${assetId}`)
        .then(({ data }) => data)
        .catch((err: any) => {
            // A network error has no response: read it safely, and never
            // answer for it. A 404 is "no such asset"; anything else is
            // rethrown, so a blip is never mistaken for a missing file
            // (MAR-3404).
            if (err?.response?.status === 404) {
                Logger.error(
                    `There is no assets in your Storyblok ${spaceId} space.`,
                );
                return undefined;
            }

            Logger.error(err);
            throw err;
        });
};

export const getAsset = async (assetName: string | undefined) => {
    Logger.log(`Trying to get '${assetName}' asset.`);

    // return getAllAssets()
    //     .then((res) =>
    //         res.space_roles.filter((role: any) => role.role === assetName)
    //     )
    //     .then((res) => {
    //         if (Array.isArray(res) && res.length === 0) {
    //             Logger.warning(`There is no role named '${assetName}'`);
    //             return false;
    //         }
    //         return res;
    //     })
    //     .catch((err) => Logger.error(err));
};
