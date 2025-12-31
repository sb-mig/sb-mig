/**
 * Simple test function with no dependencies to verify ESM/CJS interop
 */
export function testConnection(): {
    success: boolean;
    message: string;
    timestamp: string;
} {
    return {
        success: true,
        message: "sb-mig api-v2 connection successful!",
        timestamp: new Date().toISOString(),
    };
}

/**
 * Async test function to verify async imports work
 */
export async function testAsyncConnection(): Promise<{
    success: boolean;
    message: string;
}> {
    // Simulate a small delay
    await new Promise((resolve) => setTimeout(resolve, 100));
    return {
        success: true,
        message: "sb-mig api-v2 async connection successful!",
    };
}
