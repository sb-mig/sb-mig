export const mainDescription = `
    USAGE
      $ sb-mig [command]
    
    COMMANDS
        sync Synchronize components, datasources or roles with Storyblok space.
        backup  Command for backing up anything related to Storyblok
        debug   Output extra debugging information
        help    This screen
    
    Examples
      $ sb-mig sync
      $ sb-mig debug  
`;

export const syncDescription = `
    Usage
        $ sb-mig sync [components|roles|datasources] [space separated file names] or --all --packageName
        
    Description
        Synchronize components or roles with Storyblok space.
        
    COMMANDS
        components     - sync components
        roles          - sync roles
        datasources    - sync datasources
     
    FLAGS
        --all          - Sync all components
        --packageName  - Sync based on package name, instead of file name (package can have multiple schema files to sync)
        --presets      - Pass it, if u want to sync also with presets (will take longer) 
    
    EXAMPLES
        $ sb-mig sync components --all
        $ sb-mig sync components --all --presets
        $ sb-mig sync components accordion accordion-item
        $ sb-mig sync components accordion accordion-item --presets
        $ sb-mig sync components @storyblok-components/accordion --packageName
        $ sb-mig sync components @storyblok-components/accordion --packageName --presets
        $ sb-mig sync roles --all
        $ sb-mig sync datasources --all
`;

export const backupDescription = `
    Usage
        $ sb-mig backup [components|component-groups|roles|datasources|presets|component-presets] component-name --one or --all
    Description
        Command for backing up anything related to Storyblok
        
    COMMANDS
        components        - backup components
        component-groups  - backup component-groups
        roles             - backup components
        datasources       - backup components
        presets           - backup presets
        component-presets - backup component presets
     
    FLAGS
        --all   - Backup all 
        --one   - Backup one 
    
    EXAMPLES
        $ sb-mig backup components --all
        $ sb-mig backup components accordion --one  
        $ sb-mig backup datasources --all
        $ sb-mig backup roles admin --one
`;

export const debugDescription = `
    Usage
        $ sb-mig debug
    Description
        Output extra debugging information
`;
