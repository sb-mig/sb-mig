const Logger = require("../utils/loggerumd")
const { sbApi } = require("./config")

// CREATE
const createSpace = spaceName => {
  Logger.warning(`Trying to create space ${spaceName}...`)
  return sbApi
    .post(`spaces/`, {
      space: {
        name: spaceName,
        domain: 'http://localhost:8000/editor?path='
      }
    })
    .then(res => {
      return res
    })
    .catch(err => {
      Logger.error(`Error happened. Can't create space`)
      console.log(err.message)
    })
}

// GET
const getSpace = spaceId => {
  return sbApi.get(`spaces/${spaceId}`).then(res => res)
}

module.exports = {
  createSpace,
  getSpace
}
