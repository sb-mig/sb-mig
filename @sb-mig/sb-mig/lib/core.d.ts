import Command from '@oclif/command';
import { IStoryblokConfig } from './config/config';
import { StoryblokComponentsConfig } from './config/StoryblokComponentsConfig';
export default abstract class extends Command {
    storyblokConfig(): IStoryblokConfig;
    storyblokComponentsConfig(): StoryblokComponentsConfig;
    files(): {
        getCurrentDirectoryBase: () => string;
        isDirectoryExists: (path: string) => boolean;
        createDir: (dirPath: string) => Promise<void>;
        createJsonFile: (content: string, pathWithFilename: string) => Promise<void>;
        copyFolder: (src: string, dest: string) => Promise<unknown>;
        copyFile: (src: string, dest: string) => Promise<void>;
    };
    api(): {
        discover: {
            findComponents: (componentDirectory: string) => any[];
            findComponentsWithExt: (ext: string) => any[];
            findDatasources: () => any[];
        };
        datasources: {
            getAllDatasources: () => Promise<any>;
            getDatasource: (datasourceName: string) => Promise<any>;
            getDatasourceEntries: (datasourceName: string) => Promise<any>;
            createDatasource: (datasource: any) => Promise<void | {
                data: any;
                datasource_entries: any;
            }>;
            createDatasourceEntry: (datasourceEntry: any, datasourceId: string) => Promise<any>;
            updateDatasourceEntry: (datasourceEntry: any, datasourceId: string, datasourceToBeUpdated: any) => Promise<any>;
            updateDatasource: (datasource: any, temp: any) => Promise<void | {
                data: any;
                datasource_entries: any;
            }>;
            createDatasourceEntries: (datasourceId: string, datasource_entries: any, remoteDatasourceEntries: any) => void;
            syncDatasources: (specifiedDatasources: any) => Promise<void>;
        };
        components: {
            getAllComponents: () => Promise<any>;
            getComponent: (componentName: string) => Promise<any>;
            getComponentsGroup: (groupName: string) => Promise<any>;
            getAllComponentsGroups: () => Promise<any>;
            createComponentsGroup: (groupName: string) => Promise<any>;
            syncComponents: (specifiedComponents: any, ext: string | false, presets: boolean, packageName: boolean) => Promise<void>;
            syncAllComponents: (ext: string | false, presets: boolean) => void;
            updateComponent: (component: any, presets: boolean) => void;
            createComponent: (component: any, presets: boolean) => void;
        };
        presets: {
            getComponentPresets: (componentName: string) => Promise<false | [unknown, unknown, unknown, unknown, unknown, unknown, unknown, unknown, unknown, unknown]>;
            getPreset: (presetId: string) => Promise<any>;
            getAllPresets: () => Promise<any>;
            createPreset: (p: any) => void;
            updatePreset: (p: any) => void;
        };
        spaces: {
            createSpace: (spaceName: string) => Promise<void | import("./types/storyblokTypes").StoryblokManagmentApiResult>;
            getSpace: (spaceId: string) => Promise<import("./types/storyblokTypes").StoryblokResult>;
        };
    };
}
