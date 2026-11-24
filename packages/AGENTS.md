# gojona-kit Package Guidelines

Applies to `packages/*` (`@gojona/ui`, `@gojona/bridge`, `@gojona/sideveil-sdk`, `@gojona/config`, `@gojona/contracts-gen`) and `apps/*`.

- **Exports & Type Safety**: Use explicit `import type` for all type-only symbols and preserve `.ts`/`.tsx` relative extensions matching existing package conventions. Export new public hooks and types cleanly from each package's `src/index.ts` (and keep `/core` subpaths strictly React-free).
- **Host Transport & Gesture Pager**: In `@gojona/bridge` `HostTransport`, an active `WebMessageListener` (`boundHostListener`) always supersedes late-arriving `MessagePort` transfers (close superseded ports). In `@gojona/ui`, preserve full-height `min-h-full` swipe chains without shrinking tab chrome (`shrink-0` on `<TabsList>`), and drive rapid gesture commits via explicit state machines (`tabPagerCommitState`).
- **Local Cross-Repo Aliases (`POCHITA_KIT_ROOT`)**: Anchor Vite package aliases in `@gojona/config` with exact regexes so subpath imports (`/core`, `/themes`, `/styles.css`) are never rewritten; remember downstream `tsc` and `node --test` resolve from `node_modules/@gojona/*`, not Vite aliases.
- **Styling & Theming**: Bind semantic CSS custom properties only; place custom component rules inside `@layer components` or `@layer base`; avoid `space-y-*` on containers with margin-reset children (prefer flex/grid `gap-*`).
- **Accessibility**: Provide `aria-label` or `aria-labelledby` on every interactive control.
- **Testing & Build**: Add unit tests in `packages/<pkg>/test/*.test.mjs` for new public APIs and run `pnpm check` so compiled `dist/*.js` and `dist/*.d.ts` stay in sync with `src/`.
