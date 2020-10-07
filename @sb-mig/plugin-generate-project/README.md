plugin-generate-project
=======================

Plugin for sb-mig to generate Storyblok project with command line

[![npm](https://img.shields.io/npm/v/@sb-mig/plugin-generate-project.svg)](https://www.npmjs.com/package/@sb-mig/plugin-generate-project)
[![npm](https://img.shields.io/npm/dt/@sb-mig/plugin-generate-project.svg)](ttps://img.shields.io/npm/dt/@sb-mig/plugin-generate-project.svg)
[![GitHub issues](https://img.shields.io/github/issues/sb-mig/plugin-generate-project.svg?style=flat-square&v=1)](https://github.com/sb-mig/plugin-generate-project/issues?q=is%3Aopen+is%3Aissue)
[![License](https://img.shields.io/npm/l/@sb-mig/plugin-generate-project.svg)](https://github.com/sb-mig/plugin-generate-project/blob/master/package.json)

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
@sb-mig/plugin-generate-project/0.3.1 linux-x64 node-v12.18.4
$ sb-mig --help [COMMAND]
USAGE
  $ sb-mig COMMAND
...
```
<!-- usagestop -->
# Commands
<!-- commands -->
* [`sb-mig generate [PROJECT-NAME]`](#sb-mig-generate-project-name)

## `sb-mig generate [PROJECT-NAME]`

Generate whole project with sb-mig generate and sb-mig add components

```
USAGE
  $ sb-mig generate [PROJECT-NAME]

OPTIONS
  -a, --add      List of components to add to project
  -c, --copy     Copy downloaded files into your folder structure (outside node_modules).
  -h, --help     show CLI help
  -n, --nospace  Do not create a space for project. (for example when you have one already)

EXAMPLE
  $ sb-mig generate project-name --add @storyblok-components/ui-accordion @storyblok-components/ui-section
```

_See code: [src/commands/generate.ts](https://github.com/sb-mig/plugin-generate-project/blob/v0.3.1/src/commands/generate.ts)_
<!-- commandsstop -->
