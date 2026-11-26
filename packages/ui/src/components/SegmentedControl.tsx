import type { ReactNode } from 'react';
import { cn } from '../lib/cn.ts';

/**
 * Option descriptor for `<SegmentedControl>`.
 */
export interface SegmentedControlOption<T extends string = string> {
  value: T;
  label: string;
  icon?: ReactNode;
  disabled?: boolean;
}

/**
 * Props for `<SegmentedControl>`.
 */
export interface SegmentedControlProps<T extends string = string> {
  options: readonly SegmentedControlOption<T>[];
  value: T;
  onValueChange: (value: T) => void;
  size?: 'sm' | 'md';
  fullWidth?: boolean;
  ariaLabel?: string;
  ariaLabelledBy?: string;
  className?: string;
  'data-testid'?: string;
}

/**
 * Generic segmented pill selector suitable for proxy routing modes and Home Assistant mode toggles.
 */
export function SegmentedControl<T extends string = string>({
  options,
  value,
  onValueChange,
  size = 'md',
  fullWidth = false,
  ariaLabel,
  ariaLabelledBy,
  className,
  'data-testid': dataTestId,
}: SegmentedControlProps<T>) {
  return (
    <fieldset
      aria-label={ariaLabelledBy ? undefined : (ariaLabel ?? '模式切换')}
      aria-labelledby={ariaLabelledBy}
      data-pochita="segmented-control"
      data-size={size}
      data-value={value}
      data-testid={dataTestId}
      className={cn(
        'm-0 inline-flex min-w-0 max-w-full items-center gap-1 overflow-x-auto rounded-[var(--radius-pill)] border border-[var(--border-hairline)] bg-[var(--surface-elevated)] p-1 [scrollbar-width:none]',
        fullWidth && 'flex w-full',
        className,
      )}
    >
      {options.map((option) => {
        const active = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            aria-pressed={active}
            aria-label={option.label}
            disabled={option.disabled}
            data-state={active ? 'active' : 'inactive'}
            data-option-value={option.value}
            onClick={() => {
              if (!option.disabled && !active) {
                onValueChange(option.value);
              }
            }}
            className={cn(
              'inline-flex cursor-pointer select-none items-center justify-center gap-1.5 whitespace-nowrap rounded-[var(--radius-pill)] font-medium transition-[color,background-color,border-color,opacity,box-shadow] duration-150 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)] disabled:pointer-events-none disabled:opacity-45',
              size === 'sm' ? 'px-2.5 py-1 text-[11px]' : 'px-3.5 py-1.5 text-xs',
              fullWidth && 'min-w-0 flex-1',
              active
                ? 'bg-[var(--accent)] text-[var(--accent-fg)] shadow-sm'
                : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]',
            )}
          >
            {option.icon ? (
              <span className="shrink-0" aria-hidden="true">
                {option.icon}
              </span>
            ) : null}
            <span className="truncate">{option.label}</span>
          </button>
        );
      })}
    </fieldset>
  );
}
