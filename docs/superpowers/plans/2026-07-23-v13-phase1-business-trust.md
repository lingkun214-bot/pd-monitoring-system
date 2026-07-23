# V1.3 Phase 1 Business Trust Remediation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the prototype's measurement units, threshold levels, sample timestamps, trend results, and diagnosis reports internally consistent and auditable for the V1.3 TEAM-001/002/003/004/008/012/013 findings.

**Architecture:** Put calibration, display-policy, classification, and diagnosis decisions in pure `core.js` functions. Make `app.js` consume those functions through one selected-asset context and render a shared trust strip across relevant pages. Keep the prototype's frozen sample dataset explicit, preserve front-end-only behavior, and document production integration boundaries instead of simulating production identity, storage, acquisition, or algorithms.

**Tech Stack:** Static HTML/CSS/JavaScript, Node.js built-in test runner, in-app browser regression testing.

---

## Task 1: Add the canonical measurement context and display policy

**Files:**
- Modify: `core.js`
- Modify: `tests/core.test.js`

- [ ] **Step 1: Write failing tests for calibrated, missing, expired, and unknown assets**

Append tests that define the canonical contract:

```js
test("getMeasurementContext returns a cloned calibrated context for the default asset", () => {
  const first = core.getMeasurementContext("channel-3-a");
  const second = core.getMeasurementContext("channel-3-a");
  assert.deepEqual(first, {
    assetId: "channel-3-a",
    unit: "3# 机组",
    channel: "A相",
    sensor: "UHF",
    calibration: {
      state: "valid",
      certificateNo: "CAL-PD-2025-003A",
      calibratedAt: "2025-04-18",
      validUntil: "2026-04-17",
      uncertainty: "±5.0%",
      engineeringUnit: "pC",
      rawUnit: "mV",
    },
    qualityCode: "Q1",
    sampleAsOf: core.SAMPLE_AS_OF,
    datasetId: "PD-SAMPLE-20250520-001",
  });
  assert.notEqual(first, second);
  first.calibration.state = "expired";
  assert.equal(second.calibration.state, "valid");
});

test("deriveDisplayPolicy never falls back to pC for uncalibrated data", () => {
  const missing = core.deriveDisplayPolicy(core.getMeasurementContext("channel-2-b"));
  const expired = core.deriveDisplayPolicy(core.getMeasurementContext("channel-4-a"));
  assert.deepEqual(
    { allowed: missing.allowed, unit: missing.unit, level: missing.level },
    { allowed: false, unit: "mV", level: "数据受限" },
  );
  assert.deepEqual(
    { allowed: expired.allowed, unit: expired.unit, level: expired.level },
    { allowed: false, unit: "dBm", level: "数据受限" },
  );
  assert.deepEqual(core.deriveDisplayPolicy(null), {
    allowed: false,
    unit: "—",
    level: "数据不可用",
    reason: "未找到测量对象",
  });
});
```

- [ ] **Step 2: Run the focused tests and confirm the missing API failure**

Run:

```bash
node --test --test-name-pattern="MeasurementContext|display policy" tests/core.test.js
```

Expected: FAIL because `getMeasurementContext`, `deriveDisplayPolicy`, and `SAMPLE_AS_OF` do not exist.

- [ ] **Step 3: Implement immutable source data and clone-on-read**

Add before `deriveTrendProfile`:

