---
description: "Use when creating or editing packages (@pochita/ui, @pochita/bridge, @pochita/sideveil-sdk, @pochita/config) or playground apps in pochita-webui-kit."
applyTo: "packages/**,apps/**"
---
# Pochita WebUI Kit Package Standards

Follow `.agent/rules.md` strictly when modifying packages or apps in this monorepo.

- **Exports & Type Safety**: Use explicit `import type` for all type-only symbols and preserve `.ts`/`.tsx` relative extensions matching existing package conventions. Export new public hooks and types cleanly from each package's `src/index.ts`.
- **Styling & Theming**: Bind semantic CSS custom properties only; place custom component rules inside `@layer components` or `@layer base`; avoid `space-y-*` on containers with margin-reset children (prefer flex/grid `gap-*`).
- **Accessibility**: Provide `aria-label` or `aria-labelledby` on every interactive control.
- **Testing & Build**: Add unit tests in `packages/<pkg>/test/*.test.mjs` for new public APIs and run `pnpm check` so compiled `dist/*.js` and `dist/*.d.ts` stay in sync with `src/`.
