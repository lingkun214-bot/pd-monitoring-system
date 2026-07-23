# QA V1.2 Optimization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close QA findings NEW-001 through NEW-006 in the static PD monitoring prototype and make the NEW-007 production boundary explicit and verifiable.

**Architecture:** Keep the existing dependency-free HTML/CSS/JavaScript structure. Put deterministic time parsing, filtering, export serialization, operation-result normalization, and Shanghai timezone formatting in `core.js`; keep DOM state, navigation, rendering, and download behavior in `app.js`. Treat history filters as one immutable object shared by query and all export formats, while acquisition freshness is updated only by the simulated acquisition path.

**Tech Stack:** HTML5, CSS3, browser JavaScript, Node.js built-in test runner (`node --test`), localStorage.

---

## File map

- `core.js`: Pure functions for Shanghai time conversion, history range validation/filtering, export metadata, async result normalization, log formatting, and report-date defaults.
- `app.js`: History query UI state, quick ranges, shared exports, operation feedback, acquisition freshness, report initialization, log rendering, and system-to-device navigation.
- `index.html`: Datetime inputs, range feedback, quick-range controls, report-date default removal, read-only hardware overview, navigation action, and production-boundary wording.
- `styles.css`: Compact responsive layouts for the new history controls and read-only hardware panel.
- `tests/core.test.js`: Unit coverage for all pure rules and boundaries.
- `tests/structure.test.js`: DOM and source-structure regression checks.
- `README.md`: Deployment and production-boundary statement for NEW-007.

### Task 1: Add deterministic Shanghai time rules

**Files:**
- Modify: `core.js:1-170`
- Test: `tests/core.test.js`

- [ ] **Step 1: Write failing tests for parsing, formatting, range validation, and Shanghai today**

Append these tests to `tests/core.test.js`:

```js
test("parseShanghaiDateTime treats wall time as UTC+8", () => {
  assert.equal(core.parseShanghaiDateTime("2025-05-20T14:32"), Date.parse("2025-05-20T14:32:00+08:00"));
  assert.equal(core.parseShanghaiDateTime("2025-05-20 14:32:18"), Date.parse("2025-05-20T14:32:18+08:00"));
  assert.ok(Number.isNaN(core.parseShanghaiDateTime("bad-time")));
});

test("formatShanghaiDateTime always displays Asia/Shanghai and has an invalid fallback", () => {
  assert.equal(core.formatShanghaiDateTime("2025-05-20T06:32:18.000Z"), "2025-05-20 14:32:18");
  assert.equal(core.formatShanghaiDateTime("not-a-date"), "时间无效");
});

test("validateHistoryRange enforces order and a 90-day maximum", () => {
  assert.equal(core.validateHistoryRange("2025-05-01T00:00", "2025-05-20T23:59").valid, true);
  assert.deepEqual(core.validateHistoryRange("2025-05-21T00:00", "2025-05-20T23:59"), {
    valid: false,
    error: "开始时间不能晚于结束时间",
  });
  assert.deepEqual(core.validateHistoryRange("2025-01-01T00:00", "2025-05-20T23:59"), {
    valid: false,
    error: "单次查询时间跨度不能超过 90 天",
  });
  assert.deepEqual(core.validateHistoryRange("", "2025-05-20T23:59"), {
    valid: false,
    error: "请输入有效的开始和结束时间",
  });
});

test("todayInShanghai does not depend on the host timezone", () => {
  assert.equal(core.todayInShanghai("2026-07-21T16:30:00.000Z"), "2026-07-22");
});
```

- [ ] **Step 2: Run the focused tests and confirm failure**

Run:

```bash
node --test --test-name-pattern='Shanghai|validateHistoryRange|todayInShanghai' tests/core.test.js
```

Expected: FAIL because `parseShanghaiDateTime`, `formatShanghaiDateTime`, `validateHistoryRange`, and `todayInShanghai` are not exported.

- [ ] **Step 3: Add the pure time utilities to `core.js`**

Insert before `filterHistoryRows`:

