const Fetch = require("node-fetch")
const Logger = require("../helpers/logger")
const { storyblokApiUrl, spaceId } = require("../config")
const { headers, sbApi } = require("./config")

// GET
const getAllDatasources = () => {
  Logger.log("Trying to get all Datasources.")

  return Fetch(`${storyblokApiUrl}/spaces/${spaceId}/datasources/`, {
    headers
  })
    .then(response => response.json())
    .catch(err => Logger.error(err))
}

const getDatasource = datasourceName => {
  Logger.log(`Trying to get '${datasourceName}' datasource.`)

  return getAllDatasources()
    .then(res =>
      res.datasources.filter(datasource => datasource.name === datasourceName)
    )
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

  return Fetch(
    `${storyblokApiUrl}/spaces/${spaceId}/datasource_entries/?datasource_id=${data[0].id}`,
    {
      headers
    }
  )
    .then(async response => response.json())
    .catch(err => Logger.error(err))
}

module.exports = {
  getAllDatasources,
  getDatasource,
  getDatasourceEntries
}
