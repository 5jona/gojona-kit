import * as TabsPrimitive from '@radix-ui/react-tabs';
import type { ComponentPropsWithoutRef, PointerEvent, TouchEvent } from 'react';
import { useCallback, useRef, useState } from 'react';
import { cn } from '../lib/cn.ts';
import {
  classifySwipeLock,
  computeDampedOffset,
  DEFAULT_TAB_SWIPE_OPTIONS,
  hasScrollableHorizontalAncestor,
  isInEdgeGuardZone,
  resolveAdjacentTab,
  resolveSwipeStep,
  type SwipeLockState,
  shouldIgnoreSwipeStart,
} from '../lib/tabSwipe.ts';

type ListProps = ComponentPropsWithoutRef<typeof TabsPrimitive.List>;
type TriggerProps = ComponentPropsWithoutRef<typeof TabsPrimitive.Trigger>;
type ContentProps = ComponentPropsWithoutRef<typeof TabsPrimitive.Content>;
type InputSource = 'touch' | 'pointer';

const LIST_CLS =
  'inline-flex w-full min-w-0 max-w-full items-center gap-1 overflow-x-auto rounded-[var(--radius-control)] border border-[var(--border-hairline)] bg-[var(--surface-elevated)] p-1 [scrollbar-width:none]';
const TRIGGER_CLS =
  'inline-flex min-w-0 flex-1 shrink-0 cursor-pointer items-center justify-center gap-1.5 whitespace-nowrap rounded-[calc(var(--radius-control)-3px)] px-3 py-1.5 text-xs font-medium text-[var(--text-secondary)] transition-all duration-150 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[var(--accent)] hover:text-[var(--text-primary)] data-[state=active]:bg-[var(--surface-card)] data-[state=active]:text-[var(--text-primary)] data-[state=active]:shadow-sm';

/** Props for the `<Tabs>` root container with built-in horizontal swipe tab switching. */
export interface TabsProps extends ComponentPropsWithoutRef<typeof TabsPrimitive.Root> {
  /** Enables horizontal swipe tab switching across tab panels (default: `true`). */
  swipeable?: boolean;
  /** Optional explicit tab value order; defaults to enabled `[role="tab"]` triggers in DOM order. */
  tabOrder?: readonly string[];
  /** Left/right viewport edge guard width in pixels reserved for system gestures (default: `24`). */
  edgeGuardPx?: number;
}

interface SwipeSession {
  source: InputSource;
  id: number;
  x0: number;
  y0: number;
  t0: number;
  target: EventTarget | null;
  lock: SwipeLockState;
  tabs: readonly string[];
  active: string;
}

const nowMs = (): number => (typeof performance !== 'undefined' ? performance.now() : Date.now());
const isTouchOrPen = (type: string): boolean => type === 'touch' || type === 'pen';
const attr = (el: HTMLElement, k: string): string | null => el.getAttribute(k);

function discoverTabsState(root: HTMLDivElement | null): { tabs: string[]; active: string } {
  if (!root) return { tabs: [], active: '' };
  const tabs: string[] = [];
  let active = '';
  for (const el of root.querySelectorAll<HTMLElement>('[role="tab"]')) {
    if (el.closest('[data-pochita="tabs"]') !== root) continue;
    const val = attr(el, 'data-tab-value') ?? attr(el, 'data-value') ?? attr(el, 'value');
    if (!val) continue;
    if (attr(el, 'data-state') === 'active' || attr(el, 'aria-selected') === 'true') active = val;
    const off = el.hasAttribute('disabled') || el.hasAttribute('data-disabled');
    if (!off && attr(el, 'aria-disabled') !== 'true' && !tabs.includes(val)) tabs.push(val);
  }
  return { tabs, active };
}

function setPanelTransform(root: HTMLDivElement | null, offsetPx: number | null): void {
  if (!root) return;
  for (const panel of root.querySelectorAll<HTMLElement>('[data-pochita="tabs-content"]')) {
    if (panel.closest('[data-pochita="tabs"]') !== root) continue;
    if (offsetPx !== null && panel.getAttribute('data-state') === 'active') {
      panel.style.transition = 'none';
      panel.style.transform = `translate3d(${offsetPx.toFixed(2)}px, 0, 0)`;
      panel.style.willChange = 'transform';
    } else if (panel.style.transform || panel.style.willChange) {
      panel.style.transition = 'transform 160ms cubic-bezier(0.22, 1, 0.36, 1)';
      panel.style.transform = '';
      panel.style.willChange = '';
    }
  }
}

