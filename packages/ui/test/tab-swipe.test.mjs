import assert from 'node:assert/strict';
import test from 'node:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { Slider } from '../dist/components/Slider.js';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../dist/components/Tabs.js';
import {
  blurStrandedTabTrigger,
  classifySwipeLock,
  computeDampedOffset,
  computeDragOffset,
  computeReleaseVelocity,
  computeSettleDurationMs,
  DEFAULT_BOUNDARY_EDGE_PX,
  DEFAULT_TAB_SWIPE_OPTIONS,
  hasScrollableHorizontalAncestor,
  interpolateIndicatorRect,
  isInEdgeGuardZone,
  isSwipeTargetOwnedByTabs,
  recordVelocitySample,
  resolveAdjacentTab,
  resolvePagerCommitStep,
  resolveSwipeStep,
  resolveSwipeSurface,
  shouldIgnoreSwipeStart,
} from '../src/lib/tabSwipe.ts';

test('isInEdgeGuardZone protects left and right viewport edge regions', () => {
  assert.equal(DEFAULT_TAB_SWIPE_OPTIONS.edgeGuardPx, 24);
  assert.equal(isInEdgeGuardZone(0, 360), true);
  assert.equal(isInEdgeGuardZone(16, 360), true);
  assert.equal(isInEdgeGuardZone(24, 360), true);
  assert.equal(isInEdgeGuardZone(25, 360), false);
  assert.equal(isInEdgeGuardZone(180, 360), false);
  assert.equal(isInEdgeGuardZone(335, 360), false);
  assert.equal(isInEdgeGuardZone(336, 360), true);
  assert.equal(isInEdgeGuardZone(355, 360), true);

  // Custom guard width and disabled guard
  assert.equal(isInEdgeGuardZone(30, 400, 32), true);
  assert.equal(isInEdgeGuardZone(33, 400, 32), false);
  assert.equal(isInEdgeGuardZone(0, 360, 0), false);
  assert.equal(isInEdgeGuardZone(4, 360, -10), false);
});

test('classifySwipeLock distinguishes pending, horizontal, and vertical gestures', () => {
  assert.equal(classifySwipeLock(0, 0), 'pending');
  assert.equal(classifySwipeLock(8, 5), 'pending');
  assert.equal(classifySwipeLock(-11, -11), 'pending');

  // Predominantly horizontal movement beyond lockThresholdPx (12px) and horizontalRatio (1.4)
  assert.equal(classifySwipeLock(-20, 4), 'horizontal');
  assert.equal(classifySwipeLock(24, -10), 'horizontal');

  // Predominantly vertical or steep diagonal movement locks vertical to preserve native scroll
  assert.equal(classifySwipeLock(4, 18), 'vertical');
  assert.equal(classifySwipeLock(-6, -22), 'vertical');
  assert.equal(classifySwipeLock(15, 14), 'vertical');

  // Custom thresholds
  assert.equal(classifySwipeLock(16, 2, { lockThresholdPx: 20 }), 'pending');
  assert.equal(
    classifySwipeLock(22, 10, { lockThresholdPx: 20, horizontalRatio: 2.0 }),
    'horizontal',
  );
});

test('resolveSwipeStep evaluates both distance and fast-flick velocity thresholds', () => {
  // Distance threshold (>= 48px) even at slow speed
  assert.equal(resolveSwipeStep(-56, 400), 1);
  assert.equal(resolveSwipeStep(52, 450), -1);

  // Fast flick threshold (>= 24px and >= 0.35 px/ms)
  assert.equal(resolveSwipeStep(-30, 60), 1);
  assert.equal(resolveSwipeStep(28, 50), -1);

  // Short and slow movement yields 0
  assert.equal(resolveSwipeStep(-30, 200), 0);
  assert.equal(resolveSwipeStep(30, 220), 0);

  // Fast movement below flickDistancePx (24px) yields 0
  assert.equal(resolveSwipeStep(-18, 20), 0);
  assert.equal(resolveSwipeStep(0, 50), 0);
});

