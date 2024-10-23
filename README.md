
<p align="center">
    <img width="250" height="250" src="./sb-mig-logo.png" alt="Logo" />
</p>
If you've found an issue or you have feature request - <a href="https://github.com/marckraw/sb-mig/issues/new">open an issue</a> or look if it was <a href="https://github.com/sb-mig/sb-mig/issues/">already created</a>.
<br />

[![npm](https://img.shields.io/npm/v/sb-mig.svg)](https://www.npmjs.com/package/sb-mig)
[![npm](https://img.shields.io/npm/dt/sb-mig.svg)](ttps://img.shields.io/npm/dt/sb-mig.svg)
[![GitHub issues](https://img.shields.io/github/issues/sb-mig/sb-mig.svg?style=flat-square&v=1)](https://github.com/sb-mig/sb-mig/issues?q=is%3Aopen+is%3Aissue)
![npm](https://img.shields.io/npms-io/maintenance-score/sb-mig)



# Requirements:

|               |               |
| ------------- | ------------- |
| Node          | LTS (18.x.x)  |

# 5.x.x version released!

## Important Updates
- Complete codebase overhaul to facilitate the utilization of features and requests to Storyblok. This development decreases the tight coupling with CLI, while improving folder and file structure.
- New feature: Content synchronization (including stories and assets) in various directions, ranging from space to space, from space to file, and from file to space.
- New feature: Introduced support for TypeScript Schema, with the added ability to precompile them on-the-fly before synchronization, improving usage with sb-mig.
- New feature: Plugin synchronization capabilities.
- New feature: 'Discover' command.
- New feature: 'Migrate' command (tailored for Storyblok's Site Builder).
- Upgraded eslint configuration for more efficient coding practices.
- Updated all dependencies to their latest stable versions.
- Refreshed Github Actions workflows to enhance development practices.
- Expanded test coverage (with more additions anticipated).

## Breaking changes
- Please note that sb-mig no longer extends support for Node versions older than 18.x.x, as part of its adoption of native ESM support.
- The sb-mig backup command has now been aligned with all other commands, causing minor changes in its execution (although functionalities have been preserved).

Do not hesitate to get in touch if you encounter any issues or require further clarification on any points.


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

# Schema documentation:

## Basics

This is what a basic storyblok `.sb.js` schema file which maps to a component looks like:

```
export default {
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


# Releasing

## Flow of branching out and merging
- Before creating feature branch from beta, make sure you have newest beta. (by `git pull origin beta`).
- Create feature branch from beta
- Do your changes
- Create PR from feature branch to beta (it will run checks on your feature branch)
- Merge PR to beta (it will release beta channel)
- Create PR from beta to master (it will run checks on beta branch)
- Merge PR to master (it will release stable channel)
- After release properly done, make sure to pull master to beta (by `git pull origin master`), Push directly, resolve conflicts in favor of master.

## Roadmap

- [x] Sync / Migrate content (stories)
- [x] Improve preset creation/update
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
