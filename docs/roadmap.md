# sb-mig Roadmap

> This document outlines the development roadmap for sb-mig CLI and related projects.

## 📊 Current Status (v5.6.0)

### ✅ Completed Features

#### Core Functionality
- [x] Component synchronization (CRUD)
- [x] Story synchronization (CRUD, tree building)
- [x] Datasource synchronization
- [x] Role synchronization
- [x] Asset migration
- [x] Preset support and resolution
- [x] Plugin synchronization
- [x] Content migration (space-to-space, space-to-file, file-to-space)
- [x] Component groups management
- [x] Custom field support
- [x] Backup functionality

#### Developer Experience
- [x] TypeScript schema support (`.sb.ts`) with on-the-fly compilation
- [x] Discover command for exploring schema files
- [x] Migrate command for Site Builder integration
- [x] ESM native support
- [x] Comprehensive test suite (370+ tests)
- [x] Live API tests for real-world validation
- [x] Integration tests for dependency updates

#### Infrastructure
- [x] GitHub Actions CI/CD
- [x] Semantic release for automated versioning
- [x] Dual ESM/CJS output for `api-v2`

---

## 🎯 Short-term Goals (Q1 2026)

### 1. Dry Run Mode
**Priority:** High  
**Effort:** Medium

Add `--dry-run` flag to preview changes without applying them:

```bash
sb-mig sync components --all --dry-run
```

**Benefits:**
- Safer production deployments
- Better CI/CD integration
- Easier debugging

### 2. Component Diff Visualization
**Priority:** High  
**Effort:** Medium

Show detailed diff before syncing:

```bash
sb-mig sync components hero-banner --diff

# Output:
# hero-banner:
#   + field: subtitle (type: text)
#   ~ field: title (maxLength: 100 → 200)
#   - field: deprecated_field
```

### 3. Schema Validation
**Priority:** High  
**Effort:** Low

Validate schemas before sync to catch errors early:

```bash
sb-mig validate components --all
```

**Checks:**
- Required fields present
- Valid field types
- Component group references exist
- Preset references valid

### 4. Better Error Messages
**Priority:** Medium  
**Effort:** Low

Improve error messages with:
- Suggested fixes
- Links to documentation
- Context about what was being attempted

---

## 🚀 Medium-term Goals (Q2-Q3 2026)

### 5. GUI Direct API Integration
**Priority:** High  
**Effort:** High

Replace CLI spawning in sb-mig-gui with direct API calls:

**Current:**
```
GUI → spawn('sb-mig sync ...') → Parse stdout
```

**Target:**
```
GUI → import { syncComponents } from 'sb-mig/api-v2' → Structured result
```

**Benefits:**
- Better progress reporting
- Structured error handling
- Faster execution
- No environment dependencies

### 6. Incremental Sync
**Priority:** Medium  
**Effort:** High

Only sync components that have changed:

```bash
sb-mig sync components --incremental

# Output:
# Analyzing 47 components...
# 3 changed, 44 unchanged
# Syncing: hero-banner, footer, navigation
```

**Implementation:**
- Hash-based change detection
- Local cache of last synced state
- Git integration for detecting changes

### 7. Workspace Management
**Priority:** Medium  
**Effort:** Medium

Support multiple Storyblok spaces in one project:

```javascript
// storyblok.config.js
module.exports = {
  workspaces: {
    production: {
      spaceId: '123',
      oauthToken: process.env.PROD_TOKEN,
    },
    staging: {
      spaceId: '456',
      oauthToken: process.env.STAGING_TOKEN,
    },
  },
};
```

```bash
sb-mig sync components --all --workspace staging
```

### 8. Migration Scripts
**Priority:** Medium  
**Effort:** Medium

Support custom migration scripts for complex transformations:

```javascript
// migrations/001-rename-field.migration.js
export default {
  name: '001-rename-field',
  up: async (client) => {
    const component = await client.components.get('hero-banner');
    component.schema.new_title = component.schema.old_title;
    delete component.schema.old_title;
    await client.components.update(component);
  },
  down: async (client) => {
    // Reverse migration
  },
};
```

```bash
sb-mig migrations run --up
sb-mig migrations status
```

---

## 🏗️ Monorepo Migration Plan

### Overview
Convert sb-mig into a Turborepo monorepo to add a documentation website alongside the CLI/API.

### Proposed Structure
```
sb-mig/
├── apps/
│   └── docs/                 # Next.js documentation website
│       ├── app/              # App router
│       ├── content/          # MDX documentation files
│       └── ...
├── packages/
│   └── sb-mig/               # Current CLI + API (moved here)
│       ├── src/
│       ├── package.json
│       └── ...
├── turbo.json                # Turborepo config
├── package.json              # Root workspace config
└── pnpm-workspace.yaml       # Workspace definition
```

### Tech Stack for Documentation Site
- **Framework**: Next.js 14+ with App Router
- **Docs Framework**: Fumadocs or Nextra (MDX-based, great for API docs)
- **Styling**: Tailwind CSS
- **Hosting**: Vercel or GitHub Pages

