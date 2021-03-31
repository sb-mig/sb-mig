import * as fs from 'fs'
import {ncp} from 'ncp'
import * as path from 'path'
import Logger from './logger'

export const getCurrentDirectoryBase = () => path.basename(process.cwd())
export const isDirectoryExists = (path: string) => fs.existsSync(path)

export const createDir = async (dirPath: string) => {
  await fs.promises.mkdir(`${process.cwd()}/${dirPath}`, {
    recursive: true,
  })
}

export const createJsonFile = async (content: string, pathWithFilename: string) => {
  await fs.promises.writeFile(pathWithFilename, content, {flag: 'w'})
}

export const copyFolder = async (src: string, dest: string) => {
  return new Promise((resolve, reject) => {
    ncp(src, dest, function (err) {
      if (err) {
        reject({
          failed: true,
          message: `${src} copied unsuccessfully.`,
        })
      }
      resolve({
        failed: false,
        message: `${src} copied successfully.`,
      })
    })
  })
}

export const copyFile = async (src: string, dest: string) => {
  const directory = dest.split('/').slice(0, dest.split('/').length - 1)
  const fileName = src.split('/')[src.split('/').length - 1]

  if (!isDirectoryExists(directory.join('/'))) {
    await createDir(directory.join('/'))
  }

  fs.copyFile(src, dest, err => {
    if (err) {
      Logger.error(`There is no file to copy, named ${fileName}`)
      console.log(err)
      return false
    }
    console.log(`${fileName} was copied to ${dest}`)
  })
}
