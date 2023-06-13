import type { AnyFlags, Result } from "meow";

export interface CLIOptions extends Omit<Result<AnyFlags>, "flags"> {
    flags: any;
}

export type APIKind = "deliveryApi" | "managementApi";
