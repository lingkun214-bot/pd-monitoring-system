# Trend Device Tree Synchronization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make leaf channel selections in the device tree update every device-dependent value on the long-period trend page while keeping parent nodes non-selectable.

**Architecture:** Add a small pure core helper that converts the selected channel path into the normalized trend unit/channel pair. Keep `deviceContext` as the device-tree state, then synchronize the existing trend controls and call the existing `renderTrendTarget()` so charts, summaries, threshold context, and exports continue to share one `currentTrendProfile`.

**Tech Stack:** Static HTML, CSS, vanilla JavaScript, Node.js built-in test runner.

---

### Task 1: Resolve a selected channel into a trend target

**Files:**
- Modify: `core.js:120-155`
- Test: `tests/core.test.js:110-145`

- [ ] **Step 1: Write the failing core test**

Add this test after the existing device-context tests:

```js
test("resolveTrendTarget accepts only leaf channels and normalizes their labels", () => {
  assert.equal(typeof core.resolveTrendTarget, "function");
  assert.deepEqual(core.resolveTrendTarget({ selectedId: "channel-2-b" }), {
    unit: "2# 机组",
    channel: "B相",
  });
  assert.deepEqual(core.resolveTrendTarget({ selectedId: "channel-3-c" }), {
    unit: "3# 机组",
    channel: "C相",
  });
  assert.equal(core.resolveTrendTarget({ selectedId: "unit-2" }), null);
  assert.equal(core.resolveTrendTarget({ selectedId: "device-2" }), null);
  assert.equal(core.resolveTrendTarget({ selectedId: "missing" }), null);
});
```

- [ ] **Step 2: Run the test to verify RED**

Run: `node --test --test-name-pattern="resolveTrendTarget" tests/core.test.js`

Expected: FAIL because `core.resolveTrendTarget` is undefined.

- [ ] **Step 3: Add the minimal resolver and export it**

Add after `formatDevicePath`:

```js
function resolveTrendTarget(context) {
  const path = findDevicePath(context?.selectedId);
  const selected = path?.at(-1);
  if (!path || selected?.type !== "channel") return null;
  const unit = path.find(node => node.type === "unit");
  const channel = path.find(node => node.type === "channel");
  if (!unit || !channel) return null;
  const normalizedChannel = channel.label.match(/^[ABC]相/)?.[0];
  if (!normalizedChannel) return null;
  return {
    unit: unit.label.replace(/#\s*机组$/, "# 机组"),
    channel: normalizedChannel,
  };
}
```

Add `resolveTrendTarget` to `PDCore`.

- [ ] **Step 4: Run the focused and full core tests**

Run: `node --test --test-name-pattern="resolveTrendTarget" tests/core.test.js`

Expected: PASS, 1 matching test and 0 failures.

Run: `node --test tests/core.test.js`

Expected: all core tests pass.

- [ ] **Step 5: Commit the core behavior**

```bash
git add core.js tests/core.test.js
git commit -m "fix: resolve trend targets from channel nodes"
```

### Task 2: Restrict tree selection and synchronize the trend page

**Files:**
- Modify: `app.js:360-385`
- Modify: `styles.css:269-273`
- Test: `tests/structure.test.js:147-160,219-230`

- [ ] **Step 1: Write the failing integration structure test**

Add this test after the device-context container test:

```js
test("设备树仅允许通道节点选择并同步长周期趋势目标", () => {
  assert.match(app, /node\.type\s*===\s*["']channel["'][\s\S]*data-device-id/);
  assert.match(app, /button\[data-device-id\][\s\S]*selectDeviceNode/);
  assert.match(app, /function syncTrendTargetFromDeviceTree\(/);
  assert.match(app, /PDCore\.resolveTrendTarget\(deviceContext\)/);
  assert.match(app, /trendUnitSelect[\s\S]*target\.unit/);
  assert.match(app, /trendChannelSelect[\s\S]*target\.channel/);
  assert.match(app, /selectDeviceNode\([\s\S]*syncTrendTargetFromDeviceTree\(\)/);
  assert.match(app, /syncTrendTargetFromDeviceTree\([\s\S]*renderTrendTarget\(\)/);
  assert.match(css, /\.device-tree-branch[\s\S]*cursor:\s*default/);
});
```

- [ ] **Step 2: Run the new test to verify RED**

Run: `node --test --test-name-pattern="设备树仅允许通道节点选择并同步长周期趋势目标" tests/structure.test.js`

