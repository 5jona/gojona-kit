# Pochita WebUI Kit — Architecture & Navigation Map

`pochita-webui-kit` is the shared monorepo providing the React design system, multi-runtime host transport bridge, SideVeil plugin SDK, build/lint presets, and deterministic cross-language contract compiler used across Android WebView overlays, KernelSU WebUI modules, and standalone browser previews.

## 1. Repository Layout & Entry Points

| Path                      | Package / Role           | Key Entry Points                                                                                                    |
| ------------------------- | ------------------------ | ------------------------------------------------------------------------------------------------------------------- |
| `packages/config/`        | `@pochita/config`        | `index.mjs` (Vite preset), `themes.mjs` (SSOT), `biome.base.json`, `register-ts.mjs`                                |
| `packages/contracts-gen/` | `@pochita/contracts-gen` | `src/cli.mjs` (`pochita-contracts-gen`), `contract.schema.json`, `src/diff.mjs`, emitters, `src/validator.mjs`      |
| `packages/bridge/`        | `@pochita/bridge`        | `src/index.ts`, `src/detect.ts`, `src/host.ts`, `src/ksu.ts`, `src/mock.ts`, `src/trace.ts`                         |
| `packages/ui/`            | `@pochita/ui`            | `src/index.ts`, `src/theme/tokens.ts`, `src/styles/index.css`                                                       |
| `packages/sdk/`           | `@pochita/sideveil-sdk`  | `src/index.ts`, `src/PluginContext.ts`, `src/typedClient.ts`, `src/hooks.ts`, `src/presentation.ts`, `src/theme.ts` |
| `apps/playground/`        | `@pochita/playground`    | Dual-viewport workbench and live theme/component preview                                                            |
| `test/standards.test.mjs` | Repo Quality Gate        | Enforces line limits, `THEME_IDS` SSOT, zero hex colors, `import type`, `dist/` sync                                |

## 2. Package Dependency DAG & Forbidden Reverse Edges

```text
  @pochita/config (Vite/Biome presets, Node TS loader, THEME_IDS SSOT)
       │
       ├──────────────────────────────────────┐
       ▼                                      ▼
  @pochita/ui                            @pochita/bridge
  (components, tokens, glass CSS)        (runtime detection, transports, tracer)
       │                                      │
       └──────────────────┬───────────────────┘
                          ▼
               @pochita/sideveil-sdk
               (SideVeil provider, manifest, domain hooks)
                          │
                          ▼
                 apps/playground

  @pochita/contracts-gen (zero-dependency Node ESM contract compiler & fixture validator)
```

### Layering Rules & Forbidden Reverse Edges

- `@pochita/config` has zero internal package dependencies; it owns `THEME_IDS`, `DEFAULT_THEME_ID`, `createThemeBootstrapScript`, `createPochitaViteConfig`, and `biome.base.json`.
- `@pochita/contracts-gen` is strictly standalone with zero runtime npm dependencies (pure Node ESM) so downstream Rust, Android/Kotlin, and TypeScript repos can execute codegen and fixture validation without installing React or Vite.
- `@pochita/ui` depends only on `@pochita/config` (and headless UI peers). **Forbidden**: importing `@pochita/bridge`, `@pochita/sideveil-sdk`, or host-specific domain logic.
- `@pochita/bridge` has zero runtime dependencies on sibling packages (`@pochita/config` is dev-only for Node TS test registration). **Forbidden**: importing `@pochita/ui` or `@pochita/sideveil-sdk`.
- `@pochita/sideveil-sdk` composes `@pochita/bridge` and `@pochita/ui`. **Forbidden**: bypassing `@pochita/bridge` to touch `window.ksu`, `window.__POCHITA_HOST__`, or `window.postMessage`.
- Workspace runtime packages (`ui`, `bridge`, `sdk`) expose dual exports: `"source": "./src/index.ts"` for zero-build local development and compiled ESM `dist/*.js` + `dist/*.d.ts` for published consumption. Always use explicit `import type` for type-only imports so Node executes TS sources directly.

