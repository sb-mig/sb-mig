import Logger from '../utils/logger'
import storyblokConfig from '../config/config'
import { sbApi } from './apiConfig'
import { findDatasources } from '../utils/discover'

const { spaceId } = storyblokConfig;

// GET
export const getAllDatasources = () => {
    Logger.log("Trying to get all Datasources.")

    return sbApi
        .get(`spaces/${spaceId}/datasources/`)
        .then(({ data }) => data)
        .catch(err => {
            if (err.response.status === 404) {
                Logger.error(
                    `There is no datasources in your Storyblok ${spaceId} space.`
                )
            } else {
                Logger.error(err)
                return false
            }
        })
}

export const getDatasource = (datasourceName: string) => {
    Logger.log(`Trying to get '${datasourceName}' datasource.`)

    return getAllDatasources()
        .then(res => {
            if (res) {
                return res.datasources.filter(
                    (datasource: any) => datasource.name === datasourceName
                )
            }
        })
        .then(res => {
            if (Array.isArray(res) && res.length === 0) {
                Logger.warning(`There is no datasource named '${datasourceName}'`)
                return false
            }
            return res
        })
        .catch(err => Logger.error(err))
}

export const getDatasourceEntries = async (datasourceName: string) => {
    Logger.log(`Trying to get '${datasourceName}' datasource entries.`)

    const data = await getDatasource(datasourceName)

    if (data) {
        return sbApi
            .get(`spaces/${spaceId}/datasource_entries/?datasource_id=${data[0].id}`)
            .then(async ({ data }) => data)
            .catch(err => Logger.error(err))
    }
}

export const createDatasource = (datasource: any) =>
    sbApi
        .post(`spaces/${spaceId}/datasources/`, {
            datasource: {
                name: datasource.name,
                slug: datasource.slug
            }
        })
        .then(({ data }) => ({
            data,
            datasource_entries: datasource.datasource_entries
        }))
        .catch(err => Logger.error(err))


export const createDatasourceEntry = (datasourceEntry: any, datasourceId: any) => {
    return sbApi
        .post(`spaces/${spaceId}/datasource_entries/`, {
            datasource_entry: {
                name: Object.values(datasourceEntry)[0],
                value: Object.values(datasourceEntry)[1],
                datasource_id: datasourceId
            }
        })
        .then(({ data }) => {
            return data
        })
        .catch(err => Logger.error(err))
}

export const updateDatasourceEntry = (
    datasourceEntry: any,
    datasourceId: any,
    datasourceToBeUpdated: any
) => {
    return sbApi
        .put(`spaces/${spaceId}/datasource_entries/${datasourceToBeUpdated.id}`, {
            datasource_entry: {
                name: Object.values(datasourceEntry)[0],
                value: Object.values(datasourceEntry)[1],
                datasource_id: datasourceId,
                id: datasourceToBeUpdated.id
            }
        })
        .then(({ data }) => {
            return data
        })
        .catch(err => Logger.error(err))
}

export const updateDatasource = (datasource: any, temp: any) =>
    sbApi
        .put(`spaces/${spaceId}/datasources/${temp.id}`, {
            datasource: {
                id: temp.id,
                name: datasource.name,
                slug: datasource.slug
            }
        })
        .then(({ data }) => {
            return {
                data,
                datasource_entries: datasource.datasource_entries
            }
        })
        .catch(err => Logger.error(err))

export const createDatasourceEntries = (
    datasourceId: any,
    datasource_entries: any,
    remoteDatasourceEntries: any
) => {
    Promise.all(
        datasource_entries.map((datasourceEntry: any) => {
            const datasourceEntriesToBeUpdated = remoteDatasourceEntries.datasource_entries.find(
                (remoteDatasourceEntry: any) =>
                    remoteDatasourceEntry.name === Object.values(datasourceEntry)[0]
            )
            if (datasourceEntriesToBeUpdated) {
                return updateDatasourceEntry(
                    datasourceEntry,
                    datasourceId,
                    datasourceEntriesToBeUpdated
                )
            } else {
                return createDatasourceEntry(datasourceEntry, datasourceId)
            }
        })
    )
        .then(({ data }: any) => {
            Logger.success(
                `Datasource entries for ${datasourceId} datasource id has been successfully synced.`
            )
            return data
        })
        .catch(err => Logger.error(err))
}

export const syncDatasources = async (specifiedDatasources: any) => {
    Logger.log(`Trying to sync provided datasources: ${specifiedDatasources}`)
    const localDatasources = findDatasources()
    const remoteDatasources = await getAllDatasources()
    const filteredLocalDatasources = localDatasources.filter(datasource => {
        return specifiedDatasources.some(
            (specifiedDatasource: any) => datasource.name === specifiedDatasource
        )
    })

    Promise.all(
        filteredLocalDatasources.map(datasource => {
            const datasourceToBeUpdated = remoteDatasources.datasources.find(
                (remoteDatasource: any) => datasource.name === remoteDatasource.name
            )
            if (datasourceToBeUpdated) {
                return updateDatasource(datasource, datasourceToBeUpdated)
            } else {
                return createDatasource(datasource)
            }
        })
    )
        .then(res => {
            res.map(async ({ data, datasource_entries }: any) => {
                const remoteDatasourceEntries = await getDatasourceEntries(
                    data.datasource.name
                )
                createDatasourceEntries(
                    data.datasource.id,
                    datasource_entries,
                    remoteDatasourceEntries
                )
            })
            return res
        })
        .catch(err => {
            console.log(err);
            Logger.warning("There is error inside promise.all from datasource")
            return false
        })
}