```js
const SAMPLE_AS_OF = "2025-05-20T14:32:18+08:00";
const SAMPLE_DATASET_ID = "PD-SAMPLE-20250520-001";

function freezeMeasurementContext(assetId, unit, channel, calibration, qualityCode) {
  return Object.freeze({
    assetId,
    unit,
    channel,
    sensor: "UHF",
    calibration: Object.freeze({
      engineeringUnit: "pC",
      rawUnit: "mV",
      ...calibration,
    }),
    qualityCode,
    sampleAsOf: SAMPLE_AS_OF,
    datasetId: SAMPLE_DATASET_ID,
  });
}

const MISSING_CALIBRATION = Object.freeze({
  state: "missing",
  certificateNo: "—",
  calibratedAt: "—",
  validUntil: "—",
  uncertainty: "—",
});
const EXPIRED_CALIBRATION = Object.freeze({
  state: "expired",
  certificateNo: "CAL-PD-2023-004A",
  calibratedAt: "2023-03-01",
  validUntil: "2024-02-29",
  uncertainty: "±8.0%",
  rawUnit: "dBm",
});

const MEASUREMENT_CONTEXTS = Object.freeze({
  "channel-1-a": freezeMeasurementContext("channel-1-a", "1# 机组", "A相", MISSING_CALIBRATION, "Q3"),
  "channel-1-b": freezeMeasurementContext("channel-1-b", "1# 机组", "B相", MISSING_CALIBRATION, "Q3"),
  "channel-2-a": freezeMeasurementContext("channel-2-a", "2# 机组", "A相", MISSING_CALIBRATION, "Q3"),
  "channel-2-b": freezeMeasurementContext("channel-2-b", "2# 机组", "B相", MISSING_CALIBRATION, "Q3"),
  "channel-3-a": freezeMeasurementContext("channel-3-a", "3# 机组", "A相", {
    state: "valid",
    certificateNo: "CAL-PD-2025-003A",
    calibratedAt: "2025-04-18",
    validUntil: "2026-04-17",
    uncertainty: "±5.0%",
  }, "Q1"),
  "channel-3-b": freezeMeasurementContext("channel-3-b", "3# 机组", "B相", MISSING_CALIBRATION, "Q3"),
  "channel-3-c": freezeMeasurementContext("channel-3-c", "3# 机组", "C相", MISSING_CALIBRATION, "Q3"),
  "channel-4-a": freezeMeasurementContext("channel-4-a", "4# 机组", "A相", EXPIRED_CALIBRATION, "Q2"),
});

function getMeasurementContext(assetId) {
  const source = MEASUREMENT_CONTEXTS[assetId];
  if (!source) return null;
  return { ...source, calibration: { ...source.calibration } };
}

function deriveDisplayPolicy(context) {
  if (!context) return { allowed: false, unit: "—", level: "数据不可用", reason: "未找到测量对象" };
  if (context.calibration.state !== "valid") {
    const reason = context.calibration.state === "expired" ? "校准已过期" : "缺少校准证书";
    return { allowed: false, unit: context.calibration.rawUnit, level: "数据受限", reason };
  }
  return { allowed: true, unit: context.calibration.engineeringUnit, level: null, reason: "校准有效" };
}
```

Export `SAMPLE_AS_OF`, `SAMPLE_DATASET_ID`, `getMeasurementContext`, and `deriveDisplayPolicy` from `PDCore`.

- [ ] **Step 4: Run the focused tests**

Run:

```bash
node --test --test-name-pattern="MeasurementContext|display policy" tests/core.test.js
```

Expected: PASS.

- [ ] **Step 5: Commit the context contract**

```bash
git add core.js tests/core.test.js
git commit -m "feat: add auditable measurement context"
```

## Task 2: Make one classifier drive values, levels, and trend units

**Files:**
- Modify: `core.js`
- Modify: `tests/core.test.js`

- [ ] **Step 1: Write failing classification tests**

```js
test("classifyMeasurement applies one explicit threshold rule", () => {
  const policy = core.deriveDisplayPolicy(core.getMeasurementContext("channel-3-a"));
  const thresholds = { attention: 0.3, abnormal: 1, danger: 3 };
  assert.equal(core.classifyMeasurement(0.18, thresholds, policy).level, "正常");
  assert.equal(core.classifyMeasurement(0.3, thresholds, policy).level, "注意");
  assert.equal(core.classifyMeasurement(1, thresholds, policy).level, "异常");
  assert.equal(core.classifyMeasurement(3, thresholds, policy).level, "危险");
  assert.equal(core.classifyMeasurement(3, thresholds, policy).ruleVersion, "PD-QM-DEMO-1.0");
});

test("classifyMeasurement refuses engineering levels for limited data", () => {
  const policy = core.deriveDisplayPolicy(core.getMeasurementContext("channel-2-b"));
  assert.deepEqual(core.classifyMeasurement(0.62, { attention: 0.3, abnormal: 1, danger: 3 }, policy), {
    value: 0.62,
    unit: "mV",
    level: "数据受限",
    ruleVersion: "PD-QM-DEMO-1.0",
    reason: "缺少校准证书",
  });
});

test("deriveTrendProfile carries the selected asset display unit and classification", () => {
  const calibrated = core.deriveTrendProfile("3# 机组", "A相", "channel-3-a");
  const limited = core.deriveTrendProfile("2# 机组", "B相", "channel-2-b");
  assert.equal(calibrated.slopeUnit, "pC/天");
  assert.ok(calibrated.summary.every(item => item.ruleVersion === "PD-QM-DEMO-1.0"));
  assert.equal(limited.slopeUnit, "mV/天");
  assert.ok(limited.summary.every(item => item.level === "数据受限"));
});
```

