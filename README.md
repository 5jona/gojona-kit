# pochita-webui-kit

Reusable React UI kit, multi-theme design system, host runtime bridge, and shared Vite build preset for Android WebView overlays, KernelSU WebUI modules, and standalone browser dashboards.

## Packages

```text
pochita-webui-kit/
├── packages/
│   ├── config/      # @pochita/config: shared Vite + React + Tailwind v4 preset (base: './')
│   ├── bridge/      # @pochita/bridge: Host WebView / KernelSU / Browser Mock transport SDK
│   └── ui/          # @pochita/ui: Radix-based components, CSS container-query AppShell, themes
├── apps/
│   └── playground/  # @pochita/playground: dual-viewport and live theme workbench
└── .agents/rules/   # Repository engineering rules
```

## Prerequisites

Tool versions are pinned in [`mise.toml`](./mise.toml). Ensure `mise` is active or run commands via `mise exec --`.

## Development Commands

```bash
pnpm install
pnpm typecheck
pnpm build
pnpm dev
```

## Integrating External Repositories

1. **Local linking during active development**: reference `@pochita/ui`, `@pochita/bridge`, and `@pochita/config` via local workspace or relative file dependencies from a consumer repository's `package.json`.
2. **Versioned releases**: push this repository to a remote Git origin and pin consumer dependencies to release tags (e.g., `v0.1.0`).
3. **Adding a theme**: define semantic light/dark CSS custom properties under `packages/ui/src/styles/themes/` and register the theme metadata in `packages/ui/src/theme/registry.ts`.
