import Command from '../core';
export default class Debug extends Command {
    static description: string;
    static flags: {
        help: import("@oclif/parser/lib/flags").IBooleanFlag<void>;
    };
    static args: never[];
    run(): Promise<void>;
}