test('resolveAdjacentTab navigates within bounds and returns null at edges or unknown tab', () => {
  const order = ['overview', 'rules', 'logs'];
  assert.equal(resolveAdjacentTab(order, 'overview', -1), null);
  assert.equal(resolveAdjacentTab(order, 'overview', 1), 'rules');
  assert.equal(resolveAdjacentTab(order, 'rules', -1), 'overview');
  assert.equal(resolveAdjacentTab(order, 'rules', 1), 'logs');
  assert.equal(resolveAdjacentTab(order, 'logs', 1), null);
  assert.equal(resolveAdjacentTab(order, 'unknown', 1), null);
});

test('computeDampedOffset applies smooth clamping and boundary rubber-band resistance', () => {
  assert.equal(computeDampedOffset(0, true), 0);
  assert.equal(computeDampedOffset(0, false), 0);

  const normalLeft = computeDampedOffset(-60, true, 72);
  const boundaryLeft = computeDampedOffset(-60, false, 72);
  assert.ok(normalLeft < 0);
  assert.ok(boundaryLeft < 0);
  assert.ok(Math.abs(boundaryLeft) < Math.abs(normalLeft));

  const clampedRight = computeDampedOffset(300, true, 72);
  const clampedBoundaryRight = computeDampedOffset(300, false, 72);
  assert.equal(clampedRight, 72);
  assert.ok(clampedBoundaryRight <= 72 * 0.35 + 1e-6);
});

test('shouldIgnoreSwipeStart ignores interactive controls, sliders, switches, tablists, and data-swipe-ignore', () => {
  const root = { tagName: 'DIV' };
  const plainCard = { tagName: 'DIV', parentElement: root };
  const plainText = { tagName: 'P', parentElement: plainCard };
  assert.equal(shouldIgnoreSwipeStart(plainText, root), false);

  for (const tagName of ['INPUT', 'TEXTAREA', 'SELECT']) {
    assert.equal(shouldIgnoreSwipeStart({ tagName, parentElement: plainCard }, root), true);
  }

  for (const role of ['slider', 'switch', 'tablist']) {
    const roleNode = {
      tagName: 'DIV',
      parentElement: plainCard,
      getAttribute: (name) => (name === 'role' ? role : null),
    };
    const child = { tagName: 'SPAN', parentElement: roleNode };
    assert.equal(shouldIgnoreSwipeStart(child, root), true);
  }

  const ignoredContainer = {
    tagName: 'DIV',
    parentElement: plainCard,
    hasAttribute: (name) => name === 'data-swipe-ignore',
    getAttribute: (name) => (name === 'data-swipe-ignore' ? '' : null),
  };
  assert.equal(
    shouldIgnoreSwipeStart({ tagName: 'CANVAS', parentElement: ignoredContainer }, root),
    true,
  );

  const editableNode = {
    tagName: 'DIV',
    parentElement: plainCard,
    getAttribute: (name) => (name === 'contenteditable' ? 'true' : null),
  };
  assert.equal(shouldIgnoreSwipeStart(editableNode, root), true);
});

test('hasScrollableHorizontalAncestor yields when a nested container can scroll in swipe direction', () => {
  const root = { tagName: 'DIV' };
  const scrollerAtStart = {
    tagName: 'PRE',
    scrollWidth: 480,
    clientWidth: 200,
    scrollLeft: 0,
    parentElement: root,
  };
  const codeChild = { tagName: 'CODE', parentElement: scrollerAtStart };

  // Swiping left (dx < 0) scrolls content right (increasing scrollLeft): allowed at scrollLeft=0
  assert.equal(hasScrollableHorizontalAncestor(codeChild, root, -40), true);
  // Swiping right (dx > 0) at scrollLeft=0 cannot scroll further left: yields to tab switch
  assert.equal(hasScrollableHorizontalAncestor(codeChild, root, 40), false);

  // At middle scroll position, both directions scroll the nested container
  scrollerAtStart.scrollLeft = 120;
  assert.equal(hasScrollableHorizontalAncestor(codeChild, root, -40), true);
  assert.equal(hasScrollableHorizontalAncestor(codeChild, root, 40), true);

  // At right boundary (scrollLeft = 280), swiping left yields to tab switch
  scrollerAtStart.scrollLeft = 280;
  assert.equal(hasScrollableHorizontalAncestor(codeChild, root, -40), false);
  assert.equal(hasScrollableHorizontalAncestor(codeChild, root, 40), true);

  // Non-overflowing container never blocks tab swipe
  const nonOverflow = {
    tagName: 'DIV',
    scrollWidth: 200,
    clientWidth: 200,
    scrollLeft: 0,
    parentElement: root,
  };
  assert.equal(hasScrollableHorizontalAncestor(nonOverflow, root, -40), false);
});