```js
const HISTORY_TIME_ZONE = "Asia/Shanghai";
const MAX_HISTORY_RANGE_MS = 90 * 24 * 60 * 60 * 1000;

function parseShanghaiDateTime(value) {
  if (typeof value !== "string") return Number.NaN;
  const match = value.trim().match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})(?::(\d{2}))?$/);
  if (!match) return Number.NaN;
  const [, year, month, day, hour, minute, second = "00"] = match;
  const timestamp = Date.parse(`${year}-${month}-${day}T${hour}:${minute}:${second}+08:00`);
  const normalized = new Date(timestamp + 8 * 60 * 60 * 1000).toISOString().slice(0, 19);
  return normalized === `${year}-${month}-${day}T${hour}:${minute}:${second}` ? timestamp : Number.NaN;
}

function formatShanghaiDateTime(value, options = {}) {
  const timestamp = typeof value === "number" ? value : Date.parse(value);
  if (!Number.isFinite(timestamp)) return options.fallback || "时间无效";
  const parts = new Intl.DateTimeFormat("zh-CN", {
    timeZone: HISTORY_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    ...(options.dateOnly ? {} : { hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23" }),
  }).formatToParts(new Date(timestamp));
  const values = Object.fromEntries(parts.map(part => [part.type, part.value]));
  return options.dateOnly
    ? `${values.year}-${values.month}-${values.day}`
    : `${values.year}-${values.month}-${values.day} ${values.hour}:${values.minute}:${values.second}`;
}

function todayInShanghai(now = Date.now()) {
  const timestamp = typeof now === "number" ? now : Date.parse(now);
  return formatShanghaiDateTime(timestamp, { dateOnly: true });
}

function validateHistoryRange(start, end, maxRangeMs = MAX_HISTORY_RANGE_MS) {
  const startMs = parseShanghaiDateTime(start);
  const endMs = parseShanghaiDateTime(end);
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs)) {
    return { valid: false, error: "请输入有效的开始和结束时间" };
  }
  if (startMs > endMs) return { valid: false, error: "开始时间不能晚于结束时间" };
  if (endMs - startMs > maxRangeMs) return { valid: false, error: "单次查询时间跨度不能超过 90 天" };
  return { valid: true, startMs, endMs, start, end, timeZone: HISTORY_TIME_ZONE };
}
```

Add these names to `PDCore`:

```js
  HISTORY_TIME_ZONE,
  MAX_HISTORY_RANGE_MS,
  parseShanghaiDateTime,
  formatShanghaiDateTime,
  todayInShanghai,
  validateHistoryRange,
```

- [ ] **Step 4: Run the focused tests and confirm they pass**

Run:

```bash
node --test --test-name-pattern='Shanghai|validateHistoryRange|todayInShanghai' tests/core.test.js
```

Expected: 4 matching tests PASS.

- [ ] **Step 5: Commit the time-rule foundation**

```bash
git add core.js tests/core.test.js
git commit -m "feat: centralize Shanghai time rules"
```

### Task 2: Make history query and exports share one filter object

**Files:**
- Modify: `core.js:151-184`
- Test: `tests/core.test.js:224-255`

- [ ] **Step 1: Replace the old history tests with range-aware cases**

Use the following test cases in `tests/core.test.js`:

```js
test("filterHistoryRows applies time, device, and level together", () => {
  const rows = [
    ["2025-05-20 14:32:18", "3#机组", "A相", 1, 2, 3, "异常"],
    ["2025-05-20 13:55:21", "3#机组", "B相", 1, 2, 3, "异常"],
    ["2025-05-19 14:32:18", "3#机组", "A相", 1, 2, 3, "注意"],
  ];
  const filtered = core.filterHistoryRows(rows, {
    start: "2025-05-20T14:00",
    end: "2025-05-20T15:00",
    unitChannel: "3#机组 A相",
    level: "异常",
  });
  assert.deepEqual(filtered, [rows[0]]);
});

test("history export payload echoes the exact applied filters", () => {
  const filters = {
    start: "2025-05-20T14:00",
    end: "2025-05-20T15:00",
    unitChannel: "3#机组 A相",
    level: "异常",
    timeZone: "Asia/Shanghai",
  };
  const payload = core.buildHistoryExportPayload([["2025-05-20 14:32:18", "3#机组", "A相", 1, 2, 3, "异常"]], filters);
  assert.deepEqual(payload.filters, filters);
  assert.equal(payload.records.length, 1);
});

test("history CSV includes filter metadata before the table", () => {
  const csv = core.serializeHistoryCsv([["2025-05-20 14:32:18", "3#机组", "A相", 1, 2, 3, "异常"]], {
    start: "2025-05-20T14:00",
    end: "2025-05-20T15:00",
    unitChannel: "3#机组 A相",
    level: "异常",
    timeZone: "Asia/Shanghai",
  });
  assert.match(csv, /查询开始（UTC\+8）,"2025-05-20T14:00"/);
  assert.match(csv, /设备条件,"3#机组 A相"/);
  assert.match(csv, /"时间（UTC\+8）","机组","通道"/);
});
```

- [ ] **Step 2: Run the history tests and confirm failure**

Run:

```bash
node --test --test-name-pattern='history|filterHistoryRows' tests/core.test.js
```

Expected: FAIL because the old positional filter API ignores the time range and CSV metadata.

- [ ] **Step 3: Replace the history pure functions in `core.js`**

