# pochita-webui-kit

Reusable React UI kit, multi-theme design system, host runtime bridge, and shared Vite build preset for Android WebView overlays, KernelSU WebUI modules, and standalone browser dashboards.

## Packages

```text
pochita-webui-kit/
├── packages/
│   ├── config/      # @pochita/config: shared Vite + React + Tailwind v4 preset (base: './')
│   ├── bridge/      # @pochita/bridge: Host WebView / KernelSU / Browser Mock transport SDK
│   └── ui/          # @pochita/ui: Radix-based components (Input, Button, etc.), AppShell, theme utilities
├── apps/
│   └── playground/  # @pochita/playground: dual-viewport and live theme workbench
└── .agents/rules/   # Repository engineering rules
```

### `@pochita/ui`

Tailwind- and Radix-based UI component library and theme management primitives:
- **Components & Providers**: `AppShell`, `Button`, `Input`, `Card`, `SettingRow`, `Slider`, `Switch`, `Tabs`, `Badge`, `LogConsole`, `MetricTile`, `ThemeSwitcher`, `ToastProvider`, and `ThemeProvider`.
  - `ThemeProvider`: Manages theme and color mode. Supports `syncEnabled?: boolean` (defaults to `true`); daemon-backed embedded WebViews should pass `syncEnabled={hydrated}` so stale `localStorage` values do not flash the native container backdrop before authoritative config loads.
- **Canvas & Theme Helpers**:
  - `buildThemeSyncKey(payload)`: Computes a deterministic serialization key to deduplicate container theme synchronization events.
  - `readThemeToken(tokenName, scheme, fallback, root?)`: Resolves concrete scheme-qualified CSS custom properties (`--${name}-${scheme}`) for 2D Canvas or WebGL contexts where CSS `light-dark(...)` is unsupported.
  - `colorWithAlpha(color, alpha)`: Converts `#rgb`, `#rrggbb`, `rgb(...)`, or `rgba(...)` color values into an `rgba(r, g, b, alpha)` string with clamped alpha in the `[0, 1]` range.
  - `THEME_BOOTSTRAP_SCRIPT`: Synchronous inline script for `<head>` to hydrate saved theme and color-scheme attributes before first paint, eliminating theme flash.

### `@pochita/bridge`

Runtime-aware bridge SDK for embedded Android host WebViews, KernelSU modules, and browser mock environments:
- **Core APIs**: `createBridge`, `BridgeProvider`, `useBridge`, and `detectRuntime`.
- **Host Theme Synchronization**:
  - `useContainerThemeSync(options?)`: React hook providing a stable callback for `<ThemeProvider onThemeSync={...} />` with zero boilerplate, wrapping `createThemeSyncDeduplicator` and delegating to `bridge.sendContainerAction({ type: 'syncTheme', payload })`.
  - `createThemeSyncDeduplicator(send, options?)`: Pure deduplicator suppressing consecutive identical theme payloads. With `includeAppearanceHints: false`, appearance hints (`wantsNativeBlur`, `cornerRadiusPx`) are stripped to preserve daemon authority.

## Prerequisites

Tool versions are pinned in [`mise.toml`](./mise.toml). Ensure `mise` is active or run commands via `mise exec --`.

## Development Commands

```bash
pnpm install
pnpm typecheck
pnpm test
pnpm build
pnpm dev
```

## Integrating External Repositories

1. **Local linking during active development**: reference `@pochita/ui`, `@pochita/bridge`, and `@pochita/config` via local workspace or relative file dependencies from a consumer repository's `package.json`.
2. **Configuring Kit Path with `POCHITA_KIT_ROOT`**: consumer repositories utilizing `createPochitaViteConfig` (or `createWebUiViteConfig`) can override the default relative monorepo path using the `POCHITA_KIT_ROOT` environment variable:
   ```javascript
   import path from 'node:path';
   import { fileURLToPath } from 'node:url';
   import { createPochitaViteConfig } from '@pochita/config';

   const __dirname = path.dirname(fileURLToPath(import.meta.url));
   const kitRoot = process.env.POCHITA_KIT_ROOT
     ? path.resolve(process.env.POCHITA_KIT_ROOT)
     : path.resolve(__dirname, '../../../../pochita-webui-kit');

   export default createPochitaViteConfig({
     kitRoot,
     server: { fs: { allow: [__dirname, kitRoot] } },
   });
   ```
3. **Versioned releases**: push this repository to a remote Git origin and pin consumer dependencies to release tags (e.g., `v0.1.0`).
4. **Adding a theme**: define semantic light/dark CSS custom properties under `packages/ui/src/styles/themes/` and register the theme metadata in `packages/ui/src/theme/registry.ts`.

## Security Defaults

- **`detectRuntime({ allowUrlOverride })`**: URL query parameter overrides (`?env=host|ksu|mock|browser`) are disabled by default in production and only accepted in development builds when no native bridge global exists. Set `allowUrlOverride: false` to enforce strict denial of query overrides, or `allowUrlOverride: true` in controlled test harnesses.
- **`HostTransport({ allowedOrigins })`**: Embedded WebView postMessage communication strictly validates event origins against configured `allowedOrigins`. Message payloads and port transfers from untrusted origins are immediately discarded. In Android environments, pin origins to trusted endpoints such as `https://appassets.androidplatform.net`.