## 3. Primitive Lookup Matrix (Use This — Do Not Reimplement)

### `@pochita/ui` Components & Utilities (`packages/ui/src/index.ts`)

| Capability                 | Canonical Primitive                                                                               | Notes                                                                                                                             |
| -------------------------- | ------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| Responsive container shell | `AppShell`                                                                                        | Provides `@container` (`pochita-shell`) breakpoints, header modes, and surface framing                                            |
| Buttons, inputs & toggles  | `Button`, `Input`, `Switch`, `Slider`                                                             | Accessible defaults; `Slider` supports preset chips                                                                               |
| Selections & navigation    | `SegmentedControl`, `FilterChips`, `Tabs` (`TabsList`, `TabsTrigger`, `TabsContent`)              | Single/multi-select chips and Radix-backed tabs with horizontal swipe switching (`swipeable`, `edgeGuardPx`, `data-swipe-ignore`) |
| Cards, settings & tiles    | `Card` (`CardHeader`, `CardTitle`, `CardDescription`, `CardContent`), `SettingRow`, `ControlTile` | Semantic glass surfaces, rows, and quick-action tiles                                                                             |
| Status & metrics           | `Badge`, `MetricTile`, `ProgressBar`, `Sparkline`, `StatusBanner`, `EmptyState`                   | Exports pure `buildSparklineGeometry` helper                                                                                      |
| Observability & feedback   | `LogConsole`, `BridgeTraceInspector`, `ErrorBoundary`, `ToastProvider`, `useToast`                | Exports `filterLogEntries`, `formatLogEntriesText`, `filterTraceEntries`, `summarizeTraceEntries`                                 |
| Theme switcher & styling   | `ThemeSwitcher`, `cn`                                                                             | Tailwind class deduplication via `clsx` + `tailwind-merge`                                                                        |

### `@pochita/ui` Theme & Token Primitives (`packages/ui/src/theme/`)

| Capability                  | Canonical Primitive                                                                         | Notes                                                               |
| --------------------------- | ------------------------------------------------------------------------------------------- | ------------------------------------------------------------------- |
| Theme state & registry      | `ThemeProvider`, `useTheme`, `THEME_REGISTRY`, `THEME_LIST`, `isValidThemeId`               | Pass `syncEnabled={hydrated}` on daemon-backed hosts                |
| Zero-flash bootstrap        | `THEME_BOOTSTRAP_SCRIPT`, `STORAGE_KEY_THEME`, `STORAGE_KEY_SCHEME`                         | Re-exported from `@pochita/config/themes`                           |
| Canvas / WebGPU colors      | `readThemeToken`, `colorWithAlpha`, `SEMANTIC_THEME_TOKENS`                                 | Resolves concrete scheme values where `light-dark()` is unsupported |
| Dynamic Material You tokens | `applyDynamicCssTokens`, `clearDynamicCssTokens`, `inspectThemeTokens`, `buildThemeSyncKey` | Strict `--*` filtering and CDP diagnostic inspection                |

### `@pochita/bridge` Transports & Observability (`packages/bridge/src/index.ts`)

| Capability                 | Canonical Primitive                                                           | Notes                                                           |
| -------------------------- | ----------------------------------------------------------------------------- | --------------------------------------------------------------- |
| Client factory & context   | `createBridge`, `BridgeProvider`, `useBridge`, `createDeferredBridgeDisposer` | React Strict-Mode safe lifecycle disposal                       |
| Runtime & plugin detection | `detectRuntime`, `detectPluginId`                                             | Enforces `allowUrlOverride: false` in production                |
| Embedded Android host RPC  | `HostTransport`, `BridgeRpcError`                                             | MessagePort / JS interface / loopback WebSocket + origin filter |
| KernelSU shell primitives  | `ksuExec`, `ksuReadFile`, `ksuWriteFileAtomic`, `ksuToast`, `shellQuote`      | Atomic temp-file writes and POSIX argument quoting              |
| Browser preview mocks      | `MockTransport`, `registerMockRpc`, `registerMockExec`                        | Deterministic offline development without native globals        |
| Theme sync deduplication   | `useContainerThemeSync`, `createThemeSyncDeduplicator`                        | Suppresses consecutive identical `syncTheme` payloads           |
| Structured tracing         | `BridgeTracer`, `createTraceStore`, `sanitizeTraceValue`                      | Bounded ring buffer with depth/key limits and secret redaction  |

