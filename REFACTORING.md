# sb-mig Refactoring Roadmap

> **Goal**: Create a clean API-first architecture where the API layer is the single source of truth, CLI is a thin wrapper, and sb-mig-gui consumes the API directly.

## 📋 Status Legend

- ⬜ Not started
- 🟡 In progress
- ✅ Complete
- 🔴 Blocked
- 🔵 Needs discussion

---

## Phase 0: Foundation & Testing Infrastructure ✅

> Before any refactoring, we need a safety net of tests.

### 0.1 Audit Existing Tests
- ✅ Review current test files in `__tests__/`
- ✅ Document what's covered vs what's not
- ✅ Identify critical paths that need tests first

### 0.2 Testing Infrastructure
- ✅ Set up proper test configuration (Vitest for ESM - migrated from Mocha)
- ✅ Create test utilities (mocks for Storyblok API, filesystem, config)
- ✅ Set up CI pipeline for tests (GitHub Actions updated)
- ✅ Add test coverage reporting (v8 provider with thresholds)

### 0.3 Write Critical Path Tests
- ✅ **Components API**: Mock utilities and CRUD logic tests
- ✅ **Stories API**: Mock utilities, tree building, hierarchy tests
- ✅ **Sync flow**: Flag parsing, command types, SSOT mode tests
- ✅ **Discovery**: Virtual filesystem, pattern matching, comparison logic
- ✅ **Copy stories**: Story copying logic and ID remapping tests
- ✅ **Pagination**: `getAllItemsWithPagination` comprehensive tests

### 0.4 CLI Integration Tests
- ✅ Test sync command flag parsing and mode detection
- ✅ Test sync components with various flag combinations
- ✅ Test datasources and roles sync input handling

**Completed:** 84 tests across 9 test files, all passing

---

## Phase 1: API Layer Consolidation

> Move all business logic into the API layer.

### 1.1 Discovery System (`src/cli/utils/discover.ts` → `src/api/discover/`)
- ⬜ Create `src/api/discover/` module structure
- ⬜ Move `discover()` function to API layer
- ⬜ Move `discoverMany()` function to API layer
- ⬜ Move `discoverManyByPackageName()` to API layer
- ⬜ Move `discoverStories()` to API layer
- ⬜ Move `discoverResolvers()` to API layer
- ⬜ Move `compare()` function to API layer
- ⬜ Export from `managementApi`
- ⬜ Update CLI to use new API location
- ⬜ Write tests for discovery module

### 1.2 Migrate Functions (`src/api/migrate.ts` cleanup)
- ⬜ Review current `migrate.ts` - identify what should stay/move
- ⬜ Ensure all sync functions have clean interfaces
- ⬜ Remove `apiConfig` dependency from function signatures (inject instead)
- ⬜ Add proper TypeScript types (remove `any`)

### 1.3 Copy Stories API
- ⬜ Create `src/api/stories/copy.ts`
- ⬜ Implement `copyStoryBetweenSpaces()` in API
- ⬜ Implement `copyStoriesWithHierarchy()` in API
- ⬜ Refactor `cli/commands/copy.ts` to use API
- ⬜ Write tests for copy functionality

### 1.4 Story Tree Building
- ⬜ Ensure `src/api/stories/tree.ts` is complete
- ⬜ Add `buildTreeFromStories()` function
- ⬜ Add `flattenTree()` function
- ⬜ Export properly from `managementApi.stories`

### 1.5 Backup Functions
- ⬜ Move backup logic from CLI to `src/api/backup/`
- ⬜ Create `backupComponents()`, `backupStories()`, `backupAll()`
- ⬜ CLI becomes thin wrapper

---

## Phase 2: Configuration & Dependency Injection

> Make the API layer configurable and testable.

### 2.1 Configuration Refactor
- ⬜ Remove top-level await from `config.ts`
- ⬜ Create `createConfig(options)` factory function
- ⬜ Support runtime configuration (not just file-based)
- ⬜ Allow GUI to pass config without env vars

### 2.2 API Client Factory
- ⬜ Create `createApiClient(config)` factory
- ⬜ Remove global `sbApi` singleton
- ⬜ Each API function receives client as parameter or uses context
- ⬜ Makes testing with mocks much easier

### 2.3 Context Pattern (Optional)
- ⬜ Consider `createSbMigContext(config)` that bundles client + config
- ⬜ Pass context to all API functions
- ⬜ Evaluate if this improves DX

---

## Phase 3: Type Safety

> Eliminate `any` types, create proper interfaces.

