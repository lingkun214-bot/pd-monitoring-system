# Device Tree and Button Closure Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a collapsible, shared device tree to every non-dashboard page and make every visible button complete a meaningful, observable interaction.

**Architecture:** Keep the prototype dependency-free. Put deterministic selection, filtering, and action-state helpers in `core.js`; render the shared tree and page feedback from `app.js`; add one reusable page-shell markup pattern to `index.html`; and style it in `styles.css`. Reuse the existing local state and render functions instead of introducing a framework.

**Tech Stack:** HTML5, CSS, browser JavaScript, Canvas, Node.js built-in test runner.

---

## File map

- Modify `core.js`: pure device-tree state, device-path, record filtering, and action-result helpers.
- Modify `index.html`: shared device navigation shells, stable button IDs, feedback region, confirmation dialog, and removal of the history-wave close control.
- Modify `app.js`: global device context, tree rendering, page linkage, button handlers, processing states, notifications, and confirmation flow.
- Modify `styles.css`: collapsible rail/tree, path summary, feedback, loading/disabled states, confirmation dialog, and responsive layout.
- Modify `tests/core.test.js`: behavioral unit tests for pure state transitions.
- Modify `tests/structure.test.js`: structural contracts for all seven pages and button closures.

### Task 1: Pure device context model

**Files:**
- Modify: `core.js`
- Test: `tests/core.test.js`

- [ ] **Step 1: Write failing tests for normalized single and multi-selection**

Append tests that call this public API:

```js
test("createDeviceContext selects one channel and formats its full path", () => {
  const context = core.createDeviceContext("channel-3-a");
  assert.equal(context.selectedId, "channel-3-a");
  assert.deepEqual(context.selectedIds, ["channel-3-a"]);
  assert.equal(core.formatDevicePath(context), "灵昆水电站 / 3#机组 / 水轮发电机 / A相 UHF");
});

test("toggleDeviceSelection supports multi-select without losing the primary channel", () => {
  const start = { ...core.createDeviceContext("channel-3-a"), multi: true };
  const next = core.toggleDeviceSelection(start, "channel-3-b");
  assert.deepEqual(next.selectedIds, ["channel-3-a", "channel-3-b"]);
  assert.equal(next.selectedId, "channel-3-b");
  assert.deepEqual(core.toggleDeviceSelection(next, "channel-3-b").selectedIds, ["channel-3-a"]);
});
```

- [ ] **Step 2: Run the focused tests and verify RED**

Run: `node --test tests/core.test.js`

Expected: FAIL because `createDeviceContext`, `formatDevicePath`, and `toggleDeviceSelection` are not exported.

- [ ] **Step 3: Implement the minimal immutable model**

Add a fixed `DEVICE_NODES` hierarchy and these functions to `core.js`:

```js
function createDeviceContext(selectedId = "channel-3-a") {
  return { selectedId, selectedIds: [selectedId], multi: false, collapsed: true, query: "" };
}

function findDevicePath(id, nodes = DEVICE_NODES, path = []) {
  for (const node of nodes) {
    const next = [...path, node];
    if (node.id === id) return next;
    const nested = findDevicePath(id, node.children || [], next);
    if (nested) return nested;
  }
  return null;
}

function formatDevicePath(context) {
  return (findDevicePath(context.selectedId) || []).map(node => node.label).join(" / ");
}

function toggleDeviceSelection(context, id) {
  if (!context.multi) return { ...context, selectedId: id, selectedIds: [id] };
  const exists = context.selectedIds.includes(id);
  const selectedIds = exists
    ? context.selectedIds.filter(item => item !== id)
    : [...context.selectedIds, id];
  const safeIds = selectedIds.length ? selectedIds : [context.selectedId];
  return { ...context, selectedId: safeIds[safeIds.length - 1], selectedIds: safeIds };
}
```

Export the nodes and functions through the existing `PDCore`/CommonJS export object.

- [ ] **Step 4: Run tests and verify GREEN**

Run: `node --test tests/core.test.js`

Expected: all core tests PASS.

- [ ] **Step 5: Commit**

```bash
git add core.js tests/core.test.js
git commit -m "feat: add shared device context model"
```

### Task 2: Device tree structural shell for seven pages

**Files:**
- Modify: `index.html`
- Modify: `styles.css`
- Test: `tests/structure.test.js`

- [ ] **Step 1: Write failing structural tests**

Add assertions for one shared shell per non-dashboard page and no shell on the dashboard:

