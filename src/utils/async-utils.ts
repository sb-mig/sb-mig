/**
 * Async utility functions
 */

/**
 * Delay execution for a specified time
 *
 * @param time - Time to delay in milliseconds
 * @returns Promise that resolves after the delay
 *
 * @example
 * await delay(1000); // Wait 1 second
 */
export const delay = (time: number): Promise<void> =>
    new Promise((resolve) => setTimeout(resolve, time));

export const mapWithConcurrency = async <T, R>(
    items: T[],
    concurrency: number,
    mapper: (item: T, index: number) => Promise<R>,
): Promise<R[]> => {
    if (items.length === 0) {
        return [];
    }

    const limit = Math.max(1, Math.floor(concurrency));
    const results = new Array<R>(items.length);
    let nextIndex = 0;

    const workers = Array.from(
        { length: Math.min(limit, items.length) },
        async () => {
            while (nextIndex < items.length) {
                const currentIndex = nextIndex++;
                results[currentIndex] = await mapper(
                    items[currentIndex] as T,
                    currentIndex,
                );
            }
        },
    );

    await Promise.all(workers);

    return results;
};
