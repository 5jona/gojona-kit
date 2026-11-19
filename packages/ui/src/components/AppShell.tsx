import type { ReactNode } from 'react';
import { cn } from '../lib/cn.ts';

export interface AppShellProps {
  title: string;
  subtitle?: string;
  headerLeading?: ReactNode;
  headerTrailing?: ReactNode;
  footer?: ReactNode;
  children: ReactNode;
  className?: string;
  bodyClassName?: string;
  /** Disable scrolling wrapper if a custom scrollable view fills the body. */
  scrollable?: boolean;
}

/**
 * Dual-form adaptive container shell powered by CSS container queries (`@container`).
 * Automatically shifts from compact stacked padding at ~340px narrow drawer widths
 * to spacious two-column layouts at >= 480px widths.
 */
export function AppShell({
  title,
  subtitle,
  headerLeading,
  headerTrailing,
  footer,
  children,
  className,
  bodyClassName,
  scrollable = true,
}: AppShellProps) {
  return (
    <section
      className={cn(
        'pochita-shell pochita-shell-backdrop flex min-h-0 flex-col overflow-hidden transition-[border-radius,border-color,background-color] duration-200',
        className,
      )}
    >
      <header className="pochita-shell-header shrink-0 border-b border-[var(--border-hairline)] px-4 py-3.5">
        <div className="flex min-w-0 items-center gap-3">
          {headerLeading ? <div className="shrink-0">{headerLeading}</div> : null}
          <div className="min-w-0 flex-1">
            <h1 className="truncate text-base font-semibold tracking-tight text-[var(--text-primary)]">
              {title}
            </h1>
            {subtitle ? (
              <p className="mt-0.5 truncate text-xs text-[var(--text-secondary)]">{subtitle}</p>
            ) : null}
          </div>
        </div>
        {headerTrailing ? (
          <div className="flex shrink-0 flex-wrap items-center gap-2">{headerTrailing}</div>
        ) : null}
      </header>

      <div
        className={cn(
          'min-h-0 flex-1 p-4',
          scrollable && 'pochita-scroller',
          bodyClassName,
        )}
      >
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
