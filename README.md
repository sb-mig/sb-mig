<p align="center">
    <img width="250" height="250" src="./sb-mig-logo.png" alt="Logo" />
</p>
If you've found an issue or you have feature request - <a href="https://github.com/marckraw/sb-mig/issues/new">open an issue</a> or look if it was <a href="https://github.com/marckraw/sb-mig/issues/">already created</a>.

[![npm](https://img.shields.io/npm/v/sb-mig.svg)](https://www.npmjs.com/package/sb-mig)
[![npm](https://img.shields.io/npm/dt/sb-mig.svg)](ttps://img.shields.io/npm/dt/sb-mig.svg)
[![GitHub issues](https://img.shields.io/github/issues/marckraw/sb-mig.svg?style=flat-square&v=1)](https://github.com/marckraw/sb-mig/issues?q=is%3Aopen+is%3Aissue)
[![GitHub closed issues](https://img.shields.io/github/issues-closed/marckraw/sb-mig.svg?style=flat-square&v=1)](https://github.com/marckraw/sb-mig/issues?q=is%3Aissue+is%3Aclosed)

## Contents

- [How to install and configure](#how-to-install-and-configure)
  - [Usage](#usage)
- [Schema documentation:](#schema-documentation)
  - [Basics](#basics)
  - [Syncing components](#syncing-components)
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

## Usage

```
        _                           _
  ___  | |__            _ __ ___   (_)   __ _
 / __| | '_ \   _____  | '_ ` _ \  | |  / _` |
 \__ \ | |_) | |_____| | | | | | | | | | (_| |
 |___/ |_.__/          |_| |_| |_| |_|  \__, |
                                        |___/
Usage: sb-mig [options]

Options:
  -V, --version                                               Output the version number
  -s, --sync                                                  Sync provided components from schema
  -x, --ext                                                   Use only with --sync, By default sync with *.sb.js extension
  -S, --sync-all                                              Sync all components from schemas
  -g, --all-components-groups                                 Get all component groups
  -c, --components-group <components-group-name>              Get single components group by name
  -a, --all-components                                        Get all components
  -c, --component <component-name>                            Get single component by name
  -q, --all-presets                                           Get all presets
  -p, --preset <preset-id>                                    Get preset by id
  -d, --component-presets <component-name>                    Get all presets for single component by name
  -d, --debug                                                 Output extra debugging
  -h, --help                                                  Output options information
```

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
sb-mig --sync row column
```

This command will look for `row.js` and `column.js` files inside a directory named `storyblok`. You can change the directory name mapping by modifying `componentDirectory` inside `storyblok.config.js`). [How to install and configure](#how-to-install-and-configure))

```
sb-mig --sync --ext row column
```

This command will look for any file named `row.sb.js` and `column.sb.js` inside `src` and `storyblok` folders. To modify the directories in this case you can set `componentsDirectories` in the config. You can also change the extension searched by changing `schemaFileExt`. [How to install and configure](#how-to-install-and-configure))

## Presets support

- Experimental

Writing your own predefined data (presets) for components can be a pain, so with `sb-mig` you can create presets for your components in the storyblok gui, and then export them to a schema based `.js` file to be picked up while syncing.

To do so, first create a preset for your component in storyblok:

<img src="https://user-images.githubusercontent.com/8228270/72166029-caf8cc00-33c8-11ea-891b-194f57974653.png" width=300 />
<br>
<img src="https://user-images.githubusercontent.com/8228270/72166255-33e04400-33c9-11ea-9431-c6d0b684f5fb.png" width=300 />

then run

```
sb-mig --component-presets text-block    // component you've created preset for
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
sb-mig --sync text-block
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
git clone git@github.com:marckraw/sb-mig.git
```

then change below lines in `package.json`

```
...
"main": "./dist/index.js",
...
 "bin": {
    "sb-mig": "./dist/index.js"
  },
...
```

to

```
...
"main": "./src/index.js",
...
 "bin": {
    "sb-mig": "./src/index.js"
  },
...
```

Now when you link the package it will use the version of the library from `src` folder, rather than the minified one.

Run `npm link` in the root folder of `sb-mig`, and it will be linked as global `sb-mig`

## Roadmap

- [ ] Improve preset creation/update
- [ ] Sync / Migrate datasources
- [ ] Sync / Migrate content (stories)
- [ ] Generate whole project + choose components to use
- [ ] End-to-end solution to add / update components
- [x] Sync components with extensions
- [x] Sync presets
- [x] Sync single component
- [x] Sync all components
- [x] Sync components using schema based .js file (based on idea from [storyblok-migrate](https://github.com/maoberlehner/storyblok-migrate))
- [x] Component groups
- [ ] Sync custom fields

The general purpose of this package is to manage creation and maintenance of components from code/command line, to be able to create a whole space and project structure without using GUI.
