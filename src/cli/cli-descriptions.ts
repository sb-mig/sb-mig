export const mainDescription = `
    USAGE
      $ sb-mig [command]

    COMMANDS
        sync                    Synchronize components, roles, datasources, plugins, stories, and assets.
        copy                    Copy Storyblok stories or folders between spaces.
        discover                Discover local components and migration config files.
        backup                  Back up Storyblok resources to local JSON files.
        migrate                 Run story or preset data migrations.
        language-publish-state  Build a read-only story language publish-state map.
        story-versions          Inspect raw Management API story version history for one story.
        published-layer-export  Export draft/current and published story layers as JSON.
        remove                  Remove components or stories from a Storyblok space.
        revert                  Restore stories from a local story backup file.
        migrations              Recognize migration commands to run for a package upgrade.
        init                    Initialize project Storyblok environment settings.
        debug                   Output extra debugging information.
        help                    Show this screen.

    EXAMPLES
      $ sb-mig sync components --all
      $ sb-mig migrate content --all --from 12345 --to 12345 --migration file-with-migration --dry-run
      $ sb-mig copy stories --sourceSpace 12345 --targetSpace 67890 --what folder/* --where target-folder
`;

export const storyVersionsDescription = `
    USAGE
        $ sb-mig story-versions --from [spaceId] --storyId [storyId]
        $ sb-mig story-versions --from [spaceId] --withSlug [full_slug]

    DESCRIPTION
        Read Storyblok Management API story_versions for a single story.
        This command is read-only and is meant for inspecting version status values and content shape.

    FLAGS
        --from            Source space ID to inspect. Required.
        --storyId         Story ID to inspect. Required unless --withSlug is passed.
        --withSlug        Story full_slug to resolve to a story ID. Required unless --storyId is passed.
        --showContent     Include version content from Storyblok. Default: true.
        --page            Versions page. Default: 1.
        --perPage         Versions per page. Default: 25.
        --raw             Print the raw Storyblok API response instead of the compact summary.
        --outputPath      Optional file path for JSON output.

    SIDE EFFECTS
        Read-only against Storyblok. Writes a local JSON file only when --outputPath is passed.

    EXAMPLES
        $ sb-mig story-versions --from 12345 --storyId 98765
        $ sb-mig story-versions --from 12345 --withSlug tours/europe --raw --outputPath sbmig/story-versions/tours-europe.raw.json
`;

export const publishedLayerExportDescription = `
    USAGE
        $ sb-mig published-layer-export --from [spaceId] --all
        $ sb-mig published-layer-export --from [spaceId] --storyId [storyId]
        $ sb-mig published-layer-export --from [spaceId] --withSlug [full_slug]
        $ sb-mig published-layer-export --from [spaceId] --startsWith [prefix]

    DESCRIPTION
        Read selected Management API stories and their latest published Story Versions API content.
        This command is read-only against Storyblok. It writes JSON files for inspecting draft/current and published layers before changing migrate behavior.

    FLAGS
        --from            Source space ID to inspect. Required.
        --all             Export all non-folder stories.
        --storyId         Story ID to export. Can be repeated.
        --withSlug        Exact story full_slug to export. Can be repeated.
        --startsWith      Filter stories by starts_with prefix.
        --fileName        Stable output base name.
        --outputPath      Output directory. Default: sbmig/published-layer-export.
        --versionsPerPage Story versions per page. Default: 25.
        --maxVersionPages Maximum Story Versions API pages to inspect per story. Default: 4.

    OUTPUT
        <name>---draft-current-full.json
        <name>---published-layer-full.json
        <name>---dual-layer-summary.json

    SIDE EFFECTS
        Read-only against Storyblok. Always writes local JSON export files.

    EXAMPLES
        $ sb-mig published-layer-export --from 12345 --withSlug translation-migration-testing/test-1/contact-us
        $ sb-mig published-layer-export --from 12345 --storyId 178888427520390
        $ sb-mig published-layer-export --from 12345 --startsWith translation-migration-testing --fileName translation-test
`;

