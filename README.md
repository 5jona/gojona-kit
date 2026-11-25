# gojona-kit

Reusable React UI kit, multi-theme design system, host runtime bridge, contract compiler, and shared Vite build preset for Android WebView overlays, KernelSU WebUI modules, and standalone browser dashboards.

See [`docs/ARCHITECTURE.md`](./docs/ARCHITECTURE.md) for the package dependency DAG, primitive lookup matrix, transport/theme pipelines, and Scheme C contract-first codegen rules.

## Packages

```text
gojona-kit/
├── packages/
│   ├── config/        # @gojona/config: shared Vite + React + Tailwind v4 preset, Biome base config, Node TS hook
│   ├── contracts-gen/ # @gojona/contracts-gen: deterministic Rust/Kotlin/TS/JSON Schema contract compiler & validator
│   ├── bridge/        # @gojona/bridge: Host WebView / KernelSU / Browser Mock transport SDK
│   ├── sdk/           # @gojona/sideveil-sdk: optional React plugin SDK for SideVeil sidebar plugins
│   └── ui/            # @gojona/ui: Radix-based components (Input, Button, etc.), AppShell, theme utilities
├── apps/
│   └── playground/    # @gojona/playground: dual-viewport and live theme workbench
├── docs/
│   ├── ARCHITECTURE.md # Architecture DAG, primitive lookup matrix, and contract-first workflow
│   └── CHANGELOG.md    # Package release history
└── AGENTS.md          # Repository agent & engineering guidelines
```

### `@gojona/ui`

Tailwind- and Radix-based UI component library and theme management primitives:

- **Components & Providers**: `AppShell`, `Button`, `Input`, `Card`, `SettingRow`, `Slider`, `Switch`, `Tabs`, `Badge`, `LogConsole`, `MetricTile`, `ThemeSwitcher`, `ToastProvider`, and `ThemeProvider`.
  - `ThemeProvider`: Manages theme and color mode. Supports `syncEnabled?: boolean` (defaults to `true`); daemon-backed embedded WebViews should pass `syncEnabled={hydrated}` so stale `localStorage` values do not flash the native container backdrop before authoritative config loads.
- **Canvas & Theme Helpers**:
  - `buildThemeSyncKey(payload)`: Computes a deterministic serialization key to deduplicate container theme synchronization events.
  - `readThemeToken(tokenName, scheme, fallback, root?)`: Resolves concrete scheme-qualified CSS custom properties (`--${name}-${scheme}`) for 2D Canvas or WebGL contexts where CSS `light-dark(...)` is unsupported.
  - `colorWithAlpha(color, alpha)`: Converts `#rgb`, `#rrggbb`, `rgb(...)`, or `rgba(...)` color values into an `rgba(r, g, b, alpha)` string with clamped alpha in the `[0, 1]` range.
  - `applyDynamicCssTokens(tokens, root?)` & `clearDynamicCssTokens(tokenNames, root?)`: Inject and clean up host-synthesized Material You `Oklch` CSS custom properties (`--*`).
  - `THEME_BOOTSTRAP_SCRIPT`: Synchronous inline script for `<head>` to hydrate saved theme and color-scheme attributes before first paint, eliminating theme flash.

### `@gojona/bridge`

Runtime-aware bridge SDK for embedded Android host WebViews, KernelSU modules, and browser mock environments:

- **Core APIs**: `createBridge`, `BridgeProvider`, `useBridge`, `detectRuntime`, and `detectPluginId`.
- **Plugin Messaging & Container Control**: `invokePlugin` (`plugin.invoke` JSON-RPC multiplexing), `onPluginEvent`, `onPluginBackendState`, `onBackPressed`, `onThemePalette`, and `sendContainerAction` (`dismiss`, `setPreferredSize`, `requestImeFocus`, `setBackIntercept`, `setSurfaceBackdrop`, `setPresentationMode`, `setPinnedBounds`, `setEdgeStatus`, `syncTheme`).
- **Host Theme Synchronization**:
  - `useContainerThemeSync(options?)`: React hook providing a stable callback for `<ThemeProvider onThemeSync={...} />` with zero boilerplate, wrapping `createThemeSyncDeduplicator` and delegating to `bridge.sendContainerAction({ type: 'syncTheme', payload })`.
  - `createThemeSyncDeduplicator(send, options?)`: Pure deduplicator suppressing consecutive identical theme payloads. With `includeAppearanceHints: false`, appearance hints (`wantsNativeBlur`, `cornerRadiusPx`) are stripped to preserve daemon authority.

