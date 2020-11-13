import Logger from '../utils/logger'
import storyblokConfig from '../config/config'
import {sbApi} from './apiConfig'
import {
  LOOKUP_TYPE,
  SCOPE,
  compare,
  discoverRoles,
  discoverManyRoles,
  OneComponent,
  getFileContent,
  discoverStories,
} from '../utils/discover2'

const {spaceId} = storyblokConfig

// POST
export const createRole = (role: any) => {
  sbApi
  .post(`spaces/${spaceId}/space_roles/`, {
    space_role: role,
  })
  .then(_ => {
    Logger.success(`Role '${role.role}' has been created.`)
  })
  .catch(error => {
    Logger.error('error happened... :(')
    Logger.log(`${error.message} in migration of ${role.role} in createRole function`)
  })
}

// PUT
export const updateRole = (role: any) => {
  sbApi
  .put(`spaces/${spaceId}/space_roles/${role.id}`, {
    space_role: role,
  })
  .then(_ => {
    Logger.success(`Role '${role.role}' has been updated.`)
  })
  .catch(error => {
    Logger.error('error happened... :(')
    Logger.log(`${error.message} in migration of ${role.role} in updateRole function`)
  })
}

// GET
export const getAllRoles = async () => {
  return sbApi
  .get(`spaces/${spaceId}/space_roles/`)
  .then(({data}) => data)
  .catch(error => {
    if (error.response.status === 404) {
      Logger.error(
        `There is no roles in your Storyblok ${spaceId} space.`
      )
    } else {
      Logger.error(error)
      return false
    }
  })
}

// GET
export const getAllStories = async () => {
  Logger.log('Trying to get all stories.')

  return sbApi
  .get(`spaces/${spaceId}/stories/`)
  .then(({data}) => {
    return data
  })
  .catch(error => {
    if (error.response.status === 404) {
      Logger.error(
        `There is no stories in your Storyblok ${spaceId} space.`
      )
    } else {
      Logger.error(error)
      return false
    }
  })
}

// GET
export const getStory = async ({storyId}: { storyId: number }) => {
  Logger.log('Trying to get all stories.')

  return sbApi
  .get(`spaces/${spaceId}/stories/${storyId}`)
  .then(({data}) => {
    return data
  })
  .catch(error => {
    if (error.response.status === 404) {
      Logger.error(
        `There is no stories in your Storyblok ${spaceId} space.`
      )
    } else {
      Logger.error(error)
      return false
    }
  })
}

// PUT
export const updateStory = async ({story}: { story: any }) => {
  Logger.log('storyId: ', story.id)
  return sbApi
  .put(`spaces/${spaceId}/stories/${story.id}`, {
    story,
  })
  .then(res => {
    Logger.log('this is response from PUT: ')
    Logger.log(res)
    return res
  })
  .catch(error => {
    if (error.response.status === 404) {
      Logger.error(
        `There is no stories in your Storyblok ${spaceId} space.`
      )
    } else {
      Logger.error(error)
      return false
    }
  })
}

export const pullContent = async () => {
  return getStory({storyId: 26878027})
  // return await getAllStories();
}

export const pushContent = async () => {
  const discoveredStories = discoverStories({
    scope: SCOPE.local,
    type: LOOKUP_TYPE.fileName,
  })

  Logger.log('this is discovered stories: ')
  Logger.log(discoveredStories)

  const discoveredStoriesContent = discoveredStories.map(story =>
    getFileContent({file: story})
  )
  Logger.log('content: ')
  Logger.log(discoveredStoriesContent[0])

  const res = await updateStory({story: discoveredStoriesContent[0].story})
  Logger.log('result of update: ')
  Logger.log(res)
}
