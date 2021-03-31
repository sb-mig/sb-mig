// this is workaround for now working default export of storyblok-js-client
// https://github.com/storyblok/storyblok-js-client/issues/50 - issue waiting to be solved
// import Storyblok from 'storyblok-js-client'
import StoryblokTypes from '../types/storyblokTypes'
const StoryblokClient = require('storyblok-js-client')
import storyblokConfig from '../config/config'

const {accessToken, oauthToken, storyblokApiUrl} = storyblokConfig

export const sbApi = new StoryblokClient({accessToken, oauthToken}, storyblokApiUrl) as StoryblokTypes
// export const sbApi = new StoryblokClient({ accessToken, oauthToken }, storyblokApiUrl) as Storyblok // after https://github.com/storyblok/storyblok-js-client/issues/50 will be solved
// export const sbApi = new StoryblokClient({ accessToken, oauthToken }, storyblokApiUrl)