```js
function normalizeHistoryFilters(filters = {}) {
  return {
    start: filters.start || "",
    end: filters.end || "",
    unitChannel: filters.unitChannel || "全部机组",
    level: filters.level || "全部级别",
    timeZone: HISTORY_TIME_ZONE,
  };
}

function filterHistoryRows(rows, filters = {}) {
  const normalizedFilters = normalizeHistoryFilters(filters);
  const normalizedDevice = normalizedFilters.unitChannel.replace(/\s+/g, "");
  const range = validateHistoryRange(normalizedFilters.start, normalizedFilters.end);
  if (!range.valid) return [];
  return rows.filter(row => {
    const rowTime = parseShanghaiDateTime(row[0]);
    const matchesTime = rowTime >= range.startMs && rowTime <= range.endMs;
    const matchesDevice = normalizedFilters.unitChannel === "全部机组" || `${row[1]}${row[2]}` === normalizedDevice;
    const matchesLevel = normalizedFilters.level === "全部级别" || row[6] === normalizedFilters.level;
    return matchesTime && matchesDevice && matchesLevel;
  });
}

function serializeHistoryCsv(rows, filters = {}) {
  const normalizedFilters = normalizeHistoryFilters(filters);
  const header = ["时间（UTC+8）", "机组", "通道", "Qm(pC)", "Qavg(pC)", "Ntotal", "级别"];
  const quote = value => `"${String(value ?? "").replaceAll('"', '""')}"`;
  const metadata = [
    ["查询开始（UTC+8）", normalizedFilters.start],
    ["查询结束（UTC+8）", normalizedFilters.end],
    ["设备条件", normalizedFilters.unitChannel],
    ["告警级别", normalizedFilters.level],
    ["时区", normalizedFilters.timeZone],
  ];
  return `\uFEFF${[...metadata, [], header, ...rows].map(row => row.map(quote).join(",")).join("\r\n")}`;
}

function buildHistoryExportPayload(rows, filters = {}) {
  return {
    title: "局部放电历史数据",
    exportedAt: null,
    filters: normalizeHistoryFilters(filters),
    records: rows.map(row => ({
      time: row[0], unit: row[1], channel: row[2], qm: row[3], qavg: row[4], ntotal: row[5], level: row[6],
    })),
  };
}
```

Add `normalizeHistoryFilters` to `PDCore`.

- [ ] **Step 4: Run all core tests**

Run:

```bash
node --test tests/core.test.js
```

Expected: all core tests PASS after updating any old positional-call assertions to the filter-object signature.

- [ ] **Step 5: Commit history domain rules**

```bash
git add core.js tests/core.test.js
git commit -m "feat: apply history filters consistently"
```

### Task 3: Build a closed-loop history filter UI

**Files:**
- Modify: `index.html:181-215`
- Modify: `app.js:150-240, 820-890, 1658-1795`
- Modify: `styles.css`
- Test: `tests/structure.test.js:150-180`

- [ ] **Step 1: Add failing structure checks for the new controls**

Add to `tests/structure.test.js`:

```js
test("history page exposes bounded datetime and quick-range controls", () => {
  for (const id of ["historyStartTime", "historyEndTime", "historyRangeError", "historyRangeSummary"]) {
    assert.match(html, new RegExp(`id=["']${id}["']`));
  }
  for (const hours of ["24", "168", "720"]) {
    assert.match(html, new RegExp(`data-history-range-hours=["']${hours}["']`));
  }
  assert.match(app, /validateHistoryRange/);
  assert.match(app, /currentHistoryFilters/);
});

test("every history export uses currentHistoryFilters", () => {
  assert.match(app, /serializeHistoryCsv\(currentHistoryRows, currentHistoryFilters\)/);
  assert.match(app, /buildHistoryExportPayload\(currentHistoryRows, currentHistoryFilters\)/);
  assert.match(app, /filters: currentHistoryFilters/);
});
```

- [ ] **Step 2: Run the structure tests and confirm failure**

Run:

```bash
node --test --test-name-pattern='history page exposes|every history export' tests/structure.test.js
```

Expected: FAIL because the IDs and `currentHistoryFilters` do not exist.

- [ ] **Step 3: Replace the single history text field in `index.html`**

Use this control group inside the history query form:

```html
<div class="history-time-fields" role="group" aria-label="历史数据时间范围">
  <label>开始时间<input id="historyStartTime" type="datetime-local" value="2025-05-19T00:00"></label>
  <label>结束时间<input id="historyEndTime" type="datetime-local" value="2025-05-20T23:59"></label>
  <div class="history-quick-ranges" aria-label="快捷时间范围">
    <button class="ghost" type="button" data-history-range-hours="24">近24小时</button>
    <button class="ghost" type="button" data-history-range-hours="168">近7天</button>
    <button class="ghost" type="button" data-history-range-hours="720">近30天</button>
  </div>
</div>
<p id="historyRangeError" class="field-error" role="alert" hidden></p>
<p id="historyRangeSummary" class="helper-text">时间按 UTC+8（Asia/Shanghai）查询，单次最多 90 天。</p>
```

- [ ] **Step 4: Introduce one applied-filter state in `app.js`**

Place next to `currentHistoryRows`:

```js
const DEFAULT_HISTORY_FILTERS = Object.freeze({
  start: "2025-05-19T00:00",
  end: "2025-05-20T23:59",
  unitChannel: "全部机组",
  level: "全部级别",
  timeZone: PDCore.HISTORY_TIME_ZONE,
});
let currentHistoryFilters = { ...DEFAULT_HISTORY_FILTERS };

function readHistoryFilters() {
  return PDCore.normalizeHistoryFilters({
    start: $("#historyStartTime")?.value,
    end: $("#historyEndTime")?.value,
    unitChannel: $("#historyUnitChannelFilter")?.value,
    level: $("#historyLevelFilter")?.value,
  });
}