### `@pochita/sideveil-sdk` Plugin Hooks (`packages/sdk/src/index.ts`)

| Domain                         | Canonical Primitives                                                                                                                                                         |
| ------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Provider & manifest            | `SideVeilPluginProvider`, `useSideVeilPlugin`, `definePluginManifest`, `resolvePluginOrigin`, `BUILTIN_DIAG_PLUGIN_ID`                                                       |
| Container & presentation       | `useContainerAction`, `useBackPress`, `usePresentationMode`, `useHaptics`, `usePanelVisibility`, `useScopeChanged`                                                           |
| Plugin RPC & events            | `createTypedPluginClient`, `useTypedPluginClient`, `usePluginInvoke`, `usePluginRpc`, `usePluginEvent`, `usePluginEventLagged`, `usePluginBackendState`, `useInterPluginBus` |
| Persistence & theme sync       | `usePluginStorage`, `useDynamicThemeTokens`, `useDynamicThemeState`, `useSyncedPluginTheme`, `extractPluginAppearance`                                                       |
| Native HUD, telemetry & device | `useEdgeStatus`, `createEdgeStatusController`, `useNativeHud`, `useTelemetry`, `shouldPollTelemetry`, `useGraphicsCapabilities`, `useClipboard`, `useNetworkContext`         |

### `@pochita/config` & `@pochita/contracts-gen` Tooling

| Capability                | Canonical Primitive / CLI                                                             | Notes                                                                           |
| ------------------------- | ------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| Vite + Tailwind v4 preset | `createPochitaViteConfig`, `pochitaThemeBootstrapPlugin`, `DEFAULT_KIT_ROOT`          | Sets `base: './'`, offline asset paths, and `POCHITA_KIT_ROOT` fs allowlist     |
| Shared lint & TS runner   | `@pochita/config/biome.json`, `@pochita/config/register-ts`, `@pochita/config/themes` | Shared Biome preset, native Node TS hook, and `THEME_IDS` SSOT                  |
| Contract meta schema      | `packages/contracts-gen/contract.schema.json`                                         | JSON Schema Draft 2020-12 spec for `*.contract.json` (`$schema` authoring)      |
| Contract codegen & check  | `pochita-contracts-gen generate`, `pochita-contracts-gen check`                       | Zero-dependency Rust/Kotlin/TS/JSON Schema emitter and drift detector           |
| Breaking-change diff      | `pochita-contracts-gen diff [--json] <base> <head>`, `diffContractSpecs`              | Deterministic `buf breaking`-style compatibility gate across contract revisions |
| Wire fixture validation   | `pochita-contracts-gen validate-fixtures`                                             | Pure JS JSON Schema subset validator for positive and expected-invalid fixtures |

## 4. Runtime Detection & `HostTransport` Architecture

`detectRuntime(options)` resolves the active runtime in strict precedence order:

1. Explicit override when `allowUrlOverride === true` (`?env=host|ksu|mock|browser`).
2. `window.__POCHITA_HOST__` defined -> `'host'` (embedded Android WebView container).
3. `window.ksu?.exec` function defined -> `'ksu'` (KernelSU WebUI shell bridge).
4. Vite development build (`import.meta.env.DEV`) with `allowUrlOverride !== false` -> optional `?env=` query fallback.
5. Default fallback -> `'mock'` (`MockTransport`).

### Channel Multiplexing & Security Boundaries

```text
  WebUI Caller ──► createBridge() / HostTransport.invoke()
                         │
                         ├─ 1. PortChannel (upgraded MessagePort via window.postMessage)
                         ├─ 2. JS Interface (window.__POCHITA_HOST__.postMessage)
                         ├─ 3. WebSocketChannel (loopback wsUrl fallback)
                         └─ 4. PortChannel pending queue (buffered until port attaches)
```

