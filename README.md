<p align="center">
    <img width="250" height="250" src="./sb-mig-logo.png" alt="Logo" />
</p>

## Contents

- [How to install and configure](#how-to-install-and-configure)
  - [Usage](#usage)
- [Schema documentation:](#schema-documentation)
  - [Basics](#basics)
  - [Presets support](#presets-support)
  - [Roadmap](#roadmap)

---

# How to install and configure

```
npm install --global sb-mig
```

You have to create `.env` file with your variables:

```
STORYBLOK_OAUTH_TOKEN=1234567890qwertyuiop
STORYBLOK_SPACE_ID=12345
STORYBLOK_ACCESS_TOKEN=zxcvbnmasdfghjkl
```

if u want to use experimental feature of downloading `.js` files from seed project (storyblok schema based files, and react-match-storyblok files), you have to add and set github access token

```
GITHUB_TOKEN=1234567890-qwertyuiop
SEED_REPO=https://raw.githubusercontent.com/your-org/your-seed-project/master
```

You can also provide your custom config. To do that u have to create `storyblok.config.js` file in your root catalog with following structure:

```
// storyblok.config.js
module.exports = {
  componentDirectory: 'sbmig/storyblok',
  storyblokApiUrl: 'https://api.storyblok.com/v1',
  oauthToken: process.env.STORYBLOK_OAUTH_TOKEN,
  spaceId: process.env.STORYBLOK_SPACE_ID,
  accessToken: process.env.STORYBLOK_ACCESS_TOKEN,
  githubToken: process.env.GITHUB_TOKEN,
  seedRepo: process.env.SEED_REPO
};
```

You don't need to pass everything to the config file. If u want to have only `componentDirectory` as custom below code will be also valid.

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
  -V, --version                                               output the version number
  -s, --sync                                                  Sync provided components from schema with
  -S, --sync-all                                              Sync all components from schema with
  -g, --all-components-groups                                 Get all component groups
  -c, --components-group <components-group-name>              Get single components group by name
  -a, --all-components                                        Get all components
  -c, --component <component-name>                            Get single component by name
  -q, --all-presets                                           Get all presets
  -p, --preset <preset-id>                                    Get preset by id
  -d, --component-presets <component-name>                    Get all presets for single component by name
  -z, --get-sb-test-component <storyblok-component>           Get test storyblok schema based component
  -x, --get-react-test-component <storyblok-react-component>  Get test react matching to schema based component
  -d, --debug                                                 Output extra debugging
  -h, --help                                                  output usage information




  * - experimental feature, use with caution
```

# Schema documentation:

## Basics

This is basic look of the schema based `.js` file which will map to `Storyblok` component

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

Basically you should be able to add anything mentioned here: https://www.storyblok.com/docs/api/management#core-resources/components/components for your component. (with exception to `component_group_uuid`, you insert `component_group_name` and `sb-mig` will resolve `uuid` automagically).

You can also add `tabs` to your component schema (which is not documented in above storyblok documenation):

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

## Presets support

- Experimental

While writing your own predefined data (presets) for components is pretty hard, with `sb-mig` you can create presets for your components in graphical user interface in Storyblok, export preset, and apply it to schema based `.js` file to be picked up, while syncing component.

First create Preset for your component in Storyblok:

<img src="https://user-images.githubusercontent.com/8228270/72166029-caf8cc00-33c8-11ea-891b-194f57974653.png" width=300 />
<br>
<img src="https://user-images.githubusercontent.com/8228270/72166255-33e04400-33c9-11ea-9431-c6d0b684f5fb.png" width=300 />

then, run

```
sb-mig --component-presets text-block    // component you've created preset for
```

It will download all presets related to the `text-block` component.
Now you can go to your folder structure (by default: `./sbmig/component-presets/`).
Rename file which is there to for example: `text-block-preset`.

You should remove id field from preset (it will be handled with name)

Now you can add `all_presets` field to tyour `text-block` component schema.

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

Now, you can sync your component

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

## Roadmap

- [x] Sync presets
- [x] Sync single component
- [x] Sync all components
- [x] Sync components using schema based .js file (based on idea from [storyblok-migrate](https://github.com/maoberlehner/storyblok-migrate))
- [x] Component groups
- [ ] Improve preset creation/update

General purpose of this package is to manage creation and maintainance of components and other stuff, from code/command line.
To be able to create whole space and basic structure of the project without using GUI.
