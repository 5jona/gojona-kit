import assert from 'node:assert/strict';
import test from 'node:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../dist/components/Tabs.js';
import {
  classifySwipeLock,
  computeDampedOffset,
  DEFAULT_TAB_SWIPE_OPTIONS,
  hasScrollableHorizontalAncestor,
  isInEdgeGuardZone,
  resolveAdjacentTab,
  resolveSwipeStep,
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
