// @ts-ignore
import * as yarnOrNpm from 'yarn-or-npm';
import * as execa from 'execa';
import { StoryblokComponentsConfig } from 'sb-mig/lib/config/StoryblokComponentsConfig';
import { IStoryblokConfig } from 'sb-mig/lib/config/config';
import {updateLocation} from './tracking';

import { copyFolder } from '../utils/files';

import Logger from '../utils/Logger';


export const copyComponents = (
    components: string[],
    storyblokComponentsConfig: StoryblokComponentsConfig,
    storyblokConfig: IStoryblokConfig
) => {
    // @ts-ignore
    Promise.allSettled(
        components.map(component => {
            updateLocation(component, 'local', storyblokComponentsConfig)
            const componentName = component.split("@")[1]?.split('/')[1];
            return copyFolder(`./node_modules/${component}/src/`, `./src/components/${componentName}`)
        })
    ).then((res: any) => {
        return res.map((singleRes: any) => {
            if (singleRes.status === 'fulfilled') {
                Logger.success(`${singleRes.value.message} end successful!`)
            }

            return singleRes
        })
    }).then((res: any) => {
        console.log("Everything cool!");
        return res;
    }).catch((error: Error) => {
        Logger.error("Error happened inside catch allSettled from copy.ts");
        console.log(error);
        return 'sadness'
    })
}