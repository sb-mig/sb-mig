export const mainDescription = `
    USAGE
      $ sb-mig [command]
    
    COMMANDS
        sync      Synchronize components, datasources, roles, stories, assets with Storyblok space.
        discover  Discover components, migration configs and write to file or stdout.
        backup    Command for backing up anything related to Storyblok
        migrate   Migrate content from space to space, or from file to space.
        language-publish-state
                  Build a read-only Storyblok story language publish-state map.
        story-versions
                  Inspect raw Management API story version history for one story.
        published-layer-export
                  Export draft/current and published story layers as JSON.
        debug     Output extra debugging information
        help      This screen
    
    Examples
      $ sb-mig sync components --all
      $ sb-mig debug  
`;

export const storyVersionsDescription = `
    Usage
        $ sb-mig story-versions --from [spaceId] --storyId [storyId]
        $ sb-mig story-versions --from [spaceId] --withSlug [full_slug]

    Description
        Read Storyblok Management API story_versions for a single story.
        This command is read-only and is meant for inspecting version status values and content shape.

    FLAGS
        --from            - Source space ID to inspect
        --storyId         - Story ID to inspect
        --withSlug        - Story full_slug to resolve to a story ID
        --showContent     - Include version content from Storyblok. Default: true
        --page            - Versions page. Default: 1
        --perPage         - Versions per page. Default: 25
        --raw             - Print the raw Storyblok API response instead of the compact summary
        --outputPath      - Optional file path for JSON output

    EXAMPLES
        $ sb-mig story-versions --from 12345 --storyId 98765
        $ sb-mig story-versions --from 12345 --withSlug tours/europe --raw --outputPath sbmig/story-versions/tours-europe.raw.json
`;

export const publishedLayerExportDescription = `
    Usage
        $ sb-mig published-layer-export --from [spaceId] --all
        $ sb-mig published-layer-export --from [spaceId] --storyId [storyId]
        $ sb-mig published-layer-export --from [spaceId] --withSlug [full_slug]
        $ sb-mig published-layer-export --from [spaceId] --startsWith [prefix]

    Description
        Read selected Management API stories and their latest published Story Versions API content.
        This command is read-only against Storyblok. It writes JSON files for inspecting draft/current and published layers before changing migrate behavior.

    FLAGS
        --from            - Source space ID to inspect
        --all             - Export all non-folder stories
        --storyId         - Story ID to export. Can be repeated.
        --withSlug        - Exact story full_slug to export. Can be repeated.
        --startsWith      - Filter stories by starts_with prefix
        --fileName        - Stable output base name
        --outputPath      - Output directory. Default: sbmig/published-layer-export
        --versionsPerPage - Story versions per page. Default: 25
        --maxVersionPages - Maximum Story Versions API pages to inspect per story. Default: 4

    OUTPUT
        <name>---draft-current-full.json
        <name>---published-layer-full.json
        <name>---dual-layer-summary.json

    EXAMPLES
        $ sb-mig published-layer-export --from 12345 --withSlug translation-migration-testing/test-1/contact-us
        $ sb-mig published-layer-export --from 12345 --storyId 178888427520390
        $ sb-mig published-layer-export --from 12345 --startsWith translation-migration-testing --fileName translation-test
`;

export const languagePublishStateDescription = `
    Usage
        $ sb-mig language-publish-state --from [spaceId]

    Description
        Read stories from a source Storyblok space and write a JSON map of default and translated language publication states.
        This command is read-only against Storyblok. It uses Management API for story listing and default-language state, and Delivery API for translated language published/draft comparisons.

    FLAGS
        --from            - Source space ID to inspect
        --accessToken     - Optional source space Delivery API access token override. Falls back to configured accessToken.
        --languages       - Languages to inspect: all, default,fr,de. Default: all
        --withSlug        - Exact story full_slug to inspect. Can be repeated.
        --startsWith      - Filter stories by starts_with prefix
        --fileName        - Stable output base name under sbmig/language-publish-state
        --outputPath      - Explicit output path for the generated JSON file

    EXAMPLES
        $ sb-mig language-publish-state --from 12345 --startsWith about-ef --languages all --fileName about-ef-prod
        $ sb-mig language-publish-state --from 12345 --accessToken xxx --withSlug about-ef/testimonials --languages default,fr
`;

