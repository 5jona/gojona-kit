import type { ReactNode } from 'react';
import { cn } from '../lib/cn.ts';

/**
 * Semantic alert tone for `<StatusBanner>`.
 */
export type StatusBannerTone = 'info' | 'success' | 'warning' | 'danger';

/**
 * Props for `<StatusBanner>`.
 */
export interface StatusBannerProps {
  tone: StatusBannerTone;
  title: string;
  description?: string;
  action?: ReactNode;
  className?: string;
  'data-testid'?: string;
}

const BANNER_TONE_CLASSES: Record<StatusBannerTone, string> = {
  info: 'border-[color-mix(in_oklab,var(--accent)_32%,transparent)] bg-[color-mix(in_oklab,var(--accent)_11%,var(--surface-card))]',
  success:
    'border-[color-mix(in_oklab,var(--success)_32%,transparent)] bg-[color-mix(in_oklab,var(--success)_11%,var(--surface-card))]',
  warning:
    'border-[color-mix(in_oklab,var(--warning)_32%,transparent)] bg-[color-mix(in_oklab,var(--warning)_11%,var(--surface-card))]',
  danger:
    'border-[color-mix(in_oklab,var(--danger)_32%,transparent)] bg-[color-mix(in_oklab,var(--danger)_11%,var(--surface-card))]',
};

const DOT_TONE_CLASSES: Record<StatusBannerTone, string> = {
  info: 'bg-[var(--accent)]',
  success: 'bg-[var(--success)]',
  warning: 'bg-[var(--warning)]',
  danger: 'bg-[var(--danger)]',
};

/**
 * Compact glass status/alert banner for connection state, permission prompts, and inline warnings.
 */
export function StatusBanner({
  tone,
  title,
  description,
  action,
  className,
  'data-testid': dataTestId,
}: StatusBannerProps) {
  const role = tone === 'danger' || tone === 'warning' ? 'alert' : 'status';

  return (
    <div
      role={role}
      data-pochita="status-banner"
      data-tone={tone}
      data-testid={dataTestId}
      className={cn(
        'flex items-center justify-between gap-3 rounded-[var(--radius-card)] border px-3.5 py-2.5 text-xs',
        BANNER_TONE_CLASSES[tone],
        className,
      )}
    >
      <div className="flex min-w-0 flex-1 items-start gap-2.5">
        <span
          aria-hidden="true"
          className={cn('mt-1 inline-block size-2 shrink-0 rounded-full', DOT_TONE_CLASSES[tone])}
        />
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span className="font-semibold text-[var(--text-primary)]">{title}</span>
          {description ? (
            <span className="text-[11px] leading-relaxed text-[var(--text-secondary)]">
              {description}
            </span>
          ) : null}
        </div>
      </div>

      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  );
}
