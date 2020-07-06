import * as fs from 'fs';
import * as path from 'path';
import * as camelcase from 'camelcase';
import { StoryblokComponentsConfig } from 'sb-mig/lib/config/StoryblokComponentsConfig';
import { IStoryblokConfig } from 'sb-mig/lib/config/config';

import { updateIsLinkedInComponentFile, isComponentAlreadyImported } from './tracking'

export const updateComponentsJs = (
    installedComponents: any,
    copy: boolean,
    storyblokComponentsConfig: StoryblokComponentsConfig,
    storyblokConfig: IStoryblokConfig
) => {
    const storyblokMatchFile = path.resolve(process.cwd(), storyblokConfig.componentsMatchFile)

    let componentsImport = `// --- sb-mig scoped component imports ---\n`
    let componentList = `// --- sb-mig scoped component list ---\n`
    installedComponents.map((component: any, index: number) => {
        if (!isComponentAlreadyImported(`${component.scope}/${component.name}`, storyblokComponentsConfig)) {
            updateIsLinkedInComponentFile(`${component.scope}/${component.name}`, true, storyblokComponentsConfig)
            componentsImport = `${componentsImport}import * as Scoped${
                camelcase(component.name, { pascalCase: true })
                } from "${copy ? '.' : component.scope}/${component.name}";${index !== installedComponents.length - 1 ? `\n` : ''}`
            componentList = `${componentList}Scoped${camelcase(component.name, { pascalCase: true })}.ComponentList,${index !== installedComponents.length - 1 ? `\n` : ''}`
        }
    })

    fs.readFile(storyblokMatchFile, 'utf-8', function (err, data) {
        if (err) throw err;

        let newValue = data.replace(/\/\/ --- sb-mig scoped component imports ---\n/gim, componentsImport);
        newValue = newValue.replace(/\/\/ --- sb-mig scoped component list ---\n/gim, componentList);

        fs.writeFile(storyblokMatchFile, newValue, 'utf-8', (err: any) => {
            if (err) throw err;
            console.log('Done!');
        })
    })
}