/** Accessible tabbed navigation root container built on `@radix-ui/react-tabs` with swipe support. */
export function Tabs({
  swipeable = true,
  tabOrder,
  edgeGuardPx = DEFAULT_TAB_SWIPE_OPTIONS.edgeGuardPx,
  value,
  defaultValue,
  onValueChange,
  ...props
}: TabsProps) {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const sessionRef = useRef<SwipeSession | null>(null);
  const lastTouchTimeRef = useRef<number>(0);
  const [uncontrolledValue, setUncontrolledValue] = useState<string | undefined>(defaultValue);
  const currentValue = value !== undefined ? value : uncontrolledValue;

  const handleValueChange = useCallback(
    (nextValue: string) => {
      if (value === undefined) setUncontrolledValue(nextValue);
      onValueChange?.(nextValue);
    },
    [value, onValueChange],
  );

  const begin = (source: InputSource, id: number, x0: number, y0: number, target: EventTarget) => {
    if (!swipeable || props.orientation === 'vertical') return;
    const root = rootRef.current;
    const vw = typeof window !== 'undefined' ? window.innerWidth : 0;
    if (isInEdgeGuardZone(x0, vw, edgeGuardPx) || shouldIgnoreSwipeStart(target, root)) return;
    const discovered = discoverTabsState(root);
    const tabs = tabOrder && tabOrder.length > 0 ? tabOrder : discovered.tabs;
    if (tabs.length < 2) return;
    const active = currentValue || discovered.active || tabs[0] || '';
    sessionRef.current = { source, id, x0, y0, t0: nowMs(), target, lock: 'pending', tabs, active };
  };

  const move = (source: InputSource, id: number, x: number, y: number) => {
    const s = sessionRef.current;
    if (!s || s.source !== source || s.id !== id || s.lock === 'vertical') return;
    const dx = x - s.x0;
    const dy = y - s.y0;
    const root = rootRef.current;
    if (s.lock === 'pending') {
      const nextLock = classifySwipeLock(dx, dy, { edgeGuardPx });
      if (nextLock === 'pending') return;
      if (nextLock === 'vertical' || hasScrollableHorizontalAncestor(s.target, root, dx)) {
        s.lock = 'vertical';
        setPanelTransform(root, null);
        return;
      }
      s.lock = 'horizontal';
    }
    const canMove = resolveAdjacentTab(s.tabs, s.active, dx < 0 ? 1 : -1) !== null;
    setPanelTransform(root, computeDampedOffset(dx, canMove));
  };

  const end = (source: InputSource, id: number, x: number, cancel: boolean) => {
    const s = sessionRef.current;
    if (!s || s.source !== source || s.id !== id) return;
    sessionRef.current = null;
    setPanelTransform(rootRef.current, null);
    if (cancel || s.lock !== 'horizontal') return;
    const step = resolveSwipeStep(x - s.x0, Math.max(1, nowMs() - s.t0), { edgeGuardPx });
    if (step === 0) return;
    const nextTab = resolveAdjacentTab(s.tabs, s.active, step);
    if (nextTab && nextTab !== s.active) handleValueChange(nextTab);
  };

  const onTouchFinish = (e: TouchEvent<HTMLDivElement>, cancel: boolean) => {
    if (cancel) props.onTouchCancel?.(e);
    else {
      props.onTouchEnd?.(e);
      lastTouchTimeRef.current = nowMs();
    }
    const t = e.changedTouches[0];
    if (t) end('touch', t.identifier, t.clientX, cancel);
  };

  const onPtrFinish = (e: PointerEvent<HTMLDivElement>, cancel: boolean) => {
    if (cancel) props.onPointerCancel?.(e);
    else props.onPointerUp?.(e);
    if (isTouchOrPen(e.pointerType)) end('pointer', e.pointerId, e.clientX, cancel);
  };

  return (
    <TabsPrimitive.Root
      {...props}
      ref={rootRef}
      data-pochita="tabs"
      data-swipeable={swipeable ? 'true' : 'false'}
      value={currentValue}
      defaultValue={defaultValue}
      onValueChange={handleValueChange}
      onTouchStart={(e) => {
        props.onTouchStart?.(e);
        lastTouchTimeRef.current = nowMs();
        const t = e.touches.length === 1 ? e.touches[0] : undefined;
        if (t) begin('touch', t.identifier, t.clientX, t.clientY, e.target);
        else {
          sessionRef.current = null;
          setPanelTransform(rootRef.current, null);
        }
      }}
      onTouchMove={(e) => {
        props.onTouchMove?.(e);
        const t = e.touches[0];
        if (t) move('touch', t.identifier, t.clientX, t.clientY);
      }}
      onTouchEnd={(e) => onTouchFinish(e, false)}
      onTouchCancel={(e) => onTouchFinish(e, true)}
      onPointerDown={(e) => {
        props.onPointerDown?.(e);
        if (!isTouchOrPen(e.pointerType) || nowMs() - lastTouchTimeRef.current < 100) return;
        begin('pointer', e.pointerId, e.clientX, e.clientY, e.target);
      }}
      onPointerMove={(e) => {
        props.onPointerMove?.(e);
        if (isTouchOrPen(e.pointerType)) move('pointer', e.pointerId, e.clientX, e.clientY);
      }}
      onPointerUp={(e) => onPtrFinish(e, false)}
      onPointerCancel={(e) => onPtrFinish(e, true)}
    />
  );
}

/** Horizontally scrollable tab trigger bar with narrow-screen (`<=320px`) overflow protection. */
export function TabsList({ className, ...props }: ListProps) {
  return (
    <TabsPrimitive.List data-pochita="tabs-list" className={cn(LIST_CLS, className)} {...props} />
  );
}

/** Individual tab trigger button inside `<TabsList>`. */
export function TabsTrigger({ className, ...props }: TriggerProps) {
  return (
    <TabsPrimitive.Trigger
      data-pochita="tabs-trigger"
      data-tab-value={props.value}
      className={cn(TRIGGER_CLS, className)}
      {...props}
    />
  );
}

/** Tab panel content container associated with a matching `<TabsTrigger>` value. */
export function TabsContent({ className, ...props }: ContentProps) {
  return (
    <TabsPrimitive.Content
      data-pochita="tabs-content"
      data-tab-value={props.value}
      className={cn('mt-3.5 touch-pan-y focus-visible:outline-none', className)}
      {...props}
    />
  );
}