test('Tabs renders swipeable markup by default and supports swipeable={false}', () => {
  const defaultHtml = renderToStaticMarkup(
    createElement(
      Tabs,
      { defaultValue: 'overview' },
      createElement(
        TabsList,
        null,
        createElement(TabsTrigger, { value: 'overview' }, '总览'),
        createElement(TabsTrigger, { value: 'logs' }, '日志'),
      ),
      createElement(TabsContent, { value: 'overview' }, '总览面板'),
      createElement(TabsContent, { value: 'logs' }, '日志面板'),
    ),
  );
  assert.ok(defaultHtml.includes('data-pochita="tabs"'));
  assert.ok(defaultHtml.includes('data-swipeable="true"'));
  assert.ok(defaultHtml.includes('data-tab-value="overview"'));
  assert.ok(defaultHtml.includes('touch-pan-y'));

  const disabledSwipeHtml = renderToStaticMarkup(
    createElement(
      Tabs,
      { value: 'logs', swipeable: false, edgeGuardPx: 32, tabOrder: ['overview', 'logs'] },
      createElement(
        TabsList,
        null,
        createElement(TabsTrigger, { value: 'overview' }, '总览'),
        createElement(TabsTrigger, { value: 'logs' }, '日志'),
      ),
      createElement(TabsContent, { value: 'logs' }, '日志面板'),
    ),
  );
  assert.ok(disabledSwipeHtml.includes('data-swipeable="false"'));
  assert.ok(disabledSwipeHtml.includes('日志面板'));
});

test('computeDragOffset provides true 1:1 tracking with neighbor and exponential rubber-band at boundaries', () => {
  assert.equal(computeDragOffset(0, true, 360), 0);
  assert.equal(computeDragOffset(0, false, 360), 0);

  // True 1:1 tracking well beyond legacy 72px cap, clamped only at viewportWidth
  assert.equal(computeDragOffset(-150, true, 360), -150);
  assert.equal(computeDragOffset(240, true, 360), 240);
  assert.equal(computeDragOffset(-500, true, 360), -360);
  assert.equal(computeDragOffset(420, true, 360), 360);

  // Boundary exponential rubber-band: sign * maxEdge * (1 - exp(-|dx| / (maxEdge * 2.5)))
  const expected120 =
    DEFAULT_BOUNDARY_EDGE_PX * (1 - Math.exp(-120 / (DEFAULT_BOUNDARY_EDGE_PX * 2.5)));
  assert.ok(Math.abs(computeDragOffset(120, false, 360) - expected120) < 1e-9);
  assert.ok(Math.abs(computeDragOffset(-120, false, 360) + expected120) < 1e-9);

  // Strictly monotonic and asymptotically bounded below maxEdgePx (48px)
  const small = Math.abs(computeDragOffset(40, false, 360));
  const medium = Math.abs(computeDragOffset(180, false, 360));
  const huge = Math.abs(computeDragOffset(2000, false, 360));
  assert.ok(small > 0 && small < medium && medium < huge && huge <= DEFAULT_BOUNDARY_EDGE_PX);
});

test('trailing velocity window computes instantaneous release velocity and ignores stale pauses', () => {
  // Slow drag for 500ms followed by a rapid trailing flick in the last 40ms
  const samples = [];
  recordVelocitySample(samples, 300, 0);
  recordVelocitySample(samples, 290, 250);
  recordVelocitySample(samples, 280, 500);
  recordVelocitySample(samples, 260, 520);
  recordVelocitySample(samples, 232, 540);
  const vFlick = computeReleaseVelocity(samples, 540);
  // Over [500..540] -> dx = -48px, dt = 40ms -> -1.2 px/ms (even though average was -0.12 px/ms!)
  assert.ok(vFlick <= -1.0, `Expected strong negative release velocity, got ${vFlick}`);

  // If the finger pauses > 80ms before lifting, release velocity decays to 0
  assert.equal(computeReleaseVelocity(samples, 650), 0);

  // Fewer than 2 samples returns 0
  assert.equal(computeReleaseVelocity([{ x: 100, t: 10 }], 10), 0);
});

