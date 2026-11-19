# Pochita WebUI Kit — Frontend Engineering Standards

## 1. Stack & Package Boundaries
- Tooling: `mise` (`pnpm`), Vite, React, TypeScript, Tailwind CSS v4.
- Do not call `window.ksu.exec` or raw host `postMessage` APIs directly inside feature code. Always use `@pochita/bridge` (`useBridge()` / `createBridge()`).
- Share Vite build settings through `@pochita/config` (`createWebUiViteConfig()`), preserving relative `./assets/` output (`base: './'`) for offline WebView compatibility.

## 2. Language & Privacy Policy
- **Engineering Internals (English Only)**: Write all source code, identifiers, comments, JSDoc, developer error messages, and documentation (`README.md`, rules) in objective, professional English.
- **User-Facing UI Copy (Simplified Chinese)**: Display all visible web UI text (titles, labels, descriptions, button copy, toasts, theme taglines) in concise, natural Simplified Chinese (`zh-CN`).
- **Generic Showcase Data**: Keep the shared workbench and component examples strictly free of downstream project names, private file paths, or personal environment identifiers.

## 3. Theming & CSS Invariants
- Never hardcode surface, border, or text hex values in consumer components. Bind semantic custom properties exposed by `@pochita/ui` (`--surface-*`, `--text-*`, `--border-hairline`, `--accent`, `--radius-*`).
- Every view must remain legible across all built-in themes (`coloros-glass`, `modern-saas-dark`) and all three color-scheme states (`system`, `light`, `dark`).
- Every HTML entry point must include `<meta name="color-scheme" content="light dark">` followed immediately by an inline synchronous script restoring stored preferences before first paint.
- Wrap page layouts in `<AppShell>` so content adapts seamlessly via `@container` queries between narrow drawer containers (`~340px`) and full-width views (`>= 480px`).

## 4. Verification Workflow
Before finalizing any UI change:
1. Run `pnpm typecheck` and resolve all TypeScript diagnostics.
2. Run `pnpm build` and confirm relative asset paths in generated `dist/index.html`.
3. Inspect the running preview across both wide manager mode and `340px` narrow drawer mode across themes and color schemes, confirming zero console errors and zero horizontal overflow.