export const languagePublishStateDescription = `
    USAGE
        $ sb-mig language-publish-state --from [spaceId]

    DESCRIPTION
        Read stories from a source Storyblok space and write a JSON map of default and translated language publication states.
        This command is read-only against Storyblok. It uses Management API for story listing and default-language state, and Delivery API for translated language published/draft comparisons.

    FLAGS
        --from            Source space ID to inspect. Required.
        --accessToken     Optional source space Delivery API access token override. Falls back to configured accessToken.
        --languages       Languages to inspect: all, default,fr,de. Default: all.
        --withSlug        Exact story full_slug to inspect. Can be repeated.
        --startsWith      Filter stories by starts_with prefix.
        --fileName        Stable output base name under sbmig/language-publish-state.
        --outputPath      Explicit output path for the generated JSON file.

    SIDE EFFECTS
        Read-only against Storyblok. Writes a local JSON publish-state map.

    EXAMPLES
        $ sb-mig language-publish-state --from 12345 --startsWith about-ef --languages all --fileName about-ef-prod
        $ sb-mig language-publish-state --from 12345 --accessToken xxx --withSlug about-ef/testimonials --languages default,fr
`;

export const syncDescription = `
    USAGE
        $ sb-mig sync components [component-name ...] | --all [--presets] [--ssot] [--dry-run]
        $ sb-mig sync roles [role-name ...] | --all [--dry-run]
        $ sb-mig sync datasources [datasource-name ...] | --all [--dry-run]
        $ sb-mig sync plugins [plugin-name ...] [--dry-run]
        $ sb-mig sync content (--all | --stories | --assets) --from [spaceId] --to [spaceId-or-file] --syncDirection [direction]

    DESCRIPTION
        Synchronize components, roles, datasources, plugins, stories, and assets with Storyblok.

    COMMANDS
        components      Sync local component schema files to Storyblok.
        roles           Sync local role schema files to Storyblok.
        datasources     Sync local datasource schema files to Storyblok.
        plugins         Sync a provided plugin. Run from a plugin folder with ./dist/export.js.
        content         Sync stories and/or assets between spaces, local files, or AWS content hub data.

    FLAGS
        --all           Sync all supported resources for the selected command.
        --stories       Sync only stories. [content only]
        --assets        Sync only assets. [content only]
        --presets       Also sync component presets and set default presets. [components only]
        --ssot          Single Source of Truth mode. Removes GUI-only components and replaces them with code versions. [components only]
        --packageName   External package name used when resolving provided components. [components only]
        --dry-run       Preview planned changes without making writes. [components, roles, datasources, plugins, content]
        --yes           Skip confirmation prompts. [components --ssot, destructive content sync]
        --from          Source space ID or local story file name, depending on --syncDirection. [content only]
        --to            Target space ID or local output file name, depending on --syncDirection. [content only]
        --syncDirection Sync direction. Values: fromSpaceToFile, fromFileToSpace, fromSpaceToSpace, fromAWSToSpace. [content only]

    SIDE EFFECTS
        components, roles, datasources, and plugins write to Storyblok unless --dry-run is passed.
        content with fromSpaceToSpace or fromFileToSpace can delete all target stories before recreating them.
        content with fromSpaceToFile writes local story and asset backup files.

    GOTCHAS
        --syncDirection is required for content sync.
        fromFileToSpace is implemented for stories, but assets log that it is not implemented.
        fromAWSToSpace is implemented for stories. Assets log that unsupported directions are not implemented.
        --ssot is destructive for components and prompts unless --yes is passed.

    EXAMPLES
        $ sb-mig sync components --all
        $ sb-mig sync components --all --dry-run
        $ sb-mig sync components --all --presets
        $ sb-mig sync components --all --ssot --yes
        $ sb-mig sync components accordion accordion-item --presets

        $ sb-mig sync roles --all
        $ sb-mig sync roles admin editor --dry-run

        $ sb-mig sync datasources --all
        $ sb-mig sync datasources countries cities --dry-run

        $ sb-mig sync plugins my-awesome-plugin

        $ sb-mig sync content --all --from 12345 --to 67890 --syncDirection fromSpaceToSpace --yes
        $ sb-mig sync content --stories --from 12345 --to all-stories-backup --syncDirection fromSpaceToFile
        $ sb-mig sync content --stories --from all-stories-backup --to 67890 --syncDirection fromFileToSpace --dry-run
        $ sb-mig sync content --stories --from 12345 --to 67890 --syncDirection fromAWSToSpace
`;

