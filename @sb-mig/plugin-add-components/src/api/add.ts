import * as yarnOrNpm from 'yarn-or-npm';
import * as execa from 'execa';

import Logger from '../utils/Logger';

export const installComponentCommand = (component: any) => {
    if (yarnOrNpm() == 'yarn') {
        return `yarn add ${component}`
    } else {
        return `npm install ${component} --save`
    }
}

export const installProvidedComponents = async (components: string[]) => {
    return Promise.allSettled(
        components.map(component => {
            return execa.command(installComponentCommand(component))
        })
    ).then((res: any) => {
        return res.map((singleRes: any) => {
            if (singleRes.status === 'fulfilled') {
                Logger.success(`${singleRes.value.command} end successful!`)

                const firstPart = singleRes.value.command.split("/")[0]
                const secondPart = singleRes.value.command.split("/")[1]

                return {
                    scope: firstPart.split(" ")[firstPart.split(" ").length - 1],
                    name: secondPart.split(" ")[0]
                }
            }
            if (singleRes.status === 'rejected') {
                Logger.error(`${singleRes.reason.command} rejected.`);
            }
        })
    }).then((res: any) => {
        console.log("Everything cool!");
        return res;
    }).catch((error: Error) => {
        Logger.error("Error happened inside Catch allSettled from add.ts");
        console.log(error);
        return 'sadness'
    })
}

