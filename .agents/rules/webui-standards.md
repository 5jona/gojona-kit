# Pochita WebUI Kit — Frontend Engineering Standards

## 1. Stack, Exports & Package Boundaries
- Tooling: `mise` (`pnpm`), Vite, React 19, TypeScript, Tailwind CSS v4, Radix UI primitives.
- **Source-Direct Workspace Exports**: `@pochita/ui` and `@pochita/bridge` export `./src/index.ts` directly without a separate `dist/` build step. Always use explicit `import type` for type-only symbols so Node's native TypeScript test runner can execute modules without bundling.
- **Bridge Abstraction**: Do not call `window.ksu.exec` or raw host `postMessage` APIs directly inside feature code. Always use `@pochita/bridge` (`useBridge()` / `createBridge()`).
- **Origin & Runtime Isolation**: Keep `allowUrlOverride: false` in production builds and restrict `HostTransport` to explicit `allowedOrigins` (default `https://appassets.androidplatform.net`), never wildcard `'*'`.
- **Safe Config Persistence**: Treat `bridge.readFile()` returning `null` (`ENOENT`) as first-run initialization, but treat thrown errors as transient failures—never overwrite disk files with defaults on read errors. Never invoke Bridge RPC or file writes inside React `setState` updaters.
- **Vite Config Sharing**: Share Vite build settings through `@pochita/config` (`createWebUiViteConfig()`), preserving relative `./assets/` output (`base: './'`) for offline WebView compatibility. Cross-repository consumers should support `POCHITA_KIT_ROOT` to override relative workspace paths.

## 2. Language & Privacy Policy
- **Engineering Internals (English Only)**: Write all source code, identifiers, comments, JSDoc, developer error messages, and documentation (`README.md`, rules) in objective, professional English.
- **User-Facing UI Copy (Simplified Chinese)**: Display all visible web UI text (titles, labels, descriptions, button copy, toasts, theme taglines) in concise, natural Simplified Chinese (`zh-CN`).
- **Generic Showcase Data**: Keep the shared workbench and component examples strictly free of downstream project names, private file paths, or personal environment identifiers.

## 3. Theming, CSS Layers & Accessibility Invariants
- **Semantic Tokens Only**: Never hardcode surface, border, or text hex values in consumer components. Bind semantic custom properties exposed by `@pochita/ui` (`--surface-*`, `--text-*`, `--border-hairline`, `--glass-divider`, `--accent`, `--radius-*`).
- **Tailwind v4 `@layer` Discipline**: All custom component classes in `base.css` or feature stylesheets must reside inside `@layer components` (or `@layer base`) so Tailwind v4 `@layer utilities` classes passed via `className` override them deterministically.
- **Dynamic Color & Canvas 2D Compatibility**: Because theme tokens use CSS `light-dark(...)`, never append hex alpha suffixes in JS (e.g., `` `${accent}33` ``). Use `color-mix(in oklab, var(--accent) 20%, transparent)` in CSS, and use `readThemeToken()` + `colorWithAlpha()` from `@pochita/ui` when drawing to Canvas 2D contexts.
- **Native Glass Surface Mode (`data-surface="native-glass"`)**: Under hardware-blurred Android hosts, `--surface-panel` and `--surface-canvas` resolve to `transparent`. Floating overlays (Toasts, popovers, menus) must bind `--surface-toast` to remain legible above page content.
- **Theme Source of Truth**: Every HTML entry point must include `<meta name="color-scheme" content="light dark">` followed immediately by an inline synchronous script restoring stored preferences before first paint. When connected to a daemon config file, treat the daemon config as authoritative and do not let stale `localStorage` values overwrite disk config on mount.
- **Adaptive Container Layout**: Wrap page layouts in `<AppShell>` so content adapts seamlessly via `@container` queries between narrow drawer containers (`~340px`) and full-width views (`>= 480px`).
- **Accessibility (a11y)**: Every interactive control (`Slider` thumb, `Switch`, `Input`, icon-only `Button`, `Tabs`) must expose an accessible name via `aria-label` or `aria-labelledby`.

## 4. Verification Workflow
Before finalizing any UI or bridge change:
1. Run `pnpm typecheck` and resolve all TypeScript diagnostics.
2. Run `pnpm test` and ensure all unit tests across workspace packages pass.
3. Run `pnpm build` and confirm relative asset paths in generated `dist/index.html`.
4. Inspect the running preview across both wide manager mode and `340px` narrow drawer mode across themes (`coloros-glass`, `modern-saas-dark`), color schemes (`system`, `light`, `dark`), and surface modes (`standalone`, `native-glass`), confirming zero console errors and zero horizontal overflow.

