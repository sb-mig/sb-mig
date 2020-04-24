plugin-create-component
=======================

Plugin for sb-mig to create component in monorepos compliant with sb-mig

[![npm](https://img.shields.io/npm/v/@sb-mig/plugin-create-component.svg)](https://www.npmjs.com/package/@sb-mig/plugin-create-component)
[![npm](https://img.shields.io/npm/dt/@sb-mig/plugin-create-component.svg)](ttps://img.shields.io/npm/dt/@sb-mig/plugin-create-component.svg)
[![GitHub issues](https://img.shields.io/github/issues/sb-mig/plugin-create-component.svg?style=flat-square&v=1)](https://github.com/sb-mig/plugin-create-component/issues?q=is%3Aopen+is%3Aissue)
[![License](https://img.shields.io/npm/l/@sb-mig/plugin-create-component.svg)](https://github.com/sb-mig/plugin-create-component/blob/master/package.json)

<!-- toc -->
* [Usage](#usage)
* [Commands](#commands)
<!-- tocstop -->
# Usage
<!-- usage -->
```sh-session
$ npm install -g @sb-mig/plugin-create-component
$ sb-mig COMMAND
running command...
$ sb-mig (-v|--version|version)
@sb-mig/plugin-create-component/0.0.7 darwin-x64 node-v12.16.2
$ sb-mig --help [COMMAND]
USAGE
  $ sb-mig COMMAND
...
```
<!-- usagestop -->
# Commands
<!-- commands -->
* [`sb-mig create-component [BOILERPLATE-REPO]`](#sb-mig-create-component-boilerplate-repo)

## `sb-mig create-component [BOILERPLATE-REPO]`

Create package inside sb-mig compliant components monorepo.

```
USAGE
  $ sb-mig create-component [BOILERPLATE-REPO]

OPTIONS
  -f, --force
  -h, --help   show CLI help

EXAMPLE
  $ sb-mig create-component

  git@github.com:sb-mig/storyblok-components-boilerplate-component.git for @storyblok-components
```

_See code: [src/commands/create-component.ts](https://github.com/sb-mig/plugin-create-component/blob/v0.0.7/src/commands/create-component.ts)_
<!-- commandsstop -->
