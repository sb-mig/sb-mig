// component resolution file borrowed from great storyblok-migrate
// https://github.com/maoberlehner/storyblok-migrate

const glob = require(`glob`)
const path = require(`path`)

const { componentDirectory, componentsDirectories } = require(`./config`)

function findComponents(componentDirectory) {
  const directory = path.resolve(process.cwd(), componentDirectory)

  return (
    glob
      .sync(path.join(directory, `**`, `[^_, ^.datasource]*.js`))
      // eslint-disable-next-line global-require, import/no-dynamic-require
      .map(file => require(path.resolve(directory, file)))
  )
}

function findComponentsWithExt(ext) {
  const rootDirectory = "./"
  const directory = path.resolve(process.cwd(), rootDirectory)

  return (
    glob
      .sync(
        path.join(
          `${directory}/{${componentsDirectories.join(",")}}`,
          `**`,
          `[^_]*.${ext}`
        )
      )
      // eslint-disable-next-line global-require, import/no-dynamic-require
      .map(file => require(path.resolve(directory, file)))
  )
}

function findDatasources() {
  const rootDirectory = "./"
  const directory = path.resolve(process.cwd(), rootDirectory)

  return (
    glob
      .sync(path.join(`${directory}/storyblok`, `**`, `[^_]*.datasource.js`))
      // eslint-disable-next-line global-require, import/no-dynamic-require
      .map(file => require(path.resolve(directory, file)))
  )
}

const components = findComponents(componentDirectory)

function contentTypeComponents() {
  return components.filter(x => x.is_root)
}

function componentByName(allComponents = components, name) {
  return allComponents.find(x => x.name === name)
}

module.exports = {
  componentByName,
  components,
  contentTypeComponents,
  findComponentsWithExt,
  findDatasources
}
