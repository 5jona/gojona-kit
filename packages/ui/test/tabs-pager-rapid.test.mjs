import assert from 'node:assert/strict';
import test from 'node:test';
import { createTabPagerEngine } from '../dist/components/tabPagerEngine.js';

function createEl({
  attrs = {},
  offsetWidth = 360,
  offsetTop = 52,
  offsetLeft = 0,
  hidden = false,
  ownerRoot = null,
} = {}) {
  const attrMap = new Map(Object.entries(attrs));
  const listeners = new Map();
  const el = {
    tagName: 'DIV',
    style: {},
    hidden,
    offsetWidth,
    offsetTop,
    offsetLeft,
    clientWidth: offsetWidth,
    parentElement: ownerRoot,
    getAttribute: (k) => (attrMap.has(k) ? attrMap.get(k) : null),
    hasAttribute: (k) => attrMap.has(k),
    setAttribute: (k, v) => attrMap.set(k, String(v)),
    removeAttribute: (k) => attrMap.delete(k),
    closest: (sel) => (sel === '[data-pochita="tabs"]' ? (ownerRoot ?? el) : null),
    addEventListener(type, fn) {
      const set = listeners.get(type) ?? new Set();
      set.add(fn);
      listeners.set(type, set);
    },
    removeEventListener(type, fn) {
      listeners.get(type)?.delete(fn);
    },
    dispatchTransitionEnd(propertyName = 'transform') {
      for (const fn of [...(listeners.get('transitionend') ?? [])]) {
        fn({ target: el, propertyName });
      }
    },
  };
  return el;
}

function createAsyncTabsFixture(initial = 'overview', viewportWidth = 360) {
  const tabs = ['overview', 'rules', 'logs'];
  const root = createEl({ attrs: { 'data-pochita': 'tabs' }, offsetWidth: viewportWidth });
  const triggers = tabs.map((val, idx) =>
    createEl({
      attrs: {
        role: 'tab',
        'data-tab-value': val,
        'data-state': val === initial ? 'active' : 'inactive',
        'aria-selected': val === initial ? 'true' : 'false',
      },
      offsetLeft: 4 + idx * 104,
      offsetWidth: 100,
      ownerRoot: root,
    }),
  );
  const panels = new Map(
    tabs.map((val) => [
      val,
      createEl({
        attrs: {
          'data-pochita': 'tabs-content',
          'data-tab-value': val,
          'data-state': val === initial ? 'active' : 'inactive',
        },
        offsetWidth: viewportWidth,
        offsetTop: 52,
        offsetLeft: 0,
        hidden: val !== initial,
        ownerRoot: root,
      }),
    ]),
  );
  root.querySelectorAll = (selector) => {
    if (selector === '[role="tab"]') return triggers;
    if (selector === '[data-pochita="tabs-content"]') return [...panels.values()];
    return [];
  };

  let syncActiveCalls = 0;
  let clearDraggingCalls = 0;
  const indicator = {
    snapshotRects: () => new Map(tabs.map((val, idx) => [val, { x: 4 + idx * 104, width: 100 }])),
    applyRect() {},
    clearDragging() {
      clearDraggingCalls += 1;
    },
    markSettledFor() {},
    syncActive() {
      syncActiveCalls += 1;
    },
  };

  return {
    root,
    panels,
    indicator,
    applyReactRender(nextValue) {
      for (const [tab, panel] of panels) {
        panel.hidden = tab !== nextValue;
        panel.setAttribute('data-state', tab === nextValue ? 'active' : 'inactive');
      }
      for (const trigger of triggers) {
        const isAct = trigger.getAttribute('data-tab-value') === nextValue;
        trigger.setAttribute('data-state', isAct ? 'active' : 'inactive');
        trigger.setAttribute('aria-selected', isAct ? 'true' : 'false');
      }
    },
    get syncActiveCalls() {
      return syncActiveCalls;
    },
    get clearDraggingCalls() {
      return clearDraggingCalls;
    },
  };
}

