// @ts-ignore
import * as execa from 'execa';
import * as rimraf from 'rimraf';

export const cloneRepo = (repo:string, componentName: string) => {
    return execa.command(`git clone ${repo} ${componentName}`)
}

export const removeDotGit = (componentName: string) => {
    rimraf.sync(`./${componentName}/.git`)
}

export const createComponent = async (repo: string, componentName: string) => {
    await cloneRepo(repo, componentName);
    removeDotGit(componentName);
    return 'created!'
}

