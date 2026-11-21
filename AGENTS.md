# Pochita WebUI Kit — Agent Guidelines

Read `.agent/rules.md` for full package, styling, accessibility, and transport invariants.

## Package Boundaries

- `@pochita/ui`: Generic design system components, theme tokens, and glass surfaces. Zero downstream host business logic.
- `@pochita/bridge`: Generic runtime transport (`HostTransport`, KernelSU bridge, browser mock transport).
- `@pochita/sideveil-sdk`: SideVeil-specific React provider, manifest helpers, container/presentation/haptics/telemetry/HUD hooks.
- `@pochita/config`: Shared Vite (`createPochitaViteConfig`) and Biome presets.

## Non-Negotiable Invariants

- **Type Imports & Dual Exports**: Always use explicit `import type` for type-only imports so Node's native TypeScript runner executes source files directly. Rebuild `dist/` via `pnpm check` whenever package APIs change.
- **Semantic Tokens Only**: Never hardcode surface, border, or text hex colors; bind `--surface-*`, `--text-*`, `--border-hairline`, `--glass-divider`, `--accent`, `--radius-*`. Use `color-mix(in oklab, ...)` in CSS and `readThemeToken()` + `colorWithAlpha()` in Canvas/WebGPU code.
- **Transport Discipline**: Never call `window.ksu`, `window.__POCHITA_HOST__`, or raw `window.postMessage` outside `@pochita/bridge`. Keep `allowUrlOverride: false` and explicit `allowedOrigins` in production.
- **File Size & Language**: Keep source files `<= 300` lines (hard limit `400`). Objective English in code/comments/docs; Simplified Chinese (`zh-CN`) for user-facing UI copy. Never include device serials, device-specific hardware specs, or personal paths.
- **Commit Messages**: Use Conventional Commits (`<type>(<scope>): <summary>`). Keep small focused changes single-line; include 2–5 concise bullet points explaining key changes and rationale for multi-file or architectural commits.

## Verification

- Run `pnpm check` (`lint`, `build`, `typecheck`, `test`) and ensure zero warnings or errors.