- [ ] **Step 2: Confirm the new classifier tests fail**

Run:

```bash
node --test --test-name-pattern="classifyMeasurement|selected asset display unit" tests/core.test.js
```

Expected: FAIL because the unified classifier and trend metadata are absent.

- [ ] **Step 3: Implement finite validation and exclusive threshold boundaries**

```js
function classifyMeasurement(value, thresholds, displayPolicy, ruleVersion = "PD-QM-DEMO-1.0") {
  const numericValue = Number(value);
  if (!Number.isFinite(numericValue)) {
    return { value: null, unit: displayPolicy?.unit || "—", level: "数据不可用", ruleVersion, reason: "测量值无效" };
  }
  if (!displayPolicy?.allowed) {
    return {
      value: numericValue,
      unit: displayPolicy?.unit || "—",
      level: displayPolicy?.level || "数据受限",
      ruleVersion,
      reason: displayPolicy?.reason || "不可进行工程量判定",
    };
  }
  const { attention, abnormal, danger } = thresholds;
  const level = numericValue >= danger ? "危险"
    : numericValue >= abnormal ? "异常"
      : numericValue >= attention ? "注意" : "正常";
  return { value: numericValue, unit: displayPolicy.unit, level, ruleVersion, reason: "按阈值规则判定" };
}
```

Refactor `deriveTrendProfile(unit, channel, assetId)` so every summary row calls `classifyMeasurement`, returns `unit`, `slopeUnit`, `ruleVersion`, and maps assessment from that returned level. Do not retain independent `>= 0.7` / `>= 0.3` status branches.

- [ ] **Step 4: Run all core tests**

Run:

```bash
node --test tests/core.test.js
```

Expected: PASS, including the pre-existing deterministic trend tests.

- [ ] **Step 5: Commit the unified decision rule**

```bash
git add core.js tests/core.test.js
git commit -m "fix: unify measurement and trend classification"
```

## Task 3: Render a shared measurement trust strip and normalize page values

**Files:**
- Modify: `index.html`
- Modify: `app.js`
- Modify: `styles.css`
- Modify: `tests/structure.test.js`

- [ ] **Step 1: Write failing structure tests for one reusable trust strip**

```js
test("measurement pages expose one shared auditable trust strip", () => {
  assert.match(html, /id="measurementTrustBar"/);
  assert.match(html, /id="trustAssetId"/);
  assert.match(html, /id="trustCalibration"/);
  assert.match(html, /id="trustCertificate"/);
  assert.match(html, /id="trustQuality"/);
  assert.match(html, /id="trustDisplayUnit"/);
  assert.match(html, /id="trustSampleAsOf"/);
  assert.match(app, /function renderMeasurementTrustBar/);
  assert.match(app, /PDCore\.getMeasurementContext/);
  assert.match(app, /PDCore\.deriveDisplayPolicy/);
});

test("dashboard and trend values do not hardcode contradictory pC status", () => {
  assert.doesNotMatch(html, /采集数据：刚刚/);
  assert.match(app, /currentMeasurementContext/);
  assert.match(app, /currentDisplayPolicy/);
  assert.match(app, /currentTrendProfile\.slopeUnit/);
});
```

- [ ] **Step 2: Confirm structure tests fail**

Run:

```bash
node --test --test-name-pattern="trust strip|contradictory pC" tests/structure.test.js
```

Expected: FAIL because the strip and shared context state do not exist.

- [ ] **Step 3: Add the stable trust-strip markup**

Insert under the existing device path/header and above the active page:

```html
<section class="measurement-trust-bar" id="measurementTrustBar" aria-label="测量可信状态">
  <span>对象 <strong id="trustAssetId">channel-3-a</strong></span>
  <span>校准 <strong id="trustCalibration">有效</strong></span>
  <span>证书 <strong id="trustCertificate">CAL-PD-2025-003A</strong></span>
  <span>质量 <strong id="trustQuality">Q1</strong></span>
  <span>显示单位 <strong id="trustDisplayUnit">pC</strong></span>
  <span>样例截止 <strong id="trustSampleAsOf">2025-05-20 14:32:18 UTC+8</strong></span>
</section>
```