function setHistoryRangeError(message = "") {
  const error = $("#historyRangeError");
  if (!error) return;
  error.textContent = message;
  error.hidden = !message;
  ["historyStartTime", "historyEndTime"].forEach(id => $("#" + id)?.toggleAttribute("aria-invalid", Boolean(message)));
}

function formatHistoryInput(timestamp) {
  return PDCore.formatShanghaiDateTime(timestamp).replace(" ", "T").slice(0, 16);
}

function applyHistoryQuickRange(hours) {
  const latest = Math.max(...historyRows.map(row => PDCore.parseShanghaiDateTime(row[0])));
  $("#historyEndTime").value = formatHistoryInput(latest);
  $("#historyStartTime").value = formatHistoryInput(latest - hours * 60 * 60 * 1000);
  setHistoryRangeError();
}
```

- [ ] **Step 5: Replace query/reset/export behavior in `app.js`**

The query handler must validate before applying state:

```js
$("#historyQueryBtn")?.addEventListener("click", () => {
  const nextFilters = readHistoryFilters();
  const validation = PDCore.validateHistoryRange(nextFilters.start, nextFilters.end);
  if (!validation.valid) {
    setHistoryRangeError(validation.error);
    $("#historyNotice").textContent = validation.error;
    return;
  }
  stopHistoryPlayback();
  setHistoryRangeError();
  currentHistoryFilters = nextFilters;
  const filtered = PDCore.filterHistoryRows(historyRows, currentHistoryFilters);
  renderHistoryRows(filtered);
  $("#historyRangeSummary").textContent = `${currentHistoryFilters.start.replace("T", " ")} 至 ${currentHistoryFilters.end.replace("T", " ")} · UTC+8 · ${filtered.length} 条`;
  $("#historyNotice").textContent = `查询完成：${currentHistoryFilters.unitChannel} / ${currentHistoryFilters.level}，共 ${filtered.length} 条记录。`;
  showToast(`历史数据查询完成：${filtered.length} 条`);
});

$("#historyResetBtn")?.addEventListener("click", () => {
  stopHistoryPlayback();
  currentHistoryFilters = { ...DEFAULT_HISTORY_FILTERS };
  $("#historyStartTime").value = currentHistoryFilters.start;
  $("#historyEndTime").value = currentHistoryFilters.end;
  $("#historyUnitChannelFilter").value = currentHistoryFilters.unitChannel;
  $("#historyLevelFilter").value = currentHistoryFilters.level;
  setHistoryRangeError();
  renderHistoryRows(PDCore.filterHistoryRows(historyRows, currentHistoryFilters));
  $("#historyRangeSummary").textContent = "时间按 UTC+8（Asia/Shanghai）查询，单次最多 90 天。";
  $("#historyNotice").textContent = "查询条件已重置，请选择历史记录进行回放。";
  showToast("历史查询条件已重置");
});

