# E2E Tests

These tests run **actual CLI commands** and verify the complete end-to-end workflow of sb-mig.

## ⚠️ Important Warnings

1. **These tests modify real data!** - They sync components to your Storyblok space.
2. **Use a dedicated test space** - Never run these tests against a production space.
3. **CLI must be built first** - Run `yarn build` before running E2E tests.

## Setup

1. Copy `.env.example` to `.env`:

    ```bash
    cp .env.example .env
    ```

2. Fill in your Storyblok credentials:

    ```env
    STORYBLOK_SPACE_ID=your-space-id
    STORYBLOK_ACCESS_TOKEN=your-personal-access-token
    ```

3. Enable E2E tests:

    ```env
    STORYBLOK_E2E_TESTS=true
    ```

4. Build the CLI:
    ```bash
    yarn build
    ```

## Running Tests

```bash
# Run only E2E tests
yarn test:e2e

# Run with verbose output
STORYBLOK_DEBUG=true yarn test:e2e

# Run a specific test file
yarn test:e2e -- sync-components.e2e.test.ts
```

## Test Structure

| File                          | Description                              |
| ----------------------------- | ---------------------------------------- |
| `setup.ts`                    | CLI execution helpers and test utilities |
| `cli-basic.e2e.test.ts`       | Basic CLI commands (--help, --version)   |
| `sync-components.e2e.test.ts` | Full sync workflow tests                 |

## What These Tests Verify

### CLI Functionality

-   Commands execute without errors
-   Help text is displayed correctly
-   Version is displayed correctly

### Sync Workflow

-   Components are discovered correctly
-   Components are synced to Storyblok
-   Components are updated when changed
-   `--all` flag syncs all components

## Adding New Tests

1. Use the helpers from `setup.ts`:

    ```typescript
    import {
        skipIfNoE2ETests,
        runCli,
        runCliAsync,
        createTestDirectory,
    } from "./setup.js";
    ```

2. Always skip if E2E tests are disabled:

    ```typescript
    it.skipIf(skipIfNoE2ETests())("should do something", async () => {
        // test code
    });
    ```

3. Create isolated test directories:

    ```typescript
    const testDir = createTestDirectory("my-test");
    // ... run tests
    cleanupTestDirectory(testDir);
    ```

4. Clean up created resources:
    ```typescript
    afterAll(async () => {
        cleanupTestDirectory(testDir);
        await cleanupComponent(componentId, config);
    });
    ```
