# sb-mig Architecture

> This document describes the architecture of sb-mig CLI and its relationship with sb-mig-gui.

## 📐 High-Level Architecture

```
┌─────────────────────────────────────────────────────────────────────────┐
│                            CONSUMERS                                     │
│                                                                          │
│   ┌──────────────────────┐           ┌──────────────────────┐           │
│   │      sb-mig CLI      │           │     sb-mig GUI       │           │
│   │                      │           │                      │           │
│   │  • Meow for parsing  │           │  • Electron app      │           │
│   │  • Terminal output   │           │  • React frontend    │           │
│   │  • User prompts      │           │  • Visual interface  │           │
│   └──────────┬───────────┘           └──────────┬───────────┘           │
│              │                                   │                       │
│              │         ┌─────────────────────────┘                       │
│              │         │                                                 │
│              ▼         ▼                                                 │
│   ┌─────────────────────────────────────────────────────────────────┐   │
│   │                     sb-mig API Layer                             │   │
│   │                                                                  │   │
│   │   ┌─────────────┐ ┌─────────────┐ ┌─────────────┐               │   │
│   │   │ components  │ │  stories    │ │   assets    │               │   │
│   │   ├─────────────┤ ├─────────────┤ ├─────────────┤               │   │
│   │   │ • getAll    │ │ • getAll    │ │ • getAll    │               │   │
│   │   │ • create    │ │ • create    │ │ • upload    │               │   │
│   │   │ • update    │ │ • update    │ │ • migrate   │               │   │
│   │   │ • remove    │ │ • remove    │ │             │               │   │
│   │   │ • sync      │ │ • copy      │ │             │               │   │
│   │   └─────────────┘ └─────────────┘ └─────────────┘               │   │
│   │                                                                  │   │
│   │   ┌─────────────┐ ┌─────────────┐ ┌─────────────┐               │   │
│   │   │ datasources │ │   roles     │ │  presets    │               │   │
│   │   ├─────────────┤ ├─────────────┤ ├─────────────┤               │   │
│   │   │ • getAll    │ │ • getAll    │ │ • getAll    │               │   │
│   │   │ • create    │ │ • create    │ │ • create    │               │   │
│   │   │ • sync      │ │ • sync      │ │ • resolve   │               │   │
│   │   └─────────────┘ └─────────────┘ └─────────────┘               │   │
│   │                                                                  │   │
│   │   ┌─────────────┐ ┌─────────────┐ ┌─────────────┐               │   │
│   │   │  discover   │ │   backup    │ │   migrate   │               │   │
│   │   ├─────────────┤ ├─────────────┤ ├─────────────┤               │   │
│   │   │ • components│ │ • all       │ │ • content   │               │   │
│   │   │ • datasource│ │ • components│ │ • sync      │               │   │
│   │   │ • roles     │ │ • stories   │ │             │               │   │
│   │   │ • stories   │ │             │ │             │               │   │
│   │   └─────────────┘ └─────────────┘ └─────────────┘               │   │
│   │                                                                  │   │
│   └─────────────────────────────────────────────────────────────────┘   │
│                              │                                           │
│                              ▼                                           │
│   ┌─────────────────────────────────────────────────────────────────┐   │
│   │                  Configuration Layer                             │   │
│   │                                                                  │   │
│   │   • storyblok.config.js (user config)                           │   │
│   │   • Environment variables (STORYBLOK_OAUTH_TOKEN, etc.)         │   │
│   │   • Default configuration                                        │   │
│   │                                                                  │   │
│   └─────────────────────────────────────────────────────────────────┘   │
│                              │                                           │
│                              ▼                                           │
│   ┌─────────────────────────────────────────────────────────────────┐   │
│   │                  Storyblok Management API                        │   │
│   │                  https://mapi.storyblok.com/v1                   │   │
│   └─────────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## 📁 Directory Structure

### sb-mig (CLI + API)

```
sb-mig/
├── src/
│   ├── api/                    # 🔵 API Layer (business logic)
│   │   ├── assets/
│   │   │   ├── assets.ts       # Asset operations
│   │   │   ├── assets.types.ts # Type definitions
│   │   │   └── index.ts        # Public exports
│   │   ├── auth/
│   │   ├── components/
│   │   │   ├── components.ts   # Component CRUD + sync
│   │   │   ├── components.types.ts
│   │   │   └── index.ts
│   │   ├── datasources/
│   │   ├── discover/           # 🆕 To be created (Phase 1)
│   │   │   ├── discover.ts
│   │   │   ├── discover.types.ts
│   │   │   └── index.ts
│   │   ├── plugins/
│   │   ├── presets/
│   │   ├── roles/
│   │   ├── spaces/
│   │   ├── stories/
│   │   │   ├── stories.ts      # Story CRUD
│   │   │   ├── backup.ts       # Story backup
│   │   │   ├── tree.ts         # Tree building
│   │   │   ├── copy.ts         # 🆕 Story copying (Phase 1)
│   │   │   └── index.ts
│   │   ├── utils/
│   │   │   ├── request.ts      # Pagination helpers
│   │   │   └── helper-functions.ts
│   │   ├── managementApi.ts    # Main API export
│   │   ├── deliveryApi.ts      # Delivery API (read-only)
│   │   └── migrate.ts          # Sync/migration orchestration
│   │
│   ├── cli/                    # 🟢 CLI Layer (thin wrapper)
│   │   ├── commands/
│   │   │   ├── sync.ts         # sb-mig sync ...
│   │   │   ├── backup.ts       # sb-mig backup ...
│   │   │   ├── copy.ts         # sb-mig copy ...
│   │   │   ├── discover.ts     # sb-mig discover ...
│   │   │   ├── migrate.ts      # sb-mig migrate ...
│   │   │   ├── remove.ts       # sb-mig remove ...
│   │   │   └── ...
│   │   ├── utils/
│   │   │   └── discover.ts     # 🔄 Moving to api/discover/ (Phase 1)
│   │   ├── index.ts            # CLI entry point
│   │   ├── api-config.ts       # API client setup
│   │   └── cli-descriptions.ts # Help text
│   │
│   ├── config/                 # ⚙️ Configuration
│   │   ├── config.ts           # Config loader
│   │   ├── defaultConfig.ts    # Default values
│   │   ├── constants.ts        # Schema types, etc.
│   │   └── helper.ts           # Config utilities
│   │
│   ├── rollup/                 # 🔧 Build utilities
│   │   ├── build-on-the-fly.ts # TypeScript schema compilation
│   │   └── setup-rollup.ts
│   │
│   └── utils/                  # 🛠️ Shared utilities
│       ├── logger.ts           # Logging
│       ├── files.ts            # File operations
│       ├── main.ts             # Functional utilities
│       └── ...
│
├── __tests__/                  # 🧪 Test Suite
│   ├── tsconfig.json           # Test-specific TypeScript config
│   ├── mocks/                  # Mock utilities
│   │   ├── index.ts
│   │   ├── storyblokClient.mock.ts
│   │   ├── config.mock.ts
│   │   └── filesystem.mock.ts
│   ├── fixtures/               # Test data
│   │   ├── api-responses/
│   │   └── components/
│   ├── api/                    # API layer tests
│   │   ├── pagination.test.ts
│   │   ├── components.test.ts
│   │   └── stories.test.ts
│   ├── discover/               # Discovery tests
│   │   └── discover.test.ts
│   ├── cli/                    # CLI integration tests
│   │   └── sync.test.ts
│   └── *.test.ts               # Utility tests
│
├── dist/                       # Compiled output
├── coverage/                   # Test coverage reports
├── vitest.config.ts            # Vitest configuration
├── ARCHITECTURE.md             # This file
├── REFACTORING.md              # Refactoring roadmap
└── SECURITY.md                 # Security documentation
```

### sb-mig-gui (Electron App)

```
sb-mig-gui/
├── electron/
│   ├── main/
│   │   └── index.ts            # Main process, IPC handlers
│   ├── preload/
│   │   └── index.ts            # Context bridge
│   └── services/
│       ├── sbmig.service.ts    # 🔄 To be replaced with API imports
│       ├── storyblok.service.ts# 🔄 To be replaced with API imports
│       └── database.service.ts # SQLite settings storage
│
├── src/
│   ├── App.tsx                 # Main React app (needs splitting)
│   ├── components/
│   │   └── ui/                 # shadcn/ui components
│   ├── screens/
│   │   └── Settings/           # Settings screen
│   └── types/
│       └── global.d.ts         # TypeScript declarations
│
└── ...
```

---

## 🧪 Testing Architecture

### Test Framework: Vitest

We use **Vitest** for testing due to:
- Native ESM support (no `esm` package workaround needed)
- Built-in mocking (`vi.mock()`, `vi.fn()`, `vi.spyOn()`)
- TypeScript support out of the box
- Fast parallel execution
- Compatible with Jest API

### Test Structure

```
__tests__/
├── tsconfig.json           # Separate TS config for tests
│                           # - Vitest globals types
│                           # - Relaxed strict mode
│                           # - Includes src/ for imports
│
├── mocks/                  # Reusable mock utilities
│   ├── storyblokClient.mock.ts
│   │   ├── createMockStoryblokClient()  # Mock API client
│   │   ├── createMockApiConfig()        # Mock config
│   │   ├── createMockComponent()        # Component factory
│   │   ├── createMockStory()            # Story factory
│   │   └── setup*Mock()                 # Helper functions
│   │
│   ├── config.mock.ts
│   │   ├── createMockConfig()           # Full config factory
│   │   └── createMockEnv()              # Environment vars
│   │
│   └── filesystem.mock.ts
│       ├── VirtualFileSystem            # In-memory file system
│       ├── createMockFs()               # Mock fs module
│       └── createComponentSchemaContent() # Schema generators
│
├── fixtures/               # Static test data
│   ├── api-responses/      # Sample API response JSONs
│   └── components/         # Sample .sb.js files
│
├── api/                    # API layer tests
├── discover/               # Discovery tests
├── cli/                    # CLI integration tests
└── *.test.ts               # Utility function tests
```

### Test Configuration

```typescript
// vitest.config.ts
{
  test: {
    globals: true,              // describe, it, expect without imports
    environment: "node",
    pool: "threads",            // Single-thread for ESM stability
    poolOptions: {
      threads: { singleThread: true }
    },
    coverage: {
      provider: "v8",
      thresholds: {
        lines: 15,
        functions: 15,
        branches: 10,
        statements: 15
      }
    }
  }
}
```

### Running Tests

```bash
yarn test           # Run all tests once
yarn test:watch     # Watch mode
yarn test:coverage  # With coverage report
```

---

## 🔄 Data Flow

### CLI Command Execution

```
User runs: sb-mig sync components --all

    ┌──────────────────────────────────────────────────────────────┐
    │                         CLI Layer                             │
    │                                                               │
    │  1. Parse command & flags (Meow)                             │
    │  2. Load configuration (storyblok.config.js + env)           │
    │  3. Call API function                                        │
    │                                                               │
    └──────────────────────────┬───────────────────────────────────┘
                               │
                               ▼
    ┌──────────────────────────────────────────────────────────────┐
    │                         API Layer                             │
    │                                                               │
    │  4. Discover local schema files                              │
    │  5. Discover external schema files (node_modules)            │
    │  6. Compare & deduplicate                                    │
    │  7. Load schema content (with on-the-fly TS compilation)     │
    │  8. Resolve component groups                                 │
    │  9. For each component:                                      │
    │     - Check if exists remotely                               │
    │     - Create or update                                       │
    │     - Handle presets if enabled                              │
    │                                                               │
    └──────────────────────────┬───────────────────────────────────┘
                               │
                               ▼
    ┌──────────────────────────────────────────────────────────────┐
    │                    Storyblok API                              │
    │                                                               │
    │  10. HTTP requests with rate limiting                        │
    │  11. Response handling                                       │
    │                                                               │
    └──────────────────────────────────────────────────────────────┘
