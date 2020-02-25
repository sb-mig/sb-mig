const camelCase = require("camelcase")

const generateComponentsFile = components => {
  console.log(components)
  return `
    import ComponentNotFound from "./component_not_found";
    import Page from "./page";
    import Blank from "./blank";
    ${components.reduce((prev, next) => {
      return `${prev}\n    import ${camelCase(next, {
        pascalCase: true
      })} from "./scoped/${next}"`
    }, "")}

    const ComponentList = {
      page: Page,
      blank: Blank,
      ${components.reduce((prev, next) => {
        return `${prev}"${next}": ${camelCase(next, {
          pascalCase: true
        })},\n      `
      }, "")}
    };

    const Components = type => {
      if (typeof ComponentList[type] === "undefined") {
        return ComponentNotFound;
      }
      return ComponentList[type];
    };

    export default Components;
  `
}

const componentsFile = generateComponentsFile(["text-block", "test-image"])

module.exports = {
  componentsFile,
  generateComponentsFile
}
