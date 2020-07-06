import { StoryblokComponentsConfig } from 'sb-mig/lib/config/StoryblokComponentsConfig'

export const isComponentAlreadyImported = (componentName: string, storyblokComponentsConfig: StoryblokComponentsConfig) => {
    return storyblokComponentsConfig.getSingleData(componentName).isLinkedInComponentFile
}

export const updateIsLinkedInComponentFile = (
    componentName: string,
    isLinkedInComponentFile: boolean,
    storyblokComponentsConfig: StoryblokComponentsConfig
) => {
    storyblokComponentsConfig.setSingleData({
        ...storyblokComponentsConfig.getSingleData(componentName),
        isLinkedInComponentFile
    })
}

export const updateIsModified = (
    componentName: string,
    modified: boolean,
    storyblokComponentsConfig: StoryblokComponentsConfig
) => {
    storyblokComponentsConfig.setSingleData({
        ...storyblokComponentsConfig.getSingleData(componentName),
        modified
    })
}

export const updateLocation = (
    componentName: string,
    location: string,
    storyblokComponentsConfig: StoryblokComponentsConfig
) => {
    storyblokComponentsConfig.setSingleData({
        ...storyblokComponentsConfig.getSingleData(componentName),
        location
    })
}