```

### GUI Command Execution (Current - Problematic)

```
User clicks "Sync Components" button

    ┌──────────────────────────────────────────────────────────────┐
    │                      React Frontend                           │
    │  1. User interaction                                         │
    └──────────────────────────┬───────────────────────────────────┘
                               │ IPC
                               ▼
    ┌──────────────────────────────────────────────────────────────┐
    │                    Electron Main                              │
    │  2. IPC handler receives request                             │
    └──────────────────────────┬───────────────────────────────────┘
                               │
                               ▼
    ┌──────────────────────────────────────────────────────────────┐
    │                   sbmig.service.ts                            │
    │  3. Spawns child process: `sb-mig sync components --all`     │  ❌ Problem
    │  4. Streams stdout/stderr to renderer                        │
    └──────────────────────────┬───────────────────────────────────┘
                               │
                               ▼
    ┌──────────────────────────────────────────────────────────────┐
    │                      sb-mig CLI                               │
    │  5. Full CLI execution                                       │
    └──────────────────────────────────────────────────────────────┘
```

### GUI Command Execution (Target - Direct API)

```
User clicks "Sync Components" button

    ┌──────────────────────────────────────────────────────────────┐
    │                      React Frontend                           │
    │  1. User interaction                                         │
    └──────────────────────────┬───────────────────────────────────┘
                               │ IPC
                               ▼
    ┌──────────────────────────────────────────────────────────────┐
    │                    Electron Main                              │
    │  2. IPC handler receives request                             │
    └──────────────────────────┬───────────────────────────────────┘
                               │
                               ▼
    ┌──────────────────────────────────────────────────────────────┐
    │              import { syncAllComponents } from 'sb-mig'       │
    │                                                               │  ✅ Direct API
    │  3. Call API function directly                               │
    │  4. Return structured result                                 │
    └──────────────────────────────────────────────────────────────┘
