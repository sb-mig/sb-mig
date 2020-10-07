export declare const getCurrentDirectoryBase: () => string;
export declare const isDirectoryExists: (path: string) => boolean;
export declare const createDir: (dirPath: string) => Promise<void>;
export declare const createJsonFile: (content: string, pathWithFilename: string) => Promise<void>;
export declare const copyFolder: (src: string, dest: string) => Promise<unknown>;
export declare const copyFile: (src: string, dest: string) => Promise<void>;