- **Origin Isolation**: Every `window` `message` event must pass `isTrustedWindowMessage(event, allowedOrigins)` before port adoption or payload parsing. Production hosts pin explicit `allowedOrigins` (e.g., `https://appassets.androidplatform.net`) and never `'*'`.
- **JSON-RPC 2.0 & Tracing**: `plugin.invoke` and `container.action` requests carry monotonic IDs and per-call timeouts. `BridgeTracer` captures `rpcStart`/`rpcOk`/`rpcError`/`eventIn`/`port.*` events into a bounded ring buffer with `sanitizeTraceValue` redacting sensitive keys and truncating oversized payloads.

## 5. Theme & Zero-Flash Hydration Pipeline

```text
  index.html (<meta name="color-scheme" content="light dark">)
       │
       ▼  pochitaThemeBootstrapPlugin (inline <script> before CSS/JS)
  document.documentElement (data-theme, data-surface, meta color-scheme)
       │
       ▼  <ThemeProvider syncEnabled={hydrated}>
  CSS Semantic Tokens (themes/*.css -> base.css -> surfaces/native-glass.css)
       │
       ▼  useContainerThemeSync + createThemeSyncDeduplicator
  Host Container Backdrop (container.action { type: 'syncTheme', payload })
```

1. **SSOT Registry**: `packages/config/themes.mjs` owns `THEME_IDS` (`coloros-glass`, `modern-saas-dark`), `DEFAULT_THEME_ID`, storage keys (`pochita:theme`, `pochita:color-scheme`), and `createThemeBootstrapScript(surface)`. `test/standards.test.mjs` asserts 1:1 parity across `THEME_IDS`, `packages/ui/src/theme/registry.ts`, and `packages/ui/src/styles/themes/*.css`.
2. **Pre-Paint Injection**: `createPochitaViteConfig` registers `pochitaThemeBootstrapPlugin(surface)`, injecting the synchronous bootstrap `<script>` immediately after `<meta name="color-scheme" content="light dark">` so `data-theme`, `data-surface`, and color-scheme metadata resolve before stylesheets load.
3. **Hydration-Safe Sync**: `<ThemeProvider>` syncs state to `document.documentElement`. Daemon-backed WebViews pass `syncEnabled={hydrated}` to prevent stale `localStorage` values from flashing native container backdrops before authoritative config arrives. `useContainerThemeSync` deduplicates `syncTheme` actions via `buildThemeSyncKey(payload)`.
4. **Native Glass & Semantic Token Rules**:
   - Under `data-surface="native-glass"`, `native-glass.css` sets `--surface-canvas` and `--surface-panel` to `transparent` for hardware-blurred hosts while floating overlays bind `--surface-toast`.
   - Bind semantic tokens only (`--surface-*`, `--text-*`, `--border-hairline`, `--glass-divider`, `--accent`, `--accent-soft`, `--accent-fg`, `--success`, `--warning`, `--danger`, `--radius-*`, `--blur-amount`).
   - Place custom component CSS inside `@layer components` or `@layer base` (never unlayered overrides of Tailwind utilities).
   - Never append hex alpha suffixes to CSS variables in JS; use `color-mix(in oklab, ...)` in CSS and `readThemeToken()` + `colorWithAlpha()` in Canvas/WebGPU code.

## 6. Scheme C Contract-First Codegen (`@pochita/contracts-gen`)

Cross-repo IPC schemas, RPC methods, event payloads, enums, and protocol constants follow Scheme C contract-first code generation so Rust daemons, Android/Kotlin hosts, and TypeScript WebUIs derive from declarative `*.contract.json` (`schemaVersion: 1`) specifications.

