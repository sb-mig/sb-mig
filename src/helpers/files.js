const fs = require("fs")
const path = require("path")
const Logger = require("./logger")

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
  copyFile
}