```

---

## 🔧 Key Components

### Configuration (`src/config/`)

The configuration system merges multiple sources:

```
Priority (highest to lowest):
1. Runtime options (passed to API functions)
2. storyblok.config.js in working directory
3. Environment variables
4. Default configuration
```

**Key config values:**
- `oauthToken` - Personal access token for Management API
- `spaceId` - Target space ID
- `accessToken` - Preview/public token for Delivery API
- `componentsDirectories` - Where to look for schema files
- `schemaFileExt` - Extension for component schemas (`.sb.js` or `.sb.cjs`)

### Storyblok Client (`src/cli/api-config.ts`)

Uses `storyblok-js-client` with:
- OAuth token authentication
- Rate limiting (configurable, default 2 req/sec)
- Auto cache clearing

### Discovery System (`src/cli/utils/discover.ts`)

Finds schema files using glob patterns:
- **Local scope**: Files in `componentsDirectories` (excluding `node_modules`)
- **External scope**: Files in `node_modules`
- **Comparison**: Local files override external with same name

### On-the-fly Compilation (`src/rollup/build-on-the-fly.ts`)

Compiles TypeScript schema files (`.sb.ts`) to JavaScript at runtime using:
- Rollup
- SWC for TypeScript transformation
- Temporary file caching

---

## 🔌 Public API Surface

### Current Exports

```typescript
// Main entry point
import { managementApi } from 'sb-mig/dist/api/managementApi.js';

