function isValidLogin(username, password) {
  return username === "admin" && password === "12345";
}

function countOpenAlarms(alarms) {
  return alarms.filter(alarm => (Array.isArray(alarm) ? alarm[3] : alarm.status) === "未确认").length;
}

function parseThreshold(value) {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : null;
  }

  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }

  return null;
}

function validateThresholds(thresholds) {
  const values = {
    attention: parseThreshold(thresholds && thresholds.attention),
    abnormal: parseThreshold(thresholds && thresholds.abnormal),
    danger: parseThreshold(thresholds && thresholds.danger),
  };

  if (Object.values(values).some(value => value === null)) {
    return { valid: false, error: "阈值必须是有限数值" };
  }

  if (!Object.values(values).every(value => value >= 0)) {
    return { valid: false, error: "阈值不能为负数" };
  }

  if (!(values.attention < values.abnormal && values.abnormal < values.danger)) {
    return { valid: false, error: "阈值必须满足 attention < abnormal < danger" };
  }

  return { valid: true, values };
}

function upsertById(records, record) {
  const exists = records.some(existing => existing.id === record.id);
  return exists
    ? records.map(existing => (existing.id === record.id ? record : existing))
    : [...records, record];
}

function removeById(records, id) {
  return records.filter(record => record.id !== id);
}

function validateIrisImport(records) {
  if (!Array.isArray(records) || records.length === 0) {
    return { valid: false, error: "IRIS 导入数据必须是非空数组" };
  }

  const requiredFields = [
    "id",
    "name",
    "deviceType",
    "attention",
    "abnormal",
    "danger",
  ];
  const normalizedRecords = [];
  const seenIds = new Set();

  for (let index = 0; index < records.length; index += 1) {
    const record = records[index];
    const hasRequiredFields = record !== null
      && typeof record === "object"
      && requiredFields.every(field => Object.hasOwn(record, field));

    if (!hasRequiredFields) {
      return { valid: false, error: `第 ${index + 1} 条记录缺少必填字段` };
    }

    const identityFields = ["id", "name", "deviceType"];
    const hasValidIdentity = identityFields.every(field => (
      typeof record[field] === "string" && record[field].trim() !== ""
    ));
    if (!hasValidIdentity) {
      return { valid: false, error: `第 ${index + 1} 条记录的标识字段不能为空` };
    }

    const normalizedIdentity = {
      id: record.id.trim(),
      name: record.name.trim(),
      deviceType: record.deviceType.trim(),
    };
    if (seenIds.has(normalizedIdentity.id)) {
      return { valid: false, error: `第 ${index + 1} 条记录的 id 重复` };
    }
    seenIds.add(normalizedIdentity.id);

    const thresholdResult = validateThresholds(record);
    if (!thresholdResult.valid) {
      return { valid: false, error: `第 ${index + 1} 条记录：${thresholdResult.error}` };
    }

    normalizedRecords.push({
      ...record,
      ...normalizedIdentity,
      ...thresholdResult.values,
    });
  }

  return { valid: true, records: normalizedRecords };
}

const DEVICE_NODES = Object.freeze([
  {
    id: "station-lingkun", label: "灵昆水电站", type: "station", children: [
      { id: "unit-1", label: "1#机组", type: "unit", children: [{ id: "device-1", label: "水轮发电机", type: "device", children: [{ id: "channel-1-a", label: "A相 UHF", type: "channel" }, { id: "channel-1-b", label: "B相 UHF", type: "channel" }] }] },
      { id: "unit-2", label: "2#机组", type: "unit", children: [{ id: "device-2", label: "水轮发电机", type: "device", children: [{ id: "channel-2-a", label: "A相 UHF", type: "channel" }, { id: "channel-2-b", label: "B相 UHF", type: "channel" }] }] },
      { id: "unit-3", label: "3#机组", type: "unit", children: [{ id: "device-3", label: "水轮发电机", type: "device", children: [{ id: "channel-3-a", label: "A相 UHF", type: "channel" }, { id: "channel-3-b", label: "B相 UHF", type: "channel" }, { id: "channel-3-c", label: "C相 UHF", type: "channel" }] }] },
      { id: "unit-4", label: "4#机组", type: "unit", children: [{ id: "device-4", label: "水轮发电机", type: "device", children: [{ id: "channel-4-a", label: "A相 UHF", type: "channel" }] }] },
    ],
  },
]);

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
  const selectedIds = exists ? context.selectedIds.filter(item => item !== id) : [...context.selectedIds, id];
  const safeIds = selectedIds.length ? selectedIds : [context.selectedId];
  return { ...context, selectedId: safeIds[safeIds.length - 1], selectedIds: safeIds };
}

