import { AnyFlags, Result } from "meow";

export interface CLIOptions extends Omit<Result<AnyFlags>, "flags"> {
    flags: any;
}