export const syncDescription = `
    Usage
        $ sb-mig sync [components|roles|datasources|plugins|content] [space separated file names] or --all
        
    Description
        Synchronize components, roles, datasources, plugins, content with Storyblok space.
        
    COMMANDS
        components      - sync components
        roles           - sync roles
        datasources     - sync datasources
        plugins         - sync plugins
        content         - sync content (stories, assets) - ! right now destructive, it will move content from 1 space to another, completelly overwriting it
     
    FLAGS
        --all           - Sync all components, roles, datasources                            [components, roles, datasources]
        --presets       - Pass it, if u want to sync also with presets (will take longer)    [components only]
        --dry-run       - Preview planned changes without making writes                      [components, roles, datasources, plugins, content]
        
        --yes           - Skip ask for confirmation (dangerous, but useful in CI/CD)         [content only]
        --from          - Space ID from which you want to sync content                       [content only]
        --to            - Space ID to which you want to sync content                         [content only]
        --syncDirection [fromSpaceToFile|fromFileToSpace|fromSpaceToSpace|fromAWStoSpace]               
                        - Sync direction (from, to)                                          [content only]
    
    EXAMPLES
        $ sb-mig sync components --all
        $ sb-mig sync components --all --dry-run
        $ sb-mig sync components --all --presets
        $ sb-mig sync components accordion accordion-item
        $ sb-mig sync components accordion accordion-item --presets
        
        $ sb-mig sync roles --all
        $ sb-mig sync roles --all --dry-run
        
        $ sb-mig sync datasources --all
        $ sb-mig sync datasources --all --dry-run
        
        $ sb-mig sync plugins my-awesome-plugin - (you have to be in catalog which has ./dist/export.js file with compiled plugin)
        
        $ sb-mig sync content --all --from 12345 --to 12345
        $ sb-mig sync content --stories --from 12345 --to 12345
        $ sb-mig sync content --assets --from 12345 --to 12345
`;

export const copyDescription = `
    Usage
        $ sb-mig copy
        
    Description
        Copy stuff
        
    COMMANDS
        ?
     
    FLAGS
        ?
    
    EXAMPLES
        $ sb-mig copy ?
`;

export const migrateDescription = `
    Usage
        $ sb-mig migrate [content] [space separated file names] or --all --from [spaceId] --to [spaceId] --migration [migration-config-filename]
        $ sb-mig migrate content --all --migration migration-a --migration migration-b --migration migration-c
        
    Description
        Migrate content from space to space, or from file to space. It's potentially dangerous command, so it will ask for confirmation.
        Use with care.
        
    COMMANDS
        content           - migrate content 
     
    FLAGS
        --from            - Space ID from which you want to migrate / or file name if passed '--migrate-from file'
        --fromFilePath    - Direct path to stories JSON file when using '--migrate-from file'
        --to              - Space ID to which you want to migrate
        --migrate-from    - Migrate from (space, file) default: space
        --migration       - File name of migration file (without extension). Can be repeated for ordered pipeline in content migration.
        --migrationComponentAlias - Add extra component aliases for a migration. Repeatable. Format: <migration>:<source>=<alias1>,<alias2>
        --migrationComponents - Override the exact component scope for a migration. Repeatable. Format: <migration>:<component1>,<component2>
        --withSlug        - Filter stories by full slug (can be repeated)
        --startsWith      - Filter stories by starts_with prefix
        --yes             - Skip ask for confirmation (dangerous, but useful in CI/CD)
        --dry-run         - Preview what would be migrated without making any API changes
        --publicationMode - How migrate content should preserve Storyblok publication state. Values: preserve-layers, collapse-draft, save-only. Default: preserve-layers. [content only]
        --publicationLanguages - Language scope to inspect and preserve when publicationMode publishes stories. Values: default, all, or comma-separated Storyblok language codes. Default: all. [content only]
        --languagePublishStatePath - Optional JSON file generated by 'language-publish-state'. When omitted, migrate builds the language publish-state map automatically for the selected stories. [content only]
        --fileName        - Stable base name for migration output files (disables timestamp suffix for migration artifacts)

    EXAMPLES
        $ sb-mig migrate content --all --from 12345 --to 12345 --migration file-with-migration
        $ sb-mig migrate content --all --from 12345 --to 12345 --migration migration-a --migration migration-b --migration migration-c
        $ sb-mig migrate content --all --from 12345 --to 12345 --migration colorPickerModeValues --migrationComponentAlias colorPickerModeValues:sb-button=sb-open-drift-button
        $ sb-mig migrate content --all --from 12345 --to 12345 --migration colorPickerModeValues --migrationComponentAlias colorPickerModeValues:sb-section=sb-tour-page-section --migrationComponents colorPickerModeValues:sb-section,sb-tour-page-section
        $ sb-mig migrate content --all --from 12345 --to 12345 --migration file-with-migration --withSlug blog/home --withSlug docs/getting-started
        $ sb-mig migrate content --all --from 12345 --to 12345 --migration file-with-migration --startsWith blog/
        $ sb-mig migrate content --all --from 12345 --to 12345 --migration file-with-migration --publicationMode preserve-layers --yes
        $ sb-mig migrate content --all --from 12345 --to 12345 --migration file-with-migration --publicationMode collapse-draft --publicationLanguages all --yes
        $ sb-mig migrate content --all --from 12345 --to 12345 --migration file-with-migration --publicationMode preserve-layers --publicationLanguages all --dry-run
        $ sb-mig migrate content --all --from 12345 --to 12345 --migration file-with-migration --publicationMode preserve-layers --publicationLanguages all --languagePublishStatePath sbmig/language-publish-state/prod-language-state.json --yes
        $ sb-mig migrate content --all --from 12345 --to 12345 --migration file-with-migration --publicationMode collapse-draft --publicationLanguages default,fr,de --yes
        $ sb-mig migrate content --all --from 12345 --to 12345 --migration v3toV4AllMigrations --dry-run --fileName brand-hub-v3-v4-run
        $ sb-mig migrate content --all --migrate-from file --from file-with-stories --to 12345 --migration file-with-migration
        $ sb-mig migrate content --all --migrate-from file --fromFilePath sbmig/migrations/dry-run--123---story-to-migrate__2026-2-9_20-51.json --to 12345 --migration migration-a --migration migration-b
        $ sb-mig migrate content my-component-1 my-component-2 --from 12345 --to 12345 --migration file-with-migration
        $ sb-mig migrate content my-component-1 my-component-2 --migrate-from file --from file-with-stories --to 12345 --migration file-with-migration        
`;