function filterHistoryRows(rows, unitChannel = "全部机组", level = "全部级别") {
  const normalized = unitChannel.replace(/\s+/g, "");
  return rows.filter(row => {
    const matchesDevice = unitChannel === "全部机组" || `${row[1]}${row[2]}` === normalized;
    const matchesLevel = level === "全部级别" || row[6] === level;
    return matchesDevice && matchesLevel;
  });
}

function serializeHistoryCsv(rows) {
  const header = ["时间", "机组", "通道", "Qm(pC)", "Qavg(pC)", "Ntotal", "级别"];
  const quote = value => `"${String(value ?? "").replaceAll('"', '""')}"`;
  return `\uFEFF${[header, ...rows].map(row => row.map(quote).join(",")).join("\r\n")}`;
}

function buildHistoryExportPayload(rows, filters = {}) {
  return {
    title: "局部放电历史数据",
    exportedAt: null,
    filters: {
      unitChannel: filters.unitChannel || "全部机组",
      level: filters.level || "全部级别",
    },
    records: rows.map(row => ({
      time: row[0],
      unit: row[1],
      channel: row[2],
      qm: row[3],
      qavg: row[4],
      ntotal: row[5],
      level: row[6],
    })),
  };
}

function deriveTrendProfile(unit = "3# 机组", channel = "A相") {
  const unitNumber = Math.max(1, Math.min(4, Number.parseInt(unit, 10) || 3));
  const channelIndex = Math.max(0, ["A相", "B相", "C相"].indexOf(channel));
  const seed = unitNumber * 10 + channelIndex + 1;
  const base = 118 + unitNumber * 76 + channelIndex * 41;
  const slope = Number((0.08 + unitNumber * 0.17 + channelIndex * 0.06).toFixed(2));
  const status = slope >= 0.7 ? "异常" : slope >= 0.35 ? "注意" : "正常";
  const agingFactors = [1.05, 1.1, 1.2, 1.08];
  const channels = ["A相", "B相", "C相"];
  const summary = channels.map((item, index) => {
    const current = Number((base * (1 - index * 0.22) + (channelIndex === index ? 210 : 0)).toFixed(1));
    const itemSlope = Number(Math.max(0.05, slope - index * 0.14).toFixed(2));
    return {
      channel: item,
      current,
      previous: Number((current * (0.62 + index * 0.04)).toFixed(1)),
      slope: itemSlope,
      level: itemSlope >= 0.7 ? "异常" : itemSlope >= 0.3 ? "注意" : "正常",
      assessment: itemSlope >= 0.7 ? "较快劣化" : itemSlope >= 0.3 ? "轻微劣化" : "稳定",
    };
  });
  summary.sort((left, right) => (left.channel === channel ? -1 : right.channel === channel ? 1 : 0));
  return { unit, channel, seed, slope, status, agingFactor: agingFactors[unitNumber - 1], summary };
}

function escapeReportHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, character => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  })[character]);
}

function buildDiagnosisReport(context = {}) {
  const normalized = {
    unit: context.unit || "未选择机组",
    channel: context.channel || "未选择通道",
    defect: context.defect || "待诊断",
    severity: context.severity || "待评估",
    confidence: context.confidence || "—",
    conclusion: context.conclusion || "尚未完成诊断",
    advice: Array.isArray(context.advice) ? context.advice : [],
    reviewer: context.reviewer || "admin",
    signature: context.signature || "未签名",
    date: context.date || new Date().toISOString().slice(0, 10),
    note: context.note || "无",
    completed: Boolean(context.completed),
  };
  const previewHtml = `<article class="diagnosis-report-document">
    <h1>PD 局部放电诊断报告</h1>
    <p><strong>诊断对象：</strong>${escapeReportHtml(normalized.unit)} / ${escapeReportHtml(normalized.channel)}</p>
    <p><strong>报告状态：</strong>${normalized.completed ? "诊断完成" : "待完成诊断"}</p>
    <h2>诊断结论</h2>
    <p>${escapeReportHtml(normalized.conclusion)}</p>
    <p>缺陷类型：${escapeReportHtml(normalized.defect)}；严重程度：${escapeReportHtml(normalized.severity)}；置信度：${escapeReportHtml(normalized.confidence)}</p>
    <h2>处置建议</h2><ul>${normalized.advice.map(item => `<li>${escapeReportHtml(item)}</li>`).join("") || "<li>等待诊断结果</li>"}</ul>
    <h2>审核信息</h2>
    <p>审核人：${escapeReportHtml(normalized.reviewer)}　签名：${escapeReportHtml(normalized.signature)}　日期：${escapeReportHtml(normalized.date)}</p>
    <p>审核意见：${escapeReportHtml(normalized.note)}</p>
  </article>`;
  const filenameUnit = normalized.unit.replace(/\s+/g, "");
  return {
    context: normalized,
    filename: `局放诊断报告-${filenameUnit}-${normalized.channel}-${normalized.date}.html`,
    previewHtml,
    html: `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><title>PD 局部放电诊断报告</title><style>body{font-family:Arial,"Microsoft YaHei",sans-serif;max-width:840px;margin:40px auto;padding:0 32px;color:#14263d;line-height:1.7}h1{border-bottom:2px solid #176bc2;padding-bottom:16px}h2{margin-top:28px;color:#176bc2}@media print{body{margin:0}}</style></head><body>${previewHtml}</body></html>`,
  };
}

