# QA Remediation Batch 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close the history export, trend linkage, diagnosis report, filtering, and phase-mask workflows identified in QA BUG-002, 005–009.

**Architecture:** Add pure validation and serialization helpers to `core.js`; keep UI state and Blob downloads in `app.js`; add stable controls and result regions to `index.html`; preserve the current dependency-free prototype.

**Tech Stack:** HTML, CSS, browser JavaScript, Canvas, localStorage, Blob/ObjectURL, Node test runner.

---

### Task 1: Real history exports

**Files:** Modify `core.js`, `app.js`, `tests/core.test.js`, `tests/structure.test.js`.

- [ ] Write failing tests for `serializeHistoryCsv(rows)`, `buildHistoryExportPayload(rows, filters)`, UTF-8 BOM, field order, empty rows, and stable download handler nodes.
- [ ] Run `node --test tests/core.test.js tests/structure.test.js`; expect missing helper failures.
- [ ] Implement CSV escaping and payload creation:

```js
function serializeHistoryCsv(rows) {
  const header = ["时间", "机组", "通道", "Qm(pC)", "Qavg(pC)", "Ntotal", "级别"];
  const quote = value => `"${String(value).replaceAll('"', '""')}"`;
  return `\uFEFF${[header, ...rows].map(row => row.map(quote).join(",")).join("\r\n")}`;
}
```

- [ ] In `app.js`, implement `downloadBlob(content, mime, filename)` with `Blob`, `URL.createObjectURL`, temporary anchor click, and URL revocation. Map CSV, JSON, and waveform export options to real downloads; block empty exports with a toast.
- [ ] Run full tests; expect zero failures.
- [ ] Commit: `git commit -am "feat: generate real history export files"`.

### Task 2: Trend target linkage and export

**Files:** Modify `index.html`, `app.js`, `core.js`, tests.

- [ ] Write failing tests for `trendUnitSelect`, `trendChannelSelect`, `trendTargetSummary`, `deriveTrendProfile(unit, channel)`, and an export handler.
- [ ] Verify RED with `node --test tests/*.test.js`.
- [ ] Add stable selects and derive deterministic profile values from unit/channel. Update current unit, aging factor, threshold scope, slope label, three summary rows, and chart seed in one `renderTrendTarget()` call.
- [ ] Export a JSON data file containing title, target, time range, unit, legend, slope, and summary values.
- [ ] Run tests and commit: `git commit -am "feat: link trend target and export data"`.

### Task 3: Consistent diagnosis report

**Files:** Modify `index.html`, `app.js`, `core.js`, tests.

- [ ] Write failing tests for `buildDiagnosisReport(context)` and DOM nodes for report target, reviewer, signature, date, preview, PDF/download, and print.
- [ ] Verify RED.
- [ ] Implement one diagnosis context object containing unit, channel, selected defect, conclusion, advice, reviewer, signature, date, and completion state. Disable the target selects while diagnosis is running; render cover and preview from this object.
- [ ] Generate a downloadable report file with a traceable filename. Use a minimal standards-compliant PDF Blob when supported; otherwise download HTML and state the format explicitly. Keep print bound to the same rendered report.
- [ ] Test target changes update cover/preview/file content; run full suite.
- [ ] Commit: `git commit -am "feat: synchronize diagnosis report context"`.

### Task 4: Filter validation and persistence

**Files:** Modify `index.html`, `app.js`, `core.js`, `styles.css`, tests.

- [ ] Write failing tests for `validateFilterConfig({ low, high, attenuation, bandwidth })`, including negative, non-number, low>=high, over-bandwidth, and valid input.
- [ ] Verify RED.
- [ ] Convert inputs to `type="number"` with stable IDs and unit labels. Implement validation returning `{ valid, values, error, field }`.
- [ ] Persist valid values to `pd-monitor.filter-config`; safely restore or fall back on corrupt data. Redraw the response curve with values and show before/after summary.
- [ ] Run tests and commit: `git commit -am "feat: validate and persist filter settings"`.

### Task 5: Phase-mask CRUD

**Files:** Modify `index.html`, `app.js`, `core.js`, `styles.css`, tests.

- [ ] Write failing tests for `validateMaskWindow(candidate, records)` covering 0–360, start<end, overlap, edit-self exclusion, plus stable add/edit/toggle/delete nodes.
- [ ] Verify RED.
- [ ] Add mask toolbar, rows with edit/toggle/delete, and one accessible modal. Require reason, validate intervals, and confirm deletion.
- [ ] Persist to `pd-monitor.phase-masks`; restore safely; redraw `maskPrpd` after each mutation.
- [ ] Run `node --test tests/*.test.js` and `git diff --check`.
- [ ] Commit: `git commit -am "feat: manage persistent phase mask windows"`.

### Task 6: Batch 1 browser acceptance

- [ ] Serve on port 8765 and verify history CSV/JSON/waveform download events, trend linkage, diagnosis report consistency, invalid/valid filter paths, and mask CRUD.
- [ ] Refresh and verify filter/masks persist while transient query/playback state resets.
- [ ] Run full tests again; expected zero failures.