$$('[data-history-range-hours]').forEach(button => {
  button.addEventListener("click", () => applyHistoryQuickRange(Number(button.dataset.historyRangeHours)));
});
```

In `renderHistoryRows`, keep replay availability synchronized with the filtered result without treating an empty result as an exception:

```js
function renderHistoryRows(rows) {
  currentHistoryRows = [...rows];
  const body = $("#historyRows");
  if (!body) return;
  body.innerHTML = rows.length
    ? rows.map((row, index) => `<tr data-history-index="${index}"><td>${row[0]}</td><td>${row[1]}</td><td>${row[2]}</td><td>${row[3]}</td><td>${row[4]}</td><td>${row[5]}</td><td>${badge(row[6])}</td><td><button class="ghost" data-action="replay" data-history-index="${index}">回放</button></td></tr>`).join("")
    : `<tr><td colspan="8" class="empty-state">当前条件下没有历史记录</td></tr>`;
  const hasRows = rows.length > 0;
  $("#historyPlayBtn").disabled = !hasRows;
  $("#historyPauseBtn").disabled = !hasRows;
  if (!hasRows) $("#exportNote").textContent = `当前条件：${currentHistoryFilters.start.replace("T", " ")} 至 ${currentHistoryFilters.end.replace("T", " ")} · ${currentHistoryFilters.unitChannel} · ${currentHistoryFilters.level}；无可导出记录。`;
}
```

Update all history exports:

```js
downloadBlob(PDCore.serializeHistoryCsv(currentHistoryRows, currentHistoryFilters), "text/csv;charset=utf-8", historyExportFilename("csv"));
const payload = PDCore.buildHistoryExportPayload(currentHistoryRows, currentHistoryFilters);
const waveformPayload = {
  title: "局部放电脉冲波形",
  target: currentHistoryRows[0],
  pulse: selected,
  filters: currentHistoryFilters,
  exportedAt: new Date().toISOString(),
};
```

- [ ] **Step 6: Add compact responsive styles**

Append to `styles.css`:

```css
.history-time-fields { display:flex; flex-wrap:wrap; gap:8px; align-items:end; }
.history-time-fields label { min-width:178px; }
.history-quick-ranges { display:flex; gap:6px; flex-wrap:wrap; }
.field-error { color:#ff7272; margin:6px 0 0; }
.helper-text { color:#8fb6dc; margin:6px 0 0; font-size:12px; }
@media (max-width: 900px) {
  .history-time-fields label { flex:1 1 210px; }
  .history-quick-ranges { flex:1 1 100%; }
}
```

- [ ] **Step 7: Run history unit and structure tests**

Run:

```bash
node --test --test-name-pattern='history|filterHistoryRows' tests/core.test.js tests/structure.test.js
```

Expected: all matching tests PASS.

- [ ] **Step 8: Commit the history UI closure**

```bash
git add index.html app.js styles.css tests/structure.test.js
git commit -m "feat: close history query and export flow"
```

### Task 4: Separate acquisition freshness from operation feedback

**Files:**
- Modify: `core.js:380-420`
- Modify: `app.js:79, 280-316, 447-457, 1780-1790`
- Modify: `index.html` footer freshness label
- Test: `tests/core.test.js`
- Test: `tests/structure.test.js:313-320`

- [ ] **Step 1: Add failing tests for operation-result normalization**

Add to `tests/core.test.js`:

```js
test("normalizeOperationResult accepts only successful result contracts", () => {
  assert.deepEqual(core.normalizeOperationResult({ ok: true, data: 3 }), { ok: true, data: 3, error: "" });
  assert.deepEqual(core.normalizeOperationResult({ ok: false, error: "保存失败" }), { ok: false, data: null, error: "保存失败" });
  assert.deepEqual(core.normalizeOperationResult(false), { ok: false, data: null, error: "操作未完成" });
  assert.deepEqual(core.normalizeOperationResult(true), { ok: true, data: true, error: "" });
  assert.deepEqual(core.normalizeOperationResult(undefined), { ok: false, data: null, error: "操作未返回结果" });
});
```

Replace the old shared-feedback structure assertion with:

```js
test("operation feedback cannot refresh acquisition freshness", () => {
  const runAction = app.match(/async function runButtonAction[\s\S]*?\n}/)?.[0] || "";
  const appendLog = app.match(/function appendSystemLog[\s\S]*?\n}/)?.[0] || "";
  assert.match(app, /function markAcquisitionUpdated\(/);
  assert.doesNotMatch(runAction, /markAcquisitionUpdated/);
  assert.doesNotMatch(appendLog, /markAcquisitionUpdated/);
  assert.match(runAction, /normalizeOperationResult/);
});
```

- [ ] **Step 2: Run focused tests and confirm failure**

Run:

```bash
node --test --test-name-pattern='normalizeOperationResult|operation feedback' tests/core.test.js tests/structure.test.js
```

Expected: FAIL because the normalizer and `markAcquisitionUpdated` do not exist.

- [ ] **Step 3: Add the result-contract normalizer to `core.js`**

```js
function normalizeOperationResult(result) {
  if (result === undefined) return { ok: false, data: null, error: "操作未返回结果" };
  if (result === false) return { ok: false, data: null, error: "操作未完成" };
  if (result === true) return { ok: true, data: true, error: "" };
  if (!result || typeof result !== "object" || typeof result.ok !== "boolean") {
    return { ok: false, data: null, error: "操作结果格式无效" };
  }
  return result.ok
    ? { ok: true, data: result.data ?? null, error: "" }
    : { ok: false, data: null, error: result.error || "操作失败，请重试" };
}
```

Export `normalizeOperationResult` through `PDCore`.

- [ ] **Step 4: Rename freshness state and make `runButtonAction` contract-aware**

Change the state and renderer in `app.js`:

```js
let lastAcquisitionUpdatedAt = new Date().toISOString();

function markAcquisitionUpdated(timestamp = new Date().toISOString()) {
  lastAcquisitionUpdatedAt = timestamp;
  renderFreshness();
}

function renderFreshness() {
  const label = $("#lastDataUpdated");
  const warning = $("#staleDataWarning");
  if (!label || !warning) return;
  const freshness = PDCore.getFreshnessState(lastAcquisitionUpdatedAt, Date.now(), DATA_STALE_THRESHOLD_MS);
  if (freshness.state === "unknown") { label.textContent = "采集数据：未知"; warning.hidden = false; return; }
  const seconds = Math.floor(freshness.ageMs / 1000);
  const ageLabel = seconds < 5 ? "刚刚" : seconds < 60 ? `${seconds} 秒前` : `${Math.floor(seconds / 60)} 分钟前`;
  label.textContent = `采集数据：${ageLabel}`;
  warning.hidden = freshness.state !== "stale";
}

async function runButtonAction(button, busyText, operation) {
  if (!button || button.disabled) return { ok: false, error: "按钮当前不可用" };
  const original = button.textContent;
  const panel = button.closest(".panel");
  button.disabled = true;
  button.textContent = busyText;
  setPanelState(panel, "loading", busyText);
  try {
    const result = PDCore.normalizeOperationResult(await operation());
    if (!result.ok) throw new Error(result.error);
    setPanelState(panel, "ready");
    return result;
  } catch (error) {
    setPanelState(panel, "error", error?.message || "操作失败，请重试", () => runButtonAction(button, busyText, operation));
    return { ok: false, error: error?.message || "操作失败，请重试" };
  } finally {
    button.disabled = false;
    button.textContent = original;
  }
}
```

Remove the freshness call from `appendSystemLog`. Change the footer’s initial text to:

```html
<span id="lastDataUpdated">采集数据：刚刚</span>
```

- [ ] **Step 5: Make each async caller return an explicit result**

Use these handler bodies:

```js
$("#exportTrendChartBtn")?.addEventListener("click", event => runButtonAction(event.currentTarget, "生成中…", async () => {
  exportTrendData();
  showToast(`已导出 ${currentTrendProfile.unit} ${currentTrendProfile.channel} 趋势数据`);
  return { ok: true };
}));

$("#applyFilterBtn")?.addEventListener("click", event => runButtonAction(event.currentTarget, "应用中…", async () => {
  if (!applyFilterConfig()) return { ok: false, error: "滤波参数校验或保存失败" };
  showToast(`滤波器已应用至 ${PDCore.formatDevicePath(deviceContext)}`);
  return { ok: true };
}));

$("#exportDiagPdf")?.addEventListener("click", event => runButtonAction(event.currentTarget, "生成中…", async () => {
  if (!exportDiagnosisReport()) return { ok: false, error: "请先完成诊断并确认报告信息" };
  showToast("诊断报告已下载");
  return { ok: true };
}));
```

- [ ] **Step 6: Run the focused tests and full suite**

Run:

```bash
node --test --test-name-pattern='normalizeOperationResult|operation feedback' tests/core.test.js tests/structure.test.js
node --test tests/*.test.js
```

Expected: focused tests PASS; full suite PASS.

- [ ] **Step 7: Commit freshness and result-contract changes**

```bash
git add core.js app.js index.html tests/core.test.js tests/structure.test.js
git commit -m "fix: separate acquisition freshness from actions"
```

### Task 5: Fix log timezone and report-date defaults

**Files:**
- Modify: `core.js:368-375`
- Modify: `app.js:470-500, 1115-1160, 2215-2235`
- Modify: `index.html:364, system log table headings`
- Test: `tests/core.test.js:433-445`
- Test: `tests/structure.test.js`

- [ ] **Step 1: Add failing log and report-date assertions**

Replace the log CSV test and add a structure test:

```js
test("serializeSystemLogsCsv exports UTC timestamps as UTC+8", () => {
  const csv = core.serializeSystemLogsCsv([{ time: "2025-05-20T06:32:18.000Z", operator: "admin", action: "配置", detail: "完成" }]);
  assert.match(csv, /^\uFEFF时间（UTC\+8）,操作用户,动作,详情/);
  assert.match(csv, /"2025-05-20 14:32:18"/);
});
```

```js
test("report date is initialized from Shanghai today instead of fixed HTML", () => {
  assert.doesNotMatch(html, /id=["']diagReportDate["'][^>]*value=/);
  assert.match(app, /diagReportDate[^\n]*todayInShanghai|todayInShanghai[^\n]*diagReportDate/);
  assert.match(app, /diagReportDateSource/);
  assert.match(html, /时间（UTC\+8）/);
});

test("diagnosis report records whether its date was defaulted or edited", () => {
  const report = core.buildDiagnosisReport({ date: "2026-07-22", dateSource: "user-modified" });
  assert.equal(report.date, "2026-07-22");
  assert.equal(report.dateSource, "user-modified");
});
```

- [ ] **Step 2: Run focused tests and confirm failure**

Run:

```bash
node --test --test-name-pattern='UTC timestamps|report date' tests/core.test.js tests/structure.test.js
```

Expected: FAIL on raw UTC CSV output and the fixed date value.

- [ ] **Step 3: Format log export in `core.js`**

```js
function serializeSystemLogsCsv(logs = []) {
  const quote = value => `"${String(value ?? "").replaceAll('"', '""')}"`;
  return `\uFEFF时间（UTC+8）,操作用户,动作,详情\r\n${logs.map(log => [
    formatShanghaiDateTime(log.time), log.operator, log.action, log.detail,
  ].map(quote).join(",")).join("\r\n")}`;
}
```

- [ ] **Step 4: Use the same formatter in log list, detail, filename, and report initialization**

In `renderSystemLogs` and `selectSystemLog`, replace raw `slice` formatting with:

```js
PDCore.formatShanghaiDateTime(log.time)
```

Use Shanghai today for the CSV filename:

```js
`system-logs-${PDCore.todayInShanghai()}.csv`
```

Remove `value="2026-07-20"` from `diagReportDate` in `index.html`. Add before `updateDiagnosisTarget()` in `DOMContentLoaded`:

```js
const reportDate = $("#diagReportDate");
if (reportDate && !reportDate.value) {
  reportDate.value = PDCore.todayInShanghai();
  reportDate.dataset.source = "system-default";
}
```

Track user edits next to the existing report input listeners:

```js
$("#diagReportDate")?.addEventListener("input", event => {
  event.currentTarget.dataset.source = "user-modified";
  renderDiagnosisReport();
});
```

Remove `diagReportDate` from the existing `['diagReviewNote', 'diagReviewer', 'diagSignature', 'diagReportDate']` listener array so the date has one input handler.

Use this fallback in `renderDiagnosisReport`:

```js
date: $("#diagReportDate")?.value || PDCore.todayInShanghai(),
dateSource: $("#diagReportDate")?.dataset.source || "system-default",
```

In `buildDiagnosisReport` inside `core.js`, preserve the source in the normalized report object:

```js
dateSource: context.dateSource === "user-modified" ? "user-modified" : "system-default",
```

Change visible log headings and detail labels to `时间（UTC+8）`.

- [ ] **Step 5: Run focused and full tests**

Run:

```bash
node --test --test-name-pattern='UTC timestamps|report date' tests/core.test.js tests/structure.test.js
node --test tests/*.test.js
```

Expected: all tests PASS.

- [ ] **Step 6: Commit timezone corrections**

```bash
git add core.js app.js index.html tests/core.test.js tests/structure.test.js
git commit -m "fix: display operational dates in Shanghai time"
```

### Task 6: Make device management the single hardware edit entry

**Files:**
- Modify: `index.html:424-455`
- Modify: `app.js:500-620, 398-430, 1848-1860, 2215-2235`
- Modify: `styles.css`
- Test: `tests/structure.test.js:265-290`

- [ ] **Step 1: Add failing structure checks for read-only hardware configuration**

Add to `tests/structure.test.js`:

```js
test("system hardware configuration is read-only and links to device management", () => {
  for (const id of ["systemHardwareRows", "goDeviceManagementBtn", "systemHardwareHint"]) {
    assert.match(html, new RegExp(`id=["']${id}["']`));
  }
  const systemConfig = html.match(/<section class="panel sys-pane" id="sys-config">[\s\S]*?<\/section>/)?.[0] || "";
  assert.doesNotMatch(systemConfig, /<input|<select|contenteditable/);
  assert.match(app, /renderSystemHardwareOverview/);
  assert.match(app, /goDeviceManagementBtn/);
  assert.match(app, /setPage\("device"\)/);
  assert.match(app, /设备管理入口不可用/);
});
```

- [ ] **Step 2: Run the focused test and confirm failure**

Run:

```bash
node --test --test-name-pattern='system hardware configuration' tests/structure.test.js
```

Expected: FAIL because the read-only rows and jump button are absent.

- [ ] **Step 3: Replace the system hardware panel in `index.html`**

```html
<section class="panel sys-pane" id="sys-config">
  <div class="panel-title row">
    <span>硬件配置（只读）</span>
    <button id="goDeviceManagementBtn" class="primary" type="button">前往设备管理</button>
  </div>
  <p id="systemHardwareHint" class="helper-text">本页仅汇总当前生效配置；新增、编辑和保存统一在“设备管理”完成。</p>
  <div class="table-wrap">
    <table class="data-table">
      <thead><tr><th>通道ID</th><th>机组</th><th>名称</th><th>类型</th><th>采样率</th><th>状态</th></tr></thead>
      <tbody id="systemHardwareRows"></tbody>
    </table>
  </div>
</section>
```

- [ ] **Step 4: Render the overview from the same `devices` array**

Add beside `renderDeviceRows`:

```js
function renderSystemHardwareOverview() {
  const rows = $("#systemHardwareRows");
  if (!rows) return;
  rows.innerHTML = devices.map(record => `<tr>
    <td>${escapeHTML(record.id)}</td>
    <td>${escapeHTML(record.unit)}</td>
    <td>${escapeHTML(record.name)}</td>
    <td>${escapeHTML(record.type)}</td>
    <td>${escapeHTML(record.sampleRate)}</td>
    <td>${badge(record.status === "启用" ? "正常" : "注意")}</td>
  </tr>`).join("");
}
```

Call `renderSystemHardwareOverview()` from `initDeviceManagement()` and after the successful `devices = nextDevices` assignment in `saveCurrentDeviceDraft()`.

- [ ] **Step 5: Add closed-loop navigation to the unique editor**

Add in `initNav()`:

```js
$("#goDeviceManagementBtn")?.addEventListener("click", () => {
  const deviceNav = $('#mainNav .nav-btn[data-page="device"]');
  const deviceRows = $("#deviceRows");
  if (!deviceNav || !deviceRows) {
    showToast("设备管理入口不可用，请刷新页面后重试");
    return;
  }
  setPage("device");
  requestAnimationFrame(() => {
    const selectedRow = $("#deviceRows tr.selected");
    (selectedRow || deviceRows).focus();
  });
});
```

Append the layout rule:

```css
#sys-config .panel-title.row { justify-content:space-between; gap:12px; }
#sys-config .table-wrap { overflow:auto; }
```

- [ ] **Step 6: Run focused and full tests**

Run:

```bash
node --test --test-name-pattern='system hardware configuration|device management' tests/structure.test.js
node --test tests/*.test.js
```

Expected: all tests PASS.

- [ ] **Step 7: Commit the single-entry hardware flow**

```bash
git add index.html app.js styles.css tests/structure.test.js
git commit -m "fix: unify hardware configuration entry"
```

### Task 7: Make the NEW-007 production boundary explicit

**Files:**
- Modify: `index.html` login/system-user notices
- Modify: `README.md`
- Test: `tests/structure.test.js`

- [ ] **Step 1: Add a failing production-boundary test**

Add to `tests/structure.test.js`:

```js
test("prototype explicitly disclaims production authentication and persistence", () => {
  for (const phrase of ["演示认证", "停用演示用户不会改变固定 admin 登录", "localStorage", "本地日志可被修改", "生产环境必须接入后端身份认证", "RBAC", "会话控制", "不可篡改审计", "服务端持久化"]) {
    assert.match(`${html}\n${read("README.md")}`, new RegExp(phrase));
  }
});
```

- [ ] **Step 2: Run the boundary test and confirm failure**

Run:

```bash
node --test --test-name-pattern='prototype explicitly disclaims' tests/structure.test.js
```

Expected: FAIL if any required boundary phrase is missing.

- [ ] **Step 3: Add exact boundary wording to the interface and README**

Use this visible notice near login or system users:

```html
<p class="prototype-boundary" role="note">本页为演示认证：停用演示用户不会改变固定 admin 登录；配置与本地日志保存在当前浏览器 localStorage，且本地日志可被修改，不能作为生产审计证据。生产环境必须接入后端身份认证、RBAC、会话控制、不可篡改审计与服务端持久化。</p>
```

Add this section to `README.md`:

```md
## 生产化边界（NEW-007）

当前版本是可交互静态原型：登录校验、用户、设备配置、阈值、报警处置和系统日志均为前端演示逻辑，部分状态写入当前浏览器 `localStorage`。停用演示用户不会改变固定 `admin` 登录，本地日志可被修改，不能作为生产审计证据。生产环境必须接入后端身份认证、RBAC、会话控制、不可篡改审计、可靠服务端持久化、真实采集接口及统一时间同步；不得直接将本原型作为生产系统部署。
```

- [ ] **Step 4: Run the boundary test and full suite**

Run:

```bash
node --test --test-name-pattern='prototype explicitly disclaims' tests/structure.test.js
node --test tests/*.test.js
```

Expected: boundary test PASS and full suite PASS.

- [ ] **Step 5: Commit the boundary documentation**

```bash
git add index.html README.md tests/structure.test.js
git commit -m "docs: clarify prototype production boundary"
```

### Task 8: Complete visual and interaction verification

**Files:**
- Verify: `index.html`
- Verify: `README.md`
- Verify: `tests/core.test.js`
- Verify: `tests/structure.test.js`

- [ ] **Step 1: Run the complete automated suite**

Run:

```bash
node --test tests/*.test.js
```

Expected: zero failures and zero skipped tests.

- [ ] **Step 2: Check source for stale failure patterns**

Run:

```bash
rg -n 'new Date\(\)\.toISOString\(\)\.slice\(0, 10\)|log\.time\.slice|markDataUpdated|id="diagReportDate"[^>]+value=|时间范围<input' app.js index.html core.js
```

Expected: no matches.

- [ ] **Step 3: Serve the prototype locally**

Run:

```bash
python3 -m http.server 8765
```

Expected: server listens on `http://127.0.0.1:8765/`; open `/index.html` in the in-app browser.

- [ ] **Step 4: Verify the history flow manually**

Use account `admin` and password `12345`, then verify:

1. An inverted or over-90-day range shows an inline error and leaves the applied table/export state unchanged.
2. Each quick range updates both datetime fields; querying updates row count and visible summary.
3. An empty result disables practical export by showing “当前查询没有数据，无法导出”.
4. CSV, JSON, and waveform JSON contain the same start, end, device, level, and timezone conditions.
5. Replay still animates the PRPD chart for the selected filtered row.

- [ ] **Step 5: Verify freshness, timezone, report, and hardware flow manually**

Verify:

1. Saving a filter/device configuration changes operation feedback and system logs but does not reset “采集数据” freshness.
2. Failed validation never shows a success toast or ready-state result.
3. System log list, detail, and CSV show UTC+8 consistently.
4. Diagnosis report date defaults to the current Asia/Shanghai date and remains user-editable.
5. System Settings → Hardware Configuration is read-only; “前往设备管理” opens Device Management and focuses its selected row.
6. The production-boundary notice is visible and readable at desktop and narrow widths.
7. Repeat layout checks at 1366×768 and 1920×1080; no new horizontal page overflow is present.

- [ ] **Step 6: Inspect the final diff for scope and unrelated changes**

Run:

```bash
git status --short
git diff --check
git diff --stat b986865..HEAD
```

Expected: no whitespace errors; QA commits contain only `core.js`, `app.js`, `index.html`, `styles.css`, `README.md`, `tests/core.test.js`, and `tests/structure.test.js`. Preserve any pre-existing unrelated working-tree edits without staging them.
