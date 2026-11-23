import * as SliderPrimitive from '@radix-ui/react-slider';
import { cn } from '../lib/cn.ts';

/**
 * Quick preset pill definition for `<Slider>`.
 */
export interface SliderPreset {
  label: string;
  value: number;
}

/**
 * Props for `<Slider>`.
 */
export interface SliderProps {
  label?: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  unit?: string;
  disabled?: boolean;
  presets?: readonly SliderPreset[];
  onValueChange: (value: number) => void;
  onValueCommit?: (value: number) => void;
  formatValue?: (value: number) => string;
  className?: string;
  'data-testid'?: string;
}

/**
 * Accessible range slider built on `@radix-ui/react-slider` with optional quick-preset pills
 * and commit callback support.
 */
export function Slider({
  label,
  value,
  min,
  max,
  step = 1,
  unit = '',
  disabled = false,
  presets,
  onValueChange,
  onValueCommit,
  formatValue,
  className,
  'data-testid': dataTestId,
}: SliderProps) {
  const displayValue = formatValue ? formatValue(value) : `${value}${unit}`;

  return (
    <div
      data-pochita="slider"
      data-swipe-ignore=""
      data-state={disabled ? 'disabled' : 'enabled'}
      data-testid={dataTestId}
      className={cn('flex flex-col gap-2.5', className)}
    >
      {label ? (
        <div className="flex items-center justify-between gap-2 text-xs">
          <span className="font-medium text-[var(--text-secondary)]">{label}</span>
          <span className="tabular-nums font-semibold text-[var(--accent)]">{displayValue}</span>
        </div>
      ) : null}

      <SliderPrimitive.Root
        min={min}
        max={max}
        step={step}
        value={[value]}
        disabled={disabled}
        onValueChange={(vals) => {
          const next = vals[0];
          if (typeof next === 'number') {
            onValueChange(next);
          }
        }}
        onValueCommit={
          onValueCommit
            ? (vals) => {
                const next = vals[0];
                if (typeof next === 'number') {
                  onValueCommit(next);
                }
              }
            : undefined
        }
        className="relative flex h-6 w-full touch-none select-none items-center data-[disabled]:opacity-45"
      >
        <SliderPrimitive.Track className="relative h-2 w-full grow overflow-hidden rounded-[var(--radius-pill)] border border-[var(--border-hairline)] bg-[var(--surface-elevated)]">
          <SliderPrimitive.Range className="absolute h-full rounded-[var(--radius-pill)] bg-[var(--accent)]" />
        </SliderPrimitive.Track>
        <SliderPrimitive.Thumb
          aria-label={label ?? '滑块'}
          className="block size-5 cursor-grab rounded-full border-2 border-[var(--accent)] bg-[var(--thumb-bg)] shadow-md transition-transform hover:scale-110 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)] active:cursor-grabbing"
        />
      </SliderPrimitive.Root>

      {presets && presets.length > 0 ? (
        <div className="flex flex-wrap gap-1.5">
          {presets.map((preset) => {
            const active = Math.abs(value - preset.value) < 1e-6;
            return (
              <button
                key={preset.label}
                type="button"
                disabled={disabled}
                aria-pressed={active}
                aria-label={preset.label}
                data-preset-value={String(preset.value)}
                onClick={() => {
                  onValueChange(preset.value);
                  onValueCommit?.(preset.value);
                }}
                className={cn(
                  'cursor-pointer rounded-[var(--radius-pill)] border px-2.5 py-1 text-[11px] font-medium tabular-nums transition-colors disabled:pointer-events-none disabled:opacity-45',
                  active
                    ? 'border-[var(--accent)] bg-[var(--accent)] text-[var(--accent-fg)]'
                    : 'border-[var(--border-hairline)] bg-[var(--surface-elevated)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]',
                )}
              >
                {preset.label}
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
