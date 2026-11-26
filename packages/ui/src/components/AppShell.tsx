import { type HTMLAttributes, type ReactNode, useEffect, useLayoutEffect, useRef } from 'react';
import { cn } from '../lib/cn.ts';

const useIsomorphicLayoutEffect = typeof window !== 'undefined' ? useLayoutEffect : useEffect;

/**
 * Layout form factor of `<AppShell>`.
 */
export type AppShellVariant = 'floating' | 'page' | 'drawer';

/**
 * Header density mode for `<AppShell>`.
 */
export type AppShellHeaderMode = 'default' | 'compact' | 'hidden';

/**
 * Viewport sizing mode for `<AppShell>`.
 * - `'scroll'`: document-level scroll (`min-h-dvh`)
 * - `'fill'`: viewport-locked shell (`h-dvh min-h-0 overflow-hidden`) with internal body scrolling
 */
export type AppShellViewportMode = 'scroll' | 'fill';

/**
 * Props for `<AppShell>`.
 */
export interface AppShellProps extends Omit<HTMLAttributes<HTMLElement>, 'title'> {
  title?: string;
  subtitle?: string;
  variant?: AppShellVariant;
  headerMode?: AppShellHeaderMode;
  /** When `true`, `page` variant defaults to `max-w-none` instead of `max-w-5xl`. */
  fullBleed?: boolean;
  /** Controls whether the shell grows with document flow (`'scroll'`) or fills the viewport (`'fill'`). */
  viewportMode?: AppShellViewportMode;
  maxWidthClassName?: string;
  headerLeading?: ReactNode;
  headerTrailing?: ReactNode;
  footer?: ReactNode;
  /** Fixed/docked bottom slot (e.g. `<TabsList variant="dock">` / `<BottomNav>`) with safe-area bottom inset. */
  bottomSlot?: ReactNode;
  children: ReactNode;
  className?: string;
  bodyClassName?: string;
  /** Disable scrolling wrapper if a custom scrollable view fills the body. Defaults to false in `page` scroll mode. */
  scrollable?: boolean;
}

const SHELL_VARIANT_CLASSES: Record<AppShellVariant, string> = {
  page: 'pochita-shell pochita-shell-page flex min-h-dvh w-full flex-col transition-colors duration-200',
  drawer:
    'pochita-shell pochita-shell-drawer flex h-dvh min-h-0 w-full flex-col overflow-hidden transition-colors duration-200',
  floating:
    'pochita-shell pochita-shell-backdrop flex min-h-0 flex-col overflow-hidden transition-[border-radius,border-color,background-color] duration-200',
};

/**
 * Multi-form adaptive container shell powered by CSS container queries (`@container`).
 * Supports `floating` cards, borderless single-canvas `page` views, and compact fixed-viewport `drawer` panels.
 */