test('resolvePagerCommitStep and computeSettleDurationMs follow distance, velocity, and direction rules', () => {
  const vw = 360; // 28% threshold = 100.8px
  // Distance commit even with 0 release velocity
  assert.equal(resolvePagerCommitStep(-105, 0, vw), 1);
  assert.equal(resolvePagerCommitStep(105, 0, vw), -1);

  // Fast flick commit with |dx| >= 20 and |vRelease| >= 0.45 in drag direction
  assert.equal(resolvePagerCommitStep(-24, -0.55, vw), 1);
  assert.equal(resolvePagerCommitStep(22, 0.6, vw), -1);

  // Too short (< 20px) even at high velocity does not commit
  assert.equal(resolvePagerCommitStep(-18, -1.5, vw), 0);

  // Below distance ratio and below flick velocity does not commit
  assert.equal(resolvePagerCommitStep(-60, -0.25, vw), 0);

  // Opposite-direction release flick cancels switch
  assert.equal(resolvePagerCommitStep(-120, 0.8, vw), 0);
  assert.equal(resolvePagerCommitStep(-30, 0.6, vw), 0);

  // Velocity-scaled settle duration clamped strictly to [160, 260]
  const fastMs = computeSettleDurationMs(260, 2.2);
  const slowMs = computeSettleDurationMs(260, 0.2);
  assert.ok(fastMs >= 160 && fastMs <= 260);
  assert.ok(slowMs >= 160 && slowMs <= 260);
  assert.ok(fastMs < slowMs);
});

test('interpolateIndicatorRect interpolates (x, width) linearly and applies gentle boundary nudge', () => {
  const tabA = { x: 4, width: 80 };
  const tabB = { x: 88, width: 120 };
  const tabC = { x: 212, width: 60 };

  assert.deepEqual(interpolateIndicatorRect(tabB, tabC, 0), tabB);
  // Halfway toward next tab (progress = +0.5)
  assert.deepEqual(interpolateIndicatorRect(tabB, tabC, 0.5), { x: 150, width: 90 });
  // Full progress (clamped at 1)
  assert.deepEqual(interpolateIndicatorRect(tabB, tabC, 1.5), tabC);
  // Halfway toward previous tab (progress = -0.5)
  assert.deepEqual(interpolateIndicatorRect(tabB, tabA, -0.5), { x: 46, width: 100 });
  // Boundary (target = null) keeps width constant and nudges slightly in swipe direction
  const boundaryRight = interpolateIndicatorRect(tabA, null, -0.5);
  assert.equal(boundaryRight.width, tabA.width);
  assert.ok(boundaryRight.x < tabA.x && tabA.x - boundaryRight.x <= 8);
});

test('blurStrandedTabTrigger only blurs focused [role="tab"] triggers belonging to the same Tabs root', () => {
  const rootA = { tagName: 'DIV' };
  const rootB = { tagName: 'DIV' };
  let blurred = 0;

  const makeTab = (ownerRoot) => ({
    getAttribute: (k) => (k === 'role' ? 'tab' : null),
    closest: (sel) => (sel === '[data-pochita="tabs"]' ? ownerRoot : null),
    blur: () => {
      blurred += 1;
    },
  });

  // Tab in rootA -> blurred
  assert.equal(blurStrandedTabTrigger(rootA, { activeElement: makeTab(rootA) }), true);
  assert.equal(blurred, 1);

  // Tab in rootB -> NOT blurred when rootA commits swipe
  assert.equal(blurStrandedTabTrigger(rootA, { activeElement: makeTab(rootB) }), false);
  assert.equal(blurred, 1);

  // Non-tab element inside rootA -> NOT blurred
  const buttonEl = {
    getAttribute: () => null,
    closest: () => rootA,
    blur: () => {
      blurred += 1;
    },
  };
  assert.equal(blurStrandedTabTrigger(rootA, { activeElement: buttonEl }), false);
  assert.equal(blurred, 1);
});

