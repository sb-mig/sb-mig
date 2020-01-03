const fs = require("fs");
const path = require("path");

const getCurrentDirectoryBase = () => path.basename(process.cwd());
const isDirectoryExists = path => fs.existsSync(path);

module.exports = {
  getCurrentDirectoryBase,
  isDirectoryExists
};
