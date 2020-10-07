import { flags } from "@oclif/command";
import Command from '../core';
export default class Backup extends Command {
    static description: string;
    static flags: {
        help: import("@oclif/parser/lib/flags").IBooleanFlag<void>;
        allComponents: import("@oclif/parser/lib/flags").IBooleanFlag<boolean>;
        oneComponent: flags.IOptionFlag<string | undefined>;
        allComponentsGroups: import("@oclif/parser/lib/flags").IBooleanFlag<boolean>;
        oneComponentsGroup: flags.IOptionFlag<string | undefined>;
        oneComponentPresets: flags.IOptionFlag<string | undefined>;
        allPresets: import("@oclif/parser/lib/flags").IBooleanFlag<boolean>;
        onePreset: flags.IOptionFlag<string | undefined>;
        allDatasources: import("@oclif/parser/lib/flags").IBooleanFlag<boolean>;
        oneDatasource: flags.IOptionFlag<string | undefined>;
        datasourceEntries: flags.IOptionFlag<string | undefined>;
    };
    static args: never[];
    run(): Promise<boolean | void>;
}
