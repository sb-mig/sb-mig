export const mainDescription = `
    CLI to rule the world. (and handle stuff related to Storyblok CMS)
    
    USAGE
      $ sb-mig [command]
    
    COMMANDS
        sync Synchronize components, datasources or roles with Storyblok space.
        backup  Command for backing up anything related to Storyblok
        debug   Output extra debugging information
        help    This screen
    
    Examples
      $ sb-migv-3 sync
      $ sb-mig-v3 debug  
`;

export const syncDescription = `
    Usage
        $ sb-mig-v3 sync [components|roles|datasources] [space separated file names] or --all --packageName
        
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
        $ sb-mig sync components accordion accordion-item
        $ sb-mig sync components @storyblok-components/accordion --packageName
    
`;

export const backupDescription = `
    Usage
        $ sb-mig-v3 backup [components|component-groups|roles|datasources|presets|component-presets] [space separated file names ] or --all
    Description
        Command for backing up anything related to Storyblok
        
    COMMANDS
        components        - backup components
        component-groups  - backuo component-groups
        roles             - backup components
        datasources       - backup components
        presets           - backup presets
        component-presets - backup component presets
     
    FLAGS
        --all   - Backup all 
        --one   - Backup one 
    
    EXAMPLES
        $ sb-mig backup components --all
        $ sb-mig backup components accordion accordion-item carousel text-block
        $ sb-mig backup datasources --all
        $ sb-mig backup roles admin normal-user
`;

export const debugDescription = `
    Usage
        $ sb-mig-v3 debug
    Description
        Output extra debugging information
`;
