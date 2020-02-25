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
    .catch(err => console.log(err))

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
    .catch(err => console.log(err))

const createDatasourceEntries = (
  datasourceId,
  datasource_entries,
  remoteDatasourceEntries
) => {
  Promise.all(
    datasource_entries.map(datasourceEntry => {
      const temp3 = remoteDatasourceEntries.datasource_entries.find(
        remoteDatasourceEntry =>
          remoteDatasourceEntry.name === datasourceEntry.componentName
      );
      if (
        temp3
      ) {
        return sbApi
          .put(
            `spaces/${spaceId}/datasource_entries/${temp3.id}`,
            {
              datasource_entry: {
                name: datasourceEntry.componentName,
                value: datasourceEntry.importPath,
                datasource_id: datasourceId,
                id: temp3.id
              }
            }
          )
          .then(({ data }) => {
            console.log("res from single updated entry: ", data)
            return data
          })
          .catch(err => console.log(err))
      } else {
        return sbApi
          .post(`spaces/${spaceId}/datasource_entries/`, {
            datasource_entry: {
              name: datasourceEntry.componentName,
              value: datasourceEntry.importPath,
              datasource_id: datasourceId
            }
          })
          .then(({ data }) => {
            console.log("res from single added entry: ", data)
            return data
          })
          .catch(err => console.log(err))
      }
    })
  )
    .then(response => {
      console.log("repsonse from promise.all of adding entries: ", response)
      return response
    })
    .catch(err => console.log(err))
}

const syncDatasources = async specifiedDatasources => {
  localDatasources = findDatasources(".datasource.js")
  remoteDatasources = await getAllDatasources()
  console.log(remoteDatasources)
  const filteredLocalDatasources = localDatasources.filter(datasource => {
    return specifiedDatasources.some(
      specifiedDatasource => datasource.name === specifiedDatasource
    )
  })

  Promise.all(
    filteredLocalDatasources.map(datasource => {
      const temp = remoteDatasources.datasources.find(
        remoteDatasource => datasource.name === remoteDatasource.name
      )
      if (temp) {
        return updateDatasource(datasource, temp)
      } else {
        return createDatasource(datasource)
      }
    })
  )
    .then(res => {
      console.log("Promise all from datasource was resolved: ")
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
      Logger.warning("There is error inside promise.all from datasource")
      console.log(err)
      return false
    })
}

module.exports = {
  getAllDatasources,
  getDatasource,
  getDatasourceEntries,
  syncDatasources
}
