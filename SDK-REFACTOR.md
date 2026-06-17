# sb-mig SDK Refactor — Plan & Status

> **Goal:** turn sb-mig into an **SDK-first** package. The `api-v2` layer becomes a
> programmatic SDK usable from any TypeScript backend (Next.js route handlers, workers,
> scripts). The CLI is rewired to consume `api-v2` at **100% feature parity**, and
> eventually `api-v2` *becomes* the core — the legacy `src/api/*` layer dissolves.

_Last updated: 2026-06-17 · Maintainer: @marckraw · Branch: `api-v2-refactor`_

This document supersedes the now-removed `REFACTORING.md` (Dec 2024, abandoned "consolidate
into the old api layer" strategy) and `PARITY.md` (scoreboard framing). `README-V2.md` is
retained and will evolve into the public SDK usage guide (ticket **Z4**).

---

## 1. Vision & end state

sb-mig started as a pure CLI for Storyblok (management + delivery API). It has outgrown
that. The target architecture:

```
              ┌─────────────────────────────────────────────┐
   consumers  │  CLI (meow)      Next.js routes / workers     │
              └───────┬──────────────────┬────────────────────┘
                      │                  │
                      ▼                  ▼
              ┌─────────────────────────────────────────────┐
              │  api-v2  =  THE LAYER (the SDK)              │
              │  createClient(opts) → ApiClient (DI)        │
              │  pure core  +  fs-backed node tier          │
              └─────────────────────────────────────────────┘
```

**End state, concretely:**

- `api-v2` owns the real implementation, typed, no `any`, dependency-injected via `ApiClient`.
- The CLI builds an `ApiClient` from resolved config and calls `api-v2` directly. No global
  singleton, no top-level `await`.
- `src/api/*` is gone (its logic moved down into `api-v2`).
- The package exports a stable SDK surface importable from any TS backend.

---

## 2. Current state (audit, 2026-06-17)

Grounded in the code on `api-v2-refactor`, not the old docs:

| Area | Finding |
|---|---|
| **CLI → api-v2 usage** | **Zero.** No `src/cli` file imports `api-v2`. CLI is 100% on legacy `api/` + the global `apiConfig` singleton. The "rewire CLI" work has not started. |
| **Dependency direction** | **Inverted vs the goal.** Every `api-v2/*` module *wraps* legacy `api/*` via `toRequestConfig(client)`. Today it's `v2 facade → old api (real logic)`. The end state is the opposite. No back-dependency exists (old api never imports v2), so layering is clean — just pointing the wrong way. |
| **v2 coverage** | Read-heavy, write-light. Reads + basic CRUD for every resource, plus 4 data-only syncs (components/datasources/roles/plugins). **Missing:** content/asset sync, the migrate+publication pipeline, backup, copy-story strategies, presets-in-sync, inspect, init. |
| **Tests for v2** | Effectively none (one integration test references it). The 84 existing tests cover legacy api + cli + discover. This is the biggest risk for a "CLI stays 100%" rewire. |
| **Architecture (good news)** | v2 already has what we want: `createClient(opts)` DI, no singleton, no top-level await. |
| **SDK import-safety (today)** | v2's import graph does **not** reach the top-level-`await` config (`src/config/config.ts:18`) or `process.cwd()` side-effects. Those live in 4 files — `api/migrate.ts`, `api/utils/resolverTransformations.ts`, `api/data-migration/component-data-migration.ts`, `api/inspect/component-usage-query.ts` — none reachable from v2. **Caveat:** they're unreachable only because v2 doesn't yet cover those features. Porting content-sync/migrate/inspect will drag the taint in unless config is fixed first (ticket **F6**). |

---

## 3. Strategy — "move logic down, shim up" (per-resource slice)

We reach the end state **incrementally, one resource at a time**, never with a big-bang
inversion. Each resource is one repeatable **4-step slice**, and each step is a ticket:

1. **Move** — lift the real implementation from `api/<x>` into `api-v2/<x>` with the
   `client`/DI signature and real types (remove `any`).
2. **Shim** — replace `api/<x>` with a thin wrapper that calls v2 via a new
   `configToClient(config)` adapter, so the CLI keeps working **unchanged** on the same code path.
3. **Rewire** — point the CLI command at `api-v2` directly; delete the shim.
4. **Verify** — unit-test the moved code; the api-live + e2e parity suite stays green.

Why B over "facade-then-invert": the explicit goal *is* the inverted shape. B reaches it
slice by slice (each merged slice is permanently in end-state form), avoids writing every
signature twice, and avoids deferring all risk to one final inversion. The cost — touching
battle-tested code per slice — is contained by the shim (identical code path) + the parity suite.

**Definition of done (every slice):** logic in v2 with no `any`; old api path either shimmed or
removed; CLI command exercises v2; unit tests added; `test:api-live` + `test:e2e` green; no new
top-level-await/`cwd` reachable from the pure core.

---

## 4. SDK architecture — two tiers

The old "data-only, GUI owns I/O" split is retired (the GUI is parked). `discover/` and
`precompile/` already touch disk, and Node consumers need fs helpers too. The SDK ships **two tiers**:

- **Pure core** — resource CRUD + sync over already-loaded data. Browser/edge-safe: zero fs,
  zero `process.cwd()`, zero top-level await. This is the default `sb-mig/api-v2` entrypoint.
- **fs-backed node tier** — discover, precompile, backup, load-from-disk. Node-only, exposed
  under a separate subpath (e.g. `sb-mig/node`). Contains all filesystem + cwd concerns.

Cross-cutting contracts (defined in **F5**): a single error shape, a `SyncProgressCallback`
progress contract (already started in `sync/types.ts`), and a naming convention across modules.

---

## 5. Work breakdown (~35 tickets)

Internal codes (F/S/Z) are stable references; Linear IDs are filled in §7 after creation.

### F · Foundation (blocks the slices)

| Code | Title | Scope / acceptance | Depends |
|---|---|---|---|
| **F1** | Parity safety net | Make `test:api-live` + `test:e2e` runnable & green against a scratch space; document required env; (optionally) wire a CI job. This suite is the parity contract. | — |
| **F2** | `configToClient()` adapter | Inverse of `toRequestConfig`: `RequestBaseConfig → ApiClient`. Unblocks every shim. Unit-tested. | — |
| **F3** | SDK build + import-safety smoke test | Verify dual ESM/CJS build of `./api-v2`; add a test that imports the *built* SDK in both ESM and CJS with **no** `storyblok.config` present and asserts no top-level-await/`cwd` crash. Guards regressions as slices land. | — |
| **F4** | v2 unit-test harness | Reusable v2 test conventions + mocks (reuse `__tests__/mocks`). Enables per-slice tests. | — |
| **F5** | ADR: two-tier SDK layering | Decide & document pure-core vs node tier boundary, subpath exports, error contract, progress contract, naming. Blocks discover/precompile/backup design. | — |
| **F6** | `createConfig()` factory + kill top-level await | Remove top-level `await` in `config.ts`; provide a factory; contain `cwd`/fs to the node tier. **Folds in MAR-1347.** Gates the tainted slices (S12/S13/S18). | F5 |

### S · Resource slices (the 4-step pattern)

| Code | Title | Notes | Depends |
|---|---|---|---|
| **S1** | Roles slice ★PILOT | Validates the whole move/shim/rewire pattern on a leaf. | F1, F2, F4 |
| **S2** | Datasources slice | incl. datasource entries + error-formatting | S1 |
| **S3** | Plugins slice | | S1 |
| **S4** | Components CRUD + groups | | S1 |
| **S5** | Component sync + SSOT | depends on groups | S4 |
| **S6** | Presets + `--presets` in sync | reconciles **MAR-977** | S5 |
| **S7** | Discovery consolidation | port `cli/utils/discover.ts` (1355 lines) → `api-v2/discover`, split into modules | F5 |
| **S8** | Precompile finalize | `.ts` schema → js (rollup/swc), node tier | F5, S7 |
| **S9** | Rewire CLI discover + sync discovery | point `discover` cmd + sync's discovery at v2 | S7, S8 |
| **S10** | Stories CRUD + tree | consolidate `api/stories` + v2; dedupe `buildTree` | S1 |
| **S11** | Copy stories | CLI strategies: `what` / `where` / `folder/*` | S10 |
| **S12** | Content/asset directional sync | `sync content` (lives in `migrate.ts`, tainted) | S10, F6 |
| **S13** | Migration core | component-data-migration, scope, validation, file-naming → v2 | F6 |
| **S14** | Publication model | published-layer, language-publish-state, publication modes | S13 |
| **S15** | Migration artifacts | JSONL run logs, write-summary, dry-run output | S13 |
| **S16** | Rewire migrate family | `migrate`, `language-publish-state`, `published-layer-export`, `story-versions` | S13, S14, S15 |
| **S17** | `migrations` command | list/enrich migration configs | S13 |
| **S18** | Inspect | component-usage queries → v2 (tainted) | F6 |
| **S19** | Backup module | stories/components/datasources/roles/plugins/presets → v2, node tier | F5, S2, S3, S4, S6, S10 |
| **S20** | `remove` command | onto v2 | S4 |
| **S21** | `revert` command | onto v2 (uses artifacts/backups) | S13, S15 |
| **S22** | `init` project | v2 spaces + CLI keeps `.env` writing | S24 |
| **S23** | `debug` command | onto v2 | F2 |
| **S24** | Spaces / auth / assets | finalize leaf resources (assets already shipped programmatic create/update) | S1 |

### Z · Finalize inversion

| Code | Title | Scope | Depends |
|---|---|---|---|
| **Z1** | Drop global `apiConfig` singleton | CLI builds `ApiClient` via `createClient` from resolved config | all CLI rewires (S9, S16, S19–S23) |
| **Z2** | Collapse old `api/` shims | delete dead legacy code; `api/` reduced to nothing/thin | Z1 |
| **Z3** | Type-safety pass | eliminate remaining `any`; enable `tsconfig` strict | Z2 |
| **Z4** | SDK public surface + docs | freeze public API; programmatic usage guide (evolve `README-V2.md`); Next.js route example | Z2 |
| **Z5** | Release | version bump (v7), breaking-changes notes, publish | Z4 |

---

## 6. Dependency spine

```
F1 ─┐
F2 ─┼─► S1(pilot) ─┬─► S2  S3  S4 ─► S5 ─► S6
F4 ─┘              ├─► S10 ─► S11
                   ├─► S24 ─► S22
F5 ─► S7 ─► S8 ─► S9
F5 ─► F6 ─► S12 (also ◄ S10)
        F6 ─► S13 ─┬─► S14 ─┐
                   ├─► S15 ─┼─► S16
                   ├─► S17  │
                   └────────┘
        F6 ─► S18
S2,S3,S4,S6,S10 ─► S19
S4 ─► S20      S13,S15 ─► S21      F2 ─► S23

(all CLI rewires) ─► Z1 ─► Z2 ─► Z3
                                Z2 ─► Z4 ─► Z5
```

**Critical path:** `F1+F2 → S1 → {leaf slices in parallel} → F6 → migrate/content/inspect
cluster → Z1 → Z2 → Z4 → Z5`.

---

## 7. Linear mapping

Project: **sb-mig** (`ade28acf-35ff-4b7c-a354-31569292a5a0`) · Team: **marckraw / MAR**.
Structure: one **parent issue per epic** (F/S/Z), **sub-issues per slice**, `blocks/blocked-by`
relations along the spine. All tagged `sdk-refactor`.

**Epics:** F = [MAR-1432](https://linear.app/marckraw/issue/MAR-1432) · S = [MAR-1433](https://linear.app/marckraw/issue/MAR-1433) · Z = [MAR-1434](https://linear.app/marckraw/issue/MAR-1434)

| Code | Linear | Code | Linear | Code | Linear |
|---|---|---|---|---|---|
| F1 | MAR-1435 | S5 | MAR-1445 | S15 | MAR-1455 |
| F2 | MAR-1436 | S6 | MAR-1446 | S16 | MAR-1456 |
| F3 | MAR-1437 | S7 | MAR-1447 | S17 | MAR-1457 |
| F4 | MAR-1438 | S8 | MAR-1448 | S18 | MAR-1458 |
| F5 | MAR-1439 | S9 | MAR-1449 | S19 | MAR-1459 |
| F6 | MAR-1440 | S10 | MAR-1450 | S20 | MAR-1460 |
| S1 | MAR-1441 | S11 | MAR-1451 | S21 | MAR-1461 |
| S2 | MAR-1442 | S12 | MAR-1452 | S22 | MAR-1462 |
| S3 | MAR-1443 | S13 | MAR-1453 | S23 | MAR-1463 |
| S4 | MAR-1444 | S14 | MAR-1454 | S24 | MAR-1464 |
| | | | | Z1 | MAR-1465 |
| | | | | Z2 | MAR-1466 |
| | | | | Z3 | MAR-1467 |
| | | | | Z4 | MAR-1468 |
| | | | | Z5 | MAR-1469 |

All `blocks/blocked-by` relations from §6 are set in Linear (e.g. F6 blocked by F5; S1 blocked by
F1/F2/F4; Z1 blocked by every CLI rewire).

**Reconciliation with existing tickets:**

- **MAR-1347** "Make CLI command registration side-effect-free" → becomes / is folded into **F6**.
- **MAR-977** "extract syncing default presets" → folded into **S6**.
- **MAR-981** "resolvers feature not fully implemented" → tracked alongside **S12/S13** (resolver transforms live in the tainted set).

---

## 8. Notes

- Keep the CLI behaviour byte-stable through every slice — the api-live/e2e suite (F1) is the
  arbiter, not manual checking.
- Prefer landing slices behind the shim first (steps 1–2), then rewiring (step 3) in a follow-up,
  so a half-done slice never breaks the CLI.
- `any` is paid down *as each slice moves*, not in a separate late pass (Z3 only mops up remainders).