```text
  *.contract.json (SSOT: constants, enums, structs, taggedUnions, rpcs, events)
       │
       ├─► emitRust.mjs   ──► Rust structs/enums/constants (serde, rustfmt-aligned)
       ├─► emitKotlin.mjs ──► Kotlin data classes/sealed interfaces/objects (kotlinx.serialization)
       ├─► emitTs.mjs     ──► TS types, const maps, RpcMethodMap, EventPayloadMap (Biome-aligned)
       └─► emitSchema.mjs ──► JSON Schema Draft 2020-12 ($defs) ──► validator.mjs (fixtures)
```

### Spec Structure & Multi-Target Outputs

- **Supported Declarations**: `constants`, `enums`, `structs`, `taggedUnions`, `rpcs` (emits method constants + TypeScript `RpcMethodMap`), and `events` (emits event constants + TypeScript `EventPayloadMap`).
- **Modular File Splitting**: The `outputs` array supports per-file `include` filters across `rust`, `kotlin`, `ts`, and `jsonSchema` targets so large domains emit multiple small files (`<= 300` lines each).
- **Deterministic Formatting**: Output emitters match `rustfmt` (`serde`), `ktlint`/`detekt` (`kotlinx.serialization`), Biome (2-space indent, single quotes, trailing commas), and JSON Schema Draft 2020-12.
- **Cross-Repo SSOT Invariants**:
  - Every `*.contract.json` spec may reference `packages/contracts-gen/contract.schema.json` via `"$schema"` for IDE validation and autocompletion against the Draft 2020-12 meta schema.
  - Every generated file begins with `@generated by @pochita/contracts-gen — DO NOT EDIT`. Never hand-edit generated files; edit the `*.contract.json` source and regenerate.
  - Downstream CI runs `pochita-contracts-gen check <spec.json...>` to fail builds immediately on any byte-level drift, and `pochita-contracts-gen diff [--json] <base-spec.json> <head-spec.json>` (`diffContractSpecs`) to block breaking wire evolutions (removed/changed constants, enums, structs, fields, tagged-union tags/variants, RPC methods/types, or event wires/payloads) while allowing additive non-breaking changes.
  - Golden positive and negative wire fixtures are validated via `pochita-contracts-gen validate-fixtures <schema.json> <fixtures...>` against `$defs/<TypeName>`.
  - Plugin WebUIs bind generated `*RpcMethodMap` / `*EventPayloadMap` interfaces directly to `createTypedPluginClient` / `useTypedPluginClient` (or single-method `usePluginInvoke`) for compile-time-typed, per-method-timeout RPC calls and event subscriptions with zero `useState` re-render overhead.

## 7. Build, Verification & Standards Gates

| Command                                 | Scope                                                                                |
| --------------------------------------- | ------------------------------------------------------------------------------------ |
| `pnpm check` / `mise run check`         | Full gate: `lint` -> `build` -> `typecheck` -> `test`                                |
| `pnpm lint` / `mise run lint`           | Biome lint and formatting check across the monorepo                                  |
| `pnpm build` / `mise run build`         | Emits `dist/*.js` + `dist/*.d.ts` for workspace packages and builds playground       |
| `pnpm typecheck` / `mise run typecheck` | Runs `tsc --noEmit` across all TypeScript packages                                   |
| `pnpm test` / `mise run test`           | Runs package unit tests (`packages/*/test/*.test.mjs`) and `test/standards.test.mjs` |
| `pnpm dev`                              | Launches `@pochita/playground` dual-viewport workbench                               |

### Automated & Engineering Invariants (`test/standards.test.mjs` & `AGENTS.md`)

- **File Size**: Package sources `<= 300` lines; app sources hard limit `<= 400` lines.
- **Persistence & Concurrency**: Treat `ENOENT` (`null`) as first-run initialization only; never overwrite persisted config on transient errors; never run bridge I/O inside React `setState` updaters.
- **Rendering & Accessibility**: Never clamp `requestAnimationFrame` metrics to hardcoded FPS ceilings; provide `aria-label` or `aria-labelledby` on every interactive control; keep `dist/` synchronized with `src/`.
- **Language & Privacy**: Objective English in code, comments, commits, and docs; Simplified Chinese (`zh-CN`) for user-facing UI copy; zero device serials, private IPs, or personal paths.
