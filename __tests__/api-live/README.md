# Live API Tests

These tests make **real HTTP requests** to the Storyblok Management API. They verify that our API wrapper functions work correctly with the actual `storyblok-js-client` library.

## ⚠️ Important Warnings

1. **These tests modify real data!** - They create, update, and delete components/stories in your Storyblok space.
2. **Use a dedicated test space** - Never run these tests against a production space.
3. **Rate limits apply** - Tests include delays to respect Storyblok's rate limits.

## Setup

1. Copy `.env.example` to `.env`:

    ```bash
    cp .env.example .env
    ```

2. Fill in your Storyblok credentials:

    ```env
    STORYBLOK_SPACE_ID=your-space-id
    STORYBLOK_OAUTH_TOKEN=your-personal-access-token
    ```

    > **Note on tokens:**
    >
    > - `STORYBLOK_OAUTH_TOKEN` - Personal Access Token (PAT) for **Management API** (required for these tests)
    > - `NEXT_PUBLIC_STORYBLOK_ACCESS_TOKEN` - Preview/Public token for **Delivery API** (not needed for these tests)

3. Enable live tests:
    ```env
    STORYBLOK_LIVE_TESTS=true
    ```

## Running Tests

```bash
# Run only live API tests
npm run test:api-live

# Run with verbose output
STORYBLOK_DEBUG=true npm run test:api-live

# Run a specific test file
npm run test:api-live -- components.live.test.ts
```

## Test Structure

| File                      | Description                                |
| ------------------------- | ------------------------------------------ |
| `setup.ts`                | Test utilities, helpers, and configuration |
| `components.live.test.ts` | Tests for component CRUD operations        |
| `stories.live.test.ts`    | Tests for story CRUD operations            |
| `spaces.live.test.ts`     | Tests for space operations                 |

## What These Tests Verify

### Contract Tests

- API response structure matches what our code expects
- Detects breaking changes in `storyblok-js-client`

### Integration Tests

- Our wrapper functions work correctly with real API
- Pagination works as expected
- Error handling works correctly

## Adding New Tests

1. Use the helpers from `setup.ts`:

    ```typescript
    import {
        skipIfNoLiveTests,
        createLiveApiConfig,
        waitForRateLimit,
    } from "./setup.js";
    ```

2. Always skip if live tests are disabled:

    ```typescript
    it.skipIf(skipIfNoLiveTests())("should do something", async () => {
        // test code
    });
    ```

3. Clean up after yourself:

    ```typescript
    afterAll(async () => {
        await cleanupComponent(createdId, config);
    });
    ```

4. Respect rate limits:
    ```typescript
    beforeEach(async () => {
        await waitForRateLimit(300);
    });
    ```
