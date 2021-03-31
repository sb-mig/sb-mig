import Logger from '../utils/logger'
import storyblokConfig from '../config/config'
import {sbApi} from './apiConfig'

const {spaceId} = storyblokConfig

// GET
export const getAllComponents = () => {
  Logger.log('Trying to get all components.')

  return sbApi
  .get(`spaces/${spaceId}/components/`)
  .then((res: any) => res.data)
  .catch((err: any) => Logger.error(err))
}

export const getComponent = (componentName: string) => {
  Logger.log(`Trying to get '${componentName}' component.`)

  return getAllComponents()
  .then(res =>
    res.components.filter((component: any) => component.name === componentName)
  )
  .then(res => {
    if (Array.isArray(res) && res.length === 0) {
      Logger.warning(`There is no component named '${componentName}'`)
      return false
    }
    return res
  })
  .catch(err => Logger.error(err))
}

export const getComponentsGroup = (groupName: string) => {
  Logger.log(`Trying to get '${groupName}' group.`)

  return getAllComponentsGroups()
  .then(res => {
    return res.component_groups.filter((group: any) => group.name === groupName)
  })
  .then(res => {
    if (Array.isArray(res) && res.length === 0) {
      Logger.warning(`There is no group named '${groupName}'`)
      return false
    }
    return res
  })
  .catch(err => Logger.error(err))
}

export const getAllComponentsGroups = async () => {
  Logger.log('Trying to get all groups.')

  return sbApi
  .get(`spaces/${spaceId}/component_groups/`)
  .then(response => response.data)
  .catch(err => Logger.error(err))
}

export const createComponentsGroup = (groupName: string) => {
  Logger.log(`Trying to create '${groupName}' group`)
  return sbApi
  .post(`spaces/${spaceId}/component_groups/`, {
    component_group: {
      name: groupName,
    },
  })
  .then(res => {
    Logger.warning(
      `'${groupName}' created with uuid: ${res.data.component_group.uuid}`
    )
    return res.data
  })
  .catch(err => {
    Logger.error('Error happened :()')
  })
}
