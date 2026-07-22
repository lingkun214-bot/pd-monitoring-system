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

test("filterHistoryRows filters by unit-channel and alarm level", () => {
  const rows = [["t1", "3#机组", "A相", "1", "1", "1", "异常"], ["t2", "3#机组", "B相", "1", "1", "1", "注意"], ["t3", "2#机组", "A相", "1", "1", "1", "异常"]];
  assert.deepEqual(core.filterHistoryRows(rows, "3#机组 A相", "异常"), [rows[0]]);
  assert.deepEqual(core.filterHistoryRows(rows, "全部机组", "全部级别"), rows);
});

test("serializeHistoryCsv emits a BOM, stable columns, and escaped values", () => {
  assert.equal(typeof core.serializeHistoryCsv, "function");
  const csv = core.serializeHistoryCsv([
    ["2025-05-20 14:32:18", "3#机组", "A相", "1,245.3", "245.6", "12,345", "异常"],
    ["2025-05-20 13:55:21", "3#机组", "B\"相", "356.8", "78.9", "3,456", "注意"],
  ]);

  assert.ok(csv.startsWith("\uFEFF"));
  assert.equal(csv.split("\r\n")[0], '﻿"时间","机组","通道","Qm(pC)","Qavg(pC)","Ntotal","级别"');
  assert.match(csv, /"1,245\.3"/);
  assert.match(csv, /"B""相"/);
});

test("serializeHistoryCsv keeps the header for an empty result", () => {
  assert.equal(core.serializeHistoryCsv([]), '﻿"时间","机组","通道","Qm(pC)","Qavg(pC)","Ntotal","级别"');
});

test("buildHistoryExportPayload keeps filters and maps rows to stable fields", () => {
  assert.equal(typeof core.buildHistoryExportPayload, "function");
  const rows = [["2025-05-20 14:32:18", "3#机组", "A相", "1,245.3", "245.6", "12,345", "异常"]];
  assert.deepEqual(core.buildHistoryExportPayload(rows, { unitChannel: "3#机组 A相", level: "异常" }), {
    title: "局部放电历史数据",
    exportedAt: null,
    filters: { unitChannel: "3#机组 A相", level: "异常" },
    records: [{ time: "2025-05-20 14:32:18", unit: "3#机组", channel: "A相", qm: "1,245.3", qavg: "245.6", ntotal: "12,345", level: "异常" }],
  });
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

test("serializeSystemLogsCsv emits BOM, headings, and escaped detail", () => {
  assert.equal(typeof core.serializeSystemLogsCsv, "function");
  const csv = core.serializeSystemLogsCsv([{ time: "2026-07-20", operator: "admin", action: "配置", detail: "值为\"A\",完成" }]);
  assert.equal(csv.startsWith("\uFEFF"), true);
  assert.match(csv, /时间,操作用户,动作,详情/);
  assert.match(csv, /"值为""A"",完成"/);
});

test("getFreshnessState distinguishes fresh, stale, and unknown timestamps", () => {
  assert.equal(typeof core.getFreshnessState, "function");
  assert.equal(core.getFreshnessState("2026-07-20T10:00:00Z", "2026-07-20T10:00:20Z", 30000).state, "fresh");
  assert.equal(core.getFreshnessState("2026-07-20T10:00:00Z", "2026-07-20T10:01:00Z", 30000).state, "stale");
  assert.equal(core.getFreshnessState("invalid", "2026-07-20T10:01:00Z", 30000).state, "unknown");
});
