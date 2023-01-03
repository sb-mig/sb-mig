
<p align="center">
    <img width="250" height="250" src="./sb-mig-logo.png" alt="Logo" />
</p>
If you've found an issue or you have feature request - <a href="https://github.com/marckraw/sb-mig/issues/new">open an issue</a> or look if it was <a href="https://github.com/sb-mig/sb-mig/issues/">already created</a>.
<br />

[![npm](https://img.shields.io/npm/v/sb-mig.svg)](https://www.npmjs.com/package/sb-mig)
[![npm](https://img.shields.io/npm/dt/sb-mig.svg)](ttps://img.shields.io/npm/dt/sb-mig.svg)
[![GitHub issues](https://img.shields.io/github/issues/sb-mig/sb-mig.svg?style=flat-square&v=1)](https://github.com/sb-mig/sb-mig/issues?q=is%3Aopen+is%3Aissue)
![npm](https://img.shields.io/npms-io/maintenance-score/sb-mig)

https://docs.sb-mig.com/


# Requirements: 

| ------------- | ------------- |
| Node          | LTS (18.x.x)  |

# 4.x.x version released!

- Whole deployment now, is handled by [semantic-release](https://github.com/semantic-release/semantic-release). And is just normal repository, instead of Lerna monorepo which is not needed anymore, and it was recently unmaintained (now it was passed to `nrwl` to maintain (https://github.com/lerna/lerna/issues/3121) will see what will happen in future with it :)
- Fromt the code perspective, there are no **breaking changes** between **3.x.x** and **4.x.x** but i'm going to fix some stuff now and add some more functionalities to it. So stay tuned!
- This Readme, which is also kinda documentation, will also be updated. Cause in some places there is misleading information. The best documentation though is just `sb-mig --help` command.

# 3.x.x version released!

- completely rewritten to simple [Meow](https://github.com/sindresorhus/meow) lib with help of Typescript. Check [migration guide](https://github.com/sb-mig/sb-mig/blob/oclif-research/MIGRATION-GUIDE-v3.md)
- support native es modules
- thinner then Oclif framework, still with Typescript
- decide to remove plugin support, cause it was not used enough
- make all commands follow same standard (`backup` command, had some very weird syntax before, now it works like `sync`)

## Contents

- [How to install and configure](#how-to-install-and-configure)
- [Usage](#usage)
- [Schema documentation:](#schema-documentation)
  - [Basics](#basics)
  - [Syncing components](#syncing-components)
  - [Syncing datasources](#syncing-datasources)
  - [Presets support](#presets-support)
- [Development](#development)
- [Roadmap](#roadmap)

---

# How to install and configure

```
npm install --global sb-mig
```

In your working directory (usually root of your repo where u have your app/webpage using Storyblok), you have to create a `.env` file with your variables:

```
STORYBLOK_OAUTH_TOKEN=1234567890qwertyuiop
STORYBLOK_SPACE_ID=12345

# For nextjs
# NEXT_PUBLIC_STORYBLOK_ACCESS_TOKEN=zxcvbnmasdfghjkl

# For gatsby
# GATSBY_STORYBLOK_ACCESS_TOKEN=zxcvbnmasdfghjkl

# any other (you have to handle '.env' access in frontend yourself (for example with dotenv package)
STORYBLOK_ACCESS_TOKEN=zxcvbnmasdfghjkl
```

You can also provide your custom config. To do that u have to create `storyblok.config.js` file in your root catalog with following structure:

```
// storyblok.config.js
module.exports = {
  storyblokComponentsLocalDirectory: "src/@storyblok-components",
  sbmigWorkingDirectory: "sbmig",
  componentsDirectories: ["src", "storyblok"],
  schemaFileExt: "sb.js",
  datasourceExt: "sb.datasource.js",
  rolesExt: "sb.roles.js",
  storyblokApiUrl: "https://api.storyblok.com/v1",
  oauthToken: process.env.STORYBLOK_OAUTH_TOKEN,
  spaceId: process.env.STORYBLOK_SPACE_ID,
  accessToken: process.env.STORYBLOK_ACCESS_TOKEN,
};
```

You don't need to pass everything to the config file, just add what you need and it will be merged with the original config. If you just need to set the `componentDirectory`, for example, add the following:

```
// storyblok.config.js
module.exports = {
  componentsDirectories: ["src", "storyblok", "@storyblok-components"],
};
```

# Usage

```sh-session
$ sb-mig --help
  CLI to rule the world. (and handle stuff related to Storyblok CMS)

  USAGE
    $ sb-mig [command]

  COMMANDS
      sync    Synchronize components, datasources or roles with Storyblok space.
      backup  Command for backing up anything related to Storyblok
      debug   Output extra debugging information
      help    This screen

  Examples
    $ sb-mig sync components --all
    $ sb-mig debug
```

# Commands

* [`sb-mig --version`](#sb-mig-version)
* [`sb-mig backup`](#sb-mig-backup)
* [`sb-mig debug`](#sb-mig-debug)
* [`sb-mig sync`](#sb-mig-sync)

## `sb-mig version`
```
$ sb-mig --version

4.0.4
```

## `sb-mig backup`

Command for backing up anything related to Storyblok

```
$ sb-mig backup --help



CLI to rule the world. (and handle stuff related to Storyblok CMS)

  Usage
      $ sb-mig backup [components|component-groups|roles|datasources|presets|component-presets] component-name --one or --all
  Description
      Command for backing up anything related to Storyblok

  COMMANDS
      components        - backup components
      component-groups  - backuo component-groups
      roles             - backup components
      datasources       - backup components
      presets           - backup presets
      component-presets - backup component presets

  FLAGS
      --all  - Backup all
      --one  - Backup one

  EXAMPLES
      $ sb-mig backup components --all
      $ sb-mig backup components accordion accordion-item carousel text-block
      $ sb-mig backup datasources --all
      $ sb-mig backup roles admin normal-user
```

## `sb-mig debug`

Output extra debugging.

```
$ sb-mig debug

✓ Found storyblok.config.js!
storyblok.config.js:  {
  componentsMatchFile: 'src/components/components.js',
  storyblokComponentsListfile: 'src/components/storyblok-components.componentList.js',
  storyblokComponentsLocalDirectory: 'src/@storyblok-components',
  componentsStylesMatchFile: 'src/@storyblok-components/_storyblok-components.scss',
  boilerplateUrl: 'git@github.com:storyblok-components/gatsby-storyblok-boilerplate.git',
  sbmigWorkingDirectory: 'sbmig',
  componentDirectory: 'storyblok',
  datasourcesDirectory: 'storyblok',
  componentsDirectories: [ 'src', 'storyblok' ],
  schemaFileExt: 'sb.js',
  datasourceExt: 'sb.datasource.js',
  rolesExt: 'sb.roles.js',
  storyblokApiUrl: 'https://api.storyblok.com/v1',
  oauthToken: '',
  spaceId: '',
  accessToken: ''
}
```



## `sb-mig sync`

Synchronize components, datasources or roles with Storyblok space.

```
$ sb-mig sync --help

CLI to rule the world. (and handle stuff related to Storyblok CMS)

  Usage
      $ sb-mig-v3 sync [components|roles|datasources] [space separated file names] or --all --packageName

  Description
      Synchronize components or roles with Storyblok space.

  COMMANDS
      components    - sync components
      roles         - sync roles
      datasources   - sync datasources

  FLAGS
      --all         - Sync all components
      --packageName - Sync based on package name, instead of file name (package can have multiple schema files to sync)
      --presets     - Pass it, if u want to sync also with presets (will take longer)

  EXAMPLES
      $ sb-mig sync components --all
      $ sb-mig sync components --all --presets
      $ sb-mig sync components accordion accordion-item
      $ sb-mig sync components accordion accordion-item --presets
      $ sb-mig sync components @storyblok-components/accordion --packageName
      $ sb-mig sync components @storyblok-components/accordion --packageName --presets
      $ sb-mig sync roles --all
      $ sb-mig sync datasources --all

```

# Schema documentation:

## Basics

This is what a basic storyblok `.sb.js` schema file which maps to a component looks like:

```
expport default {
  name: "text-block",
  display_name: "Text block",
  is_root: false,
  is_nestable: true,
  component_group_name: "Some group",
  schema: {
    title: {
      type: "text",
    },
  }
};
```

**Important notice:** name inside `.sb.js` schema need to match `.sb.js` filename.

You can add anything mentioned here: https://www.storyblok.com/docs/api/management#core-resources/components/components to your component. (with the exception of `component_group_uuid`: insert `component_group_name` and `sb-mig` will resolve `uuid` automagically).

You can also add `tabs` to your component schema (which is not documented in above storyblok documentation):

```
...
  schema: {
    title: {
      type: "text",
    },
    Settings: {
      type: "tab",
      display_name: "Settings",
      "keys": [
        "title"
      ]
    },
  }
...
```

There is also support for `sections` inside components:

```
...
  schema: {
    title: {
      type: "text",
    },
    somesection: {
      type: "section",
      "keys": [
        "title"
      ]
    },
  }
...
```

## Syncing components

The main purpose of `sb-mig` is to sync your `.sb.js` component schema files with your `Storyblok` space.

In v4.x.x There is 1 way to sync your schemas, which is to name all your schemas with `.sb.js` extension. You can have them in any place of your repositories, as long as this place is pointed in `storyblok.config.js` `componentDirectories` field, which is set to `componentsDirectories: ["src", "storyblok"],` by default:

```
sb-mig sync components row column
```

This command will look for `row.sb.js` and `column.sb.js` files inside a directories mentioned in `componentDirectories` field. (You can change directories name mapping by modifying `componentDirectories` inside `storyblok.config.js`). You can also change the extension searched by changing `schemaFileExt`. [How to install and configure](#how-to-install-and-configure))


## Syncing datasources

You can also sync your `datasources`.

Add `datasourceExt: "your-own-extension",` to your `storyblok.config.js`. If u will not add it, will be used default one (`sb.datasource.js`)

```
// storyblok.config.js
export default {
  ...
  datasourcesDirectory: "mydatasource.ext.js"
  ...
};
```

Create file with `.sb.datasource.js` (or your defined one) extension inside it. Basic schema for datasources file:

```
export default {
  name: "icons",
  slug: "icons",
  datasource_entries: [
    {
      componentName: "icon1",
      importPath: "icon 2"
    },
    {
      componentName: "icon2",
      importPath: "icon 2"
    },
    {
      componentName: "icon3",
      importPath: "icon 3"
    },
    {
      componentName: "icon4",
      importPath: "icon 4"
    },
  ]
};
```

Above snippet will create `datasource` with `icons` name and `icons` slug. `datasource_entries` will be your `name <-> value` array.
Single `datasource entry` consist of **precisely** 2 fields. But they can be named however you like (advise to name it: `name` and `value`, it will be anyway translated to that, due to how storyblok stores them)

Command for syncing datasources:

```
sb-mig sync datasources icons
```

Example output from above command

```
Synciong priovided datasources icons...
Trying to sync provided datasources: icons
Trying to get all Datasources.
Trying to get 'icons' datasource entries.
Trying to get 'icons' datasource.
✓ Datasource entries for 15558 datasource id has been successfully synced
```

Like with syncing component, you can also use syncing multiple datasources at once:

```
sb-mig sync datasources icons logos
```

```
✓ Datasource entries for 15558 datasource id has been successfully synced.
✓ Datasource entries for 15559 datasource id has been successfully synced.
```

You can also sync all datasources, and that's the command we strongly recommend. It will sync all datasources also the one from node_modules, so potentially from `storyblok-components`. But will prefer syncing local ones, if there will be clash of datasources filenames (for example, you can have datasource from node_modules, but wanted to overwrite some fields, you will be able to do that.

```
sb-mig sync datasources --all
```


## Presets support

Writing your own predefined data (presets) for components can be a pain, so with `sb-mig` you can create presets for your components in the storyblok gui, and then export them to a schema based `.sb.js` file to be picked up while syncing.

To do so, first create a preset for your component in storyblok:

<img src="https://user-images.githubusercontent.com/8228270/72166029-caf8cc00-33c8-11ea-891b-194f57974653.png" width=300 />
<br>
<img src="https://user-images.githubusercontent.com/8228270/72166255-33e04400-33c9-11ea-9431-c6d0b684f5fb.png" width=300 />

then run

```
sb-mig backup component-presets --one text-block    // component you've created preset for
```

The tool will now download all presets related to the `text-block` component.
Now you can go to your folder structure (by default: `./sbmig/component-presets/`), and rename the generated file to (for example): `text-block-preset`.

You should remove the id field from the preset (it will be looked up by name)

Finally, add the `all_presets` field to your `text-block` component schema.

```
import allPresets from './presets/_text-block-preset.json'

export default {
  ...
  schema: {
    title: {
      type: "text",
      pos: 1
    },
  },
  all_presets: allPresets,
  ...
};
```

Now, sync your component

```
sb-mig sync components text-block --presets
```

output:

```
Checking preset for 'text-block-2' component
Trying to get all 'text-block-2' presets.
Trying to get all components.
Trying to get preset by id: 437086
Preset: 'My Preset' with '437086' id has been updated.
```

---

_This feature is still quite experimental, that's why it's not completely straightforward to do. Workin on it :)_

---

## Development

To develop and make changes to the library:

```
git clone git@github.com:sb-mig/sb-mig.git
```

Install packages

```
yarn
```

Run development command
```bash
yarn build:dev
```

It will watch a file change, and on every change, will rebuild typescript and build the whole lib/cli.

The you can use 
```
node dist/index.js debug 
```
to access `sb-mig`

For your conveniece, you can also, link it to proper `sb-mi` name:
```
yarn link
```

And then you can use it like that:
```
sb-mig debug
```

## Roadmap

- [ ] Sync / Migrate content (stories)
- [ ] Improve preset creation/update
- [x] Sync Roles
- [x] Sync / Migrate datasources
- [x] Sync components with extensions
- [x] Sync presets
- [x] Sync single component
- [x] Sync all components
- [x] Sync components using schema based .sb.js file (based on idea from [storyblok-migrate](https://github.com/maoberlehner/storyblok-migrate))
- [x] Component groups
- [x] Sync custom fields

The general purpose of this package is to manage creation and maintenance of components from code/command line, to be able to create a whole space and project structure without using GUI.
