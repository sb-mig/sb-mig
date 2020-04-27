const fs = require("fs")
const ncp = require("ncp").ncp
const path = require("path")
const Logger = require("./Logger")

const getCurrentDirectoryBase = () => path.basename(process.cwd())
const isDirectoryExists = path => fs.existsSync(path)

const createDir = async dirPath => {
  await fs.promises.mkdir(`${process.cwd()}/${dirPath}`, {
    recursive: true
  })
}

const createJsonFile = async (content, pathWithFilename) => {
  await fs.promises.writeFile(pathWithFilename, content, { flag: `w` })
}

const copyFolder = async (src, dest) => {
  return new Promise((resolve, reject) => {
    ncp(src, dest, function(err) {
      if (err) {
        reject({
          failed: true,
          message: `${src} copied unsuccessfully.`
        })
      }
      resolve({
        failed: false,
        message: `${src} copied successfully.`
      })
    })
  })
}

const copyFile = async (src, dest) => {
  const directory = dest.split("/").slice(0, dest.split("/").length - 1)
  const fileName = src.split("/")[src.split("/").length - 1]

  if (!isDirectoryExists(directory.join("/"))) {
    await createDir(directory.join("/"))
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

module.exports = {
  getCurrentDirectoryBase,
  isDirectoryExists,
  createDir,
  createJsonFile,
  copyFile,
  copyFolder
}
