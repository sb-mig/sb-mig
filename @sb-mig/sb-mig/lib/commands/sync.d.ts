import Command from '../core';
export default class Sync extends Command {
    static description: string;
    static flags: {
        help: import("@oclif/parser/lib/flags").IBooleanFlag<void>;
        all: import("@oclif/parser/lib/flags").IBooleanFlag<boolean>;
        ext: import("@oclif/parser/lib/flags").IBooleanFlag<boolean>;
        packageName: import("@oclif/parser/lib/flags").IBooleanFlag<boolean>;
        presets: import("@oclif/parser/lib/flags").IBooleanFlag<boolean>;
    };
    static strict: boolean;
    static args: ({
        name: string;
        description: string;
        options: string[];
        required: boolean;
    } | {
        name: string;
        description: string;
        options?: undefined;
        required?: undefined;
    })[];
    run(): Promise<void>;
}
