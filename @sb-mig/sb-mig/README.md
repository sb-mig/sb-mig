<p align="center">
    <img width="250" height="250" src="./sb-mig-logo.png" alt="Logo" />
</p>
If you've found an issue or you have feature request - <a href="https://github.com/marckraw/sb-mig/issues/new">open an issue</a> or look if it was <a href="https://github.com/sb-mig/sb-mig/issues/">already created</a>.

[![npm](https://img.shields.io/npm/v/sb-mig.svg)](https://www.npmjs.com/package/sb-mig)
[![npm](https://img.shields.io/npm/dt/sb-mig.svg)](ttps://img.shields.io/npm/dt/sb-mig.svg)
[![GitHub issues](https://img.shields.io/github/issues/sb-mig/sb-mig.svg?style=flat-square&v=1)](https://github.com/sb-mig/sb-mig/issues?q=is%3Aopen+is%3Aissue)

# 3.x.x version released!
TBD

# 2.x.x version released!

- completely rewritten to [Oclif](https://github.com/oclif/oclif) framework written in Typescript (with as little changes to usage as possible, check [migration guide](https://github.com/sb-mig/sb-mig/blob/oclif-research/MIGRATION-GUIDE.md))
- support for Oclif plugin system
- created [sb-mig](https://github.com/sb-mig) organization for better grouping related stuff
- created npm `@sb-mig` scope aswell, for the same reason

## Contents

- [How to install and configure](#how-to-install-and-configure)
- NEW [Adding Scoped Storyblok components](#adding-scoped-storyblok-components)
- NEW [Overwriting schema files from scoped components](#overwriting-schema-files-from-scoped-components)
- [Generate whole starter project](#generate-whole-starter-project)
- [Usage](#usage)
- [Commands](#commands)
  - [`sb-mig backup`](#sb-mig-backup)
  - [`sb-mig debug`](#sb-mig-debug)
  - [`sb-mig help [COMMAND]`](#sb-mig-help-command)
  - [`sb-mig plugins`](#sb-mig-plugins)
  - [`sb-mig sync TYPE [LIST]`](#sb-mig-sync-type-list)
- [Plugins](#plugins)
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

You have to create a `.env` file with your variables:

```
STORYBLOK_OAUTH_TOKEN=1234567890qwertyuiop
STORYBLOK_SPACE_ID=12345
STORYBLOK_ACCESS_TOKEN=zxcvbnmasdfghjkl
```

You can also provide your custom config. To do that u have to create `storyblok.config.js` file in your root catalog with following structure:

```
// storyblok.config.js
module.exports = {
  sbmigWorkingDirectory: "sbmig",
  componentDirectory: "sbmig/storyblok",
  componentsDirectories: ["src", "storyblok"],
  schemaFileExt: "sb.js",
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
  componentDirectory: 'storyblok',
};
```

## Adding scoped storyblok components
** this feature is still experimental **

For that feature to work you need to install [add-components-plugin](https://github.com/sb-mig/sb-mig/tree/master/%40sb-mig/plugin-add-components).

To do that, run (from root of your project)
```
sb-mig plugins:install add-components
```

Now you have access to `sb-mig add components`.

### Adding components and Lock file

Let's say we want to add `@storyblok-components/text-block` and `@storyblok-components/heading` component. Lets run:
```
sb-mig add components @storyblok-components/text-block @storyblok-components/heading
```

This command, will install provided components from `npm` and will create special file called `storyblok.components.lock.js` in root of your project.
This file is responsible for tracking where, and how your components end up being installed to your project, and is also tracking for any relations/links in your project. It is single source of truth for scoped components you installed with `sb-mig add components` command. 

Example output of `storyblok.components.lock.js` file:

```
module.exports = {
  "@storyblok-components/text-block": {
    "name": "@storyblok-components/text-block",
    "scope": "@storyblok-components",
    "location": "node_modules",
    "locationPath": "node_modules/@storyblok-components/text-block",
    "links": {
      "src/@storyblok-components/storyblok-components.componentList.js": {
        "// --- sb-mig scoped component imports ---": "import * as ScopedTextBlock from '@storyblok-components/text-block';",
        "// --- sb-mig scoped component list ---": "ScopedTextBlock.ComponentList"
      },
      "src/@storyblok-components/_storyblok-components.scss": {
        "// --- sb-mig scoped component styles imports ---": "@import '@storyblok-components/text-block/src/text-block.scss';"
      }
    }
  },
  "@storyblok-components/heading": {
    "name": "@storyblok-components/heading",
    "scope": "@storyblok-components",
    "location": "node_modules",
    "locationPath": "node_modules/@storyblok-components/heading",
    "links": {
      "src/@storyblok-components/storyblok-components.componentList.js": {
        "// --- sb-mig scoped component imports ---": "import * as ScopedHeading from '@storyblok-components/heading';",
        "// --- sb-mig scoped component list ---": "ScopedHeading.ComponentList"
      },
      "src/@storyblok-components/_storyblok-components.scss": {
        "// --- sb-mig scoped component styles imports ---": ""
      }
    }
  }
}
```

We can also install our components with `--copy` flag, which will copy all files of the component from `node_modules` to local file system, and will use them in needed imports.

Command: 
```
sb-mig add components @storyblok-components/image --copy
```

Will add 
```
...
"@storyblok-components/image": {
    "name": "@storyblok-components/image",
    "scope": "@storyblok-components",
    "location": "local",
    "locationPath": "src/@storyblok-components/image",
    "links": {
      "src/@storyblok-components/storyblok-components.componentList.js": {
        "// --- sb-mig scoped component imports ---": "import * as ScopedImage from './image';",
        "// --- sb-mig scoped component list ---": "ScopedImage.ComponentList"
      },
      "src/@storyblok-components/_storyblok-components.scss": {
        "// --- sb-mig scoped component styles imports ---": ""
      }
    }
  }
...
```

to `storyblok.components.lock.js`

As you can see, `location`, `locationPath` and also imports inside `links` are reffering now to local file system.

After all this, you can easy schema part of components by running
```
sb-mig sync components --all --ext
```

This command will sync all your components, `local one`, those from `node_modules`. Command will always favor local schema components, that way you can also overwrites schema files, which will be shown in next section.

## Overwriting schema files from scoped components
So, you can install components with `sb-mig add components` command, but let's say you want to restrict something in schema of that components, or you want to change `description` of the component, or even a `component_group_name`. We have overwrites mechanism.

Let's say you've installed `@storyblok-components/section` component which has following original schema:
```
module.exports = {
  name: 'section',
  schema: {
    title: { 
      type: 'text', 
    },
    content: {
      type: 'bloks',
      restrict_components: false,
    },
  },
}
```

And your goal is to overwrite some of the schema properties: you want to give a proper description to it, you want to assign it to group, and you want to restrict that only `image` and `heading` component can be nested in it. Lets do that.

1. We have to create schema file with the same name and extension, wherever in our project. So in that example, let's create `src/overwrites` folder and `section.sb.js` file.
2. Now, we will import original schema file, and write our overwrites. Take a look at final overwrites for `section` component

```
const section = require("@storyblok-components/section)

module.exports = {
  ...section
  name: 'section',
  description: 'This is my awesome section component overwrites',
  schema: {
    ...section.schema,
    content: {
      restrict_components: true,
      component_whitelist: [
        'image',
        'heading'
      ],
    },
  },
}
```

Now, if we run `sb-mig sync components --all --ext`, `sb-mig` will sync all components, and in the situation above, it will choose proper schema file (is always prefer local schema files over node_modules one).

## Generate whole starter project

1. Create folder with custom name and get inside
2. Create `storyblok.config.js` file if u want to use custom gatsby storyblok starter, or custom npm component scope

```
module.exports = {
  ...
  boilerplateUrl: "git@github.com:your-custom-gatsby-storyblok-boilerplate.git",
  componentsDirectories: ["src", "storyblok","node_modules/@custom-scope","node_modules/@storyblok-components"],
  ...
}

```

3. Create `.env` file only with your storyblok oauth token (which you can get from your storyblok account - this is needed for script to have access to creating space api)

```
STORYBLOK_OAUTH_TOKEN=1234567890qwertyuiop
```

4. Install `generate-project` `sb-mig` plugin.
```
sb-mig plugins:install generate-project
```

5. Run

```
sb-mig generate "My Greatest Project"
```

It will generate basic boilerplate.

If u want to specify components you would like to add you can do that by adding parameter to the command, and list of components (list of all public available components in @storyblok-components scope: [npm list](https://www.npmjs.com/settings/storyblok-components/packages)):

```
sb-mig generate "My Greatest Project" --add @custom-scope/ui-text-block @storyblok-components/ui-surface
```

6. You can also pass `--copy` flag, which will copy component files from `node_modules` to your local, and add it properly to `components.js` file.
```
sb-mig generate "My Greatest Project" --add @custom-scope/ui-text-block @storyblok-components/ui-surface --copy
```

7. Wait for magic to happen.
8. Run sync command to sync all components to storyblok.

```
sb-mig sync components --all --ext
```

7. `npm start`
8. Enjoy your new project.

# Usage

```sh-session
$ sb-mig help
CLI to rule the world. (and handle stuff related to Storyblok CMS)

VERSION
  sb-mig/2.0.0-beta.5 darwin-x64 node-v12.16.2

USAGE
  $ sb-mig [COMMAND]

COMMANDS
  backup  Command for backing up anything related to Storyblok
  debug   Output extra debugging
  help    display help for sb-mig
  sync    Synchronize components, datasources with Storyblok space.
```

# Commands

<!-- commands -->
* [`sb-mig backup`](#sb-mig-backup)
* [`sb-mig debug`](#sb-mig-debug)
* [`sb-mig help [COMMAND]`](#sb-mig-help-command)
* [`sb-mig plugins`](#sb-mig-plugins)
* [`sb-mig plugins:inspect PLUGIN...`](#sb-mig-pluginsinspect-plugin)
* [`sb-mig plugins:install PLUGIN...`](#sb-mig-pluginsinstall-plugin)
* [`sb-mig plugins:link PLUGIN`](#sb-mig-pluginslink-plugin)
* [`sb-mig plugins:uninstall PLUGIN...`](#sb-mig-pluginsuninstall-plugin)
* [`sb-mig plugins:update`](#sb-mig-pluginsupdate)
* [`sb-mig sync TYPE [LIST]`](#sb-mig-sync-type-list)

## `sb-mig backup`

Command for backing up anything related to Storyblok

```
Command for backing up anything related to Storyblok

USAGE
  $ sb-mig backup

OPTIONS
  -R, --allRoles                                 Backup all roles and permissions.
  -a, --allComponents                            Backup all components.
  -d, --allDatasources                           Backup all datasources.
  -e, --datasourceEntries=datasourceEntries      Backup one datasource entries by datasource name.
  -f, --oneComponentsGroup=oneComponentsGroup    Backup one components group by name.
  -g, --allComponentsGroups                      Backup all components groups.
  -h, --help                                     show CLI help
  -i, --onePreset=onePreset                      Backup one preset by id.
  -l, --allPresets                               Backup all presets.
  -o, --oneComponent=oneComponent                Backup one component by name.
  -p, --oneComponentPresets=oneComponentPresets  Backup all presets for one component
  -r, --oneRole=oneRole                          Backup one role by name.
  -x, --oneDatasource=oneDatasource              Backup one datasource by name.
```

_See code: [lib/commands/backup.js](https://github.com/sb-mig/sb-mig/blob/v2.9.11/lib/commands/backup.js)_

## `sb-mig debug`

Output extra debugging.

```
Output extra debugging.

USAGE
  $ sb-mig debug

OPTIONS
  -h, --help  show CLI help
```

_See code: [lib/commands/debug.js](https://github.com/sb-mig/sb-mig/blob/v2.9.11/lib/commands/debug.js)_

## `sb-mig help [COMMAND]`

display help for sb-mig

```
display help for <%= config.bin %>

USAGE
  $ sb-mig help [COMMAND]

ARGUMENTS
  COMMAND  command to show help for

OPTIONS
  --all  see all commands in CLI
```

_See code: [@oclif/plugin-help](https://github.com/oclif/plugin-help/blob/v2.2.3/src/commands/help.ts)_

## `sb-mig plugins`

List installed plugins.

```
List installed plugins.

USAGE
  $ sb-mig plugins

OPTIONS
  --core  Show core plugins.

EXAMPLE
  $ sb-mig plugins
```

_See code: [@oclif/plugin-plugins](https://github.com/oclif/plugin-plugins/blob/v2.0.11/src/commands/plugins/index.ts)_

## `sb-mig plugins:inspect PLUGIN...`

Displays installation properties of a plugin.

```
Displays installation properties of a plugin.

USAGE
  $ sb-mig plugins:inspect PLUGIN...

ARGUMENTS
  PLUGIN  [default: .] Plugin to inspect.

OPTIONS
  -h, --help     Show CLI help.
  -v, --verbose

EXAMPLE
  $ sb-mig plugins:inspect myplugin
```

_See code: [@oclif/plugin-plugins](https://github.com/oclif/plugin-plugins/blob/v2.0.11/src/commands/plugins/inspect.ts)_

## `sb-mig plugins:install PLUGIN...`

Installs a plugin into the CLI.

```
Installs a plugin into the CLI.
Can be installed from npm or a git url.

Installation of a user-installed plugin will override a core plugin.

e.g. If you have a core plugin that has a 'hello' command, installing a user-installed plugin with a 'hello' command will override the core plugin implementation. This is useful if a user needs to update core plugin functionality in the CLI without the need to patch and update the whole CLI.


USAGE
  $ sb-mig plugins:install PLUGIN...

ARGUMENTS
  PLUGIN  Plugin to install.

OPTIONS
  -f, --force    Run yarn install with force flag.
  -h, --help     Show CLI help.
  -v, --verbose

DESCRIPTION
  Can be installed from npm or a git url.

  Installation of a user-installed plugin will override a core plugin.

  e.g. If you have a core plugin that has a 'hello' command, installing a user-installed plugin with a 'hello' command 
  will override the core plugin implementation. This is useful if a user needs to update core plugin functionality in 
  the CLI without the need to patch and update the whole CLI.

ALIASES
  $ sb-mig plugins:add

EXAMPLES
  $ sb-mig plugins:install myplugin 
  $ sb-mig plugins:install https://github.com/someuser/someplugin
  $ sb-mig plugins:install someuser/someplugin
```

_See code: [@oclif/plugin-plugins](https://github.com/oclif/plugin-plugins/blob/v2.0.11/src/commands/plugins/install.ts)_

## `sb-mig plugins:link PLUGIN`

Links a plugin into the CLI for development.

```
Links a plugin into the CLI for development.
Installation of a linked plugin will override a user-installed or core plugin.

e.g. If you have a user-installed or core plugin that has a 'hello' command, installing a linked plugin with a 'hello' command will override the user-installed or core plugin implementation. This is useful for development work.


USAGE
  $ sb-mig plugins:link PLUGIN

ARGUMENTS
  PATH  [default: .] path to plugin

OPTIONS
  -h, --help     Show CLI help.
  -v, --verbose

DESCRIPTION
  Installation of a linked plugin will override a user-installed or core plugin.

  e.g. If you have a user-installed or core plugin that has a 'hello' command, installing a linked plugin with a 'hello' 
  command will override the user-installed or core plugin implementation. This is useful for development work.

EXAMPLE
  $ sb-mig plugins:link myplugin
```

_See code: [@oclif/plugin-plugins](https://github.com/oclif/plugin-plugins/blob/v2.0.11/src/commands/plugins/link.ts)_

## `sb-mig plugins:uninstall PLUGIN...`

Removes a plugin from the CLI.

```
Removes a plugin from the CLI.

USAGE
  $ sb-mig plugins:uninstall PLUGIN...

ARGUMENTS
  PLUGIN  plugin to uninstall

OPTIONS
  -h, --help     Show CLI help.
  -v, --verbose

ALIASES
  $ sb-mig plugins:unlink
  $ sb-mig plugins:remove
```

_See code: [@oclif/plugin-plugins](https://github.com/oclif/plugin-plugins/blob/v2.0.11/src/commands/plugins/uninstall.ts)_

## `sb-mig plugins:update`

Update installed plugins.

```
Update installed plugins.

USAGE
  $ sb-mig plugins:update

OPTIONS
  -h, --help     Show CLI help.
  -v, --verbose
```

_See code: [@oclif/plugin-plugins](https://github.com/oclif/plugin-plugins/blob/v2.0.11/src/commands/plugins/update.ts)_

## `sb-mig sync TYPE [LIST]`

Synchronize components, datasources or roles with Storyblok space.

```
Synchronize components, datasources or roles with Storyblok space.

USAGE
  $ sb-mig sync TYPE [LIST]

ARGUMENTS
  TYPE  (components|datasources|roles) What to synchronize
  LIST  Space separated list of component names. Example: card product-card row layout

OPTIONS
  -a, --all          Synchronize all components.
  -e, --ext          Synchronize with file extension. Default extension: '.sb.js'
  -h, --help         show CLI help
  -l, --lock         Synchronize based on storyblok.components.lock.js file
  -n, --packageName  Synchronize based on installed package name.
  -p, --presets      Synchronize components with presets.

EXAMPLES
  $ sb-mig sync components --all --ext
  $ sb-mig sync components @storyblok-components/text-block --ext --packageName
  $ sb-mig sync components @storyblok-components/text-block @storyblok-components/button --ext --packageName
  $ sb-mig sync components text-block button --ext
  $ sb-mig sync components text-block button
  $ sb-mig sync roles
```

_See code: [lib/commands/sync.js](https://github.com/sb-mig/sb-mig/blob/v2.9.11/lib/commands/sync.js)_
<!-- commandsstop -->

# Plugins
`sb-mig` core features are part of this repository. But `sb-mig` is build in a way that you can easily add your own command as a plugin. Here will be the list of plugins, which are already supported by `sb-mig`. For installation instructions see: [TBD](#)

- [plugin-add-components](https://github.com/sb-mig/plugin-add-components) - with this plugin, you can easily install storyblok react components to your project ( compliant with `components.js` file syntax: [TBD](#) )
- [plugin-create-component](https://github.com/sb-mig/plugin-create-component) - with this plugin, you can easily add working dummy component with all needed syntax to monorepos with storyblok components, like this unofficial one [storyblok-components/components](https://github.com/storyblok-components/components) which is deployed to `@storyblok-components` scope of public npm
- [plugin-generate-project](https://github.com/sb-mig/plugin-generate-project) - with this plugin, you need only one command, to generate and bootstrap whole new Storyblok project with provided list of available components. It is also created storyblok space for you, and after command is done, you are ready to develop, edit and use installed components. ()

To build your own plugin, head over to this instruction: [TBD](#)

# Schema documentation:

## Basics

This is what a basic storyblok `.js` schema file which maps to a component looks like:

```
module.exports = {
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

**Important notice:** name inside `.js` schema need to match `.js` filename.

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

The main purpose of `sb-mig` is to sync your `.js` component schema files with your `Storyblok` space.

There are 2 ways to sync your schemas, which to use depends on your file structure. If you are keeping all of your schema files in a single folder, use:

```
sb-mig sync components row column
```

This command will look for `row.js` and `column.js` files inside a directory named `storyblok`. You can change the directory name mapping by modifying `componentDirectory` inside `storyblok.config.js`). [How to install and configure](#how-to-install-and-configure))

```
sb-mig sync components --ext row column
```

This command will look for any file named `row.sb.js` and `column.sb.js` inside `src` and `storyblok` folders. To modify the directories in this case you can set `componentsDirectories` in the config. You can also change the extension searched by changing `schemaFileExt`. [How to install and configure](#how-to-install-and-configure))

## Syncing datasources

You can also sync your `datasources`.

Add `datasourceExt: "your-own-extension",` to your `storyblok.config.js`. If u will not add it, will be used default one (`sb.datasource.js`)

```
// storyblok.config.js
module.exports = {
  ...
  datasourcesDirectory: "mydatasource.ext.js"
  ...
};
```

Create file with `.sb.datasource.js` (or your defined one) extension inside it. Basic schema for datasources file:

```
module.exports = {
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
sb-mig sync datasources icons --ext
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
sb-mig sync datasources icons logos --ext
```

```
✓ Datasource entries for 15558 datasource id has been successfully synced.
✓ Datasource entries for 15559 datasource id has been successfully synced.
```

You can also sync all datasources, and that's the command we strongly recommend. It will sync all datasources also the one from node_modules, so potentially from `storyblok-components`. But will prefer syncing local ones, if there will be clash of datasources filenames (for example, you can have datasource from node_modules, but wanted to overwrite some fields, you will be able to do that.

```
sb-mig sync datasources --all --ext
```


## Presets support

- Experimental

Writing your own predefined data (presets) for components can be a pain, so with `sb-mig` you can create presets for your components in the storyblok gui, and then export them to a schema based `.js` file to be picked up while syncing.

To do so, first create a preset for your component in storyblok:

<img src="https://user-images.githubusercontent.com/8228270/72166029-caf8cc00-33c8-11ea-891b-194f57974653.png" width=300 />
<br>
<img src="https://user-images.githubusercontent.com/8228270/72166255-33e04400-33c9-11ea-9431-c6d0b684f5fb.png" width=300 />

then run

```
sb-mig backup --oneComponentPresets text-block    // component you've created preset for
```

The tool will now download all presets related to the `text-block` component.
Now you can go to your folder structure (by default: `./sbmig/component-presets/`), and rename the generated file to (for example): `text-block-preset`.

You should remove the id field from the preset (it will be looked up by name)

Finally, add the `all_presets` field to your `text-block` component schema.

```
const allPresets = require('./presets/_text-block-preset.json');

module.exports = {
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
sb-mig sync components --presets text-block
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

Link package to easy test it with `sb-mig` command

```
yarn link
```

or use it like that without linking:

```
./bin/run // same as linked `sb-mig` command
```

## Roadmap

- [ ] Sync / Migrate content (stories)
- [ ] Improve preset creation/update
- ~~[ ] End-to-end solution to add / update components~~ // it will be responsibility of different plugin. Check [here](https://github.com/sb-mig/plugin-generate-project)
- [x] Sync Roles
- [x] Sync / Migrate datasources
- [x] Sync components with extensions
- [x] Sync presets
- [x] Sync single component
- [x] Sync all components
- [x] Sync components using schema based .js file (based on idea from [storyblok-migrate](https://github.com/maoberlehner/storyblok-migrate))
- [x] Component groups
- [x] Sync custom fields

The general purpose of this package is to manage creation and maintenance of components from code/command line, to be able to create a whole space and project structure without using GUI.
