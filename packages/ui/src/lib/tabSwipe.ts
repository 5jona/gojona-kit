export {
  blurStrandedTabTrigger,
  hasScrollableHorizontalAncestor,
  prefersReducedMotion,
  shouldIgnoreSwipeStart,
} from './tabSwipeDom.ts';

/** Configuration thresholds for horizontal tab swipe recognition and edge protection. */
export interface TabSwipeOptions {
  /** Minimum horizontal distance in pixels required for a standard swipe (default: `48`). */
  minDistancePx?: number;
  /** Minimum horizontal distance in pixels required for a fast flick gesture (default: `24`). */
  flickDistancePx?: number;
  /** Minimum horizontal velocity in px/ms required for a fast flick gesture (default: `0.35`). */
  flickVelocityPxPerMs?: number;
  /** Movement threshold in pixels before locking gesture direction (default: `12`). */
  lockThresholdPx?: number;
  /** Required `|dx| / |dy|` dominance ratio to lock a horizontal swipe (default: `1.4`). */
  horizontalRatio?: number;
  /** Viewport edge guard width in pixels reserved for system back/drawer gestures (default: `24`). */
  edgeGuardPx?: number;
}

/** Axis lock state during an active touch or pointer gesture. */
export type SwipeLockState = 'pending' | 'horizontal' | 'vertical';

/** Single pointer or touch horizontal sample used for instantaneous release velocity. */
export interface VelocitySample {
  x: number;
  t: number;
}

/** Horizontal geometry of a tab trigger relative to its `<TabsList>` scroll content box. */
export interface TabIndicatorRect {
  x: number;
  width: number;
}

/** Commit threshold options for the 1:1 interactive tab pager. */
export interface PagerCommitOptions {
  /** Fraction of viewport width required to commit regardless of velocity (default: `0.28`). */
  distanceRatio?: number;
  /** Minimum horizontal displacement in pixels for a fast-flick commit (default: `20`). */
  flickDistancePx?: number;
  /** Minimum instantaneous release velocity in px/ms for a fast-flick commit (default: `0.45`). */
  flickVelocityPxPerMs?: number;
}

/** Default threshold parameters for horizontal tab swipe detection. */
export const DEFAULT_TAB_SWIPE_OPTIONS: Required<TabSwipeOptions> = {
  minDistancePx: 48,
  flickDistancePx: 24,
  flickVelocityPxPerMs: 0.35,
  lockThresholdPx: 12,
  horizontalRatio: 1.4,
  edgeGuardPx: 24,
};

/** Trailing sample window in milliseconds for instantaneous release velocity. */
export const VELOCITY_WINDOW_MS = 80;

/** Maximum boundary rubber-band stretch distance in pixels when no neighbor tab exists. */
export const DEFAULT_BOUNDARY_EDGE_PX = 48;

/** Checks whether `clientX` falls within the left or right viewport edge guard zone. */
export function isInEdgeGuardZone(
  clientX: number,
  viewportWidth: number,
  edgeGuardPx: number = DEFAULT_TAB_SWIPE_OPTIONS.edgeGuardPx,
): boolean {
  const guard = Math.max(0, edgeGuardPx);
  if (guard <= 0 || !Number.isFinite(clientX)) return false;
  if (clientX <= guard) return true;
  return Number.isFinite(viewportWidth) && viewportWidth > 0 && clientX >= viewportWidth - guard;
}

/** Classifies gesture displacement into `'pending'`, `'horizontal'`, or `'vertical'` lock states. */
export function classifySwipeLock(dx: number, dy: number, opts?: TabSwipeOptions): SwipeLockState {
  const lockThresholdPx = opts?.lockThresholdPx ?? DEFAULT_TAB_SWIPE_OPTIONS.lockThresholdPx;
  const horizontalRatio = opts?.horizontalRatio ?? DEFAULT_TAB_SWIPE_OPTIONS.horizontalRatio;
  const absX = Math.abs(dx);
  const absY = Math.abs(dy);
  if (absX < lockThresholdPx && absY < lockThresholdPx) return 'pending';
  if (absX >= lockThresholdPx && absX >= absY * horizontalRatio) return 'horizontal';
  return 'vertical';
}

