plugin-generate-project
=======================

Plugin for sb-mig to generate Storyblok project with command line

[![oclif](https://img.shields.io/badge/cli-oclif-brightgreen.svg)](https://oclif.io)
[![Version](https://img.shields.io/npm/v/plugin-generate-project.svg)](https://npmjs.org/package/plugin-generate-project)
[![Downloads/week](https://img.shields.io/npm/dw/plugin-generate-project.svg)](https://npmjs.org/package/plugin-generate-project)
[![License](https://img.shields.io/npm/l/plugin-generate-project.svg)](https://github.com/sb-mig/plugin-generate-project/blob/master/package.json)

<!-- toc -->
* [Usage](#usage)
* [Commands](#commands)
<!-- tocstop -->
# Usage
<!-- usage -->
```sh-session
$ npm install -g @sb-mig/plugin-generate-project
$ sb-mig COMMAND
running command...
$ sb-mig (-v|--version|version)
@sb-mig/plugin-generate-project/0.0.1 darwin-x64 node-v12.16.2
$ sb-mig --help [COMMAND]
USAGE
  $ sb-mig COMMAND
...
```
<!-- usagestop -->
# Commands
<!-- commands -->
* [`sb-mig generate [FILE]`](#sb-mig-generate-file)

## `sb-mig generate [FILE]`

Generate whole project with sb-mig generate and sb-mig add components

```
USAGE
  $ sb-mig generate [FILE]

OPTIONS
  -f, --force
  -h, --help       show CLI help
  -n, --name=name  name to print

EXAMPLE
  $ sb-mig generate ?
```

_See code: [src/commands/generate.ts](https://github.com/sb-mig/plugin-generate-project/blob/v0.0.1/src/commands/generate.ts)_
<!-- commandsstop -->
