# Pochita WebUI Kit Package Guidelines

Applies to `packages/*` (`@gojona/ui`, `@gojona/bridge`, `@gojona/sideveil-sdk`, `@gojona/config`) and `apps/*`.

- **Exports & Type Safety**: Use explicit `import type` for all type-only symbols and preserve `.ts`/`.tsx` relative extensions matching existing package conventions. Export new public hooks and types cleanly from each package's `src/index.ts`.
- **Styling & Theming**: Bind semantic CSS custom properties only; place custom component rules inside `@layer components` or `@layer base`; avoid `space-y-*` on containers with margin-reset children (prefer flex/grid `gap-*`).
- **Accessibility**: Provide `aria-label` or `aria-labelledby` on every interactive control.
- **Testing & Build**: Add unit tests in `packages/<pkg>/test/*.test.mjs` for new public APIs and run `pnpm check` so compiled `dist/*.js` and `dist/*.d.ts` stay in sync with `src/`.
