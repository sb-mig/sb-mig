import * as execa from 'execa';
import * as rimraf from 'rimraf';
import * as os from 'os';
import * as fs from 'fs';


export const cloneRepo = (boilerplateUrl: string) => {
    return execa.command(
        `git clone ${boilerplateUrl} storyblok-boilerplate`,
        {
            shell: true
        }
    )
}

export const removeAndModifyFiles = (space: any) => {
    rimraf.sync(`./storyblok-boilerplate/.git`)
    rimraf.sync(`./storyblok-boilerplate/storyblok.config.js`)
    fs.appendFile(
        "./.env",
        `\nSTORYBLOK_SPACE_ID=${space.id}\nGATSBY_STORYBLOK_ACCESS_TOKEN=${space.first_token}`,
        err => {
            if (err) {
                return console.log(err)
            }
            console.log(`.env file has been updated`)
        }
    )
    if (os.type() === "Windows_NT") {
        execa.commandSync(`move ./storyblok-boilerplate/* ./`, {
            shell: true
        })
    } else {
        execa.commandSync(`mv ./storyblok-boilerplate/* ./`, {
            shell: true
        })
        execa.commandSync(`mv ./storyblok-boilerplate/.[!.]* ./`, {
            shell: true
        })
    }
    rimraf.sync(`storyblok-boilerplate`)
}

export const createSpace = (createSpace: Function, spaceName: string) => {
    return createSpace(spaceName)
}