export function AppShell({
  title = '',
  subtitle,
  variant = 'floating',
  headerMode = 'default',
  fullBleed = false,
  viewportMode,
  maxWidthClassName,
  headerLeading,
  headerTrailing,
  footer,
  bottomSlot,
  children,
  className,
  bodyClassName,
  scrollable,
  ...props
}: AppShellProps) {
  const isPage = variant === 'page';
  const isDrawer = variant === 'drawer';
  const resolvedViewportMode: AppShellViewportMode = viewportMode ?? (isDrawer ? 'fill' : 'scroll');
  const isFill = resolvedViewportMode === 'fill';
  const isScrollable = scrollable ?? (variant !== 'page' || isFill);
  const resolvedMaxWidth = maxWidthClassName ?? (fullBleed ? 'max-w-none' : 'max-w-5xl');
  const showHeader = headerMode !== 'hidden';
  const isCompactHeader = headerMode === 'compact';
  const bottomRef = useRef<HTMLDivElement | null>(null);

  useIsomorphicLayoutEffect(() => {
    if (!bottomSlot || typeof document === 'undefined') return;
    const el = bottomRef.current;
    if (!el) return;

    const rootStyle = document.documentElement.style;
    const syncBottomOffset = () => {
      const height = el.getBoundingClientRect().height;
      if (height > 0) {
        rootStyle.setProperty('--pochita-toast-bottom', `${Math.ceil(height + 12)}px`);
      }
    };

    syncBottomOffset();
    if (typeof ResizeObserver === 'undefined') {
      return () => {
        rootStyle.removeProperty('--pochita-toast-bottom');
      };
    }

    const observer = new ResizeObserver(syncBottomOffset);
    observer.observe(el);
    return () => {
      observer.disconnect();
      rootStyle.removeProperty('--pochita-toast-bottom');
    };
  }, [bottomSlot]);

  const headerTitleBlock = (
    <div className={cn('flex min-w-0 flex-1 items-center', isDrawer ? 'gap-2.5' : 'gap-3')}>
      {headerLeading ? <div className="shrink-0">{headerLeading}</div> : null}
      <div className="min-w-0 flex-1">
        <h1
          className={cn(
            'truncate font-semibold tracking-tight text-[var(--text-primary)]',
            isDrawer
              ? isCompactHeader
                ? 'text-xs'
                : 'text-sm'
              : isCompactHeader
                ? 'text-sm'
                : 'text-base',
          )}
        >
          {title}
        </h1>
        {subtitle && !isCompactHeader ? (
          <p
            className={cn(
              'mt-0.5 truncate text-[var(--text-secondary)]',
              isDrawer ? 'text-[11px]' : 'text-xs',
            )}
          >
            {subtitle}
          </p>
        ) : null}
      </div>
    </div>
  );

  const headerTrailingBlock = headerTrailing ? (
    <div
      className={cn(
        'flex max-w-full shrink-0 flex-wrap items-center',
        isDrawer ? 'min-w-0 justify-end gap-1.5' : 'gap-2',
      )}
    >
      {headerTrailing}
    </div>
  ) : null;

  return (
    <section
      data-pochita="app-shell"
      data-variant={variant}
      data-shell-variant={variant}
      data-header-mode={headerMode}
      data-viewport-mode={resolvedViewportMode}
      data-full-bleed={fullBleed ? 'true' : 'false'}
      className={cn(
        SHELL_VARIANT_CLASSES[variant],
        isFill && 'h-dvh min-h-0 overflow-hidden',
        className,
      )}
      {...props}
    >
      {showHeader ? (
        isPage ? (
          <header className="pochita-shell-sticky-header sticky top-0 z-20 shrink-0 border-b border-[var(--border-hairline)]">
            <div
              className={cn(
                'pochita-shell-header mx-auto w-full sm:px-6',
                isCompactHeader ? 'px-3.5 py-2' : 'px-4 py-3',
                resolvedMaxWidth,
              )}
            >
              {headerTitleBlock}
              {headerTrailingBlock}
            </div>
          </header>
        ) : (
          <header
            className={cn(
              isDrawer
                ? 'pochita-drawer-header flex shrink-0 items-center justify-between gap-2 border-b border-[var(--glass-divider,var(--border-hairline))]'
                : 'pochita-shell-header shrink-0 border-b border-[var(--border-hairline)]',
              isDrawer
                ? isCompactHeader
                  ? 'px-3 py-1.5'
                  : 'px-3.5 py-2.5'
                : isCompactHeader
                  ? 'px-3.5 py-2'
                  : 'px-4 py-3.5',
            )}
          >
            {headerTitleBlock}
            {headerTrailingBlock}
          </header>
        )
      ) : null}

      {isPage ? (
        <main
          data-pochita="app-shell-body"
          className={cn(
            'pochita-shell-page-body relative mx-auto flex w-full flex-1 flex-col touch-pan-y py-4',
            !showHeader && 'pochita-shell-page-body-top-safe',
            !footer && !bottomSlot && 'pochita-shell-page-body-bottom-safe',
            resolvedMaxWidth,
            isFill ? 'min-h-0 overflow-y-auto overflow-x-hidden' : 'overflow-x-clip',
            isScrollable && 'pochita-scroller',
            bodyClassName,
          )}
        >
          {children}
        </main>
      ) : (
        <div
          data-pochita="app-shell-body"
          className={cn(
            'relative flex min-h-0 flex-1 flex-col touch-pan-y',
            isDrawer ? 'px-3 py-3' : 'p-4',
            isScrollable ? 'overflow-x-hidden pochita-scroller' : 'overflow-x-clip',
            bodyClassName,
          )}
        >
          {children}
        </div>
      )}

      {footer ? (
        isPage ? (
          <footer
            className={cn(
              'pochita-shell-footer shrink-0 border-t border-[var(--border-hairline)]',
              !bottomSlot && 'pochita-shell-footer-bottom-safe',
            )}
          >
            <div
              className={cn(
                'mx-auto w-full px-4 py-3 text-xs text-[var(--text-secondary)] sm:px-6',
                resolvedMaxWidth,
              )}
            >
              {footer}
            </div>
          </footer>
        ) : (
          <footer
            className={cn(
              'shrink-0 border-t text-[var(--text-secondary)]',
              isDrawer
                ? 'pochita-drawer-footer border-[var(--glass-divider,var(--border-hairline))] px-3.5 py-2 text-[11px]'
                : 'border-[var(--border-hairline)] px-4 py-2.5 text-xs',
            )}
          >
            {footer}
          </footer>
        )
      ) : null}

      {bottomSlot ? (
        <div
          ref={bottomRef}
          data-pochita="app-shell-bottom"
          className={cn(
            'pochita-shell-bottom shrink-0',
            isPage && !isFill && 'sticky bottom-0 z-20',
          )}
        >
          {isPage ? (
            <div className={cn('mx-auto w-full', resolvedMaxWidth)}>{bottomSlot}</div>
          ) : (
            bottomSlot
          )}
        </div>
      ) : null}
    </section>
  );
}