```js
test("seven non-dashboard pages expose the shared device context shell", () => {
  for (const page of ["history", "trend", "diagnosis", "processing", "alarm", "device", "system"]) {
    assert.match(html, new RegExp(`id=["']${page}["'][\\s\\S]*data-device-page=["']${page}["']`));
  }
  assert.doesNotMatch(html, /id=["']dashboard["'][\s\S]{0,500}data-device-page=/);
  assert.match(html, /id=["']deviceTreeToggle["']/);
  assert.match(html, /id=["']deviceTreeSearch["']/);
  assert.match(html, /id=["']currentDevicePath["']/);
});

test("history pulse panel no longer exposes a decorative close button", () => {
  assert.doesNotMatch(html, /原始脉冲波形查询[\s\S]{0,150}关闭\s*×/);
});
```

- [ ] **Step 2: Run tests and verify RED**

Run: `node --test tests/structure.test.js`

Expected: FAIL for missing device shell IDs and the still-present “关闭 ×”.

- [ ] **Step 3: Add one reusable shell pattern to each page**

Wrap each non-dashboard page body with:

```html
<div class="device-page-shell" data-device-page="history">
  <aside class="device-rail" aria-label="设备导航"></aside>
  <div class="device-page-content">
    <p class="device-path" data-device-path>灵昆水电站 / 3#机组 / 水轮发电机 / A相 UHF</p>
    <!-- existing page content -->
  </div>
</div>
```

Place the single rendered tree inside the active page’s rail from `app.js`. Remove only the `<button class="ghost">关闭 ×</button>` from the history-wave title.

- [ ] **Step 4: Add constrained layout styles**

Implement `.device-page-shell` as a two-column grid, `.device-rail` at 58px collapsed and 224px expanded, and `.device-page-content { min-width: 0; }`. Add a `@media (max-width: 980px)` rule that overlays the expanded tree rather than shrinking charts.

- [ ] **Step 5: Run structure tests and verify GREEN**

Run: `node --test tests/structure.test.js`

Expected: all structural tests PASS.

- [ ] **Step 6: Commit**

```bash
git add index.html styles.css tests/structure.test.js
git commit -m "feat: add collapsible device navigation shells"
```

### Task 3: Render and operate the collapsible device tree

**Files:**
- Modify: `app.js`
- Modify: `styles.css`
- Test: `tests/structure.test.js`

- [ ] **Step 1: Write failing interaction contract tests**

Add structural checks for `initDeviceTree`, `renderDeviceTree`, use of `PDCore.toggleDeviceSelection`, search filtering, page preservation, and multi-select availability only for history/alarm.

```js
test("device tree handlers preserve context and limit multi-select pages", () => {
  assert.match(app, /function initDeviceTree\(\)/);
  assert.match(app, /function renderDeviceTree\(\)/);
  assert.match(app, /PDCore\.toggleDeviceSelection/);
  assert.match(app, /new Set\(\["history",\s*"alarm"\]\)/);
  assert.match(app, /deviceContext\.query/);
  assert.match(app, /renderDeviceLinkedPage\(currentPage/);
});
```

- [ ] **Step 2: Run tests and verify RED**

Run: `node --test tests/structure.test.js`

Expected: FAIL because the tree controller does not exist.

- [ ] **Step 3: Implement tree controller and shared feedback**

In `app.js`, add `deviceContext`, `currentPage`, and:

```js
const MULTI_DEVICE_PAGES = new Set(["history", "alarm"]);

function selectDeviceNode(id) {
  deviceContext = PDCore.toggleDeviceSelection(deviceContext, id);
  renderDeviceTree();
  renderDeviceLinkedPage(currentPage);
  showToast(`已切换至 ${PDCore.formatDevicePath(deviceContext)}`, "success");
}
```

Render the tree with buttons carrying `data-device-id`, `aria-pressed`, and keyboard-native button behavior. Move the same tree component into the newly active page’s `.device-rail` during `setPage`. Wire the toggle, query input, and multi-select switch.

- [ ] **Step 4: Implement page linkage**

`renderDeviceLinkedPage(page)` must update every `[data-device-path]`, synchronize history/trend/alarm selectors where present, update diagnosis/processing/device labels, and show “全局设置” when the system users tab is active.

- [ ] **Step 5: Run structure and core tests**

Run: `node --test tests/*.test.js`

Expected: all tests PASS.

- [ ] **Step 6: Commit**

```bash
git add app.js styles.css tests/structure.test.js
git commit -m "feat: connect device tree to page context"
```

### Task 4: Close history and trend button loops

**Files:**
- Modify: `index.html`
- Modify: `app.js`
- Test: `tests/structure.test.js`

- [ ] **Step 1: Write failing tests for stable controls and outcomes**

Require IDs for history query/reset/play/pause/speed/detail and trend chart export. Require handlers to update `historyNotice`, playback state, selected row, and export feedback.

- [ ] **Step 2: Run tests and verify RED**

Run: `node --test tests/structure.test.js`

Expected: FAIL for missing IDs/handlers.

- [ ] **Step 3: Add stable IDs and handlers**

Use `historyQueryBtn`, `historyResetBtn`, `historyPlayBtn`, `historyPauseBtn`, `historySpeed`, and `exportTrendChartBtn`. Query filters the existing history records using current device selections; reset restores default date/level; play/pause update button disabled states and notice text; speed changes the notice and playback timer; detail renders the selected record into the existing wave area.

- [ ] **Step 4: Make export observable**

Use the existing export note for history and the global toast for trend. Generate a Blob download only when matching data exists; otherwise show “当前设备与条件下没有可导出的数据”.

- [ ] **Step 5: Run tests and commit**

Run: `node --test tests/*.test.js`

```bash
git add index.html app.js tests/structure.test.js
git commit -m "feat: close history and trend interactions"
```

### Task 5: Close diagnosis, processing, device, and system loops

**Files:**
- Modify: `index.html`
- Modify: `app.js`
- Modify: `styles.css`
- Test: `tests/structure.test.js`

- [ ] **Step 1: Write failing tests for every visible action**

Assert stable IDs for diagnosis start/preview/PDF/print, filter apply, device save, system menu/self-check/config/log actions, and the top fullscreen button. Assert each ID is referenced by an event handler or delegated action map.

- [ ] **Step 2: Run tests and verify RED**

Run: `node --test tests/structure.test.js`

Expected: FAIL for currently anonymous buttons.

- [ ] **Step 3: Implement shared processing-state helper**

Add:

```js
async function runButtonAction(button, busyText, operation) {
  if (button.disabled) return;
  const original = button.textContent;
  button.disabled = true;
  button.textContent = busyText;
  try { await operation(); }
  finally { button.disabled = false; button.textContent = original; }
}
```

Use it for diagnosis, filtering, save, self-check, and report generation. Each completion must update an existing result area plus the toast.

- [ ] **Step 4: Implement details, previews, and system tabs**

Diagnosis preview opens the existing report content in a modal; PDF produces a demo file; print invokes the print preview path; processing redraws its charts and reports applied frequency bounds; device save updates the selected node summary; system side-menu buttons switch panels and announce whether the scope is device-specific or global.

- [ ] **Step 5: Implement fullscreen with supported fallback**

Give the button `id="fullscreenBtn"`; call `document.documentElement.requestFullscreen()` when available and show a clear unsupported message otherwise. Update its label on `fullscreenchange`.

- [ ] **Step 6: Run tests and commit**

Run: `node --test tests/*.test.js`

```bash
git add index.html app.js styles.css tests/structure.test.js
git commit -m "feat: close analysis and configuration actions"
```

### Task 6: Confirm destructive alarm actions and close the alarm loop

**Files:**
- Modify: `index.html`
- Modify: `app.js`
- Modify: `styles.css`
- Test: `tests/structure.test.js`
- Test: `tests/core.test.js`

- [ ] **Step 1: Write failing confirmation and cancellation tests**

Add a pure core test showing cancel leaves records unchanged and confirmation changes the selected alarm to `已关闭`. Add structure tests for `confirmDialog`, `confirmDialogCancel`, `confirmDialogAccept`, focus return, and an alarm action handler that calls the confirmation flow before mutation.

- [ ] **Step 2: Run tests and verify RED**

Run: `node --test tests/*.test.js`

Expected: FAIL for missing confirmation helper/dialog.

- [ ] **Step 3: Implement pure alarm transition**

Add to `core.js`:

```js
function transitionAlarm(records, index, status, confirmed) {
  if (!confirmed) return records.map(record => [...record]);
  return records.map((record, rowIndex) => rowIndex === index ? [...record.slice(0, 3), status] : [...record]);
}
```

- [ ] **Step 4: Implement accessible confirmation dialog**

Add one reusable dialog to `index.html`. `requestConfirmation({ title, message, confirmLabel })` returns a Promise, traps the pending action, supports cancel/Escape, and returns focus to the triggering button. Close alarm calls it before `transitionAlarm`; dispatch also asks for confirmation because it changes workflow ownership.

- [ ] **Step 5: Refresh dependent views after confirmation**

On confirmation, persist alarms, re-render both alarm tables, update the bell badge/open count, and show the alarm object in the toast. On cancellation, show a cancellation message without changing storage.

- [ ] **Step 6: Run tests and commit**

Run: `node --test tests/*.test.js`

```bash
git add core.js index.html app.js styles.css tests/core.test.js tests/structure.test.js
git commit -m "feat: confirm and synchronize alarm actions"
```

### Task 7: Full regression and browser acceptance

**Files:**
- Modify if needed: `index.html`, `app.js`, `styles.css`, tests

- [ ] **Step 1: Run the complete automated suite**

Run: `node --test tests/*.test.js`

Expected: 0 failures.

- [ ] **Step 2: Check source integrity**

Run: `git diff --check`

Expected: no output and exit code 0.

- [ ] **Step 3: Serve the prototype locally**

Run: `python3 -m http.server 8765 --directory .`

Open `http://127.0.0.1:8765/`, log in with `admin` / `12345`, and inspect all eight navigation pages.

- [ ] **Step 4: Verify the acceptance checklist**

Confirm: dashboard has no new tree; all seven other pages have the collapsible rail; history/alarm multi-select works; device changes update path/data; every visible button gives output; destructive actions support confirm/cancel; history wave has no close button; no unexpected horizontal overflow at 1647×1018 and 1280×800.

- [ ] **Step 5: Run tests again after any browser fixes**

Run: `node --test tests/*.test.js`

Expected: 0 failures.

- [ ] **Step 6: Commit final acceptance fixes**

```bash
git add index.html app.js core.js styles.css tests
git commit -m "test: verify device navigation and action closure"
```
