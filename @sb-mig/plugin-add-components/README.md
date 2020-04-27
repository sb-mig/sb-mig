plugin-add-components
=====================

Plugin for sb-mig to add components to your project.

[![npm](https://img.shields.io/npm/v/@sb-mig/plugin-add-components.svg)](https://www.npmjs.com/package/@sb-mig/plugin-add-components)
[![npm](https://img.shields.io/npm/dt/@sb-mig/plugin-add-components.svg)](ttps://img.shields.io/npm/dt/@sb-mig/plugin-add-components.svg)
[![GitHub issues](https://img.shields.io/github/issues/sb-mig/plugin-add-components.svg?style=flat-square&v=1)](https://github.com/sb-mig/plugin-add-components/issues?q=is%3Aopen+is%3Aissue)
[![License](https://img.shields.io/npm/l/@sb-mig/plugin-add-components.svg)](https://github.com/sb-mig/plugin-add-components/blob/master/package.json)

<!-- toc -->
* [Usage](#usage)
* [Commands](#commands)
<!-- tocstop -->
# Usage
<!-- usage -->
```sh-session
$ npm install -g @sb-mig/plugin-add-components
$ sb-mig COMMAND
running command...
$ sb-mig (-v|--version|version)
@sb-mig/plugin-add-components/0.1.2 darwin-x64 node-v12.16.2
$ sb-mig --help [COMMAND]
USAGE
  $ sb-mig COMMAND
...
```
<!-- usagestop -->
# Commands
<!-- commands -->
* [`sb-mig add TYPE [LIST]`](#sb-mig-add-type-list)

## `sb-mig add TYPE [LIST]`

Add and install components from repository.

```
USAGE
  $ sb-mig add TYPE [LIST]

ARGUMENTS
  TYPE  (components) What to add and install to project.

  LIST  Space separated list of component names with scope. Example: @storyblok-components/card
        @storyblok-components/product-card @storyblok-components/row @storyblok-componenst/layout

OPTIONS
  -c, --copy  Copy downloaded files into your folder structure (outside node_modules).
  -h, --help  show CLI help

EXAMPLES
  $ sb-mig add components @storyblok-components/simple-text-block
  $ sb-mig add components @storyblok-components/simple-text-block --copy
  $ sb-mig add components @storyblok-components/simple-text-block @storyblok-components/advanced-carousel --copy
```

_See code: [src/commands/add.ts](https://github.com/sb-mig/plugin-add-components/blob/v0.1.2/src/commands/add.ts)_
<!-- commandsstop -->