export const copyDescription = `
    USAGE
        $ sb-mig copy stories --sourceSpace [spaceId] --targetSpace [spaceId] --what [full_slug] --where [target_folder_full_slug]
        $ sb-mig copy stories --sourceSpace [spaceId] --targetSpace [spaceId] --what [folder_full_slug]
        $ sb-mig copy stories --sourceSpace [spaceId] --targetSpace [spaceId] --what [folder_full_slug]/* --where [target_folder_full_slug]

    DESCRIPTION
        Copy Storyblok stories or folders from one space to a folder in another space.

    COMMANDS
        stories         Copy one story, one folder with its root, or a folder's children recursively.

    FLAGS
        --sourceSpace   Source Storyblok space ID. Falls back to configured spaceId.
        --targetSpace   Target Storyblok space ID. Falls back to configured spaceId.
        --what          Source story or folder full_slug. Use folder/* to copy a folder's children without the folder root.
        --where         Target folder full_slug where copied stories are attached.

    SIDE EFFECTS
        Writes copied stories into the target Storyblok space.

    GOTCHAS
        --what must resolve to an existing source story or folder.
        --where must resolve to an existing target folder.
        folder/* requires the source path before /* to be a folder.
        Copy currently logs internal strategy details while it runs.

    EXAMPLES
        $ sb-mig copy stories --sourceSpace 12345 --targetSpace 67890 --what blog/post-1 --where imported
        $ sb-mig copy stories --sourceSpace 12345 --targetSpace 67890 --what blog --where imported
        $ sb-mig copy stories --sourceSpace 12345 --targetSpace 67890 --what blog/* --where imported
`;

export const migrateDescription = `
    USAGE
        $ sb-mig migrate content [component-name ...] --from [spaceId] --to [spaceId] --migration [migration-config]
        $ sb-mig migrate content --all --from [spaceId] --to [spaceId] --migration [migration-config]
        $ sb-mig migrate presets --all --from [spaceId-or-file] --to [spaceId] --migration [migration-config]

    DESCRIPTION
        Migrate story content or presets using local migration config files.
        This is a potentially destructive command. It prompts for confirmation unless --yes or --dry-run is passed.

    COMMANDS
        content         Migrate story content for all components or provided component names.
        presets         Migrate presets. Supports --all and exactly one --migration value.

    FLAGS
        --from            Source space ID, or local file name when --migrate-from file is used.
        --fromFilePath    Direct path to stories or presets JSON when using --migrate-from file.
        --to              Target Storyblok space ID.
        --migrate-from    Migrate from space or file. Default: space.
        --migration       Migration file name without extension. Can be repeated for ordered content pipelines. Presets support exactly one.
        --migrationComponentAlias
                          Add extra component aliases for a migration. Repeatable. Format: <migration>:<source>=<alias1>,<alias2>.
        --migrationComponents
                          Override the exact component scope for a migration. Repeatable. Format: <migration>:<component1>,<component2>.
        --withSlug        Filter stories by full_slug. Can be repeated. [content only]
        --startsWith      Filter stories by starts_with prefix. [content only]
        --yes             Skip confirmation prompts.
        --dry-run         Preview what would be migrated without making API changes.
        --publicationMode How migrate content should preserve Storyblok publication state. Values: preserve-layers, collapse-draft, save-only. Default: preserve-layers. [content only]
        --publicationLanguages
                          Language scope to inspect and preserve when publicationMode publishes stories. Values: default, all, or comma-separated Storyblok language codes. Default: all. [content only]
        --languagePublishStatePath
                          Optional JSON file generated by language-publish-state. When omitted, migrate builds the map automatically for selected stories. [content only]
        --fileName        Stable base name for migration output files.

    SIDE EFFECTS
        content writes migrated stories to Storyblok unless --dry-run is passed.
        content creates a story backup before provided-component migrations unless --dry-run is passed.
        presets backs up all remote presets before writing migrated presets unless --dry-run is passed.

    GOTCHAS
        At least one --migration value is required.
        preserve-layers currently requires --migrate-from space and requires --from and --to to be the same Storyblok space.
        --publicationLanguages cannot be used with --publicationMode save-only.
        --languagePublishStatePath cannot be used with --publicationMode save-only.
        --publicationMode, --publicationLanguages, and --languagePublishStatePath are only supported for migrate content, not migrate presets.
        Legacy flags --publish, --publishLanguages, and --preservePublishedLayer are rejected. Use --publicationMode and --publicationLanguages instead.

    EXAMPLES
        $ sb-mig migrate content --all --from 12345 --to 12345 --migration file-with-migration --dry-run
        $ sb-mig migrate content --all --from 12345 --to 12345 --migration migration-a --migration migration-b --migration migration-c --yes
        $ sb-mig migrate content --all --from 12345 --to 12345 --migration colorPickerModeValues --migrationComponentAlias colorPickerModeValues:sb-button=sb-open-drift-button
        $ sb-mig migrate content --all --from 12345 --to 12345 --migration colorPickerModeValues --migrationComponents colorPickerModeValues:sb-section,sb-tour-page-section
        $ sb-mig migrate content --all --from 12345 --to 12345 --migration file-with-migration --withSlug blog/home --withSlug docs/getting-started
        $ sb-mig migrate content --all --from 12345 --to 12345 --migration file-with-migration --startsWith blog/
        $ sb-mig migrate content --all --from 12345 --to 12345 --migration file-with-migration --publicationMode preserve-layers --yes
        $ sb-mig migrate content --all --from 12345 --to 12345 --migration file-with-migration --publicationMode collapse-draft --publicationLanguages default,fr,de --yes
        $ sb-mig migrate content --all --migrate-from file --from file-with-stories --to 12345 --migration file-with-migration
        $ sb-mig migrate content --all --migrate-from file --fromFilePath sbmig/migrations/dry-run--123---story-to-migrate.json --to 12345 --migration migration-a --migration migration-b
        $ sb-mig migrate content my-component-1 my-component-2 --from 12345 --to 12345 --migration file-with-migration
        $ sb-mig migrate presets --all --from 12345 --to 12345 --migration preset-migration --dry-run
        $ sb-mig migrate presets --all --migrate-from file --fromFilePath sbmig/presets/presets-backup.json --to 12345 --migration preset-migration
`;

