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
@sb-mig/plugin-create-component/0.1.10 linux-x64 node-v12.19.0
$ sb-mig --help [COMMAND]
USAGE
  $ sb-mig COMMAND
...
```
<!-- usagestop -->
# Commands
<!-- commands -->
* [`sb-mig create [COMPONENT-NAME]`](#sb-mig-create-component-name)

## `sb-mig create [COMPONENT-NAME]`

Create package inside sb-mig compliant components monorepo.

```
USAGE
  $ sb-mig create [COMPONENT-NAME]

OPTIONS
  -f, --force
  -h, --help       show CLI help
  -r, --repo=repo  Custom repository url

EXAMPLE
  $ sb-mig create component-name
```

_See code: [src/commands/create.ts](https://github.com/sb-mig/plugin-create-component/blob/v0.1.10/src/commands/create.ts)_
<!-- commandsstop -->
