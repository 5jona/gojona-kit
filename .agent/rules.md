# Pochita WebUI Kit — Engineering Standards

## 1. Package & Export Discipline

- **Separation of Concerns**: Keep shared UI components (`@pochita/ui`) and transport primitives (`@pochita/bridge`) strictly generic and independent of downstream host business logic. Host-specific helpers belong in dedicated SDK packages (`@pochita/sideveil-sdk`).
- **Dual Exports & Type Imports**: Workspace packages emit compiled ESM `dist/*.js` and `dist/*.d.ts` artifacts while exposing `"source": "./src/index.ts"` for zero-build local development. Always use explicit `import type` for type-only symbols so Node's native TypeScript runner can execute source modules directly.
- **File Size Limits**: Keep source files (`*.ts`, `*.tsx`, `*.css`) at or below **300 lines** (hard limit **400 lines**). Split growing modules by responsibility before crossing the limit.

## 2. Styling, Theming & Accessibility Invariants

- **Semantic Tokens Only**: Never hardcode surface, border, or text hex colors in components. Bind semantic CSS custom properties (`--surface-*`, `--text-*`, `--border-hairline`, `--glass-divider`, `--accent`, `--radius-*`).
- **CSS Layering & Color Mixing**: Place custom component styles inside `@layer components` or `@layer base` so utility classes passed via `className` override them deterministically. Never append hex alpha suffixes to CSS variables in JavaScript; use `color-mix(in oklab, ...)` in CSS and `readThemeToken()` + `colorWithAlpha()` for 2D Canvas drawing.
- **Zero-Flash Hydration**: Every HTML entry must include `<meta name="color-scheme" content="light dark">` followed immediately by the synchronous theme bootstrap script (`injectTo: 'head-prepend'`) before first paint.
- **Native Glass & Responsive Containers**: Under `data-surface="native-glass"`, page backgrounds resolve to `transparent` while floating overlays bind `--surface-toast`. Wrap views in `<AppShell>` for `@container` responsiveness across narrow drawers and wide viewports. Every interactive control must provide an accessible name (`aria-label` or `aria-labelledby`).

## 3. Runtime Safety & Bridge Discipline

- **Transport Abstraction**: Never invoke `window.ksu` or raw `window.postMessage` directly in feature code; route all host I/O through `@pochita/bridge`.
- **Origin & Environment Isolation**: Keep `allowUrlOverride: false` in production builds and restrict `HostTransport` to explicit `allowedOrigins` (never wildcard `'*'`).
- **State & Persistence Safety**: Treat `ENOENT` (`null`) as first-run initialization, but never overwrite disk configuration with defaults on transient read errors. Never perform bridge I/O inside React `setState` updaters. Daemon-backed hosts must defer theme synchronization (`syncEnabled={hydrated}`) until authoritative config is loaded.

## 4. Language, Privacy & Verification

- **Language & Privacy**: Write all code, identifiers, comments, commit messages, and documentation in objective English. Write user-facing UI copy in Simplified Chinese (`zh-CN`). Keep code, mocks, and tests free of personal paths, device serials, or private identifiers.
- **Verification**: Every change must pass `pnpm check` with zero warnings or errors.