export const revertDescription = `
    USAGE
        $ sb-mig revert content --from [stories-file-name] --to [spaceId] [--yes]

    DESCRIPTION
        Restore stories from a local story backup file into a Storyblok space.

    COMMANDS
        content         Revert content by updating target stories from a local story backup.

    FLAGS
        --from          Local story backup file name to discover and load.
        --to            Target Storyblok space ID to update.
        --yes           Skip confirmation prompt.

    SIDE EFFECTS
        Writes stories to the target Storyblok space.
        Creates a target-space story backup before restoring.
        Restored stories are updated with publish: false.

    GOTCHAS
        This command restores local story files directly and does not run migration configs.
        The --from value is resolved as a local story file name, not a source space ID.

    EXAMPLES
        $ sb-mig revert content --from 12345--backup-before-migration --to 12345
        $ sb-mig revert content --from prod-stories-backup --to 12345 --yes
`;

export const discoverDescription = `
    USAGE
        $ sb-mig discover components --all [--write] [--file file-name]
        $ sb-mig discover migrations --all

    DESCRIPTION
        Discover local and external component schema files or migration config files.

    COMMANDS
        components      Discover component schema files.
        migrations      Discover migration config files.

    FLAGS
        --all           Discover all components or migration config files.
        --write         Write discovered component names to a local file. [components only]
        --file          Output file name when --write is passed. [components only]

    SIDE EFFECTS
        Read-only unless --write is passed.
        --write creates or overwrites a local component list file.

    EXAMPLES
        $ sb-mig discover components --all
        $ sb-mig discover components --all --write
        $ sb-mig discover components --all --write --file all-components
        $ sb-mig discover migrations --all
`;

