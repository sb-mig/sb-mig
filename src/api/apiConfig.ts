// this is workaround for now working default export of storyblok-js-client
// https://github.com/storyblok/storyblok-js-client/issues/50 - issue waiting to be solved
const StoryblokClient = require('storyblok-js-client')
import Storyblok from 'storyblok-js-client'
import storyblokConfig from '../config/config'

const { accessToken, oauthToken, storyblokApiUrl } = storyblokConfig

export const sbApi = new StoryblokClient({ accessToken, oauthToken }, storyblokApiUrl) as Storyblok
