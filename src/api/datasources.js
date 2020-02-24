const Logger = require("../helpers/logger")
const { spaceId } = require("../config")
const { sbApi } = require("./config")
const { findDatasources } = require("../discover")

// GET
const getAllDatasources = () => {
  Logger.log("Trying to get all Datasources.")

  return sbApi
    .get(`spaces/${spaceId}/datasources/`)
    .then(({ data }) => data)
    .catch(err => Logger.error(err))
}

const getDatasource = datasourceName => {
  Logger.log(`Trying to get '${datasourceName}' datasource.`)

  return getAllDatasources()
    .then(res => {
      return res.datasources.filter(
        datasource => datasource.name === datasourceName
      )
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

const syncDatasources = specifiedDatasources => {
  localDatasources = findDatasources(".datasource.js")
  const filteredLocalDatasources = localDatasources.filter(datasource => {
    return specifiedDatasources.some(
      specifiedDatasource => datasource.name === specifiedDatasource
    )
  })
}

module.exports = {
  getAllDatasources,
  getDatasource,
  getDatasourceEntries,
  syncDatasources
}