test('rapid reversed swipes (rules -> logs -> rules) do not jump to overview before React commits', () => {
  const fixture = createAsyncTabsFixture('rules');
  let reactValue = 'rules';
  const commits = [];
  let now = 1000;

  const engine = createTabPagerEngine({
    getRoot: () => fixture.root,
    getIndicator: () => fixture.indicator,
    getCurrentValue: () => reactValue,
    isSwipeable: () => true,
    getOrientation: () => 'horizontal',
    getTabOrder: () => ['overview', 'rules', 'logs'],
    getEdgeGuardPx: () => 24,
    onCommitTab: (next) => commits.push(next), // Deferred React render!
    now: () => now,
    getWindowWidth: () => 360,
  });

  const target = createEl({ ownerRoot: fixture.root });

  // Swipe 1: Left from 'rules' -> starts settling toward 'logs'
  engine.begin('touch', 1, 280, 120, target);
  now = 1020;
  engine.move('touch', 1, 140, 122);
  now = 1040;
  engine.end('touch', 1, 120, false, 122);
  assert.deepEqual(commits, []);

  // Swipe 2: Immediately swipe RIGHT during Swipe 1's settle BEFORE React renders 'logs'
  now = 1100;
  engine.begin('touch', 2, 80, 120, target);
  assert.deepEqual(commits, ['logs']);
  assert.equal(fixture.panels.get('rules').hidden, true);
  assert.equal(fixture.panels.get('logs').hidden, false);

  now = 1120;
  engine.move('touch', 2, 220, 122); // dx = +140 -> must peek 'rules', NOT 'overview'
  assert.equal(fixture.panels.get('rules').hidden, false);
  assert.equal(fixture.panels.get('overview').hidden, true);

  // Delayed React commit of Swipe 1 ('logs') arrives MID-DRAG of Swipe 2!
  reactValue = 'logs';
  fixture.applyReactRender('logs'); // React writes rules.hidden = true
  assert.equal(engine.flushPendingCommit('logs'), true);
  // Engine restores rules.hidden = false before paint and keeps live drag transforms intact
  assert.equal(fixture.panels.get('rules').hidden, false);
  assert.equal(fixture.panels.get('logs').hidden, false);
  assert.ok(fixture.panels.get('logs').style.transform.includes('translate3d('));

  // Release Swipe 2 -> settles cleanly back to 'rules' (never 'overview'!)
  now = 1140;
  engine.end('touch', 2, 240, false, 122);
  fixture.panels.get('rules').dispatchTransitionEnd('transform');
  assert.deepEqual(commits, ['logs', 'rules']);

  reactValue = 'rules';
  fixture.applyReactRender('rules');
  assert.equal(engine.flushPendingCommit('rules'), true);
  assert.equal(fixture.panels.get('rules').hidden, false);
  assert.equal(fixture.panels.get('logs').hidden, true);
  assert.equal(fixture.panels.get('rules').style.transform, '');
  engine.destroy();
});

test('rapid consecutive same-direction swipes (overview -> rules -> logs) advance two tabs without drift', () => {
  const fixture = createAsyncTabsFixture('overview');
  let reactValue = 'overview';
  const commits = [];
  let now = 2000;

  const engine = createTabPagerEngine({
    getRoot: () => fixture.root,
    getIndicator: () => fixture.indicator,
    getCurrentValue: () => reactValue,
    isSwipeable: () => true,
    getOrientation: () => 'horizontal',
    getTabOrder: () => ['overview', 'rules', 'logs'],
    getEdgeGuardPx: () => 24,
    onCommitTab: (next) => commits.push(next),
    now: () => now,
    getWindowWidth: () => 360,
  });

  const target = createEl({ ownerRoot: fixture.root });

  // Swipe 1: overview -> rules (settling)
  engine.begin('touch', 10, 280, 120, target);
  now = 2020;
  engine.move('touch', 10, 120, 120);
  now = 2040;
  engine.end('touch', 10, 100, false, 120);

  // Swipe 2: interrupts settle before React updates reactValue -> must advance rules -> logs!
  now = 2100;
  engine.begin('touch', 11, 280, 120, target);
  assert.deepEqual(commits, ['rules']);
  now = 2120;
  engine.move('touch', 11, 120, 120);
  assert.equal(fixture.panels.get('logs').hidden, false);
  now = 2140;
  engine.end('touch', 11, 100, false, 120);
  fixture.panels.get('logs').dispatchTransitionEnd('transform');
  assert.deepEqual(commits, ['rules', 'logs']);

  // React batches directly to 'logs'
  reactValue = 'logs';
  fixture.applyReactRender('logs');
  assert.equal(engine.flushPendingCommit('logs'), true);
  assert.equal(fixture.panels.get('logs').hidden, false);
  assert.equal(fixture.panels.get('rules').hidden, true);
  assert.equal(fixture.panels.get('overview').hidden, true);
  engine.destroy();
});

test('external tab switch cancels in-flight settle without committing stale tab', () => {
  const fixture = createAsyncTabsFixture('overview');
  let reactValue = 'overview';
  const commits = [];
  let now = 3000;

  const engine = createTabPagerEngine({
    getRoot: () => fixture.root,
    getIndicator: () => fixture.indicator,
    getCurrentValue: () => reactValue,
    isSwipeable: () => true,
    getOrientation: () => 'horizontal',
    getTabOrder: () => ['overview', 'rules', 'logs'],
    getEdgeGuardPx: () => 24,
    onCommitTab: (next) => commits.push(next),
    now: () => now,
    getWindowWidth: () => 360,
  });

  const target = createEl({ ownerRoot: fixture.root });
  engine.begin('touch', 20, 280, 120, target);
  now = 3020;
  engine.move('touch', 20, 120, 120);
  now = 3040;
  engine.end('touch', 20, 100, false, 120);

  // User clicks 'logs' tab trigger while settle toward 'rules' is still running
  reactValue = 'logs';
  fixture.applyReactRender('logs');
  assert.equal(engine.flushPendingCommit('logs'), false);
  assert.ok(fixture.syncActiveCalls >= 1);

  // Late transitionend from cancelled settle must NOT commit 'rules'
  fixture.panels.get('rules').dispatchTransitionEnd('transform');
  assert.deepEqual(commits, []);
  assert.equal(fixture.panels.get('logs').hidden, false);
  assert.equal(fixture.panels.get('rules').hidden, true);
  engine.destroy();
});

