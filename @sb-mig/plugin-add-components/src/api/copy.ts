import storyblokConfig from 'sb-mig/lib/config/config'
import {updateLocation} from './tracking'
import {copyFolder, copyFile} from '../utils/files'

interface CopyComponents {
    components: string[];
}

export const copyComponents = async ({components}: CopyComponents) => {
  // @ts-ignore
  await Promise.allSettled(
    components.map(async component => {
      updateLocation({componentName: component, location: 'local'})
      const componentName = component.split('@')[1]?.split('/')[1]
      await copyFolder(
        `./node_modules/${component}/src/`,
        `./${storyblokConfig.storyblokComponentsLocalDirectory}/${componentName}`
      )
      await copyFile(`./node_modules/${component}/package.json`, `./${storyblokConfig.storyblokComponentsLocalDirectory}/${componentName}/package.json`)
    })
  )
}
