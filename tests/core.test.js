const test = require("node:test");
const assert = require("node:assert/strict");

let core = {};
try {
  core = require("../core.js");
} catch (error) {
  if (error.code !== "MODULE_NOT_FOUND") throw error;
}

test("isValidLogin only accepts admin with password 12345", () => {
  assert.equal(typeof core.isValidLogin, "function");
  assert.equal(core.isValidLogin("admin", "12345"), true);
  assert.equal(core.isValidLogin("engineer01", "12345"), false);
  assert.equal(core.isValidLogin("admin", "wrong-password"), false);
  assert.equal(core.isValidLogin("Admin", "12345"), false);
});

test("countOpenAlarms counts rows whose fourth item is 未确认", () => {
  assert.equal(typeof core.countOpenAlarms, "function");
  const alarms = [
    ["2025-05-20 14:32:18", "异常", "Qm 超限", "未确认"],
    ["2025-05-20 12:40:10", "注意", "出现放电", "已确认"],
    ["2025-05-20 09:15:33", "危险", "Qm 严重超限", "未确认"],
    ["未确认", "系统", "字段位置不匹配", "已确认"],
  ];

  assert.equal(core.countOpenAlarms(alarms), 2);
});

test("validateThresholds converts valid threshold inputs to ordered numbers", () => {
  assert.equal(typeof core.validateThresholds, "function");
  assert.deepEqual(
    core.validateThresholds({ attention: "10", abnormal: "20.5", danger: 30 }),
    {
      valid: true,
      values: { attention: 10, abnormal: 20.5, danger: 30 },
    },
  );
});

test("validateThresholds rejects non-finite, negative, or unordered thresholds", () => {
  const invalidInputs = [
    { attention: "not-a-number", abnormal: 20, danger: 30 },
    { attention: "", abnormal: 20, danger: 30 },
    { attention: "   ", abnormal: 20, danger: 30 },
    { attention: null, abnormal: 20, danger: 30 },
    { attention: false, abnormal: 20, danger: 30 },
    { attention: [], abnormal: 20, danger: 30 },
    { attention: 10, abnormal: Infinity, danger: 30 },
    { attention: -1, abnormal: 20, danger: 30 },
    { attention: 10, abnormal: 10, danger: 30 },
    { attention: 10, abnormal: 30, danger: 20 },
  ];

  for (const input of invalidInputs) {
    const result = core.validateThresholds(input);
    assert.equal(result.valid, false);
    assert.equal(typeof result.error, "string");
    assert.ok(result.error.length > 0);
  }
});

test("upsertById immutably replaces an existing record or appends a new one", () => {
  assert.equal(typeof core.upsertById, "function");
  const records = [
    { id: "A", name: "设备 A" },
    { id: "B", name: "设备 B" },
  ];
  const originalSnapshot = structuredClone(records);
  const replacement = { id: "B", name: "设备 B（更新）" };

  const updated = core.upsertById(records, replacement);
  const inserted = core.upsertById(records, { id: "C", name: "设备 C" });

  assert.notEqual(updated, records);
  assert.deepEqual(updated, [records[0], replacement]);
  assert.deepEqual(inserted, [...records, { id: "C", name: "设备 C" }]);
  assert.deepEqual(records, originalSnapshot);
});

test("removeById immutably removes matching records", () => {
  assert.equal(typeof core.removeById, "function");
  const records = [
    { id: "A", name: "设备 A" },
    { id: "B", name: "设备 B" },
  ];
  const originalSnapshot = structuredClone(records);

  const result = core.removeById(records, "A");

  assert.notEqual(result, records);
  assert.deepEqual(result, [records[1]]);
  assert.deepEqual(records, originalSnapshot);
});

test("validateIrisImport accepts complete records and normalizes thresholds", () => {
  assert.equal(typeof core.validateIrisImport, "function");
  const input = [
    {
      id: "  IRIS-001  ",
      name: "  一号设备 ",
      deviceType: " GIS ",
      attention: "10",
      abnormal: "20",
      danger: "30",
    },
  ];

  assert.deepEqual(core.validateIrisImport(input), {
    valid: true,
    records: [
      {
        id: "IRIS-001",
        name: "一号设备",
        deviceType: "GIS",
        attention: 10,
        abnormal: 20,
        danger: 30,
      },
    ],
  });
});

