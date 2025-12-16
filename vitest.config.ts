import { defineConfig } from "vitest/config";

export default defineConfig({
    test: {
        globals: true,
        environment: "node",
        include: ["__tests__/**/*.test.ts"],
        exclude: ["node_modules", "dist", "dist-tests"],
        // Use threads pool with single thread to avoid ESM worker issues
        pool: "threads",
        poolOptions: {
            threads: {
                singleThread: true,
            },
        },
        coverage: {
            provider: "v8",
            reporter: ["text", "html", "lcov"],
            include: ["src/**/*.ts"],
            exclude: ["src/scripts/**", "src/**/*.types.ts"],
            reportsDirectory: "./coverage",
            // Coverage thresholds - will fail CI if not met
            thresholds: {
                // Start with reasonable thresholds, can increase as more tests are added
                lines: 15,
                functions: 15,
                branches: 10,
                statements: 15,
            },
        },
        testTimeout: 10000,
        hookTimeout: 10000,
    },
});
