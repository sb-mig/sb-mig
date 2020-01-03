# How to use

You have to create `.env` file with your variables:

```
STORYBLOK_OAUTH_TOKEN=1234567890qwertyuiop
STORYBLOK_SPACE_ID=12345
STORYBLOK_ACCESS_TOKEN=zxcvbnmasdfghjkl
```

## Usage
```
Usage: sb-mig [options]

Options:
  -V, --version                   output the version number
  -d, --debug                     Output extra debugging
  -a, --all-components            Get all components
  -c, --component <type>          Get single component
  -q, --all-presets               Get all presets
  -p, --preset <type>             Get preset by id
  -d, --component-presets <type>  Get all presets for single component
  -s, --sb-client                 Make test request using StoryblokClient
  -h, --help                      output usage information
```
