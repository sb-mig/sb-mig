const fs = require("fs");
const path = require("path");

const getCurrentDirectoryBase = () => path.basename(process.cwd());
const isDirectoryExists = path => fs.existsSync(path);

const createDir = async dirPath => {
  await fs.promises.mkdir(`${process.cwd()}/${dirPath}`, {
    recursive: true
  });
};

const createJsonFile = async (content, pathWithFilename) => {
  await fs.promises.writeFile(pathWithFilename, content, { flag: `w` });
};

module.exports = {
  getCurrentDirectoryBase,
  isDirectoryExists,
  createDir,
  createJsonFile
};
