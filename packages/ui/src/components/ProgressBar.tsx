import { cn } from '../lib/cn.ts';

export type ProgressBarTone = 'accent' | 'success' | 'warning' | 'danger' | 'neutral';

export interface ProgressBarProps {
  /** Completion percentage between 0 and 100. */
  value: number;
  tone?: ProgressBarTone;
  size?: 'sm' | 'md';
  label?: string;
  showValue?: boolean;
  ariaLabel?: string;
  className?: string;
  'data-testid'?: string;
}

const FILL_TONE_CLASSES: Record<ProgressBarTone, string> = {
  accent: 'bg-[var(--accent)]',
  success: 'bg-[var(--success)]',
  warning: 'bg-[var(--warning)]',
  danger: 'bg-[var(--danger)]',
  neutral: 'bg-[var(--text-secondary)]',
};

/**
 * Lightweight semantic progress bar for quotas, battery levels, and transfer progress.
 */
export function ProgressBar({
  value,
  tone = 'accent',
  size = 'md',
  label,
  showValue = false,
  ariaLabel,
  className,
  'data-testid': dataTestId,
}: ProgressBarProps) {
  const clamped = Number.isFinite(value) ? Math.min(100, Math.max(0, value)) : 0;
  const rounded = Math.round(clamped);

  return (
    <div
      data-pochita="progress-bar"
      data-tone={tone}
      data-size={size}
      data-value={String(clamped)}
      data-testid={dataTestId}
      className={cn('flex w-full flex-col gap-1.5', className)}
    >
      {label || showValue ? (
        <div className="flex items-center justify-between gap-2 text-xs">
          {label ? (
            <span className="truncate font-medium text-[var(--text-secondary)]">{label}</span>
          ) : (
            <span />
          )}
          {showValue ? (
            <span className="shrink-0 font-semibold tabular-nums text-[var(--text-primary)]">
              {rounded}%
            </span>
          ) : null}
        </div>
      ) : null}

      <div
        role="progressbar"
        aria-valuenow={rounded}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={ariaLabel ?? label ?? '进度'}
        className={cn(
          'w-full overflow-hidden rounded-[var(--radius-pill)] border border-[var(--border-hairline)] bg-[var(--surface-elevated)]',
          size === 'sm' ? 'h-1.5' : 'h-2.5',
        )}
      >
        <div
          className={cn(
            'h-full rounded-[var(--radius-pill)] transition-[width] duration-200 ease-out',
            FILL_TONE_CLASSES[tone],
          )}
          style={{ width: `${clamped}%` }}
        />
      </div>
    </div>
  );
}