test("validateIrisImport rejects empty input, missing fields, and invalid thresholds", () => {
  const invalidInputs = [
    null,
    [],
    [
      {
        id: "IRIS-001",
        name: "一号设备",
        deviceType: "GIS",
        attention: 10,
        abnormal: 20,
      },
    ],
    [
      {
        id: "IRIS-001",
        name: "一号设备",
        deviceType: "GIS",
        attention: 20,
        abnormal: 10,
        danger: 30,
      },
    ],
  ];

  for (const input of invalidInputs) {
    const result = core.validateIrisImport(input);
    assert.equal(result.valid, false);
    assert.equal(typeof result.error, "string");
    assert.ok(result.error.length > 0);
  }
});

test("validateIrisImport rejects empty or whitespace-only identity fields", () => {
  const baseRecord = {
    id: "IRIS-001",
    name: "一号设备",
    deviceType: "GIS",
    attention: 10,
    abnormal: 20,
    danger: 30,
  };
  const invalidRecords = [
    { ...baseRecord, id: "" },
    { ...baseRecord, id: "   " },
    { ...baseRecord, name: "" },
    { ...baseRecord, name: " \t " },
    { ...baseRecord, deviceType: "" },
    { ...baseRecord, deviceType: "\n" },
  ];

  for (const record of invalidRecords) {
    const result = core.validateIrisImport([record]);
    assert.equal(result.valid, false);
    assert.equal(typeof result.error, "string");
    assert.ok(result.error.length > 0);
  }
});

test("validateIrisImport rejects duplicate normalized ids", () => {
  const result = core.validateIrisImport([
    {
      id: "IRIS-001",
      name: "一号设备",
      deviceType: "GIS",
      attention: 10,
      abnormal: 20,
      danger: 30,
    },
    {
      id: " IRIS-001 ",
      name: "二号设备",
      deviceType: "GIS",
      attention: 11,
      abnormal: 21,
      danger: 31,
    },
  ]);

  assert.equal(result.valid, false);
  assert.equal(typeof result.error, "string");
  assert.ok(result.error.length > 0);
});

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
  assert.deepEqual(core.validateHistoryRange("2025-05-21T00:00", "2025-05-20T23:59"), { valid: false, error: "开始时间不能晚于结束时间" });
  assert.deepEqual(core.validateHistoryRange("2025-01-01T00:00", "2025-05-20T23:59"), { valid: false, error: "单次查询时间跨度不能超过 90 天" });
  assert.deepEqual(core.validateHistoryRange("", "2025-05-20T23:59"), { valid: false, error: "请输入有效的开始和结束时间" });
});

test("todayInShanghai does not depend on the host timezone", () => {
  assert.equal(core.todayInShanghai("2026-07-21T16:30:00.000Z"), "2026-07-22");
});

test("filterHistoryRows applies time, device, and level together", () => {
  const rows = [
    ["2025-05-20 14:32:18", "3#机组", "A相", 1, 2, 3, "异常"],
    ["2025-05-20 13:55:21", "3#机组", "B相", 1, 2, 3, "异常"],
    ["2025-05-19 14:32:18", "3#机组", "A相", 1, 2, 3, "注意"],
  ];
  const filtered = core.filterHistoryRows(rows, { start: "2025-05-20T14:00", end: "2025-05-20T15:00", unitChannel: "3#机组 A相", level: "异常" });
  assert.deepEqual(filtered, [rows[0]]);
});

test("history export payload echoes the exact applied filters", () => {
  const filters = { start: "2025-05-20T14:00", end: "2025-05-20T15:00", unitChannel: "3#机组 A相", level: "异常", timeZone: "Asia/Shanghai" };
  const payload = core.buildHistoryExportPayload([["2025-05-20 14:32:18", "3#机组", "A相", 1, 2, 3, "异常"]], filters);
  assert.deepEqual(payload.filters, filters);
  assert.equal(payload.records.length, 1);
});

test("history CSV includes filter metadata before the table", () => {
  const csv = core.serializeHistoryCsv([["2025-05-20 14:32:18", "3#机组", "A相", "1,245.3", 2, 3, "异常"]], {
    start: "2025-05-20T14:00", end: "2025-05-20T15:00", unitChannel: "3#机组 A相", level: "异常", timeZone: "Asia/Shanghai",
  });
  assert.match(csv, /"查询开始（UTC\+8）","2025-05-20T14:00"/);
  assert.match(csv, /"设备条件","3#机组 A相"/);
  assert.match(csv, /"时间（UTC\+8）","机组","通道"/);
  assert.match(csv, /"1,245\.3"/);
});

