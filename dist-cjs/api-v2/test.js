"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.testConnection = testConnection;
exports.testAsyncConnection = testAsyncConnection;
/**
 * Simple test function with no dependencies to verify ESM/CJS interop
 */
function testConnection() {
    return {
        success: true,
        message: "sb-mig api-v2 connection successful!",
        timestamp: new Date().toISOString(),
    };
}
/**
 * Async test function to verify async imports work
 */
async function testAsyncConnection() {
    // Simulate a small delay
    await new Promise((resolve) => setTimeout(resolve, 100));
    return {
        success: true,
        message: "sb-mig api-v2 async connection successful!",
    };
}
