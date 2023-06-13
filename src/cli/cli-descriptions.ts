export const mainDescription = `
    USAGE
      $ sb-mig [command]
    
    COMMANDS
        sync      Synchronize components, datasources, roles, stories, assets with Storyblok space.
        discover  Discover components and write to file or stdout.
        backup    Command for backing up anything related to Storyblok
        migrate   Migrate content from space to space, or from file to space.
        debug     Output extra debugging information
        help      This screen
    
    Examples
      $ sb-mig sync components --all
      $ sb-mig debug  
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
        
        --yes           - Skip ask for confirmation (dangerous, but useful in CI/CD)         [content only]
        --from          - Space ID from which you want to sync content                       [content only]
        --to            - Space ID to which you want to sync content                         [content only]
        --syncDirection [fromSpaceToFile|fromFileToSpace|fromSpaceToSpace|fromAWStoSpace]               
                        - Sync direction (from, to)                                          [content only]
    
    EXAMPLES
        $ sb-mig sync components --all
        $ sb-mig sync components --all --presets
        $ sb-mig sync components accordion accordion-item
        $ sb-mig sync components accordion accordion-item --presets
        
        $ sb-mig sync roles --all
        
        $ sb-mig sync datasources --all
        
        $ sb-mig sync plugins my-awesome-plugin - (you have to be in catalog which has ./dist/export.js file with compiled plugin)
        
        $ sb-mig sync content --all --from 12345 --to 12345
        $ sb-mig sync content --stories --from 12345 --to 12345
        $ sb-mig sync content --assets --from 12345 --to 12345
`;

export const migrateDescription = `
    Usage
        $ sb-mig migrate [content] [space separated file names] or --all --from [spaceId] --to [spaceId] --migration [migration-config-filename]
        
    Description
        Migrate content from space to space, or from file to space. It's potentially dangerous command, so it will ask for confirmation.
        Use with care.
        
    COMMANDS
        content           - migrate content 
     
    FLAGS
        --from            - Space ID from which you want to migrate / or file name if passed '--migrate-from file'
        --to              - Space ID to which you want to migrate
        --migrate-from    - Migrate from (space, file) default: space
        --migration       - File name of migration file (without extension)
        --yes             - Skip ask for confirmation (dangerous, but useful in CI/CD) 
    
    EXAMPLES
        $ sb-mig migrate content --all --from 12345 --to 12345 --migration file-with-migration
        $ sb-mig migrate content --all --migrate-from file --from file-with-stories --to 12345 --migration file-with-migration
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
        $ sb-mig discover [components] --all --write
        
    Description
        Discover all component and write to file or stdout
        
    COMMANDS
        components     - discover components
     
    FLAGS
        --all          - Discover all components
        --write        - Write to file 
    
    EXAMPLES
        $ sb-mig discover components --all
        $ sb-mig discover components --all -- write
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
