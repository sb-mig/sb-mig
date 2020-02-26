const camelCase = require("camelcase")

const generateComponentsFile = components => {
  return `
import React from 'react;
import ComponentNotFound from "./component_not_found";
import Page from "./page";
import Blank from "./blank";
import Section from "./Section/section";
import Row from "./Row/row";
import Column from "./Column/column";
import Card from "./Card/card";
import VideoCard from "./VideoCard/video-card";
import Fullbleed from "./Fullbleed/fullbleed";
import TextBlock from "./TextBlock/text-block";
import Accordion from "./Accordion/accordion";
import List from "./List/list";
import Surface from "./Surface/surface";
import Tag from "./Tag/tag";
${components.reduce((prev, next) => {
  return `${prev}\n    import ${camelCase(next, {
    pascalCase: true
  })} from "./scoped/${next}"`
}, "")}

const withComponents = (WrappedComponent, Components) => {
  return props => {
      return <WrappedComponent {...props} Components={Components} />
  }
}

const ComponentList = {
  page: Page,
  blank: Blank,
  section: Section,
  row: Row,
  column: Column,
  card: Card,
  surface: Surface,
  accordion: Accordion,
  tag: Tag,
  "video-card": VideoCard,
  list: List,
  fullbleed: Fullbleed,
  "text-block": TextBlock,
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