/** Resolves the tab step direction (`-1` previous, `1` next, `0` none) from displacement and duration. */
export function resolveSwipeStep(
  dx: number,
  durationMs: number,
  opts?: TabSwipeOptions,
): -1 | 0 | 1 {
  if (!Number.isFinite(dx) || dx === 0) return 0;
  const minDistancePx = opts?.minDistancePx ?? DEFAULT_TAB_SWIPE_OPTIONS.minDistancePx;
  const flickDistancePx = opts?.flickDistancePx ?? DEFAULT_TAB_SWIPE_OPTIONS.flickDistancePx;
  const flickVelocity =
    opts?.flickVelocityPxPerMs ?? DEFAULT_TAB_SWIPE_OPTIONS.flickVelocityPxPerMs;
  const absX = Math.abs(dx);
  const velocity = Number.isFinite(durationMs) && durationMs > 0 ? absX / durationMs : 0;
  const meetsDistance = absX >= minDistancePx;
  const meetsFlick = absX >= flickDistancePx && velocity >= flickVelocity;
  if (!meetsDistance && !meetsFlick) return 0;
  return dx < 0 ? 1 : -1;
}

/** Resolves the adjacent tab value in `tabOrder` given the `current` tab and `step` (`-1` or `1`). */
export function resolveAdjacentTab(
  tabOrder: readonly string[],
  current: string,
  step: -1 | 1,
): string | null {
  const index = tabOrder.indexOf(current);
  if (index === -1) return null;
  return tabOrder[index + step] ?? null;
}

/** Computes legacy clamped visual drag offset in pixels with boundary resistance. */
export function computeDampedOffset(
  dx: number,
  canMoveInDirection: boolean,
  maxVisualOffsetPx = 72,
): number {
  const limit = Math.max(0, maxVisualOffsetPx);
  if (!Number.isFinite(dx) || dx === 0 || limit === 0) return 0;
  const factor = canMoveInDirection ? 0.5 : 0.18;
  const effectiveLimit = canMoveInDirection ? limit : limit * 0.35;
  return Math.max(-effectiveLimit, Math.min(effectiveLimit, dx * factor));
}

/**
 * Computes 1:1 finger-tracking offset clamped to `±viewportWidth` when a neighbor panel exists,
 * or smooth exponential rubber-band resistance at first/last tab boundaries.
 */
export function computeDragOffset(
  dx: number,
  canMoveInDirection: boolean,
  viewportWidth: number,
  maxEdgePx: number = DEFAULT_BOUNDARY_EDGE_PX,
): number {
  if (!Number.isFinite(dx) || dx === 0) return 0;
  if (canMoveInDirection) {
    const limit =
      Number.isFinite(viewportWidth) && viewportWidth > 0 ? viewportWidth : Math.abs(dx);
    return Math.max(-limit, Math.min(limit, dx));
  }
  const edge = Math.max(0, Number.isFinite(maxEdgePx) ? maxEdgePx : DEFAULT_BOUNDARY_EDGE_PX);
  if (edge === 0) return 0;
  const sign = dx < 0 ? -1 : 1;
  return sign * edge * (1 - Math.exp(-Math.abs(dx) / (edge * 2.5)));
}

/** Appends a `(x, t)` pointer sample and prunes entries older than `windowMs`. */
export function recordVelocitySample(
  samples: VelocitySample[],
  x: number,
  t: number,
  windowMs: number = VELOCITY_WINDOW_MS,
): void {
  if (!Number.isFinite(x) || !Number.isFinite(t)) return;
  const last = samples[samples.length - 1];
  if (last && t <= last.t) {
    last.x = x;
    last.t = t;
  } else {
    samples.push({ x, t });
  }
  const cutoff = t - Math.max(1, windowMs);
  let dropCount = 0;
  while (samples.length - dropCount > 2) {
    const next = samples[dropCount + 1];
    if (!next || next.t >= cutoff) break;
    dropCount += 1;
  }
  if (dropCount > 0) samples.splice(0, dropCount);
}

