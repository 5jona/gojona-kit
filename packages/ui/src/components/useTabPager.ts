import type { PointerEvent, RefObject, TouchEvent } from 'react';
import { useEffect, useLayoutEffect, useRef } from 'react';
import { prefersReducedMotion } from '../lib/tabSwipe.ts';
import { createTabPagerEngine } from './tabPagerEngine.ts';
import {
  discoverTabsAndPanels,
  PAGER_SETTLE_EASING,
  type TabIndicatorController,
} from './tabsContext.ts';

const CLICK_SLIDE_MS = 180;
const CLICK_SLIDE_PX = 20;
const useIsomorphicLayoutEffect = typeof window !== 'undefined' ? useLayoutEffect : useEffect;

const nowMs = (): number => (typeof performance !== 'undefined' ? performance.now() : Date.now());
const isTouchOrPen = (type: string): boolean => type === 'touch' || type === 'pen';

export interface UseTabPagerOptions {
  rootRef: RefObject<HTMLDivElement | null>;
  indicatorControllerRef: RefObject<TabIndicatorController | null>;
  currentValue: string | undefined;
  swipeable: boolean;
  orientation: 'horizontal' | 'vertical' | undefined;
  tabOrder: readonly string[] | undefined;
  edgeGuardPx: number;
  onCommitTab: (nextTab: string) => void;
}

/**
 * React hook wiring `createTabPagerEngine`, native non-passive `touchmove` locking,
 * and subtle tap-click directional slide-in transitions (`±20px -> 0`, `180ms`).
 */
export function useTabPager(opts: UseTabPagerOptions) {
  const optsRef = useRef(opts);
  optsRef.current = opts;
  const prevValueRef = useRef<string | undefined>(opts.currentValue);
  const clickAnimRef = useRef<Animation | null>(null);
  const lastTouchTimeRef = useRef(0);

  const engineRef = useRef<ReturnType<typeof createTabPagerEngine> | null>(null);
  if (!engineRef.current) {
    engineRef.current = createTabPagerEngine({
      getRoot: () => optsRef.current.rootRef.current,
      getIndicator: () => optsRef.current.indicatorControllerRef.current,
      getCurrentValue: () => optsRef.current.currentValue,
      isSwipeable: () => optsRef.current.swipeable,
      getOrientation: () => optsRef.current.orientation,
      getTabOrder: () => optsRef.current.tabOrder,
      getEdgeGuardPx: () => optsRef.current.edgeGuardPx,
      onCommitTab: (nextTab) => optsRef.current.onCommitTab(nextTab),
      onBeforeBegin: () => {
        clickAnimRef.current?.cancel();
        clickAnimRef.current = null;
      },
    });
  }

  // Attach native non-passive touchmove listener to call preventDefault ONLY when horizontally locked.
  useEffect(() => {
    const root = optsRef.current.rootRef.current;
    if (!root || !opts.swipeable || opts.orientation === 'vertical') return;
    const handleNativeTouchMove = (e: globalThis.TouchEvent) => {
      const t = e.touches[0];
      if (!t || !engineRef.current) return;
      if (engineRef.current.move('touch', t.identifier, t.clientX, t.clientY) && e.cancelable) {
        e.preventDefault();
      }
    };
    root.addEventListener('touchmove', handleNativeTouchMove, { passive: false });
    return () => root.removeEventListener('touchmove', handleNativeTouchMove);
  }, [opts.swipeable, opts.orientation]);

  // Finalize swipe commit before paint, or run subtle directional slide-in on tap/keyboard switch.
  useIsomorphicLayoutEffect(() => {
    const prev = prevValueRef.current;
    const next = opts.currentValue;
    prevValueRef.current = next;
    if (engineRef.current?.flushPendingCommit()) return;
    if (!prev || !next || prev === next || prefersReducedMotion()) return;

    const discovered = discoverTabsAndPanels(optsRef.current.rootRef.current);
    const order = optsRef.current.tabOrder?.length ? optsRef.current.tabOrder : discovered.tabs;
    const prevIdx = order.indexOf(prev);
    const nextIdx = order.indexOf(next);
    const panel = discovered.panels.get(next);
    if (!panel || prevIdx === -1 || nextIdx === -1 || typeof panel.animate !== 'function') return;

    const dir = nextIdx > prevIdx ? 1 : -1;
    clickAnimRef.current?.cancel();
    clickAnimRef.current = panel.animate(
      [
        { transform: `translate3d(${dir * CLICK_SLIDE_PX}px, 0, 0)` },
        { transform: 'translate3d(0px, 0, 0)' },
      ],
      { duration: CLICK_SLIDE_MS, easing: PAGER_SETTLE_EASING },
    );
  }, [opts.currentValue]);

  useEffect(() => {
    return () => {
      engineRef.current?.destroy();
      clickAnimRef.current?.cancel();
    };
  }, []);

  return {
    onTouchStart(e: TouchEvent<HTMLDivElement>) {
      lastTouchTimeRef.current = nowMs();
      const t = e.touches.length === 1 ? e.touches[0] : undefined;
      if (t) engineRef.current?.begin('touch', t.identifier, t.clientX, t.clientY, e.target);
      else engineRef.current?.abort();
    },
    onTouchEnd(e: TouchEvent<HTMLDivElement>) {
      lastTouchTimeRef.current = nowMs();
      const t = e.changedTouches[0];
      if (t) engineRef.current?.end('touch', t.identifier, t.clientX, false);
    },
    onTouchCancel(e: TouchEvent<HTMLDivElement>) {
      const t = e.changedTouches[0];
      if (t) engineRef.current?.end('touch', t.identifier, t.clientX, true);
    },
    onPointerDown(e: PointerEvent<HTMLDivElement>) {
      if (!isTouchOrPen(e.pointerType) || nowMs() - lastTouchTimeRef.current < 400) return;
      engineRef.current?.begin('pointer', e.pointerId, e.clientX, e.clientY, e.target);
    },
    onPointerMove(e: PointerEvent<HTMLDivElement>) {
      if (isTouchOrPen(e.pointerType)) {
        engineRef.current?.move('pointer', e.pointerId, e.clientX, e.clientY);
      }
    },
    onPointerUp(e: PointerEvent<HTMLDivElement>) {
      if (isTouchOrPen(e.pointerType))
        engineRef.current?.end('pointer', e.pointerId, e.clientX, false);
    },
    onPointerCancel(e: PointerEvent<HTMLDivElement>) {
      if (isTouchOrPen(e.pointerType))
        engineRef.current?.end('pointer', e.pointerId, e.clientX, true);
    },
  };
}
