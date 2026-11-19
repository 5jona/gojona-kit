import { Check, Monitor, Moon, Sun } from 'lucide-react';
import { cn } from '../lib/cn.ts';
import { THEME_LIST } from '../theme/registry.ts';
import { useTheme } from '../theme/ThemeProvider.tsx';
import type { ColorMode } from '../theme/types.ts';

export interface ThemeSwitcherProps {
  compact?: boolean;
  className?: string;
}

/**
 * Interactive theme selector (`ColorOS Glass` / `Modern SaaS Dark`) paired with
 * a tri-state color-scheme selector (`System` showing resolved scheme, `Light`, `Dark`).
 */
export function ThemeSwitcher({ compact = false, className }: ThemeSwitcherProps) {
  const { themeId, colorMode, systemScheme, setThemeId, setColorMode } = useTheme();

  const colorOptions: Array<{ mode: ColorMode; label: string; icon: typeof Monitor }> = [
    {
      mode: 'system',
      label: compact ? '自动' : `跟随系统 (${systemScheme === 'dark' ? '深色' : '浅色'})`,
      icon: Monitor,
    },
    { mode: 'light', label: '浅色', icon: Sun },
    { mode: 'dark', label: '深色', icon: Moon },
  ];

  if (compact) {
    return (
      <div className={cn('space-y-2', className)}>
        <div className="grid grid-cols-2 gap-1.5" role="group" aria-label="界面主题">
          {THEME_LIST.map((item) => {
            const active = themeId === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => setThemeId(item.id)}
                aria-pressed={active}
                className={cn(
                  'pochita-switcher-pill flex cursor-pointer items-center justify-between gap-1 rounded-[var(--radius-control)] px-2 py-1.5 text-left text-[11px] font-medium transition-all duration-150 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]',
                  active
                    ? 'pochita-switcher-pill-active bg-[var(--accent-soft)] text-[var(--text-primary)] ring-1 ring-inset ring-[color-mix(in_srgb,var(--accent)_45%,transparent)]'
                    : 'bg-[var(--surface-elevated)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]',
                )}
              >
                <span className="truncate">{item.name}</span>
                {active ? (
                  <span className="inline-flex size-3.5 shrink-0 items-center justify-center rounded-full bg-[var(--accent)] text-[var(--accent-fg)]">
                    <Check className="size-2" />
                  </span>
                ) : null}
              </button>
            );
          })}
        </div>

        <div
          role="group"
          aria-label="明暗色彩模式"
          className="pochita-switcher-group inline-flex w-full items-center gap-1 rounded-[var(--radius-control)] bg-[var(--surface-elevated)] p-1"
        >
          {colorOptions.map((opt) => {
            const Icon = opt.icon;
            const active = colorMode === opt.mode;
            return (
              <button
                key={opt.mode}
                type="button"
                aria-pressed={active}
                onClick={() => setColorMode(opt.mode)}
                className={cn(
                  'inline-flex flex-1 cursor-pointer items-center justify-center gap-1 rounded-[calc(var(--radius-control)-3px)] px-2 py-1.5 text-xs font-medium whitespace-nowrap transition-all duration-150',
                  active
                    ? 'bg-[var(--surface-card)] text-[var(--text-primary)] shadow-xs'
                    : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]',
                )}
              >
                <Icon className="size-3.5 shrink-0" />
                <span>{opt.label}</span>
              </button>
            );
          })}
        </div>
      </div>
    );
  }

  return (
    <div className={cn('space-y-3', className)}>
      <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
        {THEME_LIST.map((item) => {
          const active = themeId === item.id;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => setThemeId(item.id)}
              aria-pressed={active}
              className={cn(
                'flex cursor-pointer items-start justify-between gap-3 rounded-[var(--radius-card)] border p-3 text-left transition-all duration-150 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]',
                active
                  ? 'border-[var(--accent)] bg-[var(--accent-soft)]'
                  : 'border-[var(--border-hairline)] bg-[var(--surface-card)] hover:bg-[var(--surface-elevated)]',
              )}
            >
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-semibold text-[var(--text-primary)]">
                    {item.name}
                  </span>
                  {active ? (
                    <span className="inline-flex size-4 items-center justify-center rounded-full bg-[var(--accent)] text-[var(--accent-fg)]">
                      <Check className="size-2.5" />
                    </span>
                  ) : null}
                </div>
                <p className="mt-1 text-xs leading-snug text-[var(--text-secondary)]">
                  {item.tagline}
                </p>
              </div>

              <div className="flex shrink-0 items-center gap-1 pt-0.5" aria-hidden="true">
                {item.previewSwatches.map((hex) => (
                  <span
                    key={hex}
                    className="size-3.5 rounded-full border border-white/25 shadow-xs"
                    style={{ backgroundColor: hex }}
                  />
                ))}
              </div>
            </button>
          );
        })}
      </div>

      <div
        role="group"
        aria-label="明暗色彩模式"
        className="inline-flex w-full items-center gap-1 rounded-[var(--radius-control)] border border-[var(--border-hairline)] bg-[var(--surface-elevated)] p-1"
      >
        {colorOptions.map((opt) => {
          const Icon = opt.icon;
          const active = colorMode === opt.mode;
          return (
            <button
              key={opt.mode}
              type="button"
              aria-pressed={active}
              onClick={() => setColorMode(opt.mode)}
              className={cn(
                'inline-flex flex-1 cursor-pointer items-center justify-center gap-1.5 rounded-[calc(var(--radius-control)-3px)] px-2.5 py-1.5 text-xs font-medium transition-all duration-150',
                active
                  ? 'bg-[var(--surface-card)] text-[var(--text-primary)] shadow-sm'
                  : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]',
              )}
            >
              <Icon className="size-3.5 shrink-0" />
              <span className="truncate">{opt.label}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