/**
 * Computes signed instantaneous release velocity in `px/ms` over the trailing sample window.
 * Returns `0` if fewer than 2 samples exist or the pointer paused longer than `windowMs`.
 */
export function computeReleaseVelocity(
  samples: readonly VelocitySample[],
  nowMs?: number,
  windowMs: number = VELOCITY_WINDOW_MS,
): number {
  if (samples.length < 2) return 0;
  const newest = samples[samples.length - 1];
  if (!newest) return 0;
  const win = Math.max(1, windowMs);
  if (nowMs !== undefined && Number.isFinite(nowMs) && nowMs - newest.t > win) return 0;
  const cutoff = newest.t - win;
  let oldest = samples[0] ?? newest;
  for (let i = 0; i < samples.length - 1; i += 1) {
    const candidate = samples[i];
    if (!candidate) continue;
    oldest = candidate;
    if (candidate.t >= cutoff) break;
  }
  const dt = newest.t - oldest.t;
  return dt > 0 ? (newest.x - oldest.x) / dt : 0;
}

/**
 * Resolves the pager commit step (`-1` prev, `1` next, `0` cancel) using viewport distance ratio
 * (`>= 0.28 * viewportWidth`) or directional instantaneous release velocity (`|dx| >= 20`, `|v| >= 0.45`).
 */
export function resolvePagerCommitStep(
  dx: number,
  vRelease: number,
  viewportWidth: number,
  opts?: PagerCommitOptions,
): -1 | 0 | 1 {
  if (!Number.isFinite(dx) || dx === 0) return 0;
  const distanceRatio = opts?.distanceRatio ?? 0.28;
  const flickDistancePx = opts?.flickDistancePx ?? 20;
  const flickVelocity = opts?.flickVelocityPxPerMs ?? 0.45;
  const absX = Math.abs(dx);
  const width = Number.isFinite(viewportWidth) && viewportWidth > 0 ? viewportWidth : 360;
  const validV = Number.isFinite(vRelease) ? vRelease : 0;
  const absV = Math.abs(validV);
  if (validV * dx < 0 && absV >= flickVelocity) return 0;
  const meetsDistance = absX >= width * distanceRatio;
  const meetsFlick = absX >= flickDistancePx && validV * dx > 0 && absV >= flickVelocity;
  if (!meetsDistance && !meetsFlick) return 0;
  return dx < 0 ? 1 : -1;
}

/** Computes velocity-scaled settle animation duration in milliseconds clamped to `[minMs, maxMs]`. */
export function computeSettleDurationMs(
  remainingPx: number,
  vReleasePxPerMs: number,
  minMs = 160,
  maxMs = 260,
): number {
  const dist = Math.max(0, Number.isFinite(remainingPx) ? remainingPx : 0);
  const absV = Math.abs(Number.isFinite(vReleasePxPerMs) ? vReleasePxPerMs : 0);
  const speed = Math.max(0.5, Math.min(3.5, absV));
  return Math.round(Math.max(minMs, Math.min(maxMs, dist / (speed * 1.15))));
}

/**
 * Interpolates the sliding active indicator pill `(x, width)` between `current` and `target`
 * using signed drag progress `clamp(-offset / viewportWidth, -1, 1)`.
 */
export function interpolateIndicatorRect(
  current: TabIndicatorRect,
  target: TabIndicatorRect | null,
  progress: number,
): TabIndicatorRect {
  const clamped = Math.max(-1, Math.min(1, Number.isFinite(progress) ? progress : 0));
  const t = Math.abs(clamped);
  if (t === 0) return { x: current.x, width: current.width };
  if (!target) {
    const sign = clamped < 0 ? -1 : 1;
    const nudge = sign * Math.min(8, current.width * 0.12) * t;
    return { x: current.x + nudge, width: current.width };
  }
  return {
    x: current.x + (target.x - current.x) * t,
    width: current.width + (target.width - current.width) * t,
  };
}