### `@gojona/sideveil-sdk`

Optional React SDK built on top of `@gojona/bridge` for authoring SideVeil sidebar plugins with minimal boilerplate:

- **Provider & Manifest**: `SideVeilPluginProvider`, `useSideVeilPlugin`, `definePluginManifest`, and `BUILTIN_DIAG_PLUGIN_ID`.
- **Hooks**: `useContainerAction`, `useBackPress`, `usePluginRpc`, `usePluginStorage`, `usePluginEvent`, `usePluginBackendState`, `useEdgeStatus`, `useNativeHud`, `useDynamicThemeTokens`, `useGraphicsCapabilities`, `useInterPluginBus`, and `useTelemetry`.

## Prerequisites

Tool versions are pinned in [`mise.toml`](./mise.toml). Ensure `mise` is active or run commands via `mise exec --`.

## Development Commands

```bash
pnpm install
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm check
pnpm dev
```

## Installation & Standalone Usage

All packages are published independently to npmjs.org under the `@gojona/*` scope (MIT license) and can be consumed by any React 19 + Tailwind CSS v4 frontend project—with or without SideVeil:

```bash
# Generic React UI kit + Vite/Biome config (standalone web apps)
pnpm add @gojona/ui react react-dom lucide-react
pnpm add -D @gojona/config tailwindcss @tailwindcss/vite vite @vitejs/plugin-react

# Optional: Android WebView / KernelSU bridge and SideVeil plugin SDK
pnpm add @gojona/bridge @gojona/sideveil-sdk

# Optional: Scheme C cross-language contract compiler CLI
pnpm add -D @gojona/contracts-gen
```

1. **Compiled `dist/` package exports**: `@gojona/ui`, `@gojona/bridge`, and `@gojona/sideveil-sdk` ship precompiled ESM `dist/*.js` and `dist/*.d.ts` artifacts alongside `src/styles` (`@gojona/ui/styles.css` includes `@source` directives so Tailwind CSS v4 scans component classes automatically from `node_modules`).
2. **Vite configuration**: import `createPochitaViteConfig` directly from `@gojona/config` (override `POCHITA_KIT_ROOT` only when linking against a local checkout):

   ```javascript
   import { createPochitaViteConfig } from '@gojona/config';

   export default createPochitaViteConfig({
     surface: 'standalone', // or 'native-glass' for SideVeil drawers
   });
   ```
3. **Biome preset**: extend `@gojona/config/biome.json` in your `biome.json`.
4. **Adding a theme**: define semantic light/dark CSS custom properties under `packages/ui/src/styles/themes/` and register the theme metadata in `packages/ui/src/theme/registry.ts` and `packages/config/themes.mjs`.

## Security Defaults

- **`detectRuntime({ allowUrlOverride })`**: URL query parameter overrides (`?env=host|ksu|mock|browser`) are disabled by default in production and only accepted in development builds when no native bridge global exists. Set `allowUrlOverride: false` to enforce strict denial of query overrides, or `allowUrlOverride: true` in controlled test harnesses.
- **`HostTransport({ allowedOrigins })`**: Embedded WebView postMessage communication strictly validates event origins against configured `allowedOrigins`. Message payloads and port transfers from untrusted origins are immediately discarded. In Android environments, pin origins to trusted endpoints such as `https://appassets.androidplatform.net`.

## License

Licensed under the [MIT License](./LICENSE).