test("deriveTrendProfile returns deterministic linked values for a unit and channel", () => {
  assert.equal(typeof core.deriveTrendProfile, "function");
  const first = core.deriveTrendProfile("3# 机组", "A相");
  const repeated = core.deriveTrendProfile("3# 机组", "A相");
  const different = core.deriveTrendProfile("2# 机组", "B相");

  assert.deepEqual(first, repeated);
  assert.notDeepEqual(first, different);
  assert.equal(first.unit, "3# 机组");
  assert.equal(first.channel, "A相");
  assert.equal(first.summary.length, 3);
  assert.ok(Number.isFinite(first.seed));
  assert.ok(Number.isFinite(first.slope));
});

test("buildDiagnosisReport produces one traceable report from its context", () => {
  assert.equal(typeof core.buildDiagnosisReport, "function");
  const report = core.buildDiagnosisReport({
    unit: "2# 机组",
    channel: "B相",
    defect: "端部放电",
    severity: "中等",
    confidence: "72%",
    conclusion: "疑似端部放电",
    advice: ["复核端部绑扎"],
    reviewer: "engineer01",
    signature: "李工",
    date: "2026-07-20",
    note: "安排停机复核",
    completed: true,
  });

  assert.equal(report.filename, "局放诊断报告-2#机组-B相-2026-07-20.html");
  for (const value of ["2# 机组", "B相", "端部放电", "engineer01", "李工", "安排停机复核"]) {
    assert.match(report.html, new RegExp(value));
  }
});

test("validateFilterConfig rejects invalid numeric ranges and accepts a valid configuration", () => {
  assert.equal(typeof core.validateFilterConfig, "function");
  const invalid = [
    [{ low: -1, high: 120, attenuation: 80, bandwidth: 250 }, "low"],
    [{ low: "abc", high: 120, attenuation: 80, bandwidth: 250 }, "low"],
    [{ low: 120, high: 120, attenuation: 80, bandwidth: 250 }, "high"],
    [{ low: 0.5, high: 260, attenuation: 80, bandwidth: 250 }, "high"],
    [{ low: 0.5, high: 120, attenuation: 0, bandwidth: 250 }, "attenuation"],
  ];
  for (const [input, field] of invalid) {
    const result = core.validateFilterConfig(input);
    assert.equal(result.valid, false);
    assert.equal(result.field, field);
    assert.ok(result.error);
  }
  assert.deepEqual(core.validateFilterConfig({ low: "0.5", high: "120", attenuation: "80", bandwidth: "250" }), {
    valid: true,
    values: { low: 0.5, high: 120, attenuation: 80, bandwidth: 250 },
  });
});

test("validateMaskWindow enforces phase bounds, ordering, reason, and non-overlap", () => {
  assert.equal(typeof core.validateMaskWindow, "function");
  const records = [{ id: "mask-1", start: 45, end: 85, reason: "工频噪声", enabled: true }];
  for (const candidate of [
    { start: -1, end: 20, reason: "测试" },
    { start: 20, end: 361, reason: "测试" },
    { start: 80, end: 70, reason: "测试" },
    { start: 10, end: 20, reason: " " },
    { start: 80, end: 100, reason: "重叠" },
  ]) {
    const result = core.validateMaskWindow(candidate, records);
    assert.equal(result.valid, false);
    assert.ok(result.error);
  }
  assert.equal(core.validateMaskWindow({ id: "mask-1", start: 50, end: 90, reason: "编辑自身", enabled: true }, records).valid, true);
  assert.deepEqual(core.validateMaskWindow({ start: "100", end: "130", reason: " 新噪声 " }, records), {
    valid: true,
    record: { id: "", start: 100, end: 130, reason: "新噪声", enabled: true },
  });
});

test("normalizeAlarmRecord migrates legacy rows and keeps workflow metadata", () => {
  assert.equal(typeof core.normalizeAlarmRecord, "function");
  assert.deepEqual(core.normalizeAlarmRecord(["2025-05-20 14:32:18", "异常", "3# 机组 A相 Qm 超限", "未确认"], 2), {
    id: "ALM202505200003",
    time: "2025-05-20 14:32:18",
    level: "异常",
    content: "3# 机组 A相 Qm 超限",
    status: "未确认",
    unit: "3# 机组",
    assignee: "",
    note: "",
    operator: "",
    handledAt: "",
  });
  const record = { id: "A-1", time: "t", level: "注意", content: "2# 机组 B相", status: "已派发", unit: "2# 机组", assignee: "检修一组", note: "复核", operator: "admin", handledAt: "now" };
  assert.deepEqual(core.normalizeAlarmRecord(record), record);
});