function validateFilterConfig(config = {}) {
  const values = {
    low: parseThreshold(config.low),
    high: parseThreshold(config.high),
    attenuation: parseThreshold(config.attenuation),
    bandwidth: parseThreshold(config.bandwidth),
  };
  for (const field of ["low", "high", "attenuation", "bandwidth"]) {
    if (values[field] === null) return { valid: false, field, error: "请输入有效数值" };
  }
  if (values.low < 0) return { valid: false, field: "low", error: "低截止频率不能为负数" };
  if (values.high <= values.low) return { valid: false, field: "high", error: "高截止频率必须大于低截止频率" };
  if (values.high > values.bandwidth) return { valid: false, field: "high", error: "高截止频率不能超过采样带宽" };
  if (values.attenuation <= 0) return { valid: false, field: "attenuation", error: "阻带衰减必须大于 0" };
  if (values.bandwidth <= 0) return { valid: false, field: "bandwidth", error: "采样带宽必须大于 0" };
  return { valid: true, values };
}

function validateMaskWindow(candidate = {}, records = []) {
  const start = parseThreshold(candidate.start);
  const end = parseThreshold(candidate.end);
  const reason = typeof candidate.reason === "string" ? candidate.reason.trim() : "";
  if (start === null || start < 0 || start > 360) return { valid: false, field: "start", error: "起始相位必须在 0–360° 之间" };
  if (end === null || end < 0 || end > 360) return { valid: false, field: "end", error: "结束相位必须在 0–360° 之间" };
  if (start >= end) return { valid: false, field: "end", error: "结束相位必须大于起始相位" };
  if (!reason) return { valid: false, field: "reason", error: "请填写屏蔽原因" };
  const overlaps = records.some(record => record.id !== candidate.id && start < Number(record.end) && end > Number(record.start));
  if (overlaps) return { valid: false, field: "start", error: "相位区间与现有屏蔽窗重叠" };
  return { valid: true, record: { id: candidate.id || "", start, end, reason, enabled: candidate.enabled !== false } };
}

