# How to use

You have to create `.env` file with your variables:

```
STORYBLOK_OAUTH_TOKEN=1234567890qwertyuiop
STORYBLOK_SPACE_ID=12345
STORYBLOK_ACCESS_TOKEN=zxcvbnmasdfghjkl
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
  -V, --version                             output the version number
  -d, --debug                               Output extra debugging
  -a, --all-components                      Get all components
  -c, --component <component-name>          Get single component by name
  -q, --all-presets                         Get all presets
  -p, --preset <preset-id>                  Get preset by id
  -d, --component-presets <component-name>  Get all presets for single component by name
  -s, --sb-client                           Make test request using StoryblokClient
  -h, --help                                output usage information
```