test("filterAlarms combines unit, level, and status conditions", () => {
  assert.equal(typeof core.filterAlarms, "function");
  const records = [
    core.normalizeAlarmRecord(["t1", "异常", "3# 机组 A相", "未确认"], 0),
    core.normalizeAlarmRecord(["t2", "注意", "2# 机组 B相", "已确认"], 1),
  ];
  assert.deepEqual(core.filterAlarms(records, { unit: "3# 机组", level: "异常", status: "open" }), [records[0]]);
  assert.deepEqual(core.filterAlarms(records, { unit: "all", level: "all", status: "all" }), records);
});

test("transitionAlarm enforces workflow requirements and terminal closure", () => {
  assert.equal(typeof core.transitionAlarm, "function");
  const original = core.normalizeAlarmRecord(["t1", "异常", "3# 机组 A相", "未确认"], 0);
  assert.equal(core.transitionAlarm(original, "dispatch", { group: "", note: "复核" }).valid, false);
  assert.equal(core.transitionAlarm(original, "dispatch", { group: "检修一组", note: "" }).valid, false);
  const dispatched = core.transitionAlarm(original, "dispatch", { group: "检修一组", note: "现场复核", operator: "admin", handledAt: "now" });
  assert.equal(dispatched.valid, true);
  assert.equal(dispatched.record.status, "已派发");
  assert.equal(dispatched.record.assignee, "检修一组");
  assert.equal(original.status, "未确认");
  assert.equal(core.transitionAlarm(dispatched.record, "dispatch", { group: "检修一组", note: "再次" }).valid, false);
  assert.equal(core.transitionAlarm(dispatched.record, "close", { note: "" }).valid, false);
  const closed = core.transitionAlarm(dispatched.record, "close", { note: "处理完成", operator: "admin", handledAt: "later" });
  assert.equal(closed.record.status, "已关闭");
  assert.equal(core.transitionAlarm(closed.record, "confirm", {}).valid, false);
});

test("validateDeviceConfig normalizes valid values and rejects invalid fields", () => {
  assert.equal(typeof core.validateDeviceConfig, "function");
  const base = { id: "CH01", unit: "3#", type: "UHF", name: "A相UHF", sampleRate: "500 MS/s", calibration: 0.85, depth: 1024, impedance: 52.3, status: "启用" };
  for (const [input, field] of [
    [{ ...base, name: " " }, "name"],
    [{ ...base, calibration: 0 }, "calibration"],
    [{ ...base, depth: 10.5 }, "depth"],
    [{ ...base, impedance: -1 }, "impedance"],
  ]) {
    const result = core.validateDeviceConfig(input);
    assert.equal(result.valid, false);
    assert.equal(result.field, field);
  }
  assert.deepEqual(core.validateDeviceConfig({ ...base, calibration: "0.85", depth: "1024", impedance: "52.3" }), { valid: true, record: base });
});

test("summarizeSelfCheck reports idle, running, passed, and failed states", () => {
  assert.equal(typeof core.summarizeSelfCheck, "function");
  assert.deepEqual(core.summarizeSelfCheck([]), { state: "idle", passed: 0, failed: 0, pending: 0 });
  assert.equal(core.summarizeSelfCheck([{ status: "检测中" }, { status: "待检测" }]).state, "running");
  assert.equal(core.summarizeSelfCheck([{ status: "通过" }, { status: "通过" }]).state, "passed");
  assert.equal(core.summarizeSelfCheck([{ status: "通过" }, { status: "失败" }]).state, "failed");
});

test("validateDemoUser normalizes roles and rejects duplicate usernames", () => {
  assert.equal(typeof core.validateDemoUser, "function");
  const users = [{ id: "u1", username: "admin", role: "管理员", enabled: true }];
  assert.equal(core.validateDemoUser({ username: " admin ", role: "工程师" }, users).valid, false);
  assert.equal(core.validateDemoUser({ username: "", role: "工程师" }, users).valid, false);
  assert.deepEqual(core.validateDemoUser({ id: "u2", username: " user01 ", role: "invalid", enabled: false }, users), { valid: true, record: { id: "u2", username: "user01", role: "浏览者", enabled: false } });
});