function normalizeAlarmRecord(record, index = 0) {
  if (Array.isArray(record)) {
    const [time, level, content, status] = record;
    const digits = String(time || "").replace(/\D/g, "").slice(0, 8) || "00000000";
    const unitMatch = String(content || "").match(/(\d+)#\s*机组/);
    return { id: `ALM${digits}${String(index + 1).padStart(4, "0")}`, time, level, content, status, unit: unitMatch ? `${unitMatch[1]}# 机组` : "系统", assignee: "", note: "", operator: "", handledAt: "" };
  }
  if (!record || typeof record !== "object") return null;
  return {
    id: record.id || `ALM00000000${String(index + 1).padStart(4, "0")}`,
    time: record.time || "", level: record.level || "", content: record.content || "", status: record.status || "未确认", unit: record.unit || "系统",
    assignee: record.assignee || "", note: record.note || "", operator: record.operator || "", handledAt: record.handledAt || "",
  };
}

function filterAlarms(records, filters = {}) {
  const unit = filters.unit || "all";
  const level = filters.level || "all";
  const status = filters.status || "all";
  return records.filter(record => (unit === "all" || record.unit === unit)
    && (level === "all" || record.level === level)
    && (status === "all" || (status === "open" ? record.status === "未确认" : record.status !== "未确认")));
}

function transitionAlarm(record, action, payload = {}) {
  if (!record || typeof record !== "object") return { valid: false, error: "报警记录不存在" };
  if (record.status === "已关闭") return { valid: false, error: "已关闭报警不能再次处置" };
  const note = typeof payload.note === "string" ? payload.note.trim() : "";
  const group = typeof payload.group === "string" ? payload.group.trim() : "";
  if (action === "dispatch") {
    if (record.status !== "未确认") return { valid: false, error: "仅未确认报警可派发" };
    if (!group) return { valid: false, field: "group", error: "请选择处理组" };
    if (!note) return { valid: false, field: "note", error: "派发前请填写处置意见" };
    return { valid: true, record: { ...record, status: "已派发", assignee: group, note, operator: payload.operator || "admin", handledAt: payload.handledAt || new Date().toISOString() } };
  }
  if (action === "confirm") {
    if (record.status !== "未确认") return { valid: false, error: "该报警已处置，不能重复确认" };
    return { valid: true, record: { ...record, status: "已确认", note: note || record.note, operator: payload.operator || "admin", handledAt: payload.handledAt || new Date().toISOString() } };
  }
  if (action === "close") {
    if (!note) return { valid: false, field: "note", error: "关闭前请填写处置意见" };
    return { valid: true, record: { ...record, status: "已关闭", note, operator: payload.operator || "admin", handledAt: payload.handledAt || new Date().toISOString() } };
  }
  return { valid: false, error: "不支持的报警操作" };
}

function validateDeviceConfig(config = {}) {
  const name = typeof config.name === "string" ? config.name.trim() : "";
  const calibration = parseThreshold(config.calibration);
  const depth = parseThreshold(config.depth);
  const impedance = parseThreshold(config.impedance);
  if (!name) return { valid: false, field: "name", error: "通道名称不能为空" };
  if (calibration === null || calibration <= 0) return { valid: false, field: "calibration", error: "校准系数必须大于 0" };
  if (depth === null || depth <= 0 || !Number.isInteger(depth)) return { valid: false, field: "depth", error: "存储深度必须是正整数" };
  if (impedance === null || impedance <= 0) return { valid: false, field: "impedance", error: "阻抗必须大于 0" };
  return { valid: true, record: { ...config, name, calibration, depth, impedance } };
}

function summarizeSelfCheck(items = []) {
  const passed = items.filter(item => item.status === "通过").length;
  const failed = items.filter(item => item.status === "失败").length;
  const pending = items.filter(item => item.status === "待检测").length;
  const running = items.some(item => item.status === "检测中");
  const state = !items.length || pending === items.length ? "idle" : failed ? "failed" : running || pending ? "running" : "passed";
  return { state, passed, failed, pending };
}

function validateDemoUser(candidate = {}, records = []) {
  const username = typeof candidate.username === "string" ? candidate.username.trim() : "";
  if (!username) return { valid: false, field: "username", error: "用户名不能为空" };
  if (records.some(record => record.id !== candidate.id && record.username.toLowerCase() === username.toLowerCase())) return { valid: false, field: "username", error: "用户名已存在" };
  const role = ["管理员", "工程师", "浏览者"].includes(candidate.role) ? candidate.role : "浏览者";
  return { valid: true, record: { id: candidate.id || "", username, role, enabled: candidate.enabled !== false } };
}

function toggleDemoUser(user) { return { ...user, enabled: !user.enabled }; }

function filterSystemLogs(logs = [], filters = {}) {
  const operator = filters.operator || "全部用户";
  const action = filters.action || "全部动作";
  return logs.filter(log => (operator === "全部用户" || log.operator === operator)
    && (action === "全部动作" || log.action === action));
}

function serializeSystemLogsCsv(logs = []) {
  const quote = value => `"${String(value ?? "").replaceAll('"', '""')}"`;
  return `\uFEFF时间,操作用户,动作,详情\r\n${logs.map(log => [log.time, log.operator, log.action, log.detail].map(quote).join(",")).join("\r\n")}`;
}

function getFreshnessState(lastUpdated, now = Date.now(), thresholdMs = 30000) {
  const updatedAt = new Date(lastUpdated).getTime();
  const nowAt = new Date(now).getTime();
  if (!Number.isFinite(updatedAt) || !Number.isFinite(nowAt)) return { state: "unknown", ageMs: null };
  const ageMs = Math.max(0, nowAt - updatedAt);
  return { state: ageMs > thresholdMs ? "stale" : "fresh", ageMs };
}

const PDCore = {
  isValidLogin,
  countOpenAlarms,
  validateThresholds,
  upsertById,
  removeById,
  validateIrisImport,
  DEVICE_NODES,
  createDeviceContext,
  findDevicePath,
  formatDevicePath,
  toggleDeviceSelection,
  filterHistoryRows,
  serializeHistoryCsv,
  buildHistoryExportPayload,
  deriveTrendProfile,
  buildDiagnosisReport,
  validateFilterConfig,
  validateMaskWindow,
  normalizeAlarmRecord,
  filterAlarms,
  transitionAlarm,
  validateDeviceConfig,
  summarizeSelfCheck,
  validateDemoUser,
  toggleDemoUser,
  filterSystemLogs,
  serializeSystemLogsCsv,
  getFreshnessState,
};

globalThis.PDCore = PDCore;

if (typeof module !== "undefined" && module.exports) {
  module.exports = PDCore;
}
