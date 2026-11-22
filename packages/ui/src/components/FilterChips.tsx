import type { ReactNode } from 'react';
import { cn } from '../lib/cn.ts';

export interface FilterChipOption<T extends string = string> {
  value: T;
  label: string;
  count?: number;
  icon?: ReactNode;
  disabled?: boolean;
}

export interface FilterChipsSingleProps<T extends string = string> {
  options: readonly FilterChipOption<T>[];
  selected: T;
  onChange: (next: T) => void;
  multiple?: false;
  ariaLabel: string;
  className?: string;
  'data-testid'?: string;
}

export interface FilterChipsMultiProps<T extends string = string> {
  options: readonly FilterChipOption<T>[];
  selected: readonly T[];
  onChange: (next: T[]) => void;
  multiple?: true;
  ariaLabel: string;
  className?: string;
  'data-testid'?: string;
}

export type FilterChipsProps<T extends string = string> =
  | FilterChipsSingleProps<T>
  | FilterChipsMultiProps<T>;

/**
 * Horizontally scrollable single- or multi-select filter pills for rooms, domains, or proxy groups.
 */
export function FilterChips<T extends string = string>(props: FilterChipsProps<T>) {
  const { options, ariaLabel, className, 'data-testid': dataTestId } = props;
  const isMulti = props.multiple === true || Array.isArray(props.selected);
  const selectedSet = new Set<string>(
    Array.isArray(props.selected) ? props.selected : [props.selected],
  );

  const handleSelect = (optionValue: T) => {
    if (isMulti) {
      const current = Array.isArray(props.selected) ? props.selected : [props.selected as T];
      const next = selectedSet.has(optionValue)
        ? current.filter((item) => item !== optionValue)
        : [...current, optionValue];
      (props.onChange as (next: T[]) => void)(next);
    } else {
      (props.onChange as (next: T) => void)(optionValue);
    }
  };

  return (
    <fieldset
      aria-label={ariaLabel}
      data-pochita="filter-chips"
      data-selection-mode={isMulti ? 'multiple' : 'single'}
      data-testid={dataTestId}
      className={cn(
        'm-0 flex w-full min-w-0 items-center gap-1.5 overflow-x-auto border-0 p-0 pb-0.5 [scrollbar-width:none]',
        className,
      )}
    >
      {options.map((option) => {
        const active = selectedSet.has(option.value);
        return (
          <button
            key={option.value}
            type="button"
            disabled={option.disabled}
            aria-pressed={active}
            aria-label={option.label}
            data-state={active ? 'active' : 'inactive'}
            data-chip-value={option.value}
            onClick={() => {
              if (!option.disabled) {
                handleSelect(option.value);
              }
            }}
            className={cn(
              'inline-flex shrink-0 cursor-pointer select-none items-center gap-1.5 whitespace-nowrap rounded-[var(--radius-pill)] border px-3 py-1 text-xs font-medium transition-colors duration-150 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)] disabled:pointer-events-none disabled:opacity-45',
              active
                ? 'border-[var(--accent)] bg-[var(--accent)] text-[var(--accent-fg)]'
                : 'border-[var(--border-hairline)] bg-[var(--surface-elevated)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]',
            )}
          >
            {option.icon ? (
              <span className="shrink-0" aria-hidden="true">
                {option.icon}
              </span>
            ) : null}
            <span>{option.label}</span>
            {option.count !== undefined ? (
              <span
                className={cn(
                  'tabular-nums text-[10px] font-semibold',
                  active ? 'opacity-85' : 'text-[var(--text-secondary)]',
                )}
              >
                {option.count}
              </span>
            ) : null}
          </button>
        );
      })}
    </fieldset>
  );
}
