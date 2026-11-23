# Changelog

All notable changes to `gojona-kit` (`@gojona/*` packages) are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.1.0] - 2026-11-24

### Added

- **`@gojona/ui`**: Multi-theme Tailwind CSS v4 + Radix UI component library (`AppShell`, `Button`, `Input`, `Card`, `SettingRow`, `Slider`, `Switch`, `Tabs` with 1:1 dual-panel gesture pager & GPU sliding pill, `Badge`, `LogConsole`, `MetricTile`, `ThemeSwitcher`, `ToastProvider`, `ThemeProvider`, `BridgeTraceInspector`), `coloros-glass` & `modern-saas-dark` themes, `native-glass` surface styles, and zero-flash `THEME_BOOTSTRAP_SCRIPT`.
- **`@gojona/bridge`**: Runtime-aware bridge (`HostTransport`, `KsuTransport`, `MockTransport`), `BridgeProvider` / `useBridge`, structured observability trace ring, `useContainerThemeSync`, and frozen SideVeil protocol constants/config bounds.
- **`@gojona/sideveil-sdk`**: React SideVeil plugin SDK (`SideVeilPluginProvider`, `createTypedPluginClient`, `useTypedPluginClient`, `usePluginInvoke`, `usePluginRpc`, `usePluginStorage`, `usePluginEvent`, `usePluginBackendState`, `useContainerAction`, `useBackPress`, `useEdgeStatus`, `useNativeHud`, `useDynamicThemeTokens`, `useSyncedPluginTheme`, `useClipboard`, `useHaptics`, `useTelemetry`, `useInterPluginBus`).
- **`@gojona/config`**: Shared `createPochitaViteConfig` Vite + React + Tailwind v4 preset, Biome base configuration, `THEME_IDS` SSOT, and Node TypeScript test hook (`register-ts`).
- **`@gojona/contracts-gen`**: Zero-dependency Scheme C contract-first IDL compiler (`pochita-contracts-gen`) emitting deterministic Rust, Kotlin, TypeScript, and JSON Schema 2020-12 artifacts with golden fixture validation and breaking-change `diff`.
- **Standalone npm distribution & CI**: Published under `@gojona/*` on npmjs.org under the MIT license with GitHub Actions CI and release workflows.
