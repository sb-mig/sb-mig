import Logger from '../utils/logger'
import { sbApi } from './apiConfig'

// CREATE
export const createSpace = (spaceName: string) => {
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
export const getSpace = (spaceId: string) => {
  return sbApi.get(`spaces/${spaceId}`).then(res => res)
}