The strip must be hidden only on pages without a measurement target (`alarms`, `devices`, `settings`). It remains visible on dashboard, history, trend, diagnosis, and processing.

- [ ] **Step 4: Add selected-context state and a single renderer**

```js
let selectedAssetId = "channel-3-a";
let currentMeasurementContext = PDCore.getMeasurementContext(selectedAssetId);
let currentDisplayPolicy = PDCore.deriveDisplayPolicy(currentMeasurementContext);

function renderMeasurementTrustBar() {
  currentMeasurementContext = PDCore.getMeasurementContext(selectedAssetId);
  currentDisplayPolicy = PDCore.deriveDisplayPolicy(currentMeasurementContext);
  const context = currentMeasurementContext;
  const bar = $("#measurementTrustBar");
  if (!bar) return;
  bar.hidden = !["dashboard", "history", "trend", "diagnosis", "processing"].includes(currentPage);
  $("#trustAssetId").textContent = context?.assetId || "—";
  $("#trustCalibration").textContent = context?.calibration.state === "valid" ? "有效"
    : context?.calibration.state === "expired" ? "已过期" : "缺失";
  $("#trustCertificate").textContent = context?.calibration.certificateNo || "—";
  $("#trustQuality").textContent = context?.qualityCode || "—";
  $("#trustDisplayUnit").textContent = currentDisplayPolicy.unit;
  $("#trustSampleAsOf").textContent = "2025-05-20 14:32:18 UTC+8";
  bar.dataset.state = currentDisplayPolicy.allowed ? "trusted" : "limited";
}
```

Map every leaf device node and unit/channel selector to its stable asset ID. Call `renderMeasurementTrustBar()` from page navigation, device selection, history target selection, trend selection, and diagnosis target selection.

- [ ] **Step 5: Replace fixed status and unit strings**

Use `classifyMeasurement` for dashboard cards and selected history/trend records. For limited channels:

- show the raw unit from `currentDisplayPolicy.unit`;
- show badge `数据受限`;
- show the policy reason in the helper text;
- never append `pC` or assign `正常/注意/异常/危险`.

Update `renderTrendTarget()`:

```js
currentTrendProfile = PDCore.deriveTrendProfile(unit, channel, selectedAssetId);
slopeLabel.textContent = `当前窗口β：${currentTrendProfile.slope.toFixed(2)} ${currentTrendProfile.slopeUnit}`;
```

Update `exportTrendData()` so `unit`, `slopeUnit`, `assetId`, `datasetId`, `qualityCode`, and calibration metadata come from the active context.

- [ ] **Step 6: Style the strip without increasing page height excessively**

Use one compact grid row, state-colored left border, ellipsis for long values, and a responsive two-column layout below 900 px. Do not introduce horizontal scrolling at 1647 px.

- [ ] **Step 7: Run structure and full tests**

Run:

```bash
node --test tests/structure.test.js
node --test tests/*.test.js
```

Expected: PASS.

- [ ] **Step 8: Commit the shared UI context**

```bash
git add index.html app.js styles.css tests/structure.test.js
git commit -m "feat: expose measurement trust across analysis pages"
```

## Task 4: Make frozen sample time and history range anchors explicit

**Files:**
- Modify: `index.html`
- Modify: `app.js`
- Modify: `tests/structure.test.js`

- [ ] **Step 1: Write failing frozen-sample tests**

```js
test("sample freshness never pretends to be live acquisition", () => {
  assert.doesNotMatch(app, /lastAcquisitionUpdatedAt\s*=\s*new Date\(\)\.toISOString\(\)/);
  assert.doesNotMatch(app, /采集数据：\$\{ageLabel\}/);
  assert.match(html, /冻结样例数据/);
  assert.match(html, /样例近24小时/);
  assert.match(html, /样例近7天/);
  assert.match(html, /样例近30天/);
  assert.match(app, /PDCore\.SAMPLE_AS_OF/);
});

test("history quick range tells the user which sample timestamp is the anchor", () => {
  assert.match(html, /id="historyRangeAnchor"/);
  assert.match(app, /historyRangeAnchor/);
  assert.match(app, /样例截止时间/);
});
```