Expected: FAIL because channel-only rendering and `syncTrendTargetFromDeviceTree()` do not exist.

- [ ] **Step 3: Render parent nodes as non-interactive branches**

Change the node template in `renderDeviceTree()` to:

```js
.map(node => node.type === "channel"
  ? `<button class="device-tree-node" type="button" data-device-id="${node.id}" data-level="${node.level}" aria-pressed="${deviceContext.selectedIds.includes(node.id)}">○ ${node.label}</button>`
  : `<div class="device-tree-node device-tree-branch" data-level="${node.level}">${node.children?.length ? "▾ " : ""}${node.label}</div>`)
```

Bind click handlers only to channel buttons:

```js
$$('button[data-device-id]', container).forEach(button => {
  button.addEventListener("click", () => selectDeviceNode(button.dataset.deviceId));
});
```

- [ ] **Step 4: Synchronize the selected channel into the existing trend renderer**

Add before `selectDeviceNode()`:

```js
function syncTrendTargetFromDeviceTree() {
  if (currentPage !== "trend") return false;
  const target = PDCore.resolveTrendTarget(deviceContext);
  const unitSelect = $("#trendUnitSelect");
  const channelSelect = $("#trendChannelSelect");
  if (!target || !unitSelect || !channelSelect) return false;
  const hasUnit = [...unitSelect.options].some(option => option.value === target.unit);
  const hasChannel = [...channelSelect.options].some(option => option.value === target.channel);
  if (!hasUnit || !hasChannel) return false;
  unitSelect.value = target.unit;
  channelSelect.value = target.channel;
  renderTrendTarget();
  return true;
}
```

Call it after `renderDeviceLinkedPage(currentPage)` in `selectDeviceNode()`:

```js
syncTrendTargetFromDeviceTree();
```

Keep the existing `requestAnimationFrame(drawAll)` call so other device-linked pages retain their redraw behavior.

- [ ] **Step 5: Make parent-node styling visibly non-interactive**

Replace the shared pointer and hover rules with:

```css
.device-tree-node { width: 100%; margin: 2px 0; padding: 6px 7px; text-align: left; color: #cfe9ff; border: 0; border-radius: 3px; background: transparent; }
button.device-tree-node { cursor: pointer; }
button.device-tree-node:hover, button.device-tree-node[aria-pressed="true"] { color: white; background: rgba(8, 121, 235, .4); }
.device-tree-branch { cursor: default; color: #88a9c6; }
```

Keep the existing indentation rules for `data-level`.

- [ ] **Step 6: Run focused and complete automated tests**

Run: `node --test --test-name-pattern="设备树仅允许通道节点选择并同步长周期趋势目标" tests/structure.test.js`

Expected: PASS, 1 matching test and 0 failures.

Run: `node --test tests/*.test.js`

Expected: all tests pass with 0 failures.

- [ ] **Step 7: Commit the UI integration**

```bash
git add app.js styles.css tests/structure.test.js
git commit -m "fix: synchronize trend page with device tree"
```

### Task 3: Browser regression and final verification

**Files:**
- Verify: `index.html`
- Verify: `app.js`
- Verify: `styles.css`

- [ ] **Step 1: Start a local static server from the worktree**

Run: `python3 -m http.server 8765 --bind 127.0.0.1`

Expected: the server listens on `http://127.0.0.1:8765/`.

- [ ] **Step 2: Verify the trend interaction in the browser**

Log in with `admin` / `12345`, open 长周期趋势分析, expand the device tree, and select `2#机组 / 水轮发电机 / B相 UHF`.

Expected:

- Parent rows have no selectable button behavior.
- The trend selectors show `2# 机组` and `B相`.
- The current-analysis line shows `2# 机组 / B相`.
- The current-unit field, aging factor, slope label, chart output, and selected summary row change together.
- Exported trend JSON identifies `2# 机组` and `B相`.

- [ ] **Step 3: Verify a second target and unrelated pages**

Select `3#机组 / 水轮发电机 / C相 UHF`, then visit history and data-processing pages.

Expected: the trend page switches to `3# 机组 / C相`; history and data-processing pages still render and their device tree remains usable with channel leaves.

- [ ] **Step 4: Run final repository checks**

Run: `node --test tests/*.test.js`

Expected: all tests pass with 0 failures.

Run: `git diff --check`

Expected: no output and exit code 0.

Run: `git status --short`

Expected: clean worktree.
