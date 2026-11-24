import * as TabsPrimitive from '@radix-ui/react-tabs';
import type { ComponentPropsWithoutRef } from 'react';
import { useCallback, useMemo, useRef, useState } from 'react';
import { cn } from '../lib/cn.ts';
import { DEFAULT_TAB_SWIPE_OPTIONS } from '../lib/tabSwipe.ts';
import {
  type TabIndicatorController,
  TabsInternalContext,
  useTabsInternalContext,
} from './tabsContext.ts';
import { useTabIndicator } from './useTabIndicator.ts';
import { useTabPager } from './useTabPager.ts';

/** Props for `<TabsList>`. */
export type TabsListProps = ComponentPropsWithoutRef<typeof TabsPrimitive.List>;
/** Props for `<TabsTrigger>`. */
export type TabsTriggerProps = ComponentPropsWithoutRef<typeof TabsPrimitive.Trigger>;
/** Props for `<TabsContent>`. */
export type TabsContentProps = ComponentPropsWithoutRef<typeof TabsPrimitive.Content>;

const ROOT_CLS = 'relative flex min-w-0 flex-1 flex-col overflow-x-clip touch-pan-y';
const LIST_CLS =
  'relative inline-flex w-full min-w-0 max-w-full items-center gap-1 overflow-x-auto touch-pan-x rounded-[var(--radius-control)] border border-[var(--border-hairline)] bg-[var(--surface-elevated)] p-1 [scrollbar-width:none]';
const INDICATOR_CLS =
  'pointer-events-none absolute top-1 bottom-1 left-0 z-0 rounded-[calc(var(--radius-control)-3px)] bg-[var(--surface-card)] shadow-sm opacity-0';
const TRIGGER_CLS =
  'relative z-[1] inline-flex min-w-0 flex-1 shrink-0 cursor-pointer items-center justify-center gap-1.5 whitespace-nowrap rounded-[calc(var(--radius-control)-3px)] px-3 py-1.5 text-xs font-medium text-[var(--text-secondary)] transition-colors duration-150 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[var(--accent)] hover:text-[var(--text-primary)] data-[state=active]:text-[var(--text-primary)]';
const CONTENT_CLS =
  'mt-3.5 min-w-0 flex-1 touch-pan-y focus-visible:outline-none [&[hidden]]:hidden';

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

  const pager = useTabPager({
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
        onTouchStart={(e) => {
          props.onTouchStart?.(e);
          pager.onTouchStart(e);
        }}
        onTouchEnd={(e) => {
          props.onTouchEnd?.(e);
          pager.onTouchEnd(e);
        }}
        onTouchCancel={(e) => {
          props.onTouchCancel?.(e);
          pager.onTouchCancel(e);
        }}
        onPointerDown={(e) => {
          props.onPointerDown?.(e);
          pager.onPointerDown(e);
        }}
        onPointerMove={(e) => {
          props.onPointerMove?.(e);
          pager.onPointerMove(e);
        }}
        onPointerUp={(e) => {
          props.onPointerUp?.(e);
          pager.onPointerUp(e);
        }}
        onPointerCancel={(e) => {
          props.onPointerCancel?.(e);
          pager.onPointerCancel(e);
        }}
      />
    </TabsInternalContext.Provider>
  );
}

/** Horizontally scrollable tab trigger bar with GPU-composited sliding active indicator pill. */
export function TabsList({ className, children, ...props }: TabsListProps) {
  const { listRef, indicatorRef } = useTabIndicator();

  return (
    <TabsPrimitive.List
      ref={listRef}
      data-pochita="tabs-list"
      className={cn(LIST_CLS, className)}
      {...props}
    >
      <span
        ref={indicatorRef}
        aria-hidden="true"
        data-pochita="tabs-indicator"
        className={INDICATOR_CLS}
      />
      {children}
    </TabsPrimitive.List>
  );
}

/** Individual tab trigger button inside `<TabsList>` with touch-safe focus hygiene. */
export function TabsTrigger({
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

  return (
    <TabsPrimitive.Trigger
      data-pochita="tabs-trigger"
      data-tab-value={props.value}
      className={cn(TRIGGER_CLS, className)}
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
    />
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