- [ ] **Step 2: Confirm the tests fail**

Run:

```bash
node --test --test-name-pattern="sample freshness|quick range" tests/structure.test.js
```

Expected: FAIL on the current live-looking footer and button labels.

- [ ] **Step 3: Replace relative freshness with fixed sample provenance**

Remove `lastAcquisitionUpdatedAt`, `DATA_STALE_THRESHOLD_MS`, `markAcquisitionUpdated`, and the relative `renderFreshness` branch from initial sample rendering. Replace it with:

```js
function renderSampleProvenance() {
  const label = $("#lastDataUpdated");
  const warning = $("#staleDataWarning");
  if (label) label.textContent = "冻结样例数据：2025-05-20 14:32:18 UTC+8";
  if (warning) {
    warning.hidden = false;
    warning.textContent = "非实时采集";
  }
}
```

Do not call this function from query, export, playback, diagnosis, threshold, or configuration actions.

- [ ] **Step 4: Rename and explain history quick ranges**

Change button text to `样例近24小时`, `样例近7天`, and `样例近30天`. Add:

```html
<span class="form-hint" id="historyRangeAnchor">相对样例截止时间 2025-05-20 14:32:18（UTC+8）</span>
```

Keep `applyHistoryQuickRange()` anchored to the newest sample record, and update its operation note to:

```js
`已按样例截止时间 ${PDCore.formatShanghaiDateTime(PDCore.SAMPLE_AS_OF)} 计算近 ${rangeLabel}。`
```

- [ ] **Step 5: Run tests and commit**

```bash
node --test tests/*.test.js
git add index.html app.js tests/structure.test.js
git commit -m "fix: label frozen sample time honestly"
```

## Task 5: Derive diagnosis results from target, dataset, and quality

**Files:**
- Modify: `core.js`
- Modify: `tests/core.test.js`

- [ ] **Step 1: Write failing diagnosis trust tests**

```js
test("deriveDiagnosisResult binds a deterministic result to auditable inputs", () => {
  const input = {
    assetId: "channel-3-a",
    datasetId: core.SAMPLE_DATASET_ID,
    window: "最近1000个工频周期",
    algorithmVersion: "PD-DEMO-1.0",
  };
  const first = core.deriveDiagnosisResult(input);
  const second = core.deriveDiagnosisResult(input);
  assert.deepEqual(first, second);
  assert.equal(first.determinacy, "determinate");
  assert.equal(first.assetId, "channel-3-a");
  assert.equal(first.datasetId, core.SAMPLE_DATASET_ID);
  assert.equal(first.algorithmVersion, "PD-DEMO-1.0");
  assert.equal(first.qualityCode, "Q1");
  assert.ok(first.probabilities.length >= 3);
});

test("deriveDiagnosisResult returns manual review for limited calibration", () => {
  const result = core.deriveDiagnosisResult({
    assetId: "channel-2-b",
    datasetId: core.SAMPLE_DATASET_ID,
    window: "最近1000个工频周期",
    algorithmVersion: "PD-DEMO-1.0",
  });
  assert.equal(result.determinacy, "limited");
  assert.equal(result.conclusion, "无法判定，需人工复核");
  assert.deepEqual(result.probabilities, []);
});

test("buildDiagnosisReport includes traceability metadata", () => {
  const report = core.buildDiagnosisReport({
    completed: true,
    assetId: "channel-3-a",
    datasetId: core.SAMPLE_DATASET_ID,
    window: "最近1000个工频周期",
    algorithmVersion: "PD-DEMO-1.0",
    qualityCode: "Q1",
    calibrationState: "valid",
  });
  assert.match(report.previewHtml, /channel-3-a/);
  assert.match(report.previewHtml, /PD-SAMPLE-20250520-001/);
  assert.match(report.previewHtml, /PD-DEMO-1.0/);
  assert.match(report.previewHtml, /Q1/);
});
```

- [ ] **Step 2: Confirm the diagnosis tests fail**

Run:

```bash
node --test --test-name-pattern="deriveDiagnosisResult|traceability metadata" tests/core.test.js
```

Expected: FAIL because results are currently selected from a fixed UI array and report metadata is incomplete.

- [ ] **Step 3: Implement deterministic and limited results**

