# sb-mig Parity Matrix (CLI ↔ Old API ↔ API v2 ↔ GUI)

This document tracks feature parity between:

- **sb-mig CLI** (`sb-mig/src/cli/*`)
- **Old API** (`sb-mig/src/api/*`) used by the CLI today
- **API v2** (`sb-mig/src/api-v2/*`) intended for direct consumption by `sb-mig-gui`
- **sb-mig-gui** (`sb-mig-gui/*`)

Status legend:

- ✅ implemented
- 🟡 partial
- ❌ missing

---

## 1) Story / Content

| Feature | CLI | Old API | API v2 | GUI (API mode) | GUI (CLI mode) |
|---|---:|---:|---:|---:|---:|
| List stories (flat) | ✅ `sync content` / `test stories` | ✅ `api/stories.getAllStories` | ✅ `api-v2.stories.getAllStories` | 🟡 (currently via `electron/services/storyblok.service.ts`) | ❌ |
| Tree build | ✅ (used by `copy`) | ✅ `api/stories/tree` | ✅ `api-v2.stories.fetchStories` (tree) | 🟡 (currently via GUI service) | ❌ |
| Copy stories (IDs) | 🟡 | ✅ (helpers in `api/stories/*`) | ✅ `api-v2.stories.copyStories` | 🟡 (currently via GUI service) | ❌ |
| Copy stories (CLI strategies: `what`, `where`, `folder/*`) | ✅ `cli/commands/copy.ts` | 🟡 (tree helpers exist) | ❌ | ❌ | ✅ (spawns CLI `copy`) |
| Backup stories to file | ✅ `backup stories --all` | ✅ `api/stories/backup.backupStories` | ❌ (data-only export missing) | ❌ | ✅ (spawns CLI `backup stories --all`) |
| Sync stories/assets (directional) | ✅ `sync content --syncDirection ...` | ✅ `api/migrate.syncContent` | ❌ | ❌ | ✅ (spawns CLI `sync content ...`) |

---

## 2) Components

| Feature | CLI | Old API | API v2 | GUI (API mode) | GUI (CLI mode) |
|---|---:|---:|---:|---:|---:|
| CRUD components | ✅ (via sync/backup) | ✅ `api/components/*` | ❌ | ❌ | ❌ |
| Discover local/external schemas | ✅ `discover components --all` | ✅ `cli/utils/discover` | 🟡 `api-v2.discover.discoverComponents` (simplified) | 🟡 (UI uses CLI discovery today) | ✅ (discovery in main process, no CLI spawn) |
| Sync provided components | ✅ `sync components ...` | ✅ (in `api/migrate.ts`) | ❌ | ❌ | ✅ (spawns CLI `sync components ...`) |
| Sync all components | ✅ `sync components --all` | ✅ | ❌ | ❌ | ✅ |
| SSOT mode (remove + sync) | ✅ `sync components --all --ssot` | ✅ | ❌ | ❌ | ✅ |
| Preset integration | ✅ `--presets` | ✅ `api/presets/*` + `api/migrate.setComponentDefaultPreset` | ❌ | ❌ | ✅ |
| Backup components | ✅ `backup components` | ✅ `api/components.getAllComponents` | ❌ | ❌ | ✅ (spawns CLI `backup components`) |

---

## 3) Datasources

| Feature | CLI | Old API | API v2 | GUI (API mode) | GUI (CLI mode) |
|---|---:|---:|---:|---:|---:|
| Discover datasource files | ✅ (via CLI discovery) | ✅ `cli/utils/discover` | ✅ `api-v2.discover.discoverDatasources` | 🟡 (UI uses CLI discovery today) | ✅ (discovery in main process, no CLI spawn) |
| Sync datasources | ✅ `sync datasources` | ✅ `api/datasources.syncDatasources` | ❌ | ❌ | ✅ (spawns CLI `sync datasources ...`) |
| Backup datasources | ✅ `backup datasources` | ✅ `api/datasources.getAllDatasources` | ❌ | ❌ | ❌ |

---

## 4) Roles

| Feature | CLI | Old API | API v2 | GUI (API mode) | GUI (CLI mode) |
|---|---:|---:|---:|---:|---:|
| Discover role files | ✅ (via CLI discovery) | ✅ `cli/utils/discover` | ✅ `api-v2.discover.discoverRoles` | 🟡 (UI uses CLI discovery today) | ✅ (discovery in main process, no CLI spawn) |
| Sync roles | ✅ `sync roles` | ✅ `api/roles.syncRoles` | ❌ | ❌ | ✅ (spawns CLI `sync roles ...`) |
| Backup roles | ✅ `backup roles` | ✅ `api/roles.getAllRoles` | ❌ | ❌ | ❌ |

---

## 5) Plugins

| Feature | CLI | Old API | API v2 | GUI (API mode) | GUI (CLI mode) |
|---|---:|---:|---:|---:|---:|
| Sync provided plugins | ✅ `sync plugins <names...>` | ✅ `api/plugins.syncProvidedPlugins` | ❌ | ❌ | ❌ (not exposed in UI) |
| Backup plugins | ✅ `backup plugins` | ✅ `api/plugins.getAllPlugins` | ❌ | ❌ | ❌ |

---

## 6) Presets

| Feature | CLI | Old API | API v2 | GUI (API mode) | GUI (CLI mode) |
|---|---:|---:|---:|---:|---:|
| Backup presets | ✅ `backup presets` | ✅ `api/presets.getAllPresets` | ❌ | ❌ | ❌ |
| Update presets (bulk) | ✅ (via migrate) | ✅ `api/presets.updatePresets` | ❌ | ❌ | ❌ |

---

## 7) Project / Space / Auth / Tooling

| Feature | CLI | Old API | API v2 | GUI (API mode) | GUI (CLI mode) |
|---|---:|---:|---:|---:|---:|
| Init project (write `.env`, update domain) | ✅ `init project` | ✅ `api/spaces.updateSpace` | ❌ | ❌ | ❌ |
| Auth current user / access checks | 🟡 | ✅ `api/auth/*` | ❌ | ❌ | ❌ |
| Debug info | ✅ `debug` | ✅ (reads config/pkg) | ❌ | ❌ | ✅ (spawns CLI `debug`) |

---

## Near-term priority (per current direction)

1. **Sync parity** via **API v2** (data-only core, GUI handles I/O), starting with:\n   - roles\n   - datasources\n   - plugins\n   - components\n+2. Replace GUI direct Storyblok fetch service with API v2 stories + copy + discovery.\n+3. Keep CLI mode intact and available for operations not yet ported.\n+

