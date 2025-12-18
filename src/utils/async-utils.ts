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