Add a frozen demo profile map keyed by asset ID. The valid default asset may return slot-discharge probabilities; missing or expired calibration must return no probabilities and the exact limited conclusion.

```js
function deriveDiagnosisResult(input = {}) {
  const context = getMeasurementContext(input.assetId);
  const policy = deriveDisplayPolicy(context);
  const base = {
    assetId: input.assetId || "—",
    datasetId: input.datasetId || context?.datasetId || "—",
    window: input.window || "—",
    algorithmVersion: input.algorithmVersion || "PD-DEMO-1.0",
    qualityCode: context?.qualityCode || "—",
    calibrationState: context?.calibration.state || "unknown",
  };
  if (!policy.allowed || context?.qualityCode !== "Q1") {
    return {
      ...base,
      determinacy: "limited",
      defect: "待人工复核",
      severity: "不可判定",
      confidence: "—",
      conclusion: "无法判定，需人工复核",
      probabilities: [],
      causes: ["当前测量链路不满足确定性诊断条件"],
      advice: ["核对传感器与校准证书", "完成数据质量复核后重新诊断"],
    };
  }
  return {
    ...base,
    determinacy: "determinate",
    defect: "槽部放电",
    severity: "严重",
    confidence: "88%",
    conclusion: "疑似槽部放电，严重程度严重，模型置信度88%",
    probabilities: [
      { name: "槽部放电", english: "Slot Discharge", confidence: 88 },
      { name: "端部放电", english: "End Discharge", confidence: 12 },
      { name: "内部气隙放电", english: "Internal Cavity", confidence: 0 },
    ],
    causes: ["定子槽部绝缘存在局部电场畸变特征"],
    advice: ["复核 PRPD 图谱并安排停机检查", "将本次结果提交人工审核"],
  };
}
```

Extend `buildDiagnosisReport()` normalization and preview HTML with `assetId`, `datasetId`, `window`, `algorithmVersion`, `qualityCode`, and `calibrationState`.

- [ ] **Step 4: Run core tests and commit**

```bash
node --test tests/core.test.js
git add core.js tests/core.test.js
git commit -m "feat: bind diagnosis to auditable sample context"
```

## Task 6: Remove pre-filled diagnosis claims and close the diagnosis workflow

**Files:**
- Modify: `index.html`
- Modify: `app.js`
- Modify: `styles.css`
- Modify: `tests/structure.test.js`

- [ ] **Step 1: Write failing diagnosis UI tests**

```js
test("diagnosis starts neutral and renders only a completed core result", () => {
  assert.doesNotMatch(html, /严重程度：严重.*置信度：88%/s);
  assert.match(html, /尚未执行诊断/);
  assert.match(app, /PDCore\.deriveDiagnosisResult/);
  assert.match(app, /diagnosisRunToken/);
  assert.match(app, /renderDiagnosisPlaceholder/);
});

test("diagnosis export actions remain unavailable until completion", () => {
  assert.match(html, /id="exportDiagReport"[^>]*disabled/);
  assert.match(html, /id="printDiagReport"[^>]*disabled/);
  assert.match(app, /setDiagnosisActionsEnabled/);
});
```

- [ ] **Step 2: Confirm the tests fail**

Run:

```bash
node --test --test-name-pattern="diagnosis starts neutral|export actions" tests/structure.test.js
```

Expected: FAIL because the page currently exposes an 88% conclusion before running.

- [ ] **Step 3: Replace fixed diagnosis content with neutral placeholders**

Initial HTML must say:

- probability panel: `尚未执行诊断`;
- conclusion: `等待诊断结果`;
- cause/advice: `完成诊断后显示`;
- report preview: `诊断尚未完成`.

Initialize:

```js
let diagnosisRunToken = 0;
let diagnosisTimer = null;
let diagnosisContext = {
  assetId: "channel-3-a",
  datasetId: PDCore.SAMPLE_DATASET_ID,
  window: "最近1000个工频周期",
  algorithmVersion: "PD-DEMO-1.0",
  completed: false,
};
```

- [ ] **Step 4: Cancel stale runs when the target changes**

In `updateDiagnosisTarget()`:

