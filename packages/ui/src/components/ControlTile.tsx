import type { ReactNode } from 'react';
import { cn } from '../lib/cn.ts';

/**
 * Semantic tone of an active `<ControlTile>`.
 */
export type ControlTileTone = 'accent' | 'success' | 'warning' | 'danger' | 'neutral';

/**
 * Props for `<ControlTile>`.
 */
export interface ControlTileProps {
  label: string;
  value?: string | number;
  subtitle?: string;
  icon?: ReactNode;
  active?: boolean;
  disabled?: boolean;
  loading?: boolean;
  tone?: ControlTileTone;
  onClick?: () => void;
  ariaLabel?: string;
  className?: string;
  'data-testid'?: string;
}

const ACTIVE_TONE_CLASSES: Record<ControlTileTone, string> = {
  accent:
    'border-[color-mix(in_oklab,var(--accent)_42%,transparent)] bg-[color-mix(in_oklab,var(--accent)_14%,var(--surface-card))]',
  success:
    'border-[color-mix(in_oklab,var(--success)_42%,transparent)] bg-[color-mix(in_oklab,var(--success)_14%,var(--surface-card))]',
  warning:
    'border-[color-mix(in_oklab,var(--warning)_42%,transparent)] bg-[color-mix(in_oklab,var(--warning)_14%,var(--surface-card))]',
  danger:
    'border-[color-mix(in_oklab,var(--danger)_42%,transparent)] bg-[color-mix(in_oklab,var(--danger)_14%,var(--surface-card))]',
  neutral: 'border-[var(--border-hairline)] bg-[var(--surface-elevated)]',
};

const ICON_TONE_CLASSES: Record<ControlTileTone, string> = {
  accent: 'bg-[color-mix(in_oklab,var(--accent)_18%,transparent)] text-[var(--accent)]',
  success: 'bg-[color-mix(in_oklab,var(--success)_18%,transparent)] text-[var(--success)]',
  warning: 'bg-[color-mix(in_oklab,var(--warning)_18%,transparent)] text-[var(--warning)]',
  danger: 'bg-[color-mix(in_oklab,var(--danger)_18%,transparent)] text-[var(--danger)]',
  neutral: 'bg-[var(--surface-elevated)] text-[var(--text-primary)]',
};

/**
 * Interactive glass control tile for quick toggles, smart-home device switches, and proxy actions.
 */
export function ControlTile({
  label,
  value,
  subtitle,
  icon,
  active = false,
  disabled = false,
  loading = false,
  tone = 'accent',
  onClick,
  ariaLabel,
  className,
  'data-testid': dataTestId,
}: ControlTileProps) {
  const isDisabled = disabled || loading;

  return (
    <button
      type="button"
      disabled={isDisabled}
      aria-pressed={active}
      aria-busy={loading || undefined}
      aria-label={ariaLabel ?? label}
      onClick={onClick}
      data-pochita="control-tile"
      data-state={active ? 'active' : 'inactive'}
      data-tone={tone}
      data-loading={loading ? 'true' : undefined}
      data-testid={dataTestId}
      className={cn(
        'pochita-card pochita-card-interactive flex min-w-0 flex-col items-start justify-between gap-2.5 p-3 text-left transition-all duration-150 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)] active:scale-[0.98] disabled:pointer-events-none disabled:opacity-50',
        active && ACTIVE_TONE_CLASSES[tone],
        className,
      )}
    >
      <div className="flex w-full min-w-0 items-center justify-between gap-2">
        {icon ? (
          <span
            aria-hidden="true"
            className={cn(
              'inline-flex size-8 shrink-0 items-center justify-center rounded-[var(--radius-control)] transition-colors',
              active
                ? ICON_TONE_CLASSES[tone]
                : 'bg-[var(--surface-elevated)] text-[var(--text-secondary)]',
            )}
          >
            {icon}
          </span>
        ) : (
          <span
            aria-hidden="true"
            className={cn(
              'inline-block size-2 rounded-full transition-colors',
              active ? 'bg-[var(--accent)]' : 'bg-[var(--border-hairline)]',
            )}
          />
        )}

        {loading ? (
          <span
            aria-hidden="true"
            className="size-3.5 shrink-0 animate-spin rounded-full border-2 border-[var(--border-hairline)] border-t-[var(--accent)]"
          />
        ) : value !== undefined ? (
          <span className="truncate text-xs font-semibold tabular-nums text-[var(--text-primary)]">
            {value}
          </span>
        ) : null}
      </div>

      <div className="flex w-full min-w-0 flex-col gap-0.5">
        <span className="truncate text-xs font-semibold text-[var(--text-primary)]">{label}</span>
        {subtitle ? (
          <span className="truncate text-[11px] text-[var(--text-secondary)]">{subtitle}</span>
        ) : null}
      </div>
    </button>
  );
}
