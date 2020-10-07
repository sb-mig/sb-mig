export default class Logger {
    name: any;
    constructor(name: any);
    static bigLog(content: any): void;
    static log(content: any): void;
    static success(content: any): void;
    static warning(content: any): void;
    static error(content: any, { verbose }?: {
        verbose: boolean;
    }): void;
}