export const migrationsDescription = `
    USAGE
        $ sb-mig migrations recognize --from [version] [--to version]

    DESCRIPTION
        Recognize migration commands to run for a package upgrade by comparing an old version with a target version.

    COMMANDS
        recognize       Print recommended story and preset migration commands.

    FLAGS
        --from          Previous package version. Required.
        --to            Target package version. Optional. Falls back to the installed @ef-global/backpack dependency version.

    SIDE EFFECTS
        Reads local applied-backpack-migrations.json when present.
        Reads local package.json when --to is omitted.
        Does not write files or call Storyblok.

    EXAMPLES
        $ sb-mig migrations recognize --from 3.4.0
        $ sb-mig migrations recognize --from 3.4.0 --to 4.0.0
`;

export const removeDescription = `
    USAGE
        $ sb-mig remove components [component-name ...] | --all
        $ sb-mig remove story --all --from [spaceId]

    DESCRIPTION
        Remove components or all stories from a Storyblok space.

    COMMANDS
        components      Remove all or provided components from Storyblok.
        story           Remove all stories from a Storyblok space.
        roles           Not implemented; currently logs a warning only.
        datasources     Not implemented; currently logs a warning only.

    FLAGS
        --all           Remove all resources for the selected command.
        --from          Target space ID when removing stories. [story only]

    SIDE EFFECTS
        components writes deletes to Storyblok.
        story --all --from deletes all stories from the provided Storyblok space.

    GOTCHAS
        roles and datasources are currently no-op commands.
        story removal is destructive and does not prompt for confirmation.

    EXAMPLES
        $ sb-mig remove components --all
        $ sb-mig remove components accordion accordion-item
        $ sb-mig remove story --all --from 12345
`;

export const backupDescription = `
    USAGE
        $ sb-mig backup components [component-name] | --all
        $ sb-mig backup component-groups [group-name] | --all
        $ sb-mig backup roles [role-name] | --all
        $ sb-mig backup datasources [datasource-name] | --all
        $ sb-mig backup presets [preset-id] | --all
        $ sb-mig backup component-presets [component-name] | --all [--metadata]
        $ sb-mig backup plugins [plugin-name] | --all
        $ sb-mig backup stories --all

    DESCRIPTION
        Back up Storyblok resources to local JSON files.

    COMMANDS
        components        Back up components.
        component-groups  Back up component groups.
        roles             Back up roles.
        datasources       Back up datasources.
        presets           Back up presets.
        component-presets Back up presets attached to components.
        plugins           Back up plugins.
        stories           Back up all stories from the configured space.

    FLAGS
        --all             Back up all resources for the selected command.
        --metadata        Include selected package.json metadata in component-presets --all output.

    SIDE EFFECTS
        Reads from Storyblok and writes local JSON backup files.

    EXAMPLES
        $ sb-mig backup components --all
        $ sb-mig backup components accordion
        $ sb-mig backup component-groups hero-group
        $ sb-mig backup datasources --all
        $ sb-mig backup roles admin
        $ sb-mig backup presets --all
        $ sb-mig backup component-presets accordion --metadata
        $ sb-mig backup plugins --all
        $ sb-mig backup plugins my-awesome-plugin
        $ sb-mig backup stories --all
`;

export const debugDescription = `
    USAGE
        $ sb-mig debug

    DESCRIPTION
        Output extra debugging information about resolved Storyblok config, sb-mig version, dependency versions, and package module type.

    SIDE EFFECTS
        Reads local config and package metadata. Does not call Storyblok.
`;

export const initDescription = `
    USAGE
        $ sb-mig init project --spaceId [spaceId] --oauthToken [token] --region [eu|us|cn] [--gtmToken token]

    DESCRIPTION
        Initialize project Storyblok environment settings.

    COMMANDS
        project         Create a local .env file and update the Storyblok space preview domain.

    FLAGS
        --spaceId       Storyblok space ID. Required.
        --oauthToken    Storyblok Management API OAuth token. Required.
        --region        Storyblok region. Values: eu, us, cn. Required.
        --gtmToken      Optional Google Tag Manager token. Defaults to put-your-gtm-token-here.

    SIDE EFFECTS
        Writes a local .env file.
        Calls Storyblok Management API to read the space and update the space preview domain.

    EXAMPLES
        $ sb-mig init project --spaceId 12345 --oauthToken xxx --region eu
        $ sb-mig init project --spaceId 12345 --oauthToken xxx --region us --gtmToken GTM-XXXX
`;
