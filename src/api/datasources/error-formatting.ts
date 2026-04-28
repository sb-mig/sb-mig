export const formatDatasourceApiError = (err: any) => {
    const details: string[] = [];
    const status = err?.response?.status;
    const statusText = err?.response?.statusText;
    const responseData = err?.response?.data;

    if (status || statusText) {
        details.push(
            `status: ${[status, statusText].filter(Boolean).join(" ")}`,
        );
    }

    if (responseData?.message) {
        details.push(`message: ${responseData.message}`);
    }

    if (responseData?.error) {
        details.push(`error: ${responseData.error}`);
    }

    if (responseData?.errors) {
        details.push(
            `errors: ${
                typeof responseData.errors === "string"
                    ? responseData.errors
                    : JSON.stringify(responseData.errors)
            }`,
        );
    }

    if (!details.length && err?.message) {
        details.push(`message: ${err.message}`);
    }

    return details.length ? details.join("; ") : String(err);
};
