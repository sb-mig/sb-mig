const { src, dest } = require("gulp")
const composer = require("gulp-uglify/composer")
const uglifyES = require("uglify-es")
const pump = require("pump")

const minify = composer(uglifyES, console)

function compress(cb) {
  const options = {}
  return pump([src("src/**/*.js"), minify(options), dest("dist")], cb)
}

function defaultTask(cb) {
  cb()
}

exports.default = defaultTask
exports.compress = compress
