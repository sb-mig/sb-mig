import type {
    AssetPayload,
    GetAllAssets,
    GetAssetById,
    GetAssetByName,
    MigrateAsset,
    RequestSignedUploadUrl,
    UploadFile,
} from "./assets.types.js";

import fs from "fs";
import https from "https";
import path from "path";

import FormData from "form-data";

import storyblokConfig from "../../config/config.js";
import { createDir, isDirectoryExists } from "../../utils/files.js";
import Logger from "../../utils/logger.js";

// GET
export const getAllAssets: GetAllAssets = async (
    { spaceId, search },
    config
) => {
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
                    `There is no assets in your Storyblok ${spaceId} space.`
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
    config
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
    config
) => {
    const { sbApi } = config;
    const {
        filename: _1,
        asset_folder_id,
        ext_id,
        space_id,
        ...restPayload
    } = payload;
    const filename = getFileName(payload.filename);
    const size = getSizeFromURL(payload.filename);
    return sbApi
        .post(`spaces/${spaceId}/assets/`, {
            filename,
            size,
            ...restPayload,
        })
        .then((signedResponseObject) => {
            if (storyblokConfig.debug) {
                Logger.log(
                    `Signed upload URL has been requested for ${filename}.`
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
    form.submit(signedResponseObject.post_url, async (err, res) => {
        const statusCode = res.statusCode;
        if (statusCode === 204) {
            Logger.upload(`Asset uploaded ${getFileName(file)}`);
        } else {
            if (err) throw err;
        }
    });
};

const getFileName = (fileUrl: string) => {
    const fileName = fileUrl.split("/").pop();
    if (fileName) {
        return fileName;
    } else {
        throw Error("File name couldn't be extracted from URL.");
    }
};

const getSizeFromURL = (fileUrl: string) => {
    const data = fileUrl.split("/");
    const sizePos = data.length - 3;
    return data[sizePos];
};

const downloadAsset = async ({ payload }: { payload: AssetPayload }) => {
    const fileName = getFileName(payload.filename);
    const fileUrl = payload.filename;
    const downloadedAssetsFolder = path.join(
        storyblokConfig.sbmigWorkingDirectory,
        "downloadedAssets"
    );
    Logger.log(
        `Downloading ${fileName} asset ${
            storyblokConfig.debug
                ? `from ${fileUrl} to ${downloadedAssetsFolder}`
                : ""
        }`
    );

    if (!isDirectoryExists(downloadedAssetsFolder)) {
        await createDir(downloadedAssetsFolder);
    }

    return new Promise<string>((resolve, reject) => {
        const file = fs.createWriteStream(
            path.join(downloadedAssetsFolder, fileName)
        );

        https
            .get(fileUrl, (response) => {
                response.pipe(file);
                file.on("finish", () => {
                    file.close();
                    Logger.download(
                        `Asset downloaded to ${path.join(
                            downloadedAssetsFolder,
                            fileName
                        )}`
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
    { migrateTo, payload },
    config
) => {
    const pathToFile = await downloadAsset({ payload });
    const signedResponseObject = await requestSignedUploadUrl(
        {
            spaceId: migrateTo,
            payload,
        },
        config
    );
    if (pathToFile) {
        await uploadFile({ signedResponseObject, pathToFile });
    }

    return true;
};

// GET
export const getAssetById: GetAssetById = async (
    { spaceId, assetId },
    config
) => {
    const { sbApi } = config;
    Logger.log(`Trying to get '${assetId}' asset.`);

    return sbApi
        .get(`spaces/${spaceId}/assets/${assetId}`)
        .then(({ data }) => data)
        .catch((err) => {
            if (err.response.status === 404) {
                Logger.error(
                    `There is no assets in your Storyblok ${spaceId} space.`
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
