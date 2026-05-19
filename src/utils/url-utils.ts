export type SearchParamValue = string | number | boolean | null | undefined;

type BuildUrlArgs = {
    baseUrl: string;
    pathname?: string;
    searchParams?: Record<string, SearchParamValue>;
};

const withTrailingSlash = (value: string): string =>
    value.endsWith("/") ? value : `${value}/`;

const normalizePathname = (pathname = ""): string =>
    pathname.replace(/^\/+/, "");

export const buildUrl = ({
    baseUrl,
    pathname,
    searchParams = {},
}: BuildUrlArgs): URL => {
    const url = new URL(
        normalizePathname(pathname),
        withTrailingSlash(baseUrl),
    );

    for (const [key, value] of Object.entries(searchParams)) {
        if (value === undefined || value === null) {
            continue;
        }

        url.searchParams.set(key, String(value));
    }

    return url;
};