### Benefits
1. **Shared tooling** - ESLint, TypeScript, Prettier configs can be shared
2. **Efficient builds** - Turborepo caching speeds up CI/CD
3. **Easy cross-referencing** - Docs site can import types/examples from sb-mig
4. **Future-proof** - Easy to add more packages later (e.g., `@sb-mig/core`, `@sb-mig/cli`)

### Migration Steps
1. Install Turborepo and set up workspace structure
2. Move current codebase to `packages/sb-mig/`
3. Create `apps/docs/` with Next.js
4. Update CI/CD workflows for monorepo
5. Update npm publishing configuration
6. Set up documentation content structure

### Open Questions
- **Package manager**: Stick with npm, or switch to pnpm (more common with Turborepo)?
- **Package naming**: Keep `sb-mig` as-is, or consider scoped packages like `@sb-mig/cli`?
- **Docs framework**: Simple custom Next.js, or use Fumadocs/Nextra?

---

## 🔮 Long-term Vision (2026+)

### 9. Visual Schema Editor
**Priority:** Low  
**Effort:** Very High

Web-based visual editor for component schemas:
- Drag-and-drop field ordering
- Visual field type selection
- Real-time preview
- Export to `.sb.js`/`.sb.ts`

### 10. Schema Version Control
**Priority:** Medium  
**Effort:** High

Track schema changes over time:
- Automatic versioning of schemas
- Rollback to previous versions
- Audit log of all changes
- Integration with Git

### 11. Multi-Space Sync
**Priority:** Medium  
**Effort:** High

Synchronize schemas across multiple spaces:

```bash
sb-mig sync components --all --to production,staging,development
```

### 12. Plugin System (Revisited)
**Priority:** Low  
**Effort:** High

Modular plugin system for extending functionality:
- Custom field types
- Custom sync handlers
- Custom validation rules
- Third-party integrations

### 13. GraphQL API Support
**Priority:** Low  
**Effort:** Medium

Support Storyblok's GraphQL API for queries:
- Faster story queries
- Better filtering
- Reduced API calls

---

## 🔧 Technical Debt & Improvements

### Code Quality

| Item | Priority | Effort |
|------|----------|--------|
| Split large `discover.ts` file (1355 lines) | Medium | Medium |
| Improve type coverage (reduce `any`) | Medium | High |
| Add JSDoc documentation to all public APIs | Low | Medium |
| Refactor config loading for runtime changes | Medium | Medium |

### Testing

| Item | Priority | Effort |
|------|----------|--------|
| Increase test coverage to 80% | Medium | High |
| Add performance benchmarks | Low | Medium |
| Add visual regression tests for GUI | Low | High |
| Add contract tests for API | Medium | Medium |

### Documentation

| Item | Priority | Effort |
|------|----------|--------|
| ~~Create docs folder structure~~ | High | Low |
| Add API reference documentation | Medium | High |
| Create video tutorials | Low | High |
| Add more examples | Medium | Low |

---

## 📈 Metrics & Goals

### Test Coverage Goals

| Metric | Current | Q1 2026 | Q2 2026 |
|--------|---------|---------|---------|
| Line Coverage | 23% | 40% | 60% |
| Function Coverage | 28% | 50% | 70% |
| Branch Coverage | 18% | 35% | 55% |

### Performance Goals

| Operation | Current | Target |
|-----------|---------|--------|
| Sync 50 components | ~60s | ~30s |
| Discover in large repo | ~5s | ~2s |
| Cold start (CLI) | ~2s | ~1s |

---

## 🤝 Contributing

We welcome contributions! Areas where help is especially appreciated:

1. **Documentation**: Examples, tutorials, translations
2. **Testing**: Edge cases, integration tests
3. **Bug fixes**: See [GitHub Issues](https://github.com/sb-mig/sb-mig/issues)
4. **Feature requests**: Open an issue to discuss before implementing

### How to Contribute

1. Fork the repository
2. Create a feature branch from `beta`
3. Make your changes with tests
4. Submit a PR to `beta`
5. After review, it will be merged and released

See [CONTRIBUTING.md](../CONTRIBUTING.md) for detailed guidelines.

---

## 📅 Release Schedule

- **Stable releases**: Monthly (merged from `beta`)
- **Beta releases**: Weekly (merged from feature branches)
- **Patch releases**: As needed for critical fixes

### Version Channels

| Channel | Branch | Purpose |
|---------|--------|---------|
| `latest` | `master` | Stable production releases |
| `beta` | `beta` | Pre-release testing |
| `next` | `next` | Experimental features |

---

## 📝 Changelog

For detailed changes, see [CHANGELOG.md](../CHANGELOG.md).

### Recent Highlights (v5.6.0)

- Updated `storyblok-js-client` to v7.2.1
- Updated `glob` to v11.0.3
- Updated `dotenv` to v17.2.3
- Added integration tests for package updates
- Fixed TypeScript compilation issues
- Improved type safety in asset uploads

---

_Last updated: January 2026_

_This roadmap is subject to change based on community feedback and priorities._

