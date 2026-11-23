# Pochita WebUI Kit — Agent Guidelines

Package-specific export, CSS, and test conventions live in `packages/AGENTS.md`.

## Package Boundaries
- `@pochita/ui`: Generic design system components, theme tokens, and glass surfaces. Zero downstream host business logic.
- `@pochita/bridge`: Generic runtime transport (`HostTransport`, KernelSU bridge, browser mock transport).
- `@pochita/sideveil-sdk`: SideVeil-specific React provider, manifest helpers, container/presentation/haptics/telemetry/HUD hooks.
- `@pochita/config`: Shared Vite (`createPochitaViteConfig`) and Biome presets.

## Non-Negotiable Invariants
- **Dual Exports & Type Imports**: Workspace packages emit compiled ESM `dist/*.js` and `dist/*.d.ts` artifacts while exposing `"source": "./src/index.ts"` for zero-build local development. Always use explicit `import type` for type-only symbols so Node's native TypeScript runner executes source files directly. Rebuild `dist/` via `pnpm check` whenever package APIs change.
- **Semantic Tokens & CSS Layering**: Never hardcode surface, border, or text hex colors; bind `--surface-*`, `--text-*`, `--border-hairline`, `--glass-divider`, `--accent`, `--radius-*`. Place custom component styles inside `@layer components` or `@layer base`. Never append hex alpha suffixes to CSS variables in JS; use `color-mix(in oklab, ...)` in CSS and `readThemeToken()` + `colorWithAlpha()` in Canvas/WebGPU code.
- **Zero-Flash Hydration & Native Glass**: Every HTML entry must include `<meta name="color-scheme" content="light dark">` followed immediately by the synchronous theme bootstrap script (`injectTo: 'head-prepend'`) before first paint. Under `data-surface="native-glass"`, page backgrounds resolve to `transparent` while floating overlays bind `--surface-toast`. Wrap views in `<AppShell>` for `@container` responsiveness.
- **Uncapped Frame Timing**: Never clamp `requestAnimationFrame` metrics or animation loops to arbitrary hardcoded FPS ceilings.
- **Transport & Origin Isolation**: Never call `window.ksu`, `window.__POCHITA_HOST__`, or raw `window.postMessage` outside `@pochita/bridge`. Keep `allowUrlOverride: false` in production builds and restrict `HostTransport` to explicit `allowedOrigins` (never wildcard `'*'`).
- **State & Persistence Safety**: Treat `ENOENT` (`null`) as first-run initialization, but never overwrite disk configuration with defaults on transient read errors. Never perform bridge I/O inside React `setState` updaters. Daemon-backed hosts must defer theme synchronization (`syncEnabled={hydrated}`) until authoritative config is loaded.
- **Accessibility, File Size & Language**: Every interactive control must have an accessible name (`aria-label` or `aria-labelledby`). Keep source files `<= 300` lines (hard limit `400`). Objective English in code/comments/commits/docs; Simplified Chinese (`zh-CN`) for user-facing UI copy. Never include device serials, hardware-specific specs, private IPs, or personal paths.
- **Commit Messages**: Conventional Commits (`<type>(<scope>): <imperative summary>`, `<= 72` chars); add 2–5 concise bullets for multi-file or architectural commits.

## Verification
- Run `pnpm check` (`lint`, `build`, `typecheck`, `test`) and ensure zero warnings or errors.
