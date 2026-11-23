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

/** Default threshold parameters for horizontal tab swipe detection. */
export const DEFAULT_TAB_SWIPE_OPTIONS: Required<TabSwipeOptions> = {
  minDistancePx: 48,
  flickDistancePx: 24,
  flickVelocityPxPerMs: 0.35,
  lockThresholdPx: 12,
  horizontalRatio: 1.4,
  edgeGuardPx: 24,
};

const IGNORED_TAGS = new Set(['input', 'textarea', 'select']);
const IGNORED_ROLES = new Set(['slider', 'switch', 'tablist']);
const IGNORE_SELECTOR =
  '[data-swipe-ignore], input, textarea, select, [role="slider"], [role="switch"], [role="tablist"], [contenteditable="true"]';

interface InspectableNode {
  tagName?: string;
  nodeName?: string;
  role?: string;
  contentEditable?: string;
  isContentEditable?: boolean;
  dataset?: Record<string, string | undefined>;
  style?: { overflowX?: string };
  scrollWidth?: number;
  clientWidth?: number;
  scrollLeft?: number;
  parentElement?: InspectableNode | null;
  parentNode?: InspectableNode | null;
  getAttribute?: (name: string) => string | null;
  hasAttribute?: (name: string) => boolean;
  closest?: (selector: string) => unknown;
}

function readAttr(node: InspectableNode, name: string): string | null {
  return typeof node.getAttribute === 'function' ? node.getAttribute(name) : null;
}

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

/** Computes damped visual drag offset in pixels with soft rubber-band resistance at boundary tabs. */
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

function isIgnoredSwipeNode(node: InspectableNode): boolean {
  const rawTag = node.tagName ?? node.nodeName ?? '';
  if (typeof rawTag === 'string' && IGNORED_TAGS.has(rawTag.toLowerCase())) return true;
  const attr = readAttr(node, 'data-swipe-ignore');
  const hasIgnore =
    (typeof node.hasAttribute === 'function' && node.hasAttribute('data-swipe-ignore')) ||
    attr !== null ||
    node.dataset?.swipeIgnore !== undefined;
  if (hasIgnore && attr !== 'false' && node.dataset?.swipeIgnore !== 'false') return true;
  const role = (readAttr(node, 'role') ?? node.role ?? '').toLowerCase();
  if (IGNORED_ROLES.has(role)) return true;
  const editable = (readAttr(node, 'contenteditable') ?? node.contentEditable ?? '').toLowerCase();
  return editable === 'true' || node.isContentEditable === true;
}

/** Returns `true` when a gesture originates inside an interactive control or `[data-swipe-ignore]` subtree. */
export function shouldIgnoreSwipeStart(
  target: EventTarget | null,
  root: HTMLElement | null,
): boolean {
  let current = target as InspectableNode | null;
  const rootNode = root as unknown as InspectableNode | null;
  while (current && typeof current === 'object') {
    if (isIgnoredSwipeNode(current)) return true;
    if (current === rootNode) break;
    const next = current.parentElement ?? current.parentNode ?? null;
    if (!next && typeof current.closest === 'function') {
      return Boolean(current.closest(IGNORE_SELECTOR));
    }
    current = next;
  }
  return false;
}

/** Returns `true` when an ancestor between `target` and `root` can scroll horizontally in `dx`. */
export function hasScrollableHorizontalAncestor(
  target: EventTarget | null,
  root: HTMLElement | null,
  dx: number,
): boolean {
  if (!Number.isFinite(dx) || dx === 0) return false;
  let current = target as InspectableNode | null;
  const rootNode = root as unknown as InspectableNode | null;
  while (current && typeof current === 'object' && current !== rootNode) {
    const scrollWidth = current.scrollWidth ?? 0;
    const clientWidth = current.clientWidth ?? 0;
    if (scrollWidth > clientWidth + 2) {
      let overflowX = current.style?.overflowX ?? '';
      if (
        !overflowX &&
        typeof window !== 'undefined' &&
        typeof window.getComputedStyle === 'function'
      ) {
        try {
          overflowX = window.getComputedStyle(current as unknown as Element).overflowX;
        } catch {
          overflowX = '';
        }
      }
      if (overflowX !== 'hidden' && overflowX !== 'clip') {
        const scrollLeft = current.scrollLeft ?? 0;
        if (dx < 0 && scrollLeft < scrollWidth - clientWidth - 1) return true;
        if (dx > 0 && scrollLeft > 0) return true;
      }
    }
    current = current.parentElement ?? current.parentNode ?? null;
  }
  return false;
}
