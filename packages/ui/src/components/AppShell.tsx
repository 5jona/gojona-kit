import type { HTMLAttributes, ReactNode } from 'react';
import { cn } from '../lib/cn.ts';

/**
 * Layout form factor of `<AppShell>`.
 */
export type AppShellVariant = 'floating' | 'page' | 'drawer';

/**
 * Header density mode for `<AppShell>`.
 */
export type AppShellHeaderMode = 'default' | 'compact' | 'hidden';

/**
 * Props for `<AppShell>`.
 */
export interface AppShellProps extends Omit<HTMLAttributes<HTMLElement>, 'title'> {
  title?: string;
  subtitle?: string;
  variant?: AppShellVariant;
  headerMode?: AppShellHeaderMode;
  maxWidthClassName?: string;
  headerLeading?: ReactNode;
  headerTrailing?: ReactNode;
  footer?: ReactNode;
  children: ReactNode;
  className?: string;
  bodyClassName?: string;
  /** Disable scrolling wrapper if a custom scrollable view fills the body. Defaults to false in `page` variant. */
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
  maxWidthClassName = 'max-w-5xl',
  headerLeading,
  headerTrailing,
  footer,
  children,
  className,
  bodyClassName,
  scrollable,
  ...props
}: AppShellProps) {
  const isScrollable = scrollable ?? variant !== 'page';
  const showHeader = headerMode !== 'hidden';
  const isCompactHeader = headerMode === 'compact';
  const isPage = variant === 'page';
  const isDrawer = variant === 'drawer';

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
      className={cn(SHELL_VARIANT_CLASSES[variant], className)}
      {...props}
    >
      {showHeader ? (
        isPage ? (
          <header className="sticky top-0 z-20 shrink-0 border-b border-[var(--border-hairline)] bg-[color-mix(in_oklab,var(--surface-canvas)_88%,transparent)] backdrop-blur-md">
            <div
              className={cn(
                'pochita-shell-header mx-auto w-full sm:px-6',
                isCompactHeader ? 'px-3.5 py-2' : 'px-4 py-3',
                maxWidthClassName,
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
          className={cn(
            'mx-auto w-full flex-1 px-4 py-4 sm:px-6',
            maxWidthClassName,
            isScrollable && 'pochita-scroller',
            bodyClassName,
          )}
        >
          {children}
        </main>
      ) : (
        <div
          className={cn(
            'min-h-0 flex-1',
            isDrawer ? 'px-3 py-3' : 'p-4',
            isScrollable && 'pochita-scroller',
            bodyClassName,
          )}
        >
          {children}
        </div>
      )}

      {footer ? (
        isPage ? (
          <footer className="shrink-0 border-t border-[var(--border-hairline)]">
            <div
              className={cn(
                'mx-auto w-full px-4 py-3 text-xs text-[var(--text-secondary)] sm:px-6',
                maxWidthClassName,
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
    </section>
  );
}
