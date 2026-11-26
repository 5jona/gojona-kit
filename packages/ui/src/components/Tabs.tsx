import * as TabsPrimitive from '@radix-ui/react-tabs';
import type { ComponentPropsWithoutRef, ReactNode } from 'react';
import { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react';
import { cn } from '../lib/cn.ts';
import { DEFAULT_TAB_SWIPE_OPTIONS } from '../lib/tabSwipe.ts';
import {
  type TabIndicatorController,
  TabsInternalContext,
  useTabsInternalContext,
} from './tabsContext.ts';
import { useTabIndicator } from './useTabIndicator.ts';
import { useTabPager } from './useTabPager.ts';

/** Layout variant for `<TabsList>` and `<BottomNav>`. */
export type TabsListVariant = 'pill' | 'dock';

/** Props for `<TabsList>`. */
export interface TabsListProps extends ComponentPropsWithoutRef<typeof TabsPrimitive.List> {
  /** Visual style: compact inline `'pill'` (default) or bottom-docked `'dock'` module selector. */
  variant?: TabsListVariant;
}

/** Props for `<BottomNav>` (semantic alias of `<TabsList variant="dock">`). */
export type BottomNavProps = Omit<TabsListProps, 'variant'> & {
  variant?: TabsListVariant;
};

/** Props for `<TabsTrigger>`. */
export interface TabsTriggerProps extends ComponentPropsWithoutRef<typeof TabsPrimitive.Trigger> {
  /** Optional leading/top icon rendered inside the trigger with shrink-0 sizing. */
  icon?: ReactNode;
}

/** Props for `<TabsContent>`. */
export type TabsContentProps = ComponentPropsWithoutRef<typeof TabsPrimitive.Content>;

const TabsListVariantContext = createContext<TabsListVariant>('pill');

const ROOT_CLS = 'relative flex min-h-0 min-w-0 flex-1 flex-col overflow-x-clip touch-pan-y';
const LIST_CLS =
  'relative inline-flex w-full min-w-0 max-w-full shrink-0 items-center gap-1 overflow-x-auto touch-pan-x rounded-[var(--radius-control)] border border-[var(--border-hairline)] bg-[var(--surface-elevated)] p-1 [scrollbar-width:none]';
const DOCK_LIST_CLS =
  'pochita-tabs-dock relative flex w-full min-w-0 max-w-full shrink-0 items-stretch gap-1 overflow-x-auto touch-pan-x border border-[var(--border-hairline)] bg-[var(--surface-elevated)] p-1 [scrollbar-width:none]';
const INDICATOR_CLS =
  'pointer-events-none absolute top-1 bottom-1 left-0 z-0 w-[100px] origin-left rounded-[calc(var(--radius-control)-3px)] bg-[var(--surface-card)] shadow-sm opacity-0';
const DOCK_INDICATOR_CLS =
  'pointer-events-none absolute top-1 bottom-1 left-0 z-0 w-[100px] origin-left rounded-[calc(var(--radius-card)-4px)] bg-[var(--surface-card)] shadow-sm opacity-0';
const TRIGGER_CLS =
  'relative z-[1] inline-flex min-w-0 flex-1 shrink-0 cursor-pointer items-center justify-center gap-1.5 whitespace-nowrap rounded-[calc(var(--radius-control)-3px)] px-3 py-1.5 text-xs font-medium text-[var(--text-secondary)] transition-colors duration-150 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[var(--accent)] hover:text-[var(--text-primary)] data-[state=active]:text-[var(--text-primary)]';
const DOCK_TRIGGER_CLS =
  'pochita-tabs-dock-trigger relative z-[1] inline-flex min-h-[56px] min-w-0 flex-1 shrink-0 cursor-pointer flex-col items-center justify-center gap-1 whitespace-nowrap rounded-[calc(var(--radius-card)-4px)] px-2 py-1.5 text-[11px] font-medium leading-tight text-[var(--text-secondary)] transition-[color,opacity] duration-150 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[var(--accent)] hover:text-[var(--text-primary)] data-[state=active]:font-semibold data-[state=active]:text-[var(--accent)]';
const CONTENT_CLS =
  'mt-3.5 min-w-0 flex-1 touch-pan-y focus-visible:outline-none [&[hidden]]:hidden [[data-pochita="app-shell-body"]>&]:mt-0';

const POINTER_FOCUS_WINDOW_MS = 500;
const nowMs = (): number => (typeof performance !== 'undefined' ? performance.now() : Date.now());

/** Props for the `<Tabs>` root container with built-in horizontal swipe tab switching. */
export interface TabsProps extends ComponentPropsWithoutRef<typeof TabsPrimitive.Root> {
  /** Enables horizontal swipe tab switching across tab panels (default: `true`). */
  swipeable?: boolean;
  /** Optional explicit tab value order; defaults to enabled `[role="tab"]` triggers in DOM order. */
  tabOrder?: readonly string[];
  /** Left/right viewport edge guard width in pixels reserved for system gestures (default: `24`). */
  edgeGuardPx?: number;
  /** Unmounts inactive tab panels instead of keeping them mounted and hidden (default: `false`). */
  unmountInactive?: boolean;
}

/** Accessible tabbed navigation root container built on `@radix-ui/react-tabs` with 1:1 swipe pager. */
export function Tabs({
  swipeable = true,
  tabOrder,
  edgeGuardPx = DEFAULT_TAB_SWIPE_OPTIONS.edgeGuardPx,
  unmountInactive = false,
  value,
  defaultValue,
  onValueChange,
  className,
  ...props
}: TabsProps) {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const indicatorControllerRef = useRef<TabIndicatorController | null>(null);
  const pointerInteractionTimeRef = useRef(-Infinity);
  const [uncontrolledValue, setUncontrolledValue] = useState<string | undefined>(defaultValue);
  const currentValue = value !== undefined ? value : uncontrolledValue;

  const handleValueChange = useCallback(
    (nextValue: string) => {
      if (value === undefined) setUncontrolledValue(nextValue);
      onValueChange?.(nextValue);
    },
    [value, onValueChange],
  );

  const markPointerInteraction = useCallback(() => {
    pointerInteractionTimeRef.current = nowMs();
  }, []);

  const clearPointerInteraction = useCallback(() => {
    pointerInteractionTimeRef.current = -Infinity;
  }, []);

  const isPointerFocusActive = useCallback(() => {
    return nowMs() - pointerInteractionTimeRef.current < POINTER_FOCUS_WINDOW_MS;
  }, []);

  useTabPager({
    rootRef,
    indicatorControllerRef,
    currentValue,
    swipeable,
    orientation: props.orientation,
    tabOrder,
    edgeGuardPx,
    onCommitTab: handleValueChange,
  });

  const contextValue = useMemo(
    () => ({
      activeValue: currentValue,
      unmountInactive,
      indicatorControllerRef,
      markPointerInteraction,
      clearPointerInteraction,
      isPointerFocusActive,
    }),
    [
      currentValue,
      unmountInactive,
      markPointerInteraction,
      clearPointerInteraction,
      isPointerFocusActive,
    ],
  );

  return (
    <TabsInternalContext.Provider value={contextValue}>
      <TabsPrimitive.Root
        {...props}
        ref={rootRef}
        data-pochita="tabs"
        data-swipeable={swipeable ? 'true' : 'false'}
        className={cn(ROOT_CLS, className)}
        value={currentValue}
        defaultValue={defaultValue}
        onValueChange={handleValueChange}
      />
    </TabsInternalContext.Provider>
  );
}

/** Horizontally scrollable tab trigger bar with GPU-composited sliding active indicator pill. */
export function TabsList({ variant = 'pill', className, children, ...props }: TabsListProps) {
  const { listRef, indicatorRef } = useTabIndicator();
  const isDock = variant === 'dock';

  return (
    <TabsListVariantContext.Provider value={variant}>
      <TabsPrimitive.List
        ref={listRef}
        data-pochita="tabs-list"
        data-variant={variant}
        className={cn(isDock ? DOCK_LIST_CLS : LIST_CLS, className)}
        {...props}
      >
        <span
          ref={indicatorRef}
          aria-hidden="true"
          data-pochita="tabs-indicator"
          data-variant={variant}
          className={isDock ? DOCK_INDICATOR_CLS : INDICATOR_CLS}
        />
        {children}
      </TabsPrimitive.List>
    </TabsListVariantContext.Provider>
  );
}

/** Semantic bottom module dock backed by `<TabsList variant="dock">` with 1:1 swipe indicator sync. */
export function BottomNav({ variant = 'dock', ...props }: BottomNavProps) {
  return <TabsList variant={variant} {...props} />;
}

/** Individual tab trigger button inside `<TabsList>` with touch-safe focus hygiene. */
export function TabsTrigger({
  icon,
  children,
  className,
  onPointerDown,
  onTouchStart,
  onMouseDown,
  onKeyDown,
  onFocus,
  onClick,
  ...props
}: TabsTriggerProps) {
  const ctx = useTabsInternalContext();
  const listVariant = useContext(TabsListVariantContext);

  return (
    <TabsPrimitive.Trigger
      data-pochita="tabs-trigger"
      data-variant={listVariant}
      data-tab-value={props.value}
      className={cn(listVariant === 'dock' ? DOCK_TRIGGER_CLS : TRIGGER_CLS, className)}
      onPointerDown={(e) => {
        ctx?.markPointerInteraction();
        onPointerDown?.(e);
      }}
      onTouchStart={(e) => {
        ctx?.markPointerInteraction();
        onTouchStart?.(e);
      }}
      onMouseDown={(e) => {
        ctx?.markPointerInteraction();
        onMouseDown?.(e);
      }}
      onKeyDown={(e) => {
        ctx?.clearPointerInteraction();
        onKeyDown?.(e);
      }}
      onFocus={(e) => {
        onFocus?.(e);
        if (ctx?.isPointerFocusActive()) {
          e.currentTarget.blur();
        }
      }}
      onClick={(e) => {
        onClick?.(e);
        if (
          e.detail > 0 &&
          typeof document !== 'undefined' &&
          document.activeElement === e.currentTarget
        ) {
          e.currentTarget.blur();
        }
      }}
      {...props}
    >
      {icon ? (
        <span className="shrink-0" aria-hidden="true">
          {icon}
        </span>
      ) : null}
      {children}
    </TabsPrimitive.Trigger>
  );
}

/** Tab panel content container kept mounted by default (`forceMount`) and hidden when idle. */
export function TabsContent({ className, forceMount, hidden, ...props }: TabsContentProps) {
  const ctx = useTabsInternalContext();
  const keepMounted = ctx ? !ctx.unmountInactive : true;
  const resolvedForceMount = forceMount ?? (keepMounted ? true : undefined);
  const isInactive = ctx ? ctx.activeValue !== props.value : false;
  const resolvedHidden = hidden ?? (resolvedForceMount ? isInactive : undefined);

  return (
    <TabsPrimitive.Content
      data-pochita="tabs-content"
      data-tab-value={props.value}
      forceMount={resolvedForceMount}
      hidden={resolvedHidden}
      className={cn(CONTENT_CLS, className)}
      {...props}
    />
  );
}
