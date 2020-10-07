export interface IStoryblokComponentConfig {
    name: string;
    version: string;
    modified: boolean;
    location: string;
    scope: string;
    isLinkedInComponentFile: boolean;
}
export interface IStoryblokComponentsConfig {
    [name: string]: IStoryblokComponentConfig;
}
export interface IInstalledComponents {
    scope: string | undefined;
    name: string | undefined;
}
export declare class StoryblokComponentsConfig {
    private data;
    private storyblokComponentsConfigUrl;
    constructor(data: IStoryblokComponentsConfig);
    writeComponentsConfigFile(data: IStoryblokComponentsConfig): boolean;
    updateComponentsConfigFile(): boolean;
    addComponentsToComponentsConfigFile(installedComponents: IInstalledComponents[], local: boolean): IStoryblokComponentsConfig;
    getAllData(): IStoryblokComponentsConfig;
    getSingleData(componentName: string): IStoryblokComponentConfig;
    setAllData(data: IStoryblokComponentsConfig): void;
    setSingleData(singleComponentData: IStoryblokComponentConfig): void;
}
declare const _default: StoryblokComponentsConfig;
export default _default;
