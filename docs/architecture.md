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
│   │   ├── auth/               # Authentication
│   │   ├── components/         # Component CRUD + sync
│   │   ├── datasources/        # Datasource management
│   │   ├── plugins/            # Plugin sync
│   │   ├── presets/            # Preset resolution
│   │   ├── roles/              # Role management
│   │   ├── spaces/             # Space operations
│   │   ├── stories/            # Story CRUD, backup, tree
│   │   ├── utils/              # API utilities
│   │   ├── managementApi.ts    # Main API export
│   │   ├── deliveryApi.ts      # Delivery API (read-only)
│   │   └── migrate.ts          # Sync/migration orchestration
│   │
│   ├── api-v2/                 # 🆕 New API Layer (for GUI)
│   │   ├── client.ts           # Client factory
│   │   ├── components/         # Component operations
│   │   ├── stories/            # Story operations
│   │   ├── discover/           # File discovery
│   │   ├── sync/               # Sync operations
│   │   └── index.ts            # Public exports
│   │
│   ├── cli/                    # 🟢 CLI Layer (thin wrapper)
│   │   ├── commands/           # CLI commands
│   │   │   ├── sync.ts         # sb-mig sync ...
│   │   │   ├── backup.ts       # sb-mig backup ...
│   │   │   ├── copy.ts         # sb-mig copy ...
│   │   │   ├── discover.ts     # sb-mig discover ...
│   │   │   └── ...
│   │   ├── utils/
│   │   │   └── discover.ts     # File discovery with glob
│   │   ├── index.ts            # CLI entry point
│   │   └── api-config.ts       # API client setup
│   │
│   ├── config/                 # ⚙️ Configuration
│   │   ├── config.ts           # Config loader
│   │   ├── defaultConfig.ts    # Default values
│   │   └── constants.ts        # Schema types, etc.
│   │
│   ├── rollup/                 # 🔧 Build utilities
│   │   ├── build-on-the-fly.ts # TypeScript schema compilation
│   │   └── setup-rollup.ts     # Rollup configuration
│   │
│   └── utils/                  # 🛠️ Shared utilities
│       ├── logger.ts           # Logging
│       ├── files.ts            # File operations
│       ├── path-utils.ts       # Path manipulation
│       ├── string-utils.ts     # String utilities
│       └── ...
│
├── __tests__/                  # 🧪 Test Suite
│   ├── mocks/                  # Mock utilities
│   ├── fixtures/               # Test data
│   ├── api/                    # API layer tests
│   ├── api-live/               # Live API tests (real requests)
│   ├── integration/            # Integration tests
│   ├── cli/                    # CLI integration tests
│   ├── e2e/                    # End-to-end tests
│   └── utils/                  # Utility tests
│
├── docs/                       # 📚 Documentation
│   ├── architecture.md         # This file
│   ├── security.md             # Security documentation
│   └── roadmap.md              # Future plans
│
├── dist/                       # Compiled ESM output
├── dist-cjs/                   # Compiled CJS output (for api-v2)
└── coverage/                   # Test coverage reports
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

### Test Categories

| Category | Location | Purpose | Count |
|----------|----------|---------|-------|
| **Unit Tests** | `__tests__/utils/`, `__tests__/api/` | Test utilities, logic | 327 |
| **Integration Tests** | `__tests__/integration/` | Test package upgrades | 25 |
| **Live API Tests** | `__tests__/api-live/` | Real Storyblok API calls | 18 |
| **E2E Tests** | `__tests__/e2e/` | Full CLI workflows | varies |
| **Total** | | | **370+** |

### Running Tests

```bash
npm test              # Run all unit tests
npm run test:unit     # Run only unit tests (exclude live/e2e)
npm run test:api-live # Run live API tests (requires credentials)
npm run test:e2e      # Run end-to-end tests
npm run test:coverage # With coverage report
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
    │  4. Discover local schema files (using glob)                 │
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

Uses `storyblok-js-client` v7.x with:

- OAuth token authentication
- Rate limiting (configurable, default 2 req/sec)
- Auto cache clearing

### Discovery System (`src/cli/utils/discover.ts`)

Finds schema files using `glob` v11.x patterns:

- **Local scope**: Files in `componentsDirectories` (excluding `node_modules`)
- **External scope**: Files in `node_modules`
- **Comparison**: Local files override external with same name

### On-the-fly Compilation (`src/rollup/build-on-the-fly.ts`)

Compiles TypeScript schema files (`.sb.ts`) to JavaScript at runtime using:

- Rollup
- SWC for TypeScript transformation
- Temporary file caching in `.next/cache/sb-mig`

---

## 🔌 Public API Surface

### CLI Entry Point

```bash
sb-mig <command> [options]
```

### Programmatic API

```typescript
// Main management API
import { managementApi } from 'sb-mig/dist/api/managementApi.js';

managementApi.components.*
managementApi.stories.*
managementApi.datasources.*
managementApi.roles.*
managementApi.assets.*
managementApi.presets.*
managementApi.spaces.*

// New API v2 (for GUI integration)
import { createClient } from 'sb-mig/api-v2';

const client = createClient({
  oauthToken: '...',
  spaceId: '...',
});
```

---

## 🧩 Module Responsibilities

| Module | Responsibility | CLI Commands |
|--------|----------------|--------------|
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

## 📦 Dependencies

### Core Dependencies (Production)

| Package | Version | Purpose |
|---------|---------|---------|
| `storyblok-js-client` | ^7.2.1 | Official Storyblok API client |
| `glob` | ^11.0.3 | File pattern matching |
| `meow` | ^11.0.0 | CLI argument parsing |
| `dotenv` | ^17.2.3 | Environment variable loading |
| `rollup` + `@swc/core` | ^3.28.0 / 1.3.41 | TypeScript compilation |
| `chalk` | ^4.1.2 | Terminal colors |

### Dev Dependencies

| Package | Version | Purpose |
|---------|---------|---------|
| `vitest` | ^2.1.0 | Testing framework |
| `typescript` | ^5.1.6 | Type checking |
| `eslint` | ^8.47.0 | Linting |
| `semantic-release` | ^21.0.9 | Automated releases |

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

### Why storyblok-js-client?

- Official Storyblok client
- Handles rate limiting, retries
- TypeScript support
- Actively maintained

---

## 🚧 Known Limitations

1. **Config loaded at startup**: Cannot change config at runtime
2. **Global API client**: Makes testing harder
3. **Large files**: `discover.ts` (1355 lines) could be split
4. **Any types**: Type safety is incomplete in some areas

---

_Last updated: January 2026_