```js
diagnosisRunToken += 1;
clearTimeout(diagnosisTimer);
diagnosisTimer = null;
diagnosisContext = {
  assetId: selectedAssetId,
  datasetId: currentMeasurementContext?.datasetId || PDCore.SAMPLE_DATASET_ID,
  window: $("#diagWindowText")?.textContent || "最近1000个工频周期",
  algorithmVersion: "PD-DEMO-1.0",
  completed: false,
};
renderDiagnosisPlaceholder();
setDiagnosisActionsEnabled(false);
```

- [ ] **Step 5: Render only the completed core result**

At start, capture `const runToken = ++diagnosisRunToken`. Each scheduled step exits if `runToken !== diagnosisRunToken`. At the last stage:

```js
const result = PDCore.deriveDiagnosisResult(diagnosisContext);
diagnosisContext = { ...diagnosisContext, ...result, completed: true };
renderDiagnosisResult(result);
renderDiagnosisReport();
setDiagnosisActionsEnabled(true);
```

For `determinate`, render returned probabilities, conclusion, causes, and advice. For `limited`, render no probability bars, show `无法判定，需人工复核`, and keep the explicit remediation advice. Never select `diagnosisDefects[0]` as a fallback.

- [ ] **Step 6: Verify diagnosis states and commit**

```bash
node --test tests/*.test.js
git add index.html app.js styles.css tests/structure.test.js
git commit -m "fix: prevent diagnosis claims before completion"
```

## Task 7: Document production boundaries and run full regression

**Files:**
- Modify: `README.md`
- Modify: `tests/structure.test.js`

- [ ] **Step 1: Add a failing boundary test**

```js
test("README distinguishes prototype behavior from production services", () => {
  assert.match(readme, /OIDC|统一身份认证/);
  assert.match(readme, /服务端会话/);
  assert.match(readme, /数据库持久化/);
  assert.match(readme, /采集心跳/);
  assert.match(readme, /算法服务/);
  assert.match(readme, /当前版本不模拟/);
});
```

- [ ] **Step 2: Confirm the test fails**

Run:

```bash
node --test --test-name-pattern="production services" tests/structure.test.js
```

Expected: FAIL until the boundary section is complete.

- [ ] **Step 3: Expand the prototype boundary section**

Document:

- login is a demonstrator-only local session and production requires OIDC/unified identity plus server-side sessions;
- current records are frozen front-end samples and production requires database persistence and audit trails;
- freshness is not synthesized and production requires acquisition heartbeat/event interfaces;
- diagnosis is a deterministic demo contract and production requires a versioned algorithm service;
- the current version does not simulate successful production integrations;
- reserved input/output fields: `assetId`, `datasetId`, `sampleAsOf`, `qualityCode`, `calibration`, `algorithmVersion`, `ruleVersion`.

- [ ] **Step 4: Run automated verification**

```bash
node --test tests/*.test.js
git diff --check
rg -n "TODO|FIXME|TBD|placeholder|采集数据：刚刚|pC/h|严重程度：严重.*88%" core.js app.js index.html styles.css README.md tests
```

Expected:

- all tests pass;
- `git diff --check` returns no output;
- placeholder scan has no unintended production-facing claims. A test fixture mentioning prohibited text is acceptable only when it is asserting absence.

- [ ] **Step 5: Run browser regression at the supported viewport**

Start a local server:

```bash
python3 -m http.server 8765
```

In the in-app browser, verify at 1647×1018:

1. Login with `admin` / `12345`.
2. Dashboard default target shows valid calibration, Q1, pC, certificate, and frozen sample cutoff.
3. Select a limited channel where available; it shows mV/dBm and `数据受限`, never pC severity.
4. History quick ranges visibly use the frozen sample cutoff.
5. Trend device-tree leaf selections update the right-side unit/channel, values, slope unit, and trust strip.
6. Diagnosis initially shows no defect or probability.
7. Valid default diagnosis completes with traceable metadata and enables report actions.
8. Limited diagnosis completes as `无法判定，需人工复核`.
9. Alarm, device, and settings pages do not show the trust strip or device tree.
10. No horizontal scrollbar or clipped controls appear.

- [ ] **Step 6: Commit documentation and regression assertions**

```bash
git add README.md tests/structure.test.js
git commit -m "docs: define V1.3 production integration boundaries"
```

- [ ] **Step 7: Review the branch as a whole**

```bash
git status --short
git log --oneline --decorate -8
git diff 6e8221f...HEAD --stat
node --test tests/*.test.js
```

Expected: clean worktree, focused commits, and a fully passing suite.
