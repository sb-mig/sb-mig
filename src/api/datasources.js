const Logger = require("../utils/loggerumd")
const { spaceId } = require("../config/config")
const { sbApi } = require("./config")
const { findDatasources } = require("../utils/discover")

// GET
const getAllDatasources = () => {
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

const getDatasource = datasourceName => {
  Logger.log(`Trying to get '${datasourceName}' datasource.`)

  return getAllDatasources()
    .then(res => {
      if (res) {
        return res.datasources.filter(
          datasource => datasource.name === datasourceName
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

const getDatasourceEntries = async datasourceName => {
  Logger.log(`Trying to get '${datasourceName}' datasource entries.`)

  const data = await getDatasource(datasourceName)

  if (data) {
    return sbApi
      .get(`spaces/${spaceId}/datasource_entries/?datasource_id=${data[0].id}`)
      .then(async ({ data }) => data)
      .catch(err => Logger.error(err))
  }
}

const createDatasource = datasource =>
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


const createDatasourceEntry = (datasourceEntry, datasourceId) => {
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

const updateDatasourceEntry = (
  datasourceEntry,
  datasourceId,
  datasourceToBeUpdated
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

const updateDatasource = (datasource, temp) =>
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

const createDatasourceEntries = (
  datasourceId,
  datasource_entries,
  remoteDatasourceEntries
) => {
  Promise.all(
    datasource_entries.map(datasourceEntry => {
      const datasourceEntriesToBeUpdated = remoteDatasourceEntries.datasource_entries.find(
        remoteDatasourceEntry =>
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
    .then(({ data }) => {
      Logger.success(
        `Datasource entries for ${datasourceId} datasource id has been successfully synced.`
      )
      return data
    })
    .catch(err => Logger.error(err))
}

const syncDatasources = async specifiedDatasources => {
  Logger.log(`Trying to sync provided datasources: ${specifiedDatasources}`)
  localDatasources = findDatasources(".datasource.js")
  remoteDatasources = await getAllDatasources()
  const filteredLocalDatasources = localDatasources.filter(datasource => {
    return specifiedDatasources.some(
      specifiedDatasource => datasource.name === specifiedDatasource
    )
  })

  Promise.all(
    filteredLocalDatasources.map(datasource => {
      const datasourceToBeUpdated = remoteDatasources.datasources.find(
        remoteDatasource => datasource.name === remoteDatasource.name
      )
      if (datasourceToBeUpdated) {
        return updateDatasource(datasource, datasourceToBeUpdated)
      } else {
        return createDatasource(datasource)
      }
    })
  )
    .then(res => {
      res.map(async ({ data, datasource_entries }) => {
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
      cosnole.log(err);
      Logger.warning("There is error inside promise.all from datasource")
      return false
    })
}

module.exports = {
  getAllDatasources,
  getDatasource,
  getDatasourceEntries,
  syncDatasources
}