test("toggleDemoUser changes enabled state immutably", () => {
  const user = { id: "u2", username: "user01", role: "浏览者", enabled: true };
  const changed = core.toggleDemoUser(user);
  assert.deepEqual(changed, { ...user, enabled: false });
  assert.equal(user.enabled, true);
});

test("filterSystemLogs combines operator and action filters", () => {
  assert.equal(typeof core.filterSystemLogs, "function");
  const logs = [
    { time: "2026-07-20T10:00:00.000Z", operator: "admin", action: "设备配置", detail: "CH01 已保存" },
    { time: "2026-07-20T09:00:00.000Z", operator: "engineer01", action: "硬件自检", detail: "全部通过" },
  ];
  assert.deepEqual(core.filterSystemLogs(logs, { operator: "admin", action: "设备配置" }), [logs[0]]);
  assert.deepEqual(core.filterSystemLogs(logs, { operator: "全部用户", action: "硬件自检" }), [logs[1]]);
  assert.deepEqual(core.filterSystemLogs(logs, {}), logs);
});

test("serializeSystemLogsCsv exports UTC timestamps as UTC+8", () => {
  const csv = core.serializeSystemLogsCsv([{ time: "2025-05-20T06:32:18.000Z", operator: "admin", action: "配置", detail: "值为\"A\",完成" }]);
  assert.match(csv, /^\uFEFF时间（UTC\+8）,操作用户,动作,详情/);
  assert.match(csv, /"2025-05-20 14:32:18"/);
  assert.match(csv, /"值为""A"",完成"/);
});

test("diagnosis report records whether its date was defaulted or edited", () => {
  const report = core.buildDiagnosisReport({ date: "2026-07-22", dateSource: "user-modified" });
  assert.equal(report.context.date, "2026-07-22");
  assert.equal(report.context.dateSource, "user-modified");
});

test("getFreshnessState distinguishes fresh, stale, and unknown timestamps", () => {
  assert.equal(typeof core.getFreshnessState, "function");
  assert.equal(core.getFreshnessState("2026-07-20T10:00:00Z", "2026-07-20T10:00:20Z", 30000).state, "fresh");
  assert.equal(core.getFreshnessState("2026-07-20T10:00:00Z", "2026-07-20T10:01:00Z", 30000).state, "stale");
  assert.equal(core.getFreshnessState("invalid", "2026-07-20T10:01:00Z", 30000).state, "unknown");
});

test("normalizeOperationResult accepts only successful result contracts", () => {
  assert.deepEqual(core.normalizeOperationResult({ ok: true, data: 3 }), { ok: true, data: 3, error: "" });
  assert.deepEqual(core.normalizeOperationResult({ ok: false, error: "保存失败" }), { ok: false, data: null, error: "保存失败" });
  assert.deepEqual(core.normalizeOperationResult(false), { ok: false, data: null, error: "操作未完成" });
  assert.deepEqual(core.normalizeOperationResult(true), { ok: true, data: true, error: "" });
  assert.deepEqual(core.normalizeOperationResult(undefined), { ok: false, data: null, error: "操作未返回结果" });
});

test("getMeasurementContext returns a cloned calibrated context for the default asset", () => {
  const first = core.getMeasurementContext("channel-3-a");
  const second = core.getMeasurementContext("channel-3-a");
  assert.deepEqual(first, {
    assetId: "channel-3-a",
    unit: "3# 机组",
    channel: "A相",
    sensor: "UHF",
    calibration: {
      engineeringUnit: "pC",
      rawUnit: "mV",
      state: "valid",
      certificateNo: "CAL-PD-2025-003A",
      calibratedAt: "2025-04-18",
      validUntil: "2026-04-17",
      uncertainty: "±5.0%",
    },
    qualityCode: "Q1",
    sampleAsOf: core.SAMPLE_AS_OF,
    datasetId: "PD-SAMPLE-20250520-001",
  });
  assert.notEqual(first, second);
  first.calibration.state = "expired";
  assert.equal(second.calibration.state, "valid");
});

test("measurement contexts cover every device tree leaf", () => {
  const leaves = [];
  const visit = nodes => nodes.forEach(node => {
    if (node.type === "channel") leaves.push(node.id);
    if (node.children) visit(node.children);
  });
  visit(core.DEVICE_NODES);
  assert.deepEqual(leaves.sort(), [
    "channel-1-a", "channel-1-b", "channel-2-a", "channel-2-b",
    "channel-3-a", "channel-3-b", "channel-3-c", "channel-4-a",
  ]);
  assert.ok(leaves.every(id => core.getMeasurementContext(id)));
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
