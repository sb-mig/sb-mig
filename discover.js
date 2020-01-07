// component resolution file borrowed from great storyblok-migrate
// https://github.com/maoberlehner/storyblok-migrate

const glob = require(`glob`);
const path = require(`path`);

const { componentDirectory } = require(`./config`);

function findComponents(componentDirectory) {
  const directory = path.resolve(process.cwd(), componentDirectory);

  return (
    glob
      .sync(path.join(directory, `**`, `[^_]*.js`))
      // eslint-disable-next-line global-require, import/no-dynamic-require
      .map(file => require(path.resolve(directory, file)))
  );
}

const components = findComponents(componentDirectory);

function contentTypeComponents() {
  return components.filter(x => x.is_root);
}

function componentByName(name) {
  return components.find(x => x.name === name);
}

module.exports = {
  componentByName,
  components,
  contentTypeComponents
};