test('Slider marks its root with data-swipe-ignore so slider drags never fight tab swipe', () => {
  const sliderHtml = renderToStaticMarkup(
    createElement(Slider, {
      label: '亮度',
      value: 50,
      min: 0,
      max: 100,
      onValueChange: () => {},
    }),
  );
  assert.ok(sliderHtml.includes('data-pochita="slider"'));
  assert.ok(sliderHtml.includes('data-swipe-ignore=""'));

  const tabsRoot = { tagName: 'DIV' };
  const sliderRoot = {
    tagName: 'DIV',
    parentElement: tabsRoot,
    hasAttribute: (k) => k === 'data-swipe-ignore',
    getAttribute: (k) => (k === 'data-swipe-ignore' ? '' : null),
  };
  const sliderTrack = { tagName: 'SPAN', parentElement: sliderRoot };
  assert.equal(shouldIgnoreSwipeStart(sliderTrack, tabsRoot), true);
});

test('resolveSwipeSurface and isSwipeTargetOwnedByTabs delegate blank-space swipes safely', () => {
  const shellBody = {
    tagName: 'MAIN',
    tabsList: [],
    querySelectorAll(sel) {
      return sel === '[data-pochita="tabs"][data-swipeable="true"]' ? this.tabsList : [];
    },
  };
  const outerTabs = {
    tagName: 'DIV',
    parentElement: { closest: () => null },
    closest(sel) {
      if (sel === '[data-pochita="app-shell-body"]') return shellBody;
      if (sel === '[data-pochita="tabs"]') return outerTabs;
      return null;
    },
  };
  const innerTabs = {
    tagName: 'DIV',
    parentElement: {
      closest: (sel) => (sel === '[data-pochita="tabs"]' ? outerTabs : null),
    },
    closest(sel) {
      if (sel === '[data-pochita="app-shell-body"]') return shellBody;
      if (sel === '[data-pochita="tabs"]') return innerTabs;
      return null;
    },
  };
  shellBody.tabsList = [outerTabs, innerTabs];

  // Top-level Tabs delegates to enclosing AppShell body; nested Tabs stays scoped to itself
  assert.equal(resolveSwipeSurface(outerTabs), shellBody);
  assert.equal(resolveSwipeSurface(innerTabs), innerTabs);

  // Blank space inside AppShell body below/around outerTabs -> owned by outerTabs
  const blankSpaceTarget = {
    tagName: 'MAIN',
    closest: () => null,
  };
  assert.equal(isSwipeTargetOwnedByTabs(blankSpaceTarget, outerTabs, shellBody), true);
  assert.equal(isSwipeTargetOwnedByTabs(blankSpaceTarget, innerTabs, innerTabs), false);

  // Touch inside nested innerTabs -> owned ONLY by innerTabs, never by outerTabs
  const innerCardTarget = {
    tagName: 'DIV',
    closest: (sel) => (sel === '[data-pochita="tabs"]' ? innerTabs : null),
  };
  assert.equal(isSwipeTargetOwnedByTabs(innerCardTarget, innerTabs, innerTabs), true);
  assert.equal(isSwipeTargetOwnedByTabs(innerCardTarget, outerTabs, shellBody), false);

  // Touch inside dialog/header outside Tabs -> rejected even on delegated surface
  const dialogOverlay = {
    contains: () => false,
  };
  const modalTarget = {
    tagName: 'DIV',
    closest: (sel) => (sel.includes('[role="dialog"]') ? dialogOverlay : null),
  };
  assert.equal(isSwipeTargetOwnedByTabs(modalTarget, outerTabs, shellBody), false);

  // overflowX: 'visible' must NOT block horizontal swipe even when scrollWidth > clientWidth
  const tabsRoot = { tagName: 'DIV' };
  const visibleOverflowWrapper = {
    tagName: 'DIV',
    scrollWidth: 480,
    clientWidth: 320,
    scrollLeft: 0,
    style: { overflowX: 'visible' },
    parentElement: tabsRoot,
  };
  const visibleChild = { tagName: 'DIV', parentElement: visibleOverflowWrapper };
  assert.equal(hasScrollableHorizontalAncestor(visibleChild, tabsRoot, -40), false);

  const autoScrollWrapper = {
    tagName: 'DIV',
    scrollWidth: 480,
    clientWidth: 320,
    scrollLeft: 0,
    style: { overflowX: 'auto' },
    parentElement: tabsRoot,
  };
  const autoChild = { tagName: 'DIV', parentElement: autoScrollWrapper };
  assert.equal(hasScrollableHorizontalAncestor(autoChild, tabsRoot, -40), true);
});