// Available modules
managementApi.assets.*
managementApi.auth.*
managementApi.components.*
managementApi.datasources.*
managementApi.plugins.*
managementApi.presets.*
managementApi.roles.*
managementApi.stories.*
managementApi.spaces.*
```

### Target Exports (After Refactor)

```typescript
// Clean public API
import { 
  createClient,
  components,
  stories,
  datasources,
  roles,
  assets,
  discover,
  sync,
  backup,
} from 'sb-mig';

// Create a configured client
const client = createClient({
  oauthToken: '...',
  spaceId: '...',
});

// Use typed functions
await components.syncAll(client, { presets: true });
await stories.copy(client, { from: 'space1', to: 'space2', storyIds: [...] });
await discover.components(client, { directories: ['src'] });
```

---

## 🧩 Module Responsibilities

| Module | Responsibility | CLI Commands |
|--------|---------------|--------------|
| `components` | CRUD operations, group management, sync | `sync components` |
| `stories` | CRUD, tree building, copying | `copy stories`, `backup stories` |
| `datasources` | Datasource & entries management | `sync datasources` |
| `roles` | Role management | `sync roles` |
| `assets` | Asset upload, migration | `sync content --assets` |
| `presets` | Preset resolution, creation | `sync components --presets` |
| `discover` | File system scanning for schemas | `discover components` |
| `migrate` | High-level sync orchestration | `sync content` |
| `backup` | Export to local files | `backup` |

---

## 🔐 Authentication

See [SECURITY.md](./SECURITY.md) for detailed security information.

**Quick overview:**
- OAuth Token: For Management API operations (write access)
- Access Token: For Delivery API (read-only, preview/public content)
- Both stored in environment variables or config file
- GUI stores tokens in local SQLite database

---

## 📝 Design Decisions

### Why Meow instead of Oclif?
- Oclif was too heavy for the use case
- Meow is lightweight and ESM-native
- Simpler plugin model (we removed plugin support)

### Why Vitest instead of Mocha?
- Native ESM support (no `esm` workaround)
- Built-in mocking (no sinon needed)
- TypeScript support out of the box
- Faster parallel execution
- Better developer experience

### Why not a monorepo?
- Historical decision - sb-mig predates GUI
- Could be reconsidered during refactor
- Would enable shared types package

### Why storyblok-js-client?
- Official Storyblok client
- Handles rate limiting, retries
- TypeScript support

### Why SQLite in GUI?
- Simple, file-based persistence
- No external dependencies
- Fast for small datasets (settings)

---

## 🚧 Known Limitations

1. **Config loaded at startup**: Cannot change config at runtime
2. **Global API client**: Makes testing harder
3. **CLI spawning in GUI**: Suboptimal, should use API directly
4. **Large files**: `discover.ts` (1355 lines), `App.tsx` (1534 lines)
5. **Any types**: Type safety is incomplete

---

*Last updated: December 2024*