test('single ultra-fast flick commits even if touchmove never crossed lockThresholdPx', () => {
  const fixture = createAsyncTabsFixture('overview');
  const commits = [];
  let now = 4000;

  const engine = createTabPagerEngine({
    getRoot: () => fixture.root,
    getIndicator: () => fixture.indicator,
    getCurrentValue: () => 'overview',
    isSwipeable: () => true,
    getOrientation: () => 'horizontal',
    getTabOrder: () => ['overview', 'rules', 'logs'],
    getEdgeGuardPx: () => 24,
    onCommitTab: (next) => commits.push(next),
    now: () => now,
    getWindowWidth: () => 360,
  });

  const target = createEl({ ownerRoot: fixture.root });
  engine.begin('touch', 30, 280, 120, target);
  now = 4008;
  assert.equal(engine.move('touch', 30, 272, 121), false); // dx = -8 (< 12px lockThreshold)
  now = 4020;
  engine.end('touch', 30, 190, false, 124); // dx = -90, fast release!
  fixture.panels.get('rules').dispatchTransitionEnd('transform');
  assert.deepEqual(commits, ['rules']);
  engine.destroy();
});

test('touch session ignores stray pointerdown and supersedes prior pointer session', () => {
  const fixture = createAsyncTabsFixture('overview');
  const engine = createTabPagerEngine({
    getRoot: () => fixture.root,
    getIndicator: () => fixture.indicator,
    getCurrentValue: () => 'overview',
    isSwipeable: () => true,
    getOrientation: () => 'horizontal',
    getTabOrder: () => ['overview', 'rules', 'logs'],
    getEdgeGuardPx: () => 24,
    onCommitTab: () => {},
    getWindowWidth: () => 360,
  });

  const target = createEl({ ownerRoot: fixture.root });
  engine.begin('pointer', 100, 200, 120, target);
  assert.deepEqual(engine.getActiveInput(), { source: 'pointer', id: 100 });

  // Touchstart supersedes pointer session cleanly
  engine.begin('touch', 1, 200, 120, target);
  assert.deepEqual(engine.getActiveInput(), { source: 'touch', id: 1 });

  // Subsequent pointerdown while touch is active is ignored
  engine.begin('pointer', 101, 200, 120, target);
  assert.deepEqual(engine.getActiveInput(), { source: 'touch', id: 1 });

  engine.destroy();
});

test('delayed React commit of Swipe 1 during Swipe 2 settle preserves Swipe 2 panel visibility, and React bailout reconciles cleanly', async () => {
  const fixture = createAsyncTabsFixture('rules');
  let reactValue = 'rules';
  const commits = [];
  let now = 5000;

  const engine = createTabPagerEngine({
    getRoot: () => fixture.root,
    getIndicator: () => fixture.indicator,
    getCurrentValue: () => reactValue,
    isSwipeable: () => true,
    getOrientation: () => 'horizontal',
    getTabOrder: () => ['overview', 'rules', 'logs'],
    getEdgeGuardPx: () => 24,
    onCommitTab: (next) => commits.push(next),
    now: () => now,
    getWindowWidth: () => 360,
  });

  const target = createEl({ ownerRoot: fixture.root });

  // Swipe 1: rules -> logs (settling)
  engine.begin('touch', 40, 280, 120, target);
  now = 5020;
  engine.move('touch', 40, 120, 120);
  now = 5040;
  engine.end('touch', 40, 100, false, 120);

  // Swipe 2: interrupts settle, drags right (logs -> rules), releases into Swipe 2 settle
  now = 5080;
  engine.begin('touch', 41, 80, 120, target);
  now = 5100;
  engine.move('touch', 41, 220, 120);
  now = 5120;
  engine.end('touch', 41, 240, false, 120);

  // React delivers Swipe 1 ('logs') DURING Swipe 2's settle (setting rules.hidden = true)
  reactValue = 'logs';
  fixture.applyReactRender('logs');
  assert.equal(engine.flushPendingCommit('logs'), true);
  assert.equal(fixture.panels.get('rules').hidden, false);
  assert.equal(fixture.panels.get('logs').hidden, false);

  // Swipe 2 settle finishes -> commits 'rules'
  fixture.panels.get('rules').dispatchTransitionEnd('transform');
  assert.deepEqual(commits, ['logs', 'rules']);

  // Simulate React bailout (value already 'rules' without triggering useLayoutEffect)
  reactValue = 'rules';
  await new Promise((resolve) => setTimeout(resolve, 160));
  assert.equal(fixture.panels.get('rules').hidden, false);
  assert.equal(fixture.panels.get('logs').hidden, true);
  assert.equal(fixture.panels.get('rules').style.transform, '');
  assert.equal(fixture.panels.get('logs').style.transform, '');
  engine.destroy();
});
