// @ts-ignore
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

export const installAllDependencies = () => {
    if (yarnOrNpm() == 'yarn') {
        return execa.command(`yarn`)
    } else {
        return execa.command(`npm install`)
    }
}

export const installProvidedComponents = (components: string[]) => {
    const successComponents = components.map(component => {
        Logger.log(`Adding ${component}... `)
        let result;
        try {
            result = execa.commandSync(installComponentCommand(component))
        } catch (error) {
            Logger.error(`${error?.command} rejected.`);
            Logger.error(`Reason: ${error.stderr}`)
            return {
                command: result?.command,
                failed: true
            };
        }

        if (!result.failed) {
            Logger.success(`${result.command} end successful!`)
        }

        return result
    }).filter(result => {
        if (!result.failed) {
            return result
        }
    })
        .map(result => {
            const firstPart = result?.command?.split("/")[0]
            const secondPart = result?.command?.split("/")[1]

            return {
                scope: firstPart?.split(" ")[firstPart?.split(" ").length - 1],
                name: secondPart?.split(" ")[0]
            }
        })

    console.log("\n")
    Logger.success("Successfully installed components: ")
    console.log(successComponents);

    return successComponents
}


