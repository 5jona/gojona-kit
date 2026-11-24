import type { RefObject } from 'react';
import { useEffect, useLayoutEffect, useRef } from 'react';
import { prefersReducedMotion, resolveSwipeSurface } from '../lib/tabSwipe.ts';
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

function findTouchById(list: globalThis.TouchList, id: number): globalThis.Touch | undefined {
  for (let i = 0; i < list.length; i += 1) {
    const item = list[i];
    if (item && item.identifier === id) return item;
  }
  return undefined;
}

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
 * React hook wiring `createTabPagerEngine`, container-level blank-space touch/pointer delegation,
 * native non-passive `touchmove` axis locking, and subtle tap-click slide-in transitions.
 */
export function useTabPager(opts: UseTabPagerOptions): void {
  const optsRef = useRef(opts);
  optsRef.current = opts;
  const surfaceRef = useRef<HTMLElement | null>(null);
  const prevValueRef = useRef<string | undefined>(opts.currentValue);
  const clickAnimRef = useRef<Animation | null>(null);
  const lastTouchTimeRef = useRef(0);

  const engineRef = useRef<ReturnType<typeof createTabPagerEngine> | null>(null);
  if (!engineRef.current) {
    engineRef.current = createTabPagerEngine({
      getRoot: () => optsRef.current.rootRef.current,
      getSurface: () => surfaceRef.current ?? optsRef.current.rootRef.current,
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

  // Attach native touch/pointer listeners on the enclosing shell body (or root when nested)
  // so horizontal swipes in empty vertical/horizontal margins work regardless of wrapper heights.
  useEffect(() => {
    const root = optsRef.current.rootRef.current;
    if (!root || !opts.swipeable || opts.orientation === 'vertical') {
      surfaceRef.current = null;
      return;
    }
    const surface = resolveSwipeSurface(root) ?? root;
    surfaceRef.current = surface;
    const supportsTouch = typeof window !== 'undefined' && 'ontouchstart' in window;

    const onTouchStart = (e: globalThis.TouchEvent) => {
      lastTouchTimeRef.current = nowMs();
      const engine = engineRef.current;
      if (!engine) return;
      const activeInput = engine.getActiveInput();
      if (activeInput?.source === 'touch') {
        if (findTouchById(e.touches, activeInput.id)) {
          if (!engine.isHorizontallyLocked()) engine.abort();
          return;
        }
        // Recover if the previously tracked touch disappeared without touchend/touchcancel.
        engine.abort();
      }
      if (e.touches.length !== 1) {
        engine.abort();
        return;
      }
      const t = e.touches[0];
      if (t && e.target) {
        engine.begin('touch', t.identifier, t.clientX, t.clientY, e.target);
      }
    };
    const onTouchMove = (e: globalThis.TouchEvent) => {
      const engine = engineRef.current;
      if (!engine) return;
      const activeInput = engine.getActiveInput();
      if (activeInput?.source !== 'touch') return;
      const t = findTouchById(e.touches, activeInput.id);
      if (!t) return;
      if (engine.move('touch', t.identifier, t.clientX, t.clientY) && e.cancelable) {
        e.preventDefault();
      }
    };
    const onTouchEnd = (e: globalThis.TouchEvent) => {
      lastTouchTimeRef.current = nowMs();
      const engine = engineRef.current;
      if (!engine) return;
      const activeInput = engine.getActiveInput();
      if (activeInput?.source !== 'touch') return;
      const t = findTouchById(e.changedTouches, activeInput.id);
      if (t) engine.end('touch', t.identifier, t.clientX, false, t.clientY);
    };
    const onTouchCancel = (e: globalThis.TouchEvent) => {
      lastTouchTimeRef.current = nowMs();
      const engine = engineRef.current;
      if (!engine) return;
      const activeInput = engine.getActiveInput();
      if (activeInput?.source !== 'touch') return;
      const t = findTouchById(e.changedTouches, activeInput.id);
      if (t) engine.end('touch', t.identifier, t.clientX, true, t.clientY);
    };
    const onPointerDown = (e: globalThis.PointerEvent) => {
      if (e.pointerType === 'touch' && supportsTouch) return;
      if (
        !isTouchOrPen(e.pointerType) ||
        !e.isPrimary ||
        nowMs() - lastTouchTimeRef.current < 400 ||
        !e.target
      ) {
        return;
      }
      engineRef.current?.begin('pointer', e.pointerId, e.clientX, e.clientY, e.target);
    };
    const onPointerMove = (e: globalThis.PointerEvent) => {
      if (e.pointerType === 'touch' && supportsTouch) return;
      if (isTouchOrPen(e.pointerType)) {
        engineRef.current?.move('pointer', e.pointerId, e.clientX, e.clientY);
      }
    };
    const onPointerUp = (e: globalThis.PointerEvent) => {
      if (e.pointerType === 'touch' && supportsTouch) return;
      if (isTouchOrPen(e.pointerType)) {
        engineRef.current?.end('pointer', e.pointerId, e.clientX, false, e.clientY);
      }
    };
    const onPointerCancel = (e: globalThis.PointerEvent) => {
      if (e.pointerType === 'touch' && supportsTouch) return;
      if (isTouchOrPen(e.pointerType)) {
        engineRef.current?.end('pointer', e.pointerId, e.clientX, true, e.clientY);
      }
    };

    const passive = { passive: true } as const;
    surface.addEventListener('touchstart', onTouchStart, passive);
    surface.addEventListener('touchmove', onTouchMove, { passive: false });
    surface.addEventListener('touchend', onTouchEnd, passive);
    surface.addEventListener('touchcancel', onTouchCancel, passive);
    surface.addEventListener('pointerdown', onPointerDown, passive);
    surface.addEventListener('pointermove', onPointerMove, passive);
    surface.addEventListener('pointerup', onPointerUp, passive);
    surface.addEventListener('pointercancel', onPointerCancel, passive);
    return () => {
      surfaceRef.current = null;
      surface.removeEventListener('touchstart', onTouchStart);
      surface.removeEventListener('touchmove', onTouchMove);
      surface.removeEventListener('touchend', onTouchEnd);
      surface.removeEventListener('touchcancel', onTouchCancel);
      surface.removeEventListener('pointerdown', onPointerDown);
      surface.removeEventListener('pointermove', onPointerMove);
      surface.removeEventListener('pointerup', onPointerUp);
      surface.removeEventListener('pointercancel', onPointerCancel);
    };
  }, [opts.swipeable, opts.orientation]);

  // Finalize swipe commit before paint, or run subtle directional slide-in on tap/keyboard switch.
  useIsomorphicLayoutEffect(() => {
    const prev = prevValueRef.current;
    const next = opts.currentValue;
    prevValueRef.current = next;
    if (prev === next) return;
    if (engineRef.current?.flushPendingCommit(next)) return;
    if (!prev || !next || prefersReducedMotion()) return;

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
}
