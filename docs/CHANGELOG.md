# Changelog

All notable changes to `gojona-kit` (`@gojona/*` packages) are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.3.1] - 2026-11-27

### Fixed

- Republished `@gojona/*` packages to recover from an incomplete npmjs.org tarball upload for `@gojona/ui@0.3.0`.

## [0.3.0] - 2026-11-27

### Added

- **`@gojona/ui`**: Added `AppShell` `fullBleed`, `viewportMode` (`scroll` | `fill`), `bottomSlot`, safe-area inset styling, `TabsList` `dock` variant, `BottomNav` alias, and `TabsTrigger` icon slot while preserving 1:1 swipe gestures across `app-shell-body`.

### Changed

- **`@gojona/ui`**: Converted `TabsIndicator` to compositor-only `translate3d` + `scaleX`, replaced `transition-all` with targeted transition properties, disabled redundant `native-glass` backdrop blur, and declared CSS-only `sideEffects`.
- **`@gojona/bridge`**: Synced generated SideVeil contract constants (`SIDEVEIL_BUILTIN_DIAGNOSTIC.VERSION = '0.3.0'`).

### Fixed

- **`@gojona/ui`**: Offset `Toast` viewport above `AppShell` `bottomSlot`, moved theme and base `:root` tokens into `@layer base` for `native-glass` layering, and fixed `useTabPager` swipe abort and `overflow-x: visible` ancestor checks.
- **`@gojona/config` & `@gojona/bridge` & `@gojona/sideveil-sdk` & `@gojona/contracts-gen`**: Added `/core` subpath resolution in `@gojona/config/register-ts`, fixed `onPluginEvent` concurrent deduplication, sticky events in `MockTransport`, non-DOM timer/unmount guards, stale async overwrite guards in `@gojona/sideveil-sdk`, and cyclic `$ref` rejection in `@gojona/contracts-gen`.

## [0.2.0] - 2026-11-25

### Fixed

- **`@gojona/ui`**: Fixed rapid, consecutive, and reversed tab-swipe flicker and lost commits via an explicit settle/commit state machine (`tabPagerCommitState.ts`), with comprehensive unit tests.
- **`@gojona/bridge`**: Prioritized active Android `WebMessageListener` channel over late-transferred `MessagePort` instances in `HostTransport`, closing superseded ports and preventing `plugin.invoke` timeouts in SideVeil overlays.
- **`@gojona/config`**: Anchored `POCHITA_KIT_ROOT` Vite aliases with exact regex patterns so subpath imports such as `@gojona/bridge/core` and `@gojona/sideveil-sdk/core` resolve reliably.

### Changed

- Synced generated SideVeil contract constants (`SIDEVEIL_BUILTIN_DIAGNOSTIC.VERSION = '0.2.0'`) and added workspace-wide version parity checks in `test/standards.test.mjs`.

## [0.1.1] - 2026-11-24

### Changed

- Renamed upstream repository and package metadata (`repository`, `homepage`, `bugs`) from `pochita-webui-kit` to `gojona-kit`.
- Enabled GitHub Actions npm OIDC Trusted Publishing with Sigstore `--provenance` attestations in `.github/workflows/publish.yml`.

## [0.1.0] - 2026-11-24

### Added

- **`@gojona/ui`**: Multi-theme Tailwind CSS v4 + Radix UI component library (`AppShell`, `Button`, `Input`, `Card`, `SettingRow`, `Slider`, `Switch`, `Tabs` with 1:1 dual-panel gesture pager & GPU sliding pill, `Badge`, `LogConsole`, `MetricTile`, `ThemeSwitcher`, `ToastProvider`, `ThemeProvider`, `BridgeTraceInspector`), `coloros-glass` & `modern-saas-dark` themes, `native-glass` surface styles, and zero-flash `THEME_BOOTSTRAP_SCRIPT`.
- **`@gojona/bridge`**: Runtime-aware bridge (`HostTransport`, `KsuTransport`, `MockTransport`), `BridgeProvider` / `useBridge`, structured observability trace ring, `useContainerThemeSync`, and frozen SideVeil protocol constants/config bounds.
- **`@gojona/sideveil-sdk`**: React SideVeil plugin SDK (`SideVeilPluginProvider`, `createTypedPluginClient`, `useTypedPluginClient`, `usePluginInvoke`, `usePluginRpc`, `usePluginStorage`, `usePluginEvent`, `usePluginBackendState`, `useContainerAction`, `useBackPress`, `useEdgeStatus`, `useNativeHud`, `useDynamicThemeTokens`, `useSyncedPluginTheme`, `useClipboard`, `useHaptics`, `useTelemetry`, `useInterPluginBus`).
- **`@gojona/config`**: Shared `createPochitaViteConfig` Vite + React + Tailwind v4 preset, Biome base configuration, `THEME_IDS` SSOT, and Node TypeScript test hook (`register-ts`).
- **`@gojona/contracts-gen`**: Zero-dependency Scheme C contract-first IDL compiler (`pochita-contracts-gen`) emitting deterministic Rust, Kotlin, TypeScript, and JSON Schema 2020-12 artifacts with golden fixture validation and breaking-change `diff`.
- **Standalone npm distribution & CI**: Published under `@gojona/*` on npmjs.org under the MIT license with GitHub Actions CI and release workflows.