export const revertDescription = `
    Usage
        $ sb-mig revert [content] --migration
        
    Description
        Revert content migration
        
    COMMANDS
        content           - revert content migration 
     
    FLAGS
        --migration       - ???
        --yes             - Skip ask for confirmation (dangerous, but useful in CI/CD) 
    
    EXAMPLES
        $ sb-mig revert content --migration        
`;

export const discoverDescription = `
    Usage
        $ sb-mig discover [components|migrations] --all --write

    Description
        Discover all components or migration configs and write to file or stdout

    COMMANDS
        components     - discover components
        migrations     - discover migration config files

    FLAGS
        --all          - Discover all components or migration configs
        --write        - Write to file

    EXAMPLES
        $ sb-mig discover components --all
        $ sb-mig discover components --all --write
        $ sb-mig discover migrations --all
`;

export const migrationsDescription = `
    Usage
        $ sb-mig migrations recognize
        
    Description
        Recognize migrations you need to apply
        
    COMMANDS
        recognize      - recognize migrations
     
    FLAGS 
    
    EXAMPLES
        $ sb-mig migrations recognize

`;

export const removeDescription = `
    Usage
        $ sb-mig remove [components|roles|datasources] [space separated file names] or --all 
        
    Description
        Remove components or roles with Storyblok space.
        
    COMMANDS
        components     - remove components
        roles          - remove roles
        datasources    - remove datasources
     
    FLAGS
        --all          - Remove all components 
    
    EXAMPLES
        $ sb-mig remove components --all
        $ sb-mig remove components accordion accordion-item
        $ sb-mig remove roles --all
        $ sb-mig remove datasources --all
`;

export const backupDescription = `
    Usage
        $ sb-mig backup [components|component-groups|roles|datasources|presets|component-presets] component-name or --all
    Description
        Command for backing up anything related to Storyblok
        
    COMMANDS
        components        - backup components
        component-groups  - backup component-groups
        roles             - backup components
        datasources       - backup components
        presets           - backup presets
        component-presets - backup component presets
        plugins           - backup plugins
        stories           - backup stories (only --all)

     
    FLAGS
        --all   - Backup all 
    
    EXAMPLES
        $ sb-mig backup components --all
        $ sb-mig backup components accordion  
        $ sb-mig backup datasources --all
        $ sb-mig backup roles admin
        $ sb-mig backup plugins --all
        $ sb-mig backup plugins my-awesome-plugin
        $ sb-mig backup stories --all
`;

export const debugDescription = `
    Usage
        $ sb-mig debug
    Description
        Output extra debugging information
`;

export const initDescription = `
    Usage
        $ sb-mig init
    Description
        Init and update your project
`;
