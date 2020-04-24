plugin-create-component
=======================

Plugin for sb-mig to create component in monorepos compliant with sb-mig

[![oclif](https://img.shields.io/badge/cli-oclif-brightgreen.svg)](https://oclif.io)
[![Version](https://img.shields.io/npm/v/plugin-create-component.svg)](https://npmjs.org/package/plugin-create-component)
[![Downloads/week](https://img.shields.io/npm/dw/plugin-create-component.svg)](https://npmjs.org/package/plugin-create-component)
[![License](https://img.shields.io/npm/l/plugin-create-component.svg)](https://github.com/sb-mig/plugin-create-component/blob/master/package.json)

<!-- toc -->
* [Usage](#usage)
* [Commands](#commands)
<!-- tocstop -->
# Usage
<!-- usage -->
```sh-session
$ npm install -g @sb-mig/plugin-create-component
$ oclif-example COMMAND
running command...
$ oclif-example (-v|--version|version)
@sb-mig/plugin-create-component/0.0.4 darwin-x64 node-v12.16.2
$ oclif-example --help [COMMAND]
USAGE
  $ oclif-example COMMAND
...
```
<!-- usagestop -->
# Commands
<!-- commands -->
* [`oclif-example create-component [BOILERPLATE-REPO]`](#oclif-example-create-component-boilerplate-repo)

## `oclif-example create-component [BOILERPLATE-REPO]`

Create package inside sb-mig compliant components monorepo.

```
USAGE
  $ oclif-example create-component [BOILERPLATE-REPO]

OPTIONS
  -f, --force
  -h, --help   show CLI help

EXAMPLE
  $ sb-mig create-component

  git@github.com:sb-mig/storyblok-components-boilerplate-component.git for @storyblok-components
```

_See code: [src/commands/create-component.ts](https://github.com/sb-mig/plugin-create-component/blob/v0.0.4/src/commands/create-component.ts)_
<!-- commandsstop -->
