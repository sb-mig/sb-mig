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
import { getFileName, getSizeFromURL } from "../../utils/string-utils.js";

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
    const { spaceId, search } = args;
    const { sbApi } = config;

    return sbApi
        .get(`spaces/${spaceId}/assets/`, {
            // @ts-ignore TODO: have to submit ISSUE to storyblok-js-client (in documentation it is search, in typescript its search_term STORYBLOK_ISSUE
            search: search ? search : "",
            per_page: 100, // need to do pagination here probably
        })
        .then(({ data }) => data)
        .catch((err) => {
            if (err.response.status === 404) {
                Logger.error(
                    `There is no assets in your Storyblok ${spaceId} space.`,
                );
                return true;
            } else {
                Logger.error(err);
                return false;
            }
        });
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
    return sbApi
        .post(`spaces/${spaceId}/assets/`, signedUploadPayload)
        .then((signedResponseObject) => {
            if (debug) {
                Logger.log(
                    `Signed upload URL has been requested for ${signedUploadPayload.filename}.`,
                );
            }
            return (signedResponseObject as any as { data: any }).data; // this is very bad... but storyblok-js-client types are pretty broken
        })
        .catch((err) => {
            console.log(err);
        });
};

const uploadFile: UploadFile = ({ signedResponseObject, pathToFile }) => {
    const file = pathToFile;
    const form = new FormData();

    // apply all fields from the signed response object to the second request
    for (const key in signedResponseObject.fields) {
        form.append(key, signedResponseObject.fields[key]);
    }

    // also append the file read stream
    form.append("file", fs.createReadStream(file));

    // submit your form
    return new Promise<void>((resolve, reject) => {
        form.submit(signedResponseObject.post_url, (err, res) => {
            if (err) {
                reject(err);
                return;
            }

            const statusCode = res?.statusCode;
            if (statusCode === 204) {
                Logger.upload(`Asset uploaded ${getFileName(file)}`);
                resolve();
                return;
            }

            reject(
                new Error(
                    `Asset upload failed with status code ${
                        statusCode ?? "unknown"
                    }`,
                ),
            );
        });
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

export const finishAssetUpload: FinishAssetUpload = async (
    { spaceId, assetId },
    config,
) => {
    const { sbApi } = config;

    return (sbApi as any)
        .get(`spaces/${spaceId}/assets/${assetId}/finish_upload`, {})
        .then(({ data }: any) => data)
        .catch((err: any) => {
            Logger.error(err);
            throw err;
        });
};

export const downloadAsset: DownloadAsset = async (args, config) => {
    const { debug, sbmigWorkingDirectory } = config;
    const { payload } = args;
    if (!sbmigWorkingDirectory) {
        throw Error("sbmigWorkingDirectory is not defined");
    }
    const fileName = getFileName(payload.filename);
    const fileUrl = payload.filename;
    const downloadedAssetsFolder = path.join(
        sbmigWorkingDirectory,
        "downloadedAssets",
    );
    Logger.log(
        `Downloading ${fileName} asset ${
            debug ? `from ${fileUrl} to ${downloadedAssetsFolder}` : ""
        }`,
    );

    if (!isDirectoryExists(downloadedAssetsFolder)) {
        await createDir(downloadedAssetsFolder);
    }

    return new Promise<string>((resolve, reject) => {
        const file = fs.createWriteStream(
            path.join(downloadedAssetsFolder, fileName),
        );

        https
            .get(fileUrl, (response) => {
                response.pipe(file);
                file.on("finish", () => {
                    file.close();
                    Logger.download(
                        `Asset downloaded to ${path.join(
                            downloadedAssetsFolder,
                            fileName,
                        )}`,
                    );
                    resolve(path.join(downloadedAssetsFolder, fileName));
                });
            })
            .on("error", (error) => {
                Logger.error(`Error downloading image: ${error.message}`);
                reject("error");
            });
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
    { spaceId, pathToFile, payload = {} },
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

    await uploadFile({ signedResponseObject, pathToFile });

    return signedResponseObject;
};

export const createAssetAndFinalize: CreateAssetAndFinalize = async (
    { spaceId, pathToFile, payload = {} },
    config,
) => {
    const signedResponseObject = await createAsset(
        {
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

    return finishedUpload.asset as SBAsset;
};

export const updateAsset: UpdateAsset = async (
    { spaceId, assetId, payload },
    config,
) => {
    const { sbApi } = config;
    Logger.log(`Trying to update asset with id ${assetId}.`);

    return sbApi
        .put(`spaces/${spaceId}/assets/${assetId}`, payload)
        .then((res: any) => {
            Logger.success(`Asset '${assetId}' has been updated.`);
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
        .catch((err) => {
            if (err.response.status === 404) {
                Logger.error(
                    `There is no assets in your Storyblok ${spaceId} space.`,
                );
                return true;
            } else {
                Logger.error(err);
                return false;
            }
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