### 3.1 Core Types
- ⬜ Create `src/types/` directory for shared types
- ⬜ Define `StoryblokComponent` type properly
- ⬜ Define `StoryblokStory` type properly
- ⬜ Define `StoryblokAsset` type properly
- ⬜ Define all API response types

### 3.2 API Function Signatures
- ⬜ Audit all functions for `any` usage
- ⬜ Replace with proper types
- ⬜ Add return type annotations everywhere
- ⬜ Enable `strict: true` in tsconfig (eventually)

### 3.3 Shared Types Package (Optional)
- ⬜ Evaluate if `@sb-mig/types` package makes sense
- ⬜ Would be shared between CLI and GUI
- ⬜ Consider monorepo setup

---

## Phase 4: CLI Cleanup

> Make CLI a thin wrapper over API.

### 4.1 Command Refactoring
- ⬜ `sync.ts` - Ensure only parsing + API calls
- ⬜ `backup.ts` - Ensure only parsing + API calls
- ⬜ `copy.ts` - Ensure only parsing + API calls
- ⬜ `discover.ts` - Ensure only parsing + API calls
- ⬜ `migrate.ts` - Ensure only parsing + API calls
- ⬜ `remove.ts` - Ensure only parsing + API calls
- ⬜ `revert.ts` - Ensure only parsing + API calls

### 4.2 Remove CLI-specific Logic
- ⬜ Move `askForConfirmation` to CLI utilities (not API)
- ⬜ Keep logging/output in CLI layer
- ⬜ API should return results, CLI formats them

---

## Phase 5: sb-mig-gui Integration

> GUI uses API directly, no CLI spawning.

### 5.1 Export API for External Use
- ⬜ Update `package.json` exports for library use
- ⬜ Create clean public API surface
- ⬜ Document programmatic usage

### 5.2 GUI Migration
- ⬜ Remove `sbmig.service.ts` CLI spawning
- ⬜ Import API directly: `import { managementApi } from 'sb-mig'`
- ⬜ Remove `storyblok.service.ts` duplicated logic
- ⬜ Use sb-mig's story/tree functions

### 5.3 GUI-Specific Features
- ⬜ Evaluate what's GUI-only (discovery for file picker, etc.)
- ⬜ These may remain in GUI but use API utilities

---

## Phase 6: Documentation & Polish

### 6.1 API Documentation
- ⬜ Document all public API functions
- ⬜ Add usage examples
- ⬜ Create migration guide from v5 to v6

### 6.2 GUI Documentation
- ⬜ Document how GUI uses API
- ⬜ Setup/development instructions

### 6.3 Breaking Changes
- ⬜ List all breaking changes
- ⬜ Provide migration scripts if needed
- ⬜ Coordinate version bump (v6.0.0?)

---

## 🗓️ Suggested Timeline

| Phase | Estimated Effort | Priority | Status |
|-------|-----------------|----------|--------|
| Phase 0 (Testing) | 1-2 weeks | 🔴 Critical | ✅ Complete |
| Phase 1 (API Consolidation) | 2-3 weeks | 🔴 Critical | ⬜ Next |
| Phase 2 (Config/DI) | 1 week | 🟡 High | ⬜ |
| Phase 3 (Types) | 1-2 weeks | 🟡 High | ⬜ |
| Phase 4 (CLI Cleanup) | 1 week | 🟢 Medium | ⬜ |
| Phase 5 (GUI Integration) | 1-2 weeks | 🟢 Medium | ⬜ |
| Phase 6 (Docs) | 1 week | 🟢 Medium | ⬜ |

**Total estimate**: 8-12 weeks for full refactor

---

## 📝 Notes & Decisions

### Open Questions
1. Should we move to a monorepo structure? (sb-mig, @sb-mig/types, sb-mig-gui)
2. What's the minimum Node.js version going forward?
3. Should config support both JS and TS config files?

### Decisions Made
- [x] **Test Framework**: Migrated from Mocha+Chai to Vitest (native ESM, built-in mocking, TypeScript support)
- [x] **Coverage Thresholds**: Set initial thresholds at 15% (lines/functions/statements), 10% branches
- [x] **Test Pool**: Using single-thread mode to avoid ESM worker issues

---

## 🐛 Known Issues to Address

- [ ] `discover.ts` is 1355 lines - needs splitting
- [ ] `App.tsx` in GUI is 1534 lines - needs componentization
- [ ] Some API functions don't handle errors consistently
- [ ] Rate limiting could be improved

---

*Last updated: $(date)*
*Maintainer: @marckraw*


