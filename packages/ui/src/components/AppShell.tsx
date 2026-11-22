import type { HTMLAttributes, ReactNode } from 'react';
import { cn } from '../lib/cn.ts';

export type AppShellVariant = 'floating' | 'page' | 'drawer';
export type AppShellHeaderMode = 'default' | 'compact' | 'hidden';

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

  if (variant === 'page') {
    return (
      <section
        data-pochita="app-shell"
        data-variant="page"
        data-shell-variant="page"
        data-header-mode={headerMode}
        className={cn(
          'pochita-shell pochita-shell-page flex min-h-dvh w-full flex-col transition-colors duration-200',
          className,
        )}
        {...props}
      >
        {showHeader ? (
          <header className="sticky top-0 z-20 shrink-0 border-b border-[var(--border-hairline)] bg-[color-mix(in_oklab,var(--surface-canvas)_88%,transparent)] backdrop-blur-md">
            <div
              className={cn(
                'pochita-shell-header mx-auto w-full sm:px-6',
                isCompactHeader ? 'px-3.5 py-2' : 'px-4 py-3',
                maxWidthClassName,
              )}
            >
              <div className="flex min-w-0 items-center gap-3">
                {headerLeading ? <div className="shrink-0">{headerLeading}</div> : null}
                <div className="min-w-0 flex-1">
                  <h1
                    className={cn(
                      'truncate font-semibold tracking-tight text-[var(--text-primary)]',
                      isCompactHeader ? 'text-sm' : 'text-base',
                    )}
                  >
                    {title}
                  </h1>
                  {subtitle && !isCompactHeader ? (
                    <p className="mt-0.5 truncate text-xs text-[var(--text-secondary)]">
                      {subtitle}
                    </p>
                  ) : null}
                </div>
              </div>
              {headerTrailing ? (
                <div className="flex shrink-0 flex-wrap items-center gap-2">{headerTrailing}</div>
              ) : null}
            </div>
          </header>
        ) : null}

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

        {footer ? (
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
        ) : null}
      </section>
    );
  }

  if (variant === 'drawer') {
    return (
      <section
        data-pochita="app-shell"
        data-variant="drawer"
        data-shell-variant="drawer"
        data-header-mode={headerMode}
        className={cn(
          'pochita-shell pochita-shell-drawer flex h-dvh min-h-0 w-full flex-col overflow-hidden transition-colors duration-200',
          className,
        )}
        {...props}
      >
        {showHeader ? (
          <header
            className={cn(
              'pochita-drawer-header flex shrink-0 items-center justify-between gap-2 border-b border-[var(--glass-divider,var(--border-hairline))]',
              isCompactHeader ? 'px-3 py-1.5' : 'px-3.5 py-2.5',
            )}
          >
            <div className="flex min-w-0 items-center gap-2.5">
              {headerLeading ? <div className="shrink-0">{headerLeading}</div> : null}
              <div className="min-w-0 flex-1">
                <h1
                  className={cn(
                    'truncate font-semibold tracking-tight text-[var(--text-primary)]',
                    isCompactHeader ? 'text-xs' : 'text-sm',
                  )}
                >
                  {title}
                </h1>
                {subtitle && !isCompactHeader ? (
                  <p className="mt-0.5 truncate text-[11px] text-[var(--text-secondary)]">
                    {subtitle}
                  </p>
                ) : null}
              </div>
            </div>
            {headerTrailing ? (
              <div className="flex shrink-0 items-center gap-1.5">{headerTrailing}</div>
            ) : null}
          </header>
        ) : null}

        <div
          className={cn(
            'min-h-0 flex-1 px-3 py-3',
            isScrollable && 'pochita-scroller',
            bodyClassName,
          )}
        >
          {children}
        </div>

        {footer ? (
          <footer className="pochita-drawer-footer shrink-0 border-t border-[var(--glass-divider,var(--border-hairline))] px-3.5 py-2 text-[11px] text-[var(--text-secondary)]">
            {footer}
          </footer>
        ) : null}
      </section>
    );
  }

  return (
    <section
      data-pochita="app-shell"
      data-variant="floating"
      data-shell-variant="floating"
      data-header-mode={headerMode}
      className={cn(
        'pochita-shell pochita-shell-backdrop flex min-h-0 flex-col overflow-hidden transition-[border-radius,border-color,background-color] duration-200',
        className,
      )}
      {...props}
    >
      {showHeader ? (
        <header
          className={cn(
            'pochita-shell-header shrink-0 border-b border-[var(--border-hairline)]',
            isCompactHeader ? 'px-3.5 py-2' : 'px-4 py-3.5',
          )}
        >
          <div className="flex min-w-0 items-center gap-3">
            {headerLeading ? <div className="shrink-0">{headerLeading}</div> : null}
            <div className="min-w-0 flex-1">
              <h1
                className={cn(
                  'truncate font-semibold tracking-tight text-[var(--text-primary)]',
                  isCompactHeader ? 'text-sm' : 'text-base',
                )}
              >
                {title}
              </h1>
              {subtitle && !isCompactHeader ? (
                <p className="mt-0.5 truncate text-xs text-[var(--text-secondary)]">{subtitle}</p>
              ) : null}
            </div>
          </div>
          {headerTrailing ? (
            <div className="flex shrink-0 flex-wrap items-center gap-2">{headerTrailing}</div>
          ) : null}
        </header>
      ) : null}

      <div className={cn('min-h-0 flex-1 p-4', isScrollable && 'pochita-scroller', bodyClassName)}>
        {children}
      </div>

      {footer ? (
        <footer className="shrink-0 border-t border-[var(--border-hairline)] px-4 py-2.5 text-xs text-[var(--text-secondary)]">
          {footer}
        </footer>
      ) : null}
    </section>
  );
}
