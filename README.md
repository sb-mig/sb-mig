# How to use

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
  -d, --debug                                                 Output extra debugging
  -a, --all-components                                        Get all components
  -c, --component <component-name>                            Get single component by name
  -q, --all-presets                                           Get all presets
  -p, --preset <preset-id>                                    Get preset by id
  -d, --component-presets <component-name>                    Get all presets for single component by name
  -s, --sb-client                                             Make test request using StoryblokClient
  -z, --get-sb-test-component <storyblok-component>           Get test storyblok schema based component
  -x, --get-react-test-component <storyblok-react-component>  Get test react matching to schema based component
  -h, --help                                                  output usage information
```

## Roadmap:
- [ ] Upload presets
- [ ] Upload components
- [ ] Upload components using schema based .js file
- [ ] Component groups

Generally, purpose of this package is to manage creation and maintainance of components and other stuff, from code/command line.
To be able to create whole space and basic structure of the project without using GUI.
