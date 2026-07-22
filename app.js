const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
const AUTH_STORAGE_KEY = "pd-monitor.authenticated";
const STORAGE_KEYS = {
  thresholds: "pd-monitor.thresholds",
  aging: "pd-monitor.aging-factors",
  iris: "pd-monitor.iris-benchmarks",
  alarms: "pd-monitor.alarms",
  filterConfig: "pd-monitor.filter-config",
  phaseMasks: "pd-monitor.phase-masks",
  systemLogs: "pd-monitor.system-logs",
  devices: "pd-monitor.devices",
  demoUsers: "pd-monitor.demo-users",
};

const DEFAULT_THRESHOLDS = Object.freeze({ attention: 0.3, abnormal: 1, danger: 3 });
const DEFAULT_AGING_FACTORS = Object.freeze([
  { id: "age-3-hydro", unit: "3# 机组", deviceType: "水轮发电机", factor: 1.2, updatedAt: "2025-05-20", applied: true },
  { id: "age-2-hydro", unit: "2# 机组", deviceType: "水轮发电机", factor: 1.1, updatedAt: "2025-04-18", applied: false },
]);
const DEFAULT_IRIS_BENCHMARKS = Object.freeze([
  { id: "iris-hydro-10kv", name: "Hydro 10kV 标准", deviceType: "水轮发电机", attention: 0.3, abnormal: 1, danger: 3, updatedAt: "2025-05-16" },
  { id: "iris-motor-6kv", name: "Motor 6kV 标准", deviceType: "高压电机", attention: 0.25, abnormal: 0.8, danger: 2.5, updatedAt: "2025-04-28" },
]);
const DEFAULT_ALARMS = Object.freeze([
  ["2025-05-20 14:32:18", "异常", "3# 机组 A相 Qm 超限", "未确认"],
  ["2025-05-20 14:28:55", "注意", "2# 机组 B相 Qavg 偏高", "未确认"],
  ["2025-05-20 13:55:21", "异常", "3# 机组 Ntotal 持续增加", "未确认"],
  ["2025-05-20 12:40:10", "注意", "4# 机组 A相 出现放电", "已确认"],
  ["2025-05-20 11:30:42", "系统", "系统自检完成", "已确认"],
  ["2025-05-20 09:15:33", "危险", "3# 机组 Qm 严重超限", "未确认"],
]);

function validateAlarmRecords(records) {
  const validStatuses = new Set(["未确认", "已派发", "已确认", "已关闭"]);
  return Array.isArray(records) && records.every(record => record && typeof record === "object"
    && [record.id, record.time, record.level, record.content, record.status, record.unit].every(value => typeof value === "string" && value.trim() !== "")
    && validStatuses.has(record.status));
}

function normalizeAgingFactors(records) {
  const firstAppliedIndex = records.findIndex(record => record.applied);
  const appliedIndex = firstAppliedIndex >= 0 ? firstAppliedIndex : records.length ? 0 : -1;
  return records.map((record, index) => ({ ...record, applied: index === appliedIndex }));
}

let thresholdValues = { ...DEFAULT_THRESHOLDS };
let agingFactors = normalizeAgingFactors(DEFAULT_AGING_FACTORS);
let irisBenchmarks = DEFAULT_IRIS_BENCHMARKS.map(item => ({ ...item }));
let thresholdModalMode = "aging";
let thresholdModalTrigger = null;
let thresholdStorageReadFailed = false;
let alarms = DEFAULT_ALARMS.map((record, index) => PDCore.normalizeAlarmRecord(record, index));
const DEFAULT_FILTER_CONFIG = Object.freeze({ low: 0.5, high: 120, attenuation: 80, bandwidth: 250 });
let filterConfig = { ...DEFAULT_FILTER_CONFIG };
const DEFAULT_PHASE_MASKS = Object.freeze([
  { id: "mask-1", start: 45, end: 85, reason: "工频噪声", enabled: true },
  { id: "mask-2", start: 175, end: 215, reason: "变频器干扰", enabled: true },
  { id: "mask-3", start: 310, end: 350, reason: "谐波干扰", enabled: true },
]);
let phaseMasks = DEFAULT_PHASE_MASKS.map(record => ({ ...record }));
const DEFAULT_DEVICES = Object.freeze([
  { id: "CH01", unit: "3#", name: "A相UHF", type: "UHF", sampleRate: "500 MS/s", calibration: 0.85, depth: 1024, impedance: 52.3, status: "启用" },
  { id: "CH04", unit: "3#", name: "中性点UHF", type: "UHF", sampleRate: "500 MS/s", calibration: 0.92, depth: 2048, impedance: 49.8, status: "维护" },
]);
let devices = DEFAULT_DEVICES.map(record => ({ ...record }));
let selectedDeviceId = "CH01";
let deviceFormDirty = false;
let deviceStorageWarning = false;
let selfCheckItems = ["编码脉冲注入", "主板网络检测", "传感器灵敏度检测"].map(name => ({ name, status: "待检测" }));
let selfCheckTimer = null;
let demoUsers = [{ id: "user-admin", username: "admin", role: "管理员", enabled: true }, { id: "user-engineer", username: "engineer01", role: "工程师", enabled: true }, { id: "user-viewer", username: "viewer01", role: "浏览者", enabled: false }];
const DEFAULT_SYSTEM_LOGS = Object.freeze([
  { time: "2025-05-20T14:31:22.000Z", operator: "engineer01", action: "阈值变更", detail: "更新 3#机组 A相阈值配置" },
  { time: "2025-05-20T14:28:45.000Z", operator: "admin", action: "系统配置", detail: "完成系统基础配置检查" },
]);
let systemLogs = DEFAULT_SYSTEM_LOGS.map(record => ({ ...record }));
let currentSystemLogs = [...systemLogs];
let lastDataUpdatedAt = new Date().toISOString();
const DATA_STALE_THRESHOLD_MS = 30000;

function readAuthenticated() {
  try {
    return localStorage.getItem(AUTH_STORAGE_KEY) === "true";
  } catch (error) {
    return false;
  }
}

function showAuthenticatedView(authenticated) {
  const loginView = $("#loginView");
  const appShell = $("#appShell");
  if (!loginView || !appShell) return;
  loginView.hidden = authenticated;
  appShell.hidden = !authenticated;
  if (authenticated) requestAnimationFrame(drawAll);
}

function initAuthentication() {
  const loginForm = $("#loginForm");
  const username = $("#loginUsername");
  const password = $("#loginPassword");
  const errorMessage = $("#loginError");
  const passwordToggle = $("#passwordToggle");
  const logoutButton = $("#logoutBtn");
  if (!loginForm || !username || !password || !errorMessage || !passwordToggle || !logoutButton) return;

  showAuthenticatedView(readAuthenticated());

  passwordToggle.addEventListener("click", () => {
    const showing = password.type === "text";
    password.type = showing ? "password" : "text";
    passwordToggle.textContent = showing ? "显示" : "隐藏";
    passwordToggle.setAttribute("aria-label", showing ? "显示密码" : "隐藏密码");
    passwordToggle.setAttribute("aria-pressed", String(!showing));
    password.focus();
  });

  loginForm.addEventListener("submit", event => {
    event.preventDefault();
    if (!PDCore.isValidLogin(username.value, password.value)) {
      errorMessage.textContent = "账户或密码错误";
      username.focus();
      username.select();
      return;
    }

    try {
      localStorage.setItem(AUTH_STORAGE_KEY, "true");
    } catch (error) {
      // 存储不可用时仍允许本次演示会话进入系统。
    }
    errorMessage.textContent = "";
    showAuthenticatedView(true);
  });

  logoutButton.addEventListener("click", () => {
    try {
      localStorage.removeItem(AUTH_STORAGE_KEY);
    } catch (error) {
      // 存储不可用时仍切回登录视图。
    }
    password.value = "";
    password.type = "password";
    passwordToggle.textContent = "显示";
    passwordToggle.setAttribute("aria-label", "显示密码");
    passwordToggle.setAttribute("aria-pressed", "false");
    errorMessage.textContent = "";
    showAuthenticatedView(false);
    username.focus();
  });
}

const historyRows = [
  ["2025-05-20 14:32:18", "3#机组", "A相", "1,245.3", "245.6", "12,345", "异常"],
  ["2025-05-20 13:55:21", "3#机组", "B相", "356.8", "78.9", "3,456", "注意"],
  ["2025-05-20 12:40:10", "4#机组", "A相", "98.7", "22.1", "1,234", "正常"],
  ["2025-05-20 11:30:42", "2#机组", "C相", "245.6", "45.3", "2,345", "注意"],
  ["2025-05-20 09:15:33", "3#机组", "Qm通道", "856.2", "156.7", "6,789", "异常"],
  ["2025-05-20 08:22:11", "1#机组", "B相", "78.4", "15.6", "987", "正常"],
];

const unitProfiles = [
  { unit: "1# 机组", channel: "1#-B相", status: "正常", levelClass: "normal", qm: "125.6", qavg: "28.4", ntotal: "1,126", beta: "0.12", gauge: [38, 32, 28, 22], seed: 1 },
  { unit: "2# 机组", channel: "2#-C相", status: "注意", levelClass: "warn", qm: "356.8", qavg: "78.9", ntotal: "3,456", beta: "0.36", gauge: [56, 48, 44, 38], seed: 2 },
  { unit: "3# 机组", channel: "3#-A相", status: "异常", levelClass: "danger", qm: "1,245.3", qavg: "245.6", ntotal: "12,345", beta: "0.85", gauge: [82, 76, 72, 66], seed: 3 },
  { unit: "4# 机组", channel: "4#-A相", status: "正常", levelClass: "normal", qm: "98.7", qavg: "22.1", ntotal: "1,234", beta: "0.08", gauge: [34, 28, 31, 18], seed: 4 },
];

const pulseRows = [
  { id: "#1", phase: "32.4°", tr: "1.02 ns", width: "7.80 ns", voltage: "0.228 V", charge: "126.4 pC" },
  { id: "#2", phase: "45.7°", tr: "1.25 ns", width: "8.76 ns", voltage: "0.312 V", charge: "245.6 pC" },
  { id: "#3", phase: "67.1°", tr: "1.41 ns", width: "9.10 ns", voltage: "0.286 V", charge: "211.8 pC" },
  { id: "#4", phase: "89.3°", tr: "1.18 ns", width: "7.96 ns", voltage: "0.194 V", charge: "156.2 pC" },
];

const exportOptions = [
  ["CSV", "历史统计数据", "适用于 Excel/MATLAB/Python"],
  ["JSON", "结构化数据包", "包含筛选条件与完整字段"],
  ["WAVEFORM", "当前脉冲波形", "包含脉冲参数与回放对象"],
];

const diagnosisDefects = [
  {
    name: "槽部放电",
    english: "Slot Discharge",
    severity: "严重",
    confidence: "88%",
    percent: 88,
    causes: ["定子槽部绝缘存在局部电场畸变，电场强度集中", "槽内固定位移导致槽楔或涂层表面出现微小气隙或裂纹", "高电压作用下气隙中发生局部电离放电", "放电侵蚀绝缘表面，导致绝缘材料劣化、碳化", "劣化区域扩大，放电量增加，最终可能引发槽部绝缘击穿"],
    advice: ["重点检查定子槽部绝缘状况", "加强槽部绝缘清洁并保持通风散热"],
  },
  {
    name: "端部放电",
    english: "End Discharge",
    severity: "中等",
    confidence: "12%",
    percent: 12,
    causes: ["端部绕组电场集中，防晕层过渡区存在电位梯度", "绑扎结构松动造成局部空气间隙", "湿度升高或表面污秽会提高端部电晕概率", "脉冲相位宽度较大，常伴随较强的相位离散性", "需结合端部目视检查与红外温升结果复核"],
    advice: ["复核端部绑扎和防晕层状态", "观察湿度与Qm同步变化"],
  },
  {
    name: "内部气隙放电",
    english: "Internal Cavity",
    severity: "低",
    confidence: "<1%",
    percent: 1,
    causes: ["绝缘内部气隙特征不明显，当前匹配概率较低", "相位分布与内部气隙模板偏差较大", "若持续出现，应关注绝缘制造缺陷或热老化空洞", "需要结合介损、局放离线试验进一步确认", "当前更可能为槽部放电伴随随机噪声"],
    advice: ["保留为低概率候选", "后续结合离线试验复核"],
  },
  {
    name: "表面放电",
    english: "Surface Discharge",
    severity: "低",
    confidence: "<1%",
    percent: 1,
    causes: ["绝缘表面污秽、潮湿或爬电路径可能诱发表面放电", "当前PRPD点簇未呈现典型沿面扩展特征", "幅值离散度低于表面放电模板", "建议在停机窗口检查线棒表面清洁度", "若环境湿度升高后增强，应提高该候选权重"],
    advice: ["关注环境湿度和表面污秽", "必要时安排清洁和防潮处理"],
  },
  {
    name: "悬浮电位放电",
    english: "Floating Potential",
    severity: "低",
    confidence: "<1%",
    percent: 1,
    causes: ["金属部件接触不良可能产生悬浮电位放电", "当前缺少周期性窄脉冲和稳定重复特征", "与主放电簇的相位耦合度较弱", "需核查屏蔽层、接地端子及连接件状态", "作为低概率候选保留在后续趋势跟踪中"],
    advice: ["复核接地与连接件紧固状态", "持续跟踪窄脉冲重复性"],
  },
];

let selectedUnitIndex = 2;
let selectedPulseIndex = 1;
let dashboardAlarmFilter = "all";
let alarmManagementFilter = "all";
let selectedAlarmIndex = 0;
let historyReplaySeed = 0;
let currentHistoryRows = [...historyRows];
let historyPlaybackTimer = null;
let selectedDiagnosisIndex = 0;
let selectedDiagUnit = "3# 机组";
let selectedDiagChannel = "A相";
let currentPage = "dashboard";
let deviceContext = PDCore.createDeviceContext();
let currentTrendProfile = PDCore.deriveTrendProfile("3# 机组", "A相");
let diagnosisContext = {
  unit: selectedDiagUnit,
  channel: selectedDiagChannel,
  defect: diagnosisDefects[0].name,
  severity: diagnosisDefects[0].severity,
  confidence: diagnosisDefects[0].confidence,
  conclusion: `疑似${diagnosisDefects[0].name}`,
  advice: [...diagnosisDefects[0].advice],
  reviewer: "admin",
  signature: "已签名",
  date: new Date().toISOString().slice(0, 10),
  note: "",
  completed: false,
};
const MULTI_DEVICE_PAGES = new Set(["history"]);
const DEVICE_TREE_PAGES = new Set(["history", "trend", "processing"]);
let toastTimer = null;

function badge(level) {
  if (level === "正常" || level === "已确认" || level === "已关闭") return `<span class="pill ok">${level}</span>`;
  if (level === "注意") return `<span class="pill warn">${level}</span>`;
  if (level === "危险") return `<span class="pill risk">${level}</span>`;
  if (level === "系统") return `<span class="pill ok">${level}</span>`;
  return `<span class="pill bad">${level}</span>`;
}

function showToast(message) {
  const toast = $("#operationToast");
  if (!toast) return;
  toast.textContent = message;
  toast.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { toast.hidden = true; }, 2800);
}

function markDataUpdated() {
  lastDataUpdatedAt = new Date().toISOString();
  renderFreshness();
}

function renderFreshness() {
  const label = $("#lastDataUpdated"); const warning = $("#staleDataWarning");
  if (!label || !warning) return;
  const freshness = PDCore.getFreshnessState(lastDataUpdatedAt, Date.now(), DATA_STALE_THRESHOLD_MS);
  if (freshness.state === "unknown") { label.textContent = "数据更新：未知"; warning.hidden = false; return; }
  const seconds = Math.floor(freshness.ageMs / 1000);
  label.textContent = `数据更新：${seconds < 5 ? "刚刚" : `${seconds} 秒前`}`;
  warning.hidden = freshness.state !== "stale";
}

function setPanelState(panel, state, message = "", retry) {
  if (!panel) return;
  let overlay = panel.querySelector(".panel-state-overlay");
  if (!overlay) { overlay = document.createElement("div"); overlay.className = "panel-state-overlay"; overlay.setAttribute("role", "status"); panel.append(overlay); }
  overlay.setAttribute("data-state", state);
  overlay.hidden = state === "ready";
  overlay.innerHTML = state === "loading" ? `<span class="state-spinner" aria-hidden="true"></span><span>${escapeHTML(message || "正在处理...")}</span>` : `<span>${escapeHTML(message || "操作失败，请重试")}</span>${typeof retry === "function" ? '<button class="ghost" type="button">重试</button>' : ""}`;
  const retryButton = overlay.querySelector("button");
  if (retryButton) retryButton.addEventListener("click", retry, { once: true });
}

async function runButtonAction(button, busyText, operation) {
  if (!button || button.disabled) return;
  const original = button.textContent;
  const panel = button.closest(".panel");
  button.disabled = true;
  button.textContent = busyText;
  setPanelState(panel, "loading", busyText);
  try { await operation(); setPanelState(panel, "ready"); markDataUpdated(); }
  catch (error) { setPanelState(panel, "error", error?.message || "操作失败，请重试", () => runButtonAction(button, busyText, operation)); }
  finally { button.disabled = false; button.textContent = original; }
}

function requestConfirmation({ title, message, confirmLabel = "确认", trigger }) {
  const dialog = $("#confirmDialog");
  const accept = $("#confirmDialogAccept");
  const cancel = $("#confirmDialogCancel");
  if (!dialog || !accept || !cancel) return Promise.resolve(false);
  $("#confirmDialogTitle").textContent = title;
  $("#confirmDialogMessage").textContent = message;
  accept.textContent = confirmLabel;
  dialog.hidden = false;
  cancel.focus();
  return new Promise(resolve => {
    const finish = result => {
      dialog.hidden = true;
      accept.onclick = null;
      cancel.onclick = null;
      trigger?.focus();
      resolve(result);
    };
    accept.onclick = () => finish(true);
    cancel.onclick = () => finish(false);
  });
}

function flattenDeviceNodes(nodes, level = 0) {
  return nodes.flatMap(node => [{ ...node, level }, ...flattenDeviceNodes(node.children || [], level + 1)]);
}

function renderDeviceLinkedPage(pageId = currentPage) {
  const path = PDCore.formatDevicePath(deviceContext);
  $$('[data-device-path]').forEach(node => { node.textContent = pageId === "system" && $(".side-menu [data-sys='users']")?.classList.contains("active") ? "全局设置 / 用户管理" : path; });
  const summary = $(".device-tree-summary");
  const parts = path.split(" / ");
  if (summary) summary.innerHTML = `<b>${parts[1] || "设备"}</b><span>${parts[3] || "通道"}</span>`;
}

function renderDeviceTree() {
  const container = $("#deviceTreeNodes");
  if (!container) return;
  const query = deviceContext.query.trim().toLowerCase();
  container.innerHTML = flattenDeviceNodes(PDCore.DEVICE_NODES)
    .filter(node => !query || node.label.toLowerCase().includes(query) || node.type !== "channel")
    .map(node => `<button class="device-tree-node" type="button" data-device-id="${node.id}" data-level="${node.level}" aria-pressed="${deviceContext.selectedIds.includes(node.id)}">${node.children?.length ? "▾ " : "○ "}${node.label}</button>`)
    .join("");
  $$("[data-device-id]", container).forEach(button => button.addEventListener("click", () => selectDeviceNode(button.dataset.deviceId)));
}

function selectDeviceNode(id) {
  deviceContext = PDCore.toggleDeviceSelection(deviceContext, id);
  renderDeviceTree();
  renderDeviceLinkedPage(currentPage);
  showToast(`已切换至 ${PDCore.formatDevicePath(deviceContext)}`);
  requestAnimationFrame(drawAll);
}

function initDeviceTree() {
  const panel = $("#deviceTreePanel");
  const toggle = $("#deviceTreeToggle");
  const search = $("#deviceTreeSearch");
  const multi = $("#deviceTreeMulti");
  toggle?.addEventListener("click", () => {
    deviceContext = { ...deviceContext, collapsed: !deviceContext.collapsed };
    panel.classList.toggle("collapsed", deviceContext.collapsed);
    toggle.setAttribute("aria-expanded", String(!deviceContext.collapsed));
    toggle.title = deviceContext.collapsed ? "展开设备树" : "收起设备树";
    $(".page.active")?.classList.toggle("tree-expanded", !deviceContext.collapsed);
    requestAnimationFrame(drawAll);
  });
  search?.addEventListener("input", () => {
    deviceContext = { ...deviceContext, query: search.value };
    renderDeviceTree();
  });
  multi?.addEventListener("change", () => {
    deviceContext = { ...deviceContext, multi: multi.checked, selectedIds: [deviceContext.selectedId] };
    renderDeviceTree();
    showToast(multi.checked ? "已开启多通道选择" : "已恢复单通道选择");
  });
  renderDeviceTree();
  renderDeviceLinkedPage();
}

function setPage(pageId) {
  if (pageId !== "history") stopHistoryPlayback();
  if (currentPage === "system" && pageId !== "system" && selfCheckTimer) cancelSelfCheck("离开系统设置，自检已停止");
  currentPage = pageId;
  $$("#mainNav .nav-btn").forEach(x => x.classList.toggle("active", x.dataset.page === pageId));
  $$(".page").forEach(p => p.classList.toggle("active", p.id === pageId));
  const panel = $("#deviceTreePanel");
  if (panel) panel.hidden = !DEVICE_TREE_PAGES.has(pageId);
  const multi = $("#deviceTreeMulti");
  if (multi) {
    const supported = MULTI_DEVICE_PAGES.has(pageId);
    multi.closest("label").hidden = !supported;
    if (!supported && deviceContext.multi) {
      deviceContext = { ...deviceContext, multi: false, selectedIds: [deviceContext.selectedId] };
      multi.checked = false;
      renderDeviceTree();
    }
  }
  $(".page.active")?.classList.toggle("tree-expanded", !deviceContext.collapsed && pageId !== "dashboard");
  renderDeviceLinkedPage(pageId);
  drawAll();
}

function alarmNo(index) {
  return alarms[index]?.id || `ALM${String(index + 1).padStart(4, "0")}`;
}

function readAlarmStorage() {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.alarms);
    if (raw === null) return DEFAULT_ALARMS.map((record, index) => PDCore.normalizeAlarmRecord(record, index));
    const parsed = JSON.parse(raw);
    const normalized = Array.isArray(parsed) ? parsed.map((record, index) => PDCore.normalizeAlarmRecord(record, index)) : [];
    return validateAlarmRecords(normalized) ? normalized : DEFAULT_ALARMS.map((record, index) => PDCore.normalizeAlarmRecord(record, index));
  } catch (error) {
    return DEFAULT_ALARMS.map((record, index) => PDCore.normalizeAlarmRecord(record, index));
  }
}

function saveAlarmStorage() {
  try {
    localStorage.setItem(STORAGE_KEYS.alarms, JSON.stringify(alarms));
    return true;
  } catch (error) {
    return false;
  }
}

function appendSystemLog(action, detail) {
  const entry = { time: new Date().toISOString(), operator: "admin", action, detail };
  systemLogs = [entry, ...systemLogs].slice(0, 100);
  try {
    localStorage.setItem(STORAGE_KEYS.systemLogs, JSON.stringify(systemLogs));
  } catch (error) {
    // 日志存储失败不阻断当前处置，但页面仍显示操作结果。
  }
  renderSystemLogFilters();
  renderSystemLogs();
  markDataUpdated();
}

function loadSystemLogs() {
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEYS.systemLogs) || "null");
    systemLogs = Array.isArray(parsed) ? parsed.filter(log => log && log.time && log.operator && log.action) : DEFAULT_SYSTEM_LOGS.map(record => ({ ...record }));
  } catch (error) { systemLogs = DEFAULT_SYSTEM_LOGS.map(record => ({ ...record })); }
}

function renderSystemLogFilters() {
  const user = $("#systemLogUserFilter"); const action = $("#systemLogActionFilter");
  if (!user || !action) return;
  const selectedUser = user.value || "全部用户"; const selectedAction = action.value || "全部动作";
  user.innerHTML = ["全部用户", ...new Set(systemLogs.map(log => log.operator))].map(value => `<option>${escapeHTML(value)}</option>`).join("");
  action.innerHTML = ["全部动作", ...new Set(systemLogs.map(log => log.action))].map(value => `<option>${escapeHTML(value)}</option>`).join("");
  if ([...user.options].some(option => option.value === selectedUser)) user.value = selectedUser;
  if ([...action.options].some(option => option.value === selectedAction)) action.value = selectedAction;
}

function renderSystemLogs() {
  const rows = $("#systemLogRows"); if (!rows) return;
  currentSystemLogs = PDCore.filterSystemLogs(systemLogs, { operator: $("#systemLogUserFilter")?.value, action: $("#systemLogActionFilter")?.value });
  rows.innerHTML = currentSystemLogs.length ? currentSystemLogs.map((log, index) => `<tr data-log-index="${index}" tabindex="0" role="button"><td>${escapeHTML(log.time.slice(0, 19).replace("T", " "))}</td><td>${escapeHTML(log.operator)}</td><td>${escapeHTML(log.action)}</td><td>${escapeHTML(log.detail || "-")}</td></tr>`).join("") : `<tr><td colspan="4" class="empty-state">当前条件下没有日志</td></tr>`;
  $("#systemLogHint").textContent = `共 ${currentSystemLogs.length} 条日志`;
}

function selectSystemLog(index) {
  const log = currentSystemLogs[index]; if (!log) return;
  $$("#systemLogRows tr").forEach(row => row.classList.toggle("selected", Number(row.dataset.logIndex) === index));
  const detail = $("#systemLogDetail");
  detail.innerHTML = `<strong>日志详情</strong><dl><dt>时间</dt><dd>${escapeHTML(log.time.slice(0, 19).replace("T", " "))}</dd><dt>操作用户</dt><dd>${escapeHTML(log.operator)}</dd><dt>动作</dt><dd>${escapeHTML(log.action)}</dd><dt>详情</dt><dd>${escapeHTML(log.detail || "-")}</dd></dl>`;
  detail.focus();
}

function initSystemLogs() {
  loadSystemLogs(); renderSystemLogFilters(); renderSystemLogs();
  $("#querySystemLogsBtn")?.addEventListener("click", renderSystemLogs);
  $("#exportSystemLogsBtn")?.addEventListener("click", () => { downloadBlob(PDCore.serializeSystemLogsCsv(currentSystemLogs), "text/csv;charset=utf-8", `system-logs-${new Date().toISOString().slice(0, 10)}.csv`); });
  $("#systemLogRows")?.addEventListener("click", event => { const row = event.target.closest("tr[data-log-index]"); if (row) selectSystemLog(Number(row.dataset.logIndex)); });
  $("#systemLogRows")?.addEventListener("keydown", event => { if (!["Enter", " "].includes(event.key)) return; const row = event.target.closest("tr[data-log-index]"); if (row) { event.preventDefault(); selectSystemLog(Number(row.dataset.logIndex)); } });
}

function renderDeviceRows() {
  const rows = $("#deviceRows");
  if (!rows) return;
  rows.innerHTML = devices.map(record => `<tr data-device-id="${record.id}" tabindex="0" role="button" class="${record.id === selectedDeviceId ? "selected" : ""}"><td>${record.id}</td><td>${record.unit}</td><td>${escapeHTML(record.name)}</td><td>${record.type}</td><td>${record.sampleRate}</td><td>${badge(record.status === "启用" ? "正常" : "注意")}</td></tr>`).join("");
}

function loadDeviceForm(record = devices.find(item => item.id === selectedDeviceId)) {
  if (!record) return;
  $("#deviceType").value = record.type;
  $("#deviceName").value = record.name;
  $("#deviceCalibration").value = String(record.calibration);
  $("#deviceDepth").value = String(record.depth);
  $("#deviceImpedance").value = String(record.impedance);
  deviceFormDirty = false;
  renderDeviceRows();
}

function saveCurrentDeviceDraft() {
  const index = devices.findIndex(record => record.id === selectedDeviceId);
  if (index < 0) return false;
  const result = PDCore.validateDeviceConfig({ ...devices[index], type: $("#deviceType").value, name: $("#deviceName").value, calibration: $("#deviceCalibration").value, depth: $("#deviceDepth").value, impedance: $("#deviceImpedance").value });
  ["deviceName", "deviceCalibration", "deviceDepth", "deviceImpedance"].forEach(id => $("#" + id)?.removeAttribute("aria-invalid"));
  if (!result.valid) {
    const input = $("#device" + result.field[0].toUpperCase() + result.field.slice(1));
    input?.setAttribute("aria-invalid", "true");
    input?.focus();
    showToast(result.error);
    return false;
  }
  const nextDevices = devices.map((record, recordIndex) => recordIndex === index ? result.record : record);
  try { localStorage.setItem(STORAGE_KEYS.devices, JSON.stringify(nextDevices)); }
  catch (error) { showToast("设备配置保存失败，请检查浏览器存储权限"); return false; }
  devices = nextDevices;
  deviceFormDirty = false;
  renderDeviceRows();
  appendSystemLog("设备配置", `${selectedDeviceId} 配置已保存`);
  return true;
}

function loadDevices() {
  deviceStorageWarning = false;
  try {
    const stored = JSON.parse(localStorage.getItem(STORAGE_KEYS.devices) || "null");
    if (stored === null) return;
    if (!Array.isArray(stored) || !stored.length) throw new Error("invalid devices");
    const validated = stored.map(record => PDCore.validateDeviceConfig(record));
    if (validated.some(result => !result.valid)) throw new Error("invalid devices");
    devices = validated.map(result => result.record);
  } catch (error) {
    devices = DEFAULT_DEVICES.map(record => ({ ...record }));
    deviceStorageWarning = true;
  }
}

function requestDeviceDirtyDecision() {
  const dialog = $("#deviceDirtyDialog");
  dialog.hidden = false;
  $("#deviceDirtyCancel").focus();
  return new Promise(resolve => {
    const finish = decision => {
      dialog.hidden = true;
      ["deviceDirtySave", "deviceDirtyDiscard", "deviceDirtyCancel"].forEach(id => $("#" + id).removeEventListener("click", handlers[id]));
      resolve(decision);
    };
    const handlers = {
      deviceDirtySave: () => finish("save"),
      deviceDirtyDiscard: () => finish("discard"),
      deviceDirtyCancel: () => finish("cancel"),
    };
    Object.entries(handlers).forEach(([id, handler]) => $("#" + id).addEventListener("click", handler));
  });
}

async function selectDeviceRecord(id) {
  if (id === selectedDeviceId) return;
  if (deviceFormDirty) {
    const decision = await requestDeviceDirtyDecision();
    if (decision === "cancel") return;
    if (decision === "save" && !saveCurrentDeviceDraft()) return;
  }
  selectedDeviceId = id;
  loadDeviceForm();
}

function initDeviceManagement() {
  loadDevices();
  renderDeviceRows();
  loadDeviceForm();
  if (deviceStorageWarning) showToast("设备配置数据异常，已恢复默认值");
  $("#deviceRows")?.addEventListener("click", event => {
    const row = event.target.closest("tr[data-device-id]");
    if (row) selectDeviceRecord(row.dataset.deviceId);
  });
  $("#deviceRows")?.addEventListener("keydown", event => {
    if (event.key !== "Enter" && event.key !== " ") return;
    const row = event.target.closest("tr[data-device-id]");
    if (!row) return;
    event.preventDefault();
    selectDeviceRecord(row.dataset.deviceId);
  });
  ["deviceType", "deviceName", "deviceCalibration", "deviceDepth", "deviceImpedance"].forEach(id => $("#" + id)?.addEventListener("input", () => { deviceFormDirty = true; }));
}

function renderSelfCheck() {
  const summary = PDCore.summarizeSelfCheck(selfCheckItems);
  $("#selfCheckRows").innerHTML = selfCheckItems.map(item => `<tr><td>${item.name}</td><td>${item.status}</td><td><span class="${item.status === "通过" ? "ok-text" : item.status === "失败" ? "bad-text" : "warn-text"}">●</span></td></tr>`).join("");
  const labels = { idle: "待启动", running: "检测中", passed: "全部通过", failed: "存在失败项" };
  $("#selfCheckStatus").textContent = labels[summary.state];
  $("#selfCheckProgress").style.width = `${Math.round((summary.passed + summary.failed) / selfCheckItems.length * 100)}%`;
  $("#startSelfCheckBtn").disabled = summary.state === "running";
  $("#cancelSelfCheckBtn").disabled = summary.state !== "running";
  $("#retrySelfCheckBtn").disabled = summary.state !== "failed";
}

function cancelSelfCheck(message = "自检已取消") {
  clearTimeout(selfCheckTimer);
  selfCheckTimer = null;
  selfCheckItems = selfCheckItems.map(item => item.status === "检测中" ? { ...item, status: "待检测" } : item);
  renderSelfCheck();
  showToast(message);
}

function startSelfCheck() {
  clearTimeout(selfCheckTimer);
  selfCheckItems = selfCheckItems.map(item => ({ ...item, status: "待检测" }));
  let index = 0;
  const advance = () => {
    if (index > 0) selfCheckItems[index - 1].status = $("#selfCheckFailureMode").checked && index - 1 === 1 ? "失败" : "通过";
    if (index < selfCheckItems.length) {
      selfCheckItems[index].status = "检测中";
      index += 1;
      renderSelfCheck();
      selfCheckTimer = setTimeout(advance, 320);
      return;
    }
    selfCheckTimer = null;
    renderSelfCheck();
    const summary = PDCore.summarizeSelfCheck(selfCheckItems);
    appendSystemLog("硬件自检", summary.state === "passed" ? "全部项目通过" : "检测到失败项");
    showToast(summary.state === "passed" ? "硬件自检全部通过" : "硬件自检存在失败项，可重试");
  };
  advance();
}

function initSelfCheck() {
  renderSelfCheck();
  $("#startSelfCheckBtn")?.addEventListener("click", startSelfCheck);
  $("#retrySelfCheckBtn")?.addEventListener("click", startSelfCheck);
  $("#cancelSelfCheckBtn")?.addEventListener("click", () => cancelSelfCheck());
}

function saveDemoUsers() { try { localStorage.setItem(STORAGE_KEYS.demoUsers, JSON.stringify(demoUsers)); return true; } catch (error) { showToast("用户数据保存失败"); return false; } }
function renderDemoUsers() { $("#demoUserRows").innerHTML = demoUsers.map(user => `<tr><td>${escapeHTML(user.username)}</td><td>${user.role}</td><td>${user.enabled ? '<span class="pill ok">启用</span>' : '<span class="pill">停用</span>'}</td><td><button class="ghost" data-demo-user-action="edit" data-id="${user.id}">编辑</button> <button class="ghost" data-demo-user-action="toggle" data-id="${user.id}">${user.enabled ? "停用" : "启用"}</button></td></tr>`).join(""); }
function openDemoUserModal(user = null) { $("#demoUserId").value = user?.id || ""; $("#demoUsername").value = user?.username || ""; $("#demoUserRole").value = user?.role || "浏览者"; $("#demoUserEnabled").checked = user?.enabled !== false; $("#demoUserError").textContent = ""; $("#demoUserModal").hidden = false; $("#demoUsername").focus(); }
function closeDemoUserModal() { $("#demoUserModal").hidden = true; }
function initDemoUsers() {
  try { const stored = JSON.parse(localStorage.getItem(STORAGE_KEYS.demoUsers) || "null"); if (Array.isArray(stored) && stored.length) demoUsers = stored; } catch (error) { showToast("演示用户数据异常，已使用默认值"); }
  renderDemoUsers();
  $("#addDemoUserBtn")?.addEventListener("click", () => openDemoUserModal());
  $("#demoUserClose")?.addEventListener("click", closeDemoUserModal); $("#demoUserCancel")?.addEventListener("click", closeDemoUserModal);
  $("#demoUserForm")?.addEventListener("submit", event => { event.preventDefault(); const id = $("#demoUserId").value; const result = PDCore.validateDemoUser({ id, username: $("#demoUsername").value, role: $("#demoUserRole").value, enabled: $("#demoUserEnabled").checked }, demoUsers); if (!result.valid) { $("#demoUserError").textContent = result.error; return; } const record = { ...result.record, id: id || `user-${Date.now()}` }; demoUsers = PDCore.upsertById(demoUsers, record); if (saveDemoUsers()) { renderDemoUsers(); closeDemoUserModal(); appendSystemLog("用户管理", `${record.username} 已保存`); } });
  $("#demoUserRows")?.addEventListener("click", event => { const button = event.target.closest("button[data-demo-user-action]"); if (!button) return; const user = demoUsers.find(item => item.id === button.dataset.id); if (!user) return; if (button.dataset.demoUserAction === "edit") openDemoUserModal(user); else { demoUsers = PDCore.upsertById(demoUsers, PDCore.toggleDemoUser(user)); if (saveDemoUsers()) { renderDemoUsers(); appendSystemLog("用户管理", `${user.username} 状态已切换`); } } });
}

function renderFilterConfig(message = "") {
  const fieldIds = { low: "filterLow", high: "filterHigh", attenuation: "filterAttenuation", bandwidth: "filterBandwidth" };
  Object.entries(fieldIds).forEach(([field, id]) => {
    const input = $("#" + id);
    if (input) {
      input.value = filterConfig[field];
      input.removeAttribute("aria-invalid");
    }
  });
  const summary = $("#filterResultSummary");
  if (summary) summary.textContent = message || `当前配置：${filterConfig.low.toFixed(2)}–${filterConfig.high.toFixed(2)} MHz，衰减 ${filterConfig.attenuation} dB，带宽 ${filterConfig.bandwidth} MHz`;
  drawSpectrum("filterChart");
}

function loadFilterConfig() {
  try {
    const stored = JSON.parse(localStorage.getItem(STORAGE_KEYS.filterConfig) || "null");
    const result = PDCore.validateFilterConfig(stored);
    filterConfig = result.valid ? result.values : { ...DEFAULT_FILTER_CONFIG };
  } catch (error) {
    filterConfig = { ...DEFAULT_FILTER_CONFIG };
  }
  renderFilterConfig();
}

function applyFilterConfig() {
  const candidate = {
    low: $("#filterLow")?.value,
    high: $("#filterHigh")?.value,
    attenuation: $("#filterAttenuation")?.value,
    bandwidth: $("#filterBandwidth")?.value,
  };
  const result = PDCore.validateFilterConfig(candidate);
  $$("#filterLow, #filterHigh, #filterAttenuation, #filterBandwidth").forEach(input => input.removeAttribute("aria-invalid"));
  if (!result.valid) {
    const input = $("#filter" + result.field[0].toUpperCase() + result.field.slice(1));
    input?.setAttribute("aria-invalid", "true");
    input?.focus();
    $("#filterResultSummary").textContent = `配置未应用：${result.error}`;
    showToast(result.error);
    return false;
  }
  const previous = { ...filterConfig };
  filterConfig = result.values;
  try { localStorage.setItem(STORAGE_KEYS.filterConfig, JSON.stringify(filterConfig)); }
  catch (error) { showToast("本地存储不可用，本次配置仅在当前页面有效"); }
  renderFilterConfig(`已应用：${previous.low.toFixed(2)}–${previous.high.toFixed(2)} MHz → ${filterConfig.low.toFixed(2)}–${filterConfig.high.toFixed(2)} MHz`);
  return true;
}

function renderPhaseMasks() {
  const rows = $("#phaseMaskRows");
  if (!rows) return;
  rows.innerHTML = phaseMasks.length ? phaseMasks.map((record, index) => `<tr><td>${index + 1}</td><td>${record.start}°</td><td>${record.end}°</td><td>${escapeHTML(record.reason)}</td><td>${record.enabled ? '<span class="pill ok">启用</span>' : '<span class="pill">停用</span>'}</td><td><div class="mask-actions"><button class="ghost" type="button" data-mask-action="edit" data-id="${record.id}">编辑</button><button class="ghost" type="button" data-mask-action="toggle" data-id="${record.id}">${record.enabled ? "停用" : "启用"}</button><button class="danger-btn" type="button" data-mask-action="delete" data-id="${record.id}">删除</button></div></td></tr>`).join("") : '<tr><td colspan="6">暂无屏蔽窗</td></tr>';
  drawPrpd("maskPrpd");
}

function savePhaseMasks(message) {
  try { localStorage.setItem(STORAGE_KEYS.phaseMasks, JSON.stringify(phaseMasks)); }
  catch (error) { showToast("本地存储不可用，本次修改仅在当前页面有效"); }
  renderPhaseMasks();
  showToast(message);
}

function loadPhaseMasks() {
  try {
    const stored = JSON.parse(localStorage.getItem(STORAGE_KEYS.phaseMasks) || "null");
    if (Array.isArray(stored)) {
      const accepted = [];
      for (const record of stored) {
        const result = PDCore.validateMaskWindow(record, accepted);
        if (!result.valid || !record.id) throw new Error("invalid phase masks");
        accepted.push({ ...result.record, id: record.id });
      }
      phaseMasks = accepted;
    }
  } catch (error) {
    phaseMasks = DEFAULT_PHASE_MASKS.map(record => ({ ...record }));
  }
  renderPhaseMasks();
}

function openPhaseMaskModal(record = null) {
  $("#phaseMaskId").value = record?.id || "";
  $("#phaseMaskStart").value = record?.start ?? "";
  $("#phaseMaskEnd").value = record?.end ?? "";
  $("#phaseMaskReason").value = record?.reason || "";
  $("#phaseMaskTitle").textContent = record ? "编辑相位屏蔽窗" : "新增相位屏蔽窗";
  $("#phaseMaskError").textContent = "";
  $("#phaseMaskModal").hidden = false;
  $("#phaseMaskStart").focus();
}

function closePhaseMaskModal() {
  $("#phaseMaskModal").hidden = true;
  $("#addPhaseMaskBtn")?.focus();
}

function initPhaseMaskManagement() {
  loadPhaseMasks();
  $("#addPhaseMaskBtn")?.addEventListener("click", () => openPhaseMaskModal());
  $("#phaseMaskClose")?.addEventListener("click", closePhaseMaskModal);
  $("#phaseMaskCancel")?.addEventListener("click", closePhaseMaskModal);
  $("#phaseMaskForm")?.addEventListener("submit", event => {
    event.preventDefault();
    const id = $("#phaseMaskId").value;
    const current = phaseMasks.find(record => record.id === id);
    const result = PDCore.validateMaskWindow({ id, start: $("#phaseMaskStart").value, end: $("#phaseMaskEnd").value, reason: $("#phaseMaskReason").value, enabled: current?.enabled ?? true }, phaseMasks);
    if (!result.valid) {
      $("#phaseMaskError").textContent = result.error;
      $("#phaseMask" + result.field[0].toUpperCase() + result.field.slice(1))?.focus();
      return;
    }
    const record = { ...result.record, id: id || `mask-${Date.now()}` };
    phaseMasks = PDCore.upsertById(phaseMasks, record);
    closePhaseMaskModal();
    savePhaseMasks(id ? "屏蔽窗已更新" : "屏蔽窗已新增");
  });
  $("#phaseMaskRows")?.addEventListener("click", async event => {
    const button = event.target.closest("button[data-mask-action]");
    if (!button) return;
    const record = phaseMasks.find(item => item.id === button.dataset.id);
    if (!record) return;
    if (button.dataset.maskAction === "edit") openPhaseMaskModal(record);
    if (button.dataset.maskAction === "toggle") {
      phaseMasks = PDCore.upsertById(phaseMasks, { ...record, enabled: !record.enabled });
      savePhaseMasks(record.enabled ? "屏蔽窗已停用" : "屏蔽窗已启用");
    }
    if (button.dataset.maskAction === "delete") {
      const confirmed = await requestConfirmation({ title: "删除屏蔽窗", message: `确认删除 ${record.start}°–${record.end}° 屏蔽窗吗？`, confirmLabel: "确认删除", trigger: button });
      if (confirmed) {
        phaseMasks = PDCore.removeById(phaseMasks, record.id);
        savePhaseMasks("屏蔽窗已删除");
      }
    }
  });
}

function renderWaveSelection(index = selectedPulseIndex) {
  selectedPulseIndex = index;
  const list = $("#pulseList");
  const params = $("#pulseParams");
  if (!list || !params) return;
  list.innerHTML = pulseRows.map((pulse, pulseIndex) => `
    <button class="pulse-row ${pulseIndex === index ? "active" : ""}" data-pulse-index="${pulseIndex}">
      <strong>${pulse.id}</strong>
      <span>${pulse.phase}<br><small>电荷量 ${pulse.charge}</small></span>
    </button>
  `).join("");
  const current = pulseRows[index];
  params.innerHTML = `
    <h4>脉冲参数</h4>
    <div class="param-row"><small>tr</small><span>上升时间：${current.tr}</span></div>
    <div class="param-row"><small>tw</small><span>脉宽：${current.width}</span></div>
    <div class="param-row"><small>Vpk</small><span>峰值电压：${current.voltage}</span></div>
    <div class="param-row"><small>q</small><span>电荷量：${current.charge}</span></div>
  `;
  $$("#pulseList .pulse-row").forEach(row => {
    row.addEventListener("click", () => {
      renderWaveSelection(Number(row.dataset.pulseIndex));
      drawWave("waveChart");
      drawSpectrum("fftChart");
    });
  });
}

function renderExportMenu() {
  const menu = $("#exportMenu");
  if (!menu) return;
  menu.innerHTML = exportOptions.map(([type, title, desc]) => `
    <button class="export-option" data-export="${type}">
      <b>${type}</b>
      <span>${title}<br>${desc}</span>
    </button>
  `).join("");
}

function downloadBlob(content, mime, filename) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.hidden = true;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

function historyExportFilename(suffix) {
  const unitChannel = $("#historyUnitChannelFilter")?.value || "全部机组";
  const target = unitChannel.replace(/[\\/:*?"<>|\s]+/g, "-");
  return `局放历史数据-${target}-${new Date().toISOString().slice(0, 10)}.${suffix}`;
}

function exportHistoryData(type) {
  if (currentHistoryRows.length === 0) {
    showToast("当前查询没有数据，无法导出");
    return false;
  }
  const filters = {
    unitChannel: $("#historyUnitChannelFilter")?.value || "全部机组",
    level: $("#historyLevelFilter")?.value || "全部级别",
  };
  if (type === "CSV") {
    downloadBlob(PDCore.serializeHistoryCsv(currentHistoryRows), "text/csv;charset=utf-8", historyExportFilename("csv"));
  } else if (type === "JSON") {
    const payload = PDCore.buildHistoryExportPayload(currentHistoryRows, filters);
    payload.exportedAt = new Date().toISOString();
    downloadBlob(JSON.stringify(payload, null, 2), "application/json;charset=utf-8", historyExportFilename("json"));
  } else if (type === "WAVEFORM") {
    const selected = pulseRows[selectedPulseIndex] || pulseRows[0];
    const payload = { title: "局部放电脉冲波形", target: currentHistoryRows[0], pulse: selected, exportedAt: new Date().toISOString() };
    downloadBlob(JSON.stringify(payload, null, 2), "application/json;charset=utf-8", historyExportFilename("waveform.json"));
  } else {
    showToast("暂不支持该导出格式");
    return false;
  }
  $("#exportNote").textContent = `已生成 ${type} 文件，共 ${currentHistoryRows.length} 条历史记录。`;
  showToast(`${type} 文件已下载`);
  return true;
}

function renderTrendTarget() {
  const unit = $("#trendUnitSelect")?.value || "3# 机组";
  const channel = $("#trendChannelSelect")?.value || "A相";
  currentTrendProfile = PDCore.deriveTrendProfile(unit, channel);
  const targetSummary = $("#trendTargetSummary");
  const currentUnit = $("#trendCurrentUnit");
  const agingFactor = $("#currentAgingFactor");
  const slopeLabel = $("#trendSlopeLabel");
  if (targetSummary) targetSummary.textContent = `当前分析：${unit} / ${channel} · 最近 90 天`;
  if (currentUnit) currentUnit.textContent = unit;
  if (agingFactor) agingFactor.textContent = currentTrendProfile.agingFactor.toFixed(2);
  if (slopeLabel) slopeLabel.textContent = `当前窗口β：${currentTrendProfile.slope.toFixed(2)} pC/天`;
  const rows = $("#trendSummaryRows");
  if (rows) rows.innerHTML = currentTrendProfile.summary.map(item => `<tr${item.channel === channel ? ' class="selected"' : ""}><td>${item.channel}</td><td>${item.current.toLocaleString("zh-CN")}</td><td>${item.previous.toLocaleString("zh-CN")}</td><td>${item.slope.toFixed(2)}</td><td>${badge(item.level)}</td><td>${item.assessment}</td></tr>`).join("");
  requestAnimationFrame(() => {
    drawLines("multiTrend", 5);
    drawSlope();
  });
}

function exportTrendData() {
  const payload = {
    title: "长周期趋势分析",
    target: `${currentTrendProfile.unit} ${currentTrendProfile.channel}`,
    timeRange: "最近 90 天",
    unit: "pC",
    legend: ["Qm", "Qavg", "Ntotal", "环境温度", "相对湿度"],
    slope: currentTrendProfile.slope,
    summary: currentTrendProfile.summary,
    exportedAt: new Date().toISOString(),
  };
  const name = `趋势数据-${currentTrendProfile.unit.replace(/\s/g, "")}-${currentTrendProfile.channel}.json`;
  downloadBlob(JSON.stringify(payload, null, 2), "application/json;charset=utf-8", name);
}

function dashboardAlarmRows() {
  return alarms.filter(alarm => {
    if (dashboardAlarmFilter === "open") return alarm.status === "未确认";
    if (dashboardAlarmFilter === "done") return alarm.status !== "未确认";
    return true;
  });
}

function renderDashboardAlarms() {
  const rows = dashboardAlarmRows();
  $("#alarmRows").innerHTML = rows.map(r => `<tr><td>${r.time}</td><td>${badge(r.level)}</td><td>${r.content}</td></tr>`).join("");
}

function renderAlarmCount() {
  const openCount = PDCore.countOpenAlarms(alarms);
  const alarmBadge = $("#alarmBadge");
  const dashboardOpenAlarmCount = $("#dashboardOpenAlarmCount");
  if (alarmBadge) {
    alarmBadge.textContent = String(openCount);
    alarmBadge.hidden = openCount === 0;
  }
  if (dashboardOpenAlarmCount) dashboardOpenAlarmCount.textContent = String(openCount);
  const alarmBell = $("#alarmBell");
  if (alarmBell) {
    const accessibleLabel = openCount > 0 ? `未处理报警：${openCount} 条` : "暂无未处理报警";
    alarmBell.title = accessibleLabel;
    alarmBell.setAttribute("aria-label", accessibleLabel);
  }
}

function managedAlarmIndexes() {
  const filtered = PDCore.filterAlarms(alarms, {
    unit: $("#alarmUnitFilter")?.value || "all",
    level: $("#alarmLevelFilter")?.value || "all",
    status: alarmManagementFilter,
  });
  return filtered.map(alarm => alarms.indexOf(alarm));
}

function selectManagedAlarmRow(row) {
  selectedAlarmIndex = Number(row.dataset.index);
  renderAlarmDetail(selectedAlarmIndex);
}

function renderAlarmManagement() {
  const rows = $("#alarmManageRows");
  if (!rows) return;
  const indexes = managedAlarmIndexes();
  if (!indexes.includes(selectedAlarmIndex)) selectedAlarmIndex = indexes[0] ?? -1;
  rows.innerHTML = indexes.length
    ? indexes.map(index => {
      const alarm = alarms[index];
      return `<tr data-index="${index}" tabindex="0" role="button"><td>${alarmNo(index)}</td><td>${alarm.time}</td><td>${badge(alarm.level)}</td><td>${alarm.content}</td><td>${badge(alarm.status)}</td></tr>`;
    }).join("")
    : `<tr><td colspan="5">当前筛选条件下暂无报警</td></tr>`;
  $$("#alarmManageRows tr[data-index]").forEach(row => {
    row.addEventListener("click", () => selectManagedAlarmRow(row));
    row.addEventListener("keydown", event => {
      if (event.key !== "Enter" && event.key !== " ") return;
      event.preventDefault();
      selectManagedAlarmRow(row);
    });
  });
  renderAlarmDetail(selectedAlarmIndex);
  $("#alarmManagementHint").textContent = `当前筛选结果：共 ${indexes.length} 条报警。`;
}

function renderAlarmViews() {
  renderAlarmCount();
  renderDashboardAlarms();
  renderAlarmManagement();
}

function applySelectedUnit() {
  const profile = unitProfiles[selectedUnitIndex];
  $$(".unit-card").forEach((card, index) => {
    card.classList.toggle("selected", index === selectedUnitIndex);
    card.classList.remove("normal", "warn", "danger");
    card.classList.add(unitProfiles[index].levelClass);
  });

  const channel = $("#dashboardChannel");
  if (channel) {
    channel.innerHTML = `<option>${profile.channel}</option><option>${profile.unit} B相</option><option>${profile.unit} C相</option>`;
  }

  const summary = $(".floating-card");
  if (summary) {
    summary.querySelector("strong").textContent = `${profile.unit} 详细摘要`;
    summary.querySelector("dl").innerHTML = `
      <dt>运行状态：</dt><dd>${profile.status}</dd>
      <dt>最大放电量 Qm：</dt><dd>${profile.qm} pC</dd>
      <dt>平均放电量 Qavg：</dt><dd>${profile.qavg} pC</dd>
      <dt>趋势斜率 β：</dt><dd>${profile.beta} pC/h</dd>
    `;
  }

  const gauges = $$(".gauge");
  const gaugeNumbers = [profile.qm, profile.qavg, profile.ntotal, profile.beta];
  gauges.forEach((gauge, index) => {
    gauge.dataset.value = String(profile.gauge[index]);
    gauge.dataset.num = gaugeNumbers[index];
  });
}

function selectUnit(index) {
  selectedUnitIndex = index;
  applySelectedUnit();
  drawAll();
}

function renderAlarmDetail(index = 0) {
  const detail = $("#alarmDetail");
  if (!detail) return;
  if (!alarms[index]) {
    detail.innerHTML = "<p>当前筛选条件下没有可处置的报警。</p>";
    return;
  }
  selectedAlarmIndex = index;
  const alarm = alarms[index];
  const isCritical = alarm.level === "危险" || alarm.level === "异常";
  detail.innerHTML = `
    <div class="alarm-detail-grid">
      <div class="detail-item"><small>告警编号</small><strong>${alarmNo(index)}</strong></div>
      <div class="detail-item"><small>告警时间</small><strong>${alarm.time}</strong></div>
      <div class="detail-item"><small>告警级别</small><strong>${badge(alarm.level)}</strong></div>
      <div class="detail-item"><small>告警内容</small><strong>${alarm.content}</strong></div>
      <div class="detail-item"><small>当前状态</small><strong>${badge(alarm.status)}</strong></div>
      <div class="detail-item"><small>处理组</small><strong>${escapeHTML(alarm.assignee || "未派发")}</strong></div>
      <div class="detail-item"><small>最近处置</small><strong>${escapeHTML(alarm.note || "暂无")}</strong></div>
      <div class="detail-item"><small>处置建议</small><strong>${isCritical ? "复核PRPD图谱并安排巡检" : "观察趋势变化，必要时调阈值"}</strong></div>
    </div>
  `;
  $$("#alarmManageRows tr[data-index]").forEach(row => {
    row.classList.toggle("selected", Number(row.dataset.index) === index);
  });
  const confirmButton = $("#confirmAlarmBtn");
  const dispatchButton = $("#dispatchAlarmBtn");
  const closeButton = $("#closeAlarmBtn");
  if (confirmButton) confirmButton.disabled = alarm.status !== "未确认";
  if (dispatchButton) dispatchButton.disabled = alarm.status !== "未确认";
  if (closeButton) closeButton.disabled = alarm.status === "已关闭";
}

function applyAlarmAction(action) {
  if (!alarms[selectedAlarmIndex]) {
    $("#alarmManagementHint").textContent = "请先选择一条报警事件。";
    return false;
  }
  const number = alarmNo(selectedAlarmIndex);
  const note = $("#alarmDispositionNote")?.value || "";
  const group = $("#alarmDispatchGroup")?.value || "";
  const result = PDCore.transitionAlarm(alarms[selectedAlarmIndex], action, { note, group, operator: "admin", handledAt: new Date().toISOString() });
  if (!result.valid) {
    $("#alarmManagementHint").textContent = result.error;
    (result.field === "group" ? $("#alarmDispatchGroup") : $("#alarmDispositionNote"))?.focus();
    return false;
  }
  const previous = alarms[selectedAlarmIndex];
  alarms[selectedAlarmIndex] = result.record;
  const saved = saveAlarmStorage();
  if (!saved) {
    alarms[selectedAlarmIndex] = previous;
    $("#alarmManagementHint").textContent = `${number} 保存失败，处置意见已保留，请重试。`;
    return false;
  }
  appendSystemLog(`报警${action === "dispatch" ? "派发" : action === "confirm" ? "确认" : "关闭"}`, `${number} ${result.record.status}`);
  renderAlarmViews();
  $("#alarmManagementHint").textContent = `${number} 已更新为${result.record.status}，未确认报警数量已同步。`;
  $("#alarmDispositionNote").value = "";
  return true;
}

function renderDiagnosisDefect(index = selectedDiagnosisIndex) {
  selectedDiagnosisIndex = index;
  const defect = diagnosisDefects[index];
  if (!defect) return;
  const defectList = $("#defectList");
  if (defectList) {
    defectList.innerHTML = diagnosisDefects.map((item, itemIndex) => {
      const hot = itemIndex === index ? " active" : "";
      const percent = item.percent <= 1 ? 1 : item.percent;
      return `<button class="defect-row${hot}" data-defect-index="${itemIndex}">
        <span>${itemIndex + 1}</span>
        <strong>${item.name} <small>${item.english}</small></strong>
        <em>${item.confidence}<i style="--p:${percent}%"></i></em>
        <b>详情</b>
      </button>`;
    }).join("");
  }
  $("#diagConclusion").innerHTML = `导缺陷类型：${defect.name}<br><small>严重程度：${defect.severity}　置信度：${defect.confidence}</small>`;
  $("#defectCause").innerHTML = `<div class="cause-copy"><b>绝缘物理损伤成因分析（${defect.name}）</b><ol>${defect.causes.map(item => `<li>${item}</li>`).join("")}</ol></div><div class="slot-schematic" aria-hidden="true"><span></span><i></i><em></em></div>`;
  $("#diagAdvice").innerHTML = defect.advice.map(item => `<li>${item}</li>`).join("");
  renderDiagnosisReport();
}

function collectDiagnosisContext(completed = diagnosisContext.completed) {
  const defect = diagnosisDefects[selectedDiagnosisIndex] || diagnosisDefects[0];
  return {
    unit: selectedDiagUnit,
    channel: selectedDiagChannel,
    defect: defect.name,
    severity: defect.severity,
    confidence: defect.confidence,
    conclusion: `疑似${defect.name}，严重程度${defect.severity}，模型置信度${defect.confidence}`,
    advice: [...defect.advice],
    reviewer: $("#diagReviewer")?.value || "admin",
    signature: $("#diagSignature")?.value.trim() || "未签名",
    date: $("#diagReportDate")?.value || new Date().toISOString().slice(0, 10),
    note: $("#diagReviewNote")?.value.trim() || "",
    completed,
  };
}

function renderDiagnosisReport() {
  diagnosisContext = collectDiagnosisContext(diagnosisContext.completed);
  const report = PDCore.buildDiagnosisReport(diagnosisContext);
  const target = $("#diagReportTarget");
  const preview = $("#diagReportPreview");
  if (target) target.textContent = `${diagnosisContext.unit}　${diagnosisContext.channel}通道`;
  if (preview) preview.innerHTML = report.previewHtml;
  return report;
}

function exportDiagnosisReport() {
  if (!diagnosisContext.completed) {
    showToast("请先完成诊断，再下载报告");
    return false;
  }
  const report = renderDiagnosisReport();
  downloadBlob(report.html, "text/html;charset=utf-8", report.filename);
  $("#diagStatus").textContent = `HTML 诊断报告已下载：${report.filename}`;
  return true;
}

function updateDiagnosisTarget() {
  selectedDiagUnit = $("#diagUnitSelect")?.value || selectedDiagUnit;
  selectedDiagChannel = $("#diagChannelSelect")?.value || selectedDiagChannel;
  $("#diagUnitText").textContent = selectedDiagUnit;
  $("#diagChannelText").textContent = selectedDiagChannel;
  $("#diagStage").textContent = "待启动";
  $("#diagStatus").textContent = `已选择 ${selectedDiagUnit} ${selectedDiagChannel}，可启动专家诊断。`;
  $("#diagProgressBar").style.width = "0%";
  $$(".pipeline span").forEach(item => item.classList.remove("active", "done"));
  diagnosisContext.completed = false;
  renderDiagnosisReport();
  const startButton = $("#startDiagnosis");
  if (startButton) {
    startButton.disabled = false;
    startButton.innerHTML = "启动专家诊断<br><small id=\"diagTime\">0.00 s</small>";
  }
}

function runDiagnosis() {
  updateDiagnosisTarget();
  const unit = selectedDiagUnit;
  const channel = selectedDiagChannel;
  const windowText = $("#diagWindowText")?.textContent || "最近1000个工频周期";
  const stages = [
    ["特征提取", "正在分析放电指纹特征...", "25%", "0.42"],
    ["模型推理", "CNN-Transformer 模型推理中...", "55%", "0.96"],
    ["模式匹配", "正在匹配缺陷概率排序...", "82%", "1.38"],
    ["报告生成", `诊断完成：${unit} ${channel}，${windowText}`, "100%", "1.52"],
  ];
  let step = 0;
  const startButton = $("#startDiagnosis");
  const diagUnitSelect = $("#diagUnitSelect");
  const diagChannelSelect = $("#diagChannelSelect");
  if (diagUnitSelect) diagUnitSelect.disabled = true;
  if (diagChannelSelect) diagChannelSelect.disabled = true;
  if (startButton) {
    startButton.disabled = true;
    startButton.innerHTML = "诊断进行中<br><small id=\"diagTime\">0.00 s</small>";
  }
  const advance = () => {
    const [stage, text, width, seconds] = stages[step];
    $("#diagStage").textContent = stage;
    $("#diagStatus").textContent = text;
    $("#diagProgressBar").style.width = width;
    const timeLabel = $("#diagTime");
    if (timeLabel) timeLabel.textContent = `${seconds} s`;
    $$(".pipeline span").forEach((item, index) => {
      item.classList.toggle("done", index < step);
      item.classList.toggle("active", index === step);
    });
    if (step < stages.length - 1) {
      step += 1;
      setTimeout(advance, 280);
    } else {
      $$(".pipeline span").forEach(item => {
        item.classList.remove("active");
        item.classList.add("done");
      });
      if (startButton) {
        startButton.disabled = false;
        startButton.innerHTML = "重新诊断<br><small id=\"diagTime\">1.52 s</small>";
      }
      if (diagUnitSelect) diagUnitSelect.disabled = false;
      if (diagChannelSelect) diagChannelSelect.disabled = false;
      diagnosisContext.completed = true;
      renderDiagnosisDefect(selectedDiagnosisIndex);
      drawAll();
    }
  };
  advance();
}

function cloneDefaults(records) {
  return records.map(item => ({ ...item }));
}

function escapeHTML(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function todayText() {
  const now = new Date();
  const pad = value => String(value).padStart(2, "0");
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

function createRecordId(prefix) {
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2, 7)}`;
}

function readThresholdStorage(key, fallback, validate) {
  try {
    const raw = localStorage.getItem(key);
    if (raw === null) return fallback;
    const parsed = JSON.parse(raw);
    if (validate(parsed)) return parsed;
    thresholdStorageReadFailed = true;
    return fallback;
  } catch (error) {
    thresholdStorageReadFailed = true;
    return fallback;
  }
}

function saveThresholdStorage(key, value, successMessage) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    showThresholdMessage(successMessage);
    return true;
  } catch (error) {
    showThresholdMessage("浏览器本地存储不可用，本次修改仅在当前页面有效。", true);
    return false;
  }
}

function showThresholdMessage(message, isError = false) {
  const element = $("#thresholdMessage");
  if (!element) return;
  element.textContent = message;
  element.classList.toggle("error", isError);
}

function loadThresholdState() {
  thresholdStorageReadFailed = false;
  thresholdValues = readThresholdStorage(
    STORAGE_KEYS.thresholds,
    { ...DEFAULT_THRESHOLDS },
    value => PDCore.validateThresholds(value).valid,
  );
  const agingFallback = cloneDefaults(DEFAULT_AGING_FACTORS);
  agingFactors = normalizeAgingFactors(readThresholdStorage(
    STORAGE_KEYS.aging,
    agingFallback,
    records => Array.isArray(records) && records.every(record => record && record.id && Number.isFinite(Number(record.factor)) && Number(record.factor) > 0),
  ).map(record => ({ ...record, factor: Number(record.factor) })));
  const irisFallback = cloneDefaults(DEFAULT_IRIS_BENCHMARKS);
  irisBenchmarks = readThresholdStorage(
    STORAGE_KEYS.iris,
    irisFallback,
    records => PDCore.validateIrisImport(records).valid,
  ).map(record => ({ ...record }));
}

function renderThresholdSummary() {
  const activeAging = agingFactors.find(record => record.applied) || agingFactors[0];
  const agingText = activeAging ? Number(activeAging.factor).toFixed(2) : "1.00";
  const agingNode = $("#currentAgingFactor");
  const thresholdNode = $("#currentThresholdSummary");
  if (agingNode) agingNode.textContent = agingText;
  if (thresholdNode) {
    thresholdNode.textContent = `${Number(thresholdValues.attention).toFixed(2)} / ${Number(thresholdValues.abnormal).toFixed(2)} / ${Number(thresholdValues.danger).toFixed(2)} pC`;
  }
}

function renderThresholdForm() {
  const attention = $("#thresholdAttention");
  const abnormal = $("#thresholdAbnormal");
  const danger = $("#thresholdDanger");
  if (!attention || !abnormal || !danger) return;
  attention.value = thresholdValues.attention;
  abnormal.value = thresholdValues.abnormal;
  danger.value = thresholdValues.danger;
  $("#thresholdRangePreview").innerHTML = `
    <span><b>注意</b> ${escapeHTML(thresholdValues.attention)} ～ ${escapeHTML(thresholdValues.abnormal)} pC</span>
    <span><b>异常</b> ${escapeHTML(thresholdValues.abnormal)} ～ ${escapeHTML(thresholdValues.danger)} pC</span>
    <span><b>危险</b> ≥ ${escapeHTML(thresholdValues.danger)} pC</span>
  `;
}

function renderAgingFactors() {
  const rows = $("#agingRows");
  if (!rows) return;
  rows.innerHTML = agingFactors.length ? agingFactors.map(record => `
    <tr>
      <td>${escapeHTML(record.unit || "通用")}</td>
      <td>${escapeHTML(record.deviceType || "全部类型")}</td>
      <td>${Number(record.factor).toFixed(2)}${record.applied ? ' <span class="pill ok">当前</span>' : ""}</td>
      <td>${escapeHTML(record.updatedAt || "—")}</td>
      <td><div class="threshold-actions">
        <button class="ghost" type="button" data-aging-action="edit" data-id="${escapeHTML(record.id)}">编辑</button>
        <button class="danger-btn" type="button" data-aging-action="delete" data-id="${escapeHTML(record.id)}">删除</button>
        <button class="primary" type="button" data-aging-action="apply" data-id="${escapeHTML(record.id)}">应用</button>
      </div></td>
    </tr>
  `).join("") : '<tr><td class="empty-row" colspan="5">暂无老化系数，请新增记录。</td></tr>';
}

function renderIrisBenchmarks() {
  const filter = $("#irisDeviceFilter");
  const rows = $("#irisRows");
  if (!filter || !rows) return;
  const currentFilter = filter.value || "all";
  const deviceTypes = [...new Set(irisBenchmarks.map(record => record.deviceType))].sort();
  filter.innerHTML = '<option value="all">全部类型</option>' + deviceTypes.map(type => `<option value="${escapeHTML(type)}">${escapeHTML(type)}</option>`).join("");
  filter.value = deviceTypes.includes(currentFilter) ? currentFilter : "all";
  const visibleRecords = filter.value === "all" ? irisBenchmarks : irisBenchmarks.filter(record => record.deviceType === filter.value);
  rows.innerHTML = visibleRecords.length ? visibleRecords.map(record => `
    <tr>
      <td>${escapeHTML(record.name)}</td><td>${escapeHTML(record.deviceType)}</td>
      <td>${escapeHTML(record.attention)}</td><td>${escapeHTML(record.abnormal)}</td><td>${escapeHTML(record.danger)}</td>
      <td>${escapeHTML(record.updatedAt || "—")}</td>
      <td><div class="threshold-actions">
        <button class="ghost" type="button" data-iris-action="edit" data-id="${escapeHTML(record.id)}">编辑</button>
        <button class="danger-btn" type="button" data-iris-action="delete" data-id="${escapeHTML(record.id)}">删除</button>
        <button class="primary" type="button" data-iris-action="apply" data-id="${escapeHTML(record.id)}">应用</button>
      </div></td>
    </tr>
  `).join("") : '<tr><td class="empty-row" colspan="7">当前筛选条件下暂无 IRIS 基准。</td></tr>';
}

function renderThresholdManagement() {
  renderThresholdForm();
  renderAgingFactors();
  renderIrisBenchmarks();
  renderThresholdSummary();
}

function selectThresholdTab(tabName) {
  $$("[data-threshold-tab]").forEach(tab => {
    const active = tab.dataset.thresholdTab === tabName;
    tab.classList.toggle("active", active);
    tab.setAttribute("aria-selected", String(active));
    tab.tabIndex = active ? 0 : -1;
  });
  $$("[data-threshold-panel]").forEach(panel => {
    panel.hidden = panel.dataset.thresholdPanel !== tabName;
  });
}

function closeThresholdModal() {
  const modal = $("#thresholdModal");
  if (!modal) return;
  const trigger = thresholdModalTrigger;
  const triggerId = trigger?.dataset.id;
  const triggerAction = trigger?.dataset.agingAction || trigger?.dataset.irisAction;
  modal.hidden = true;
  if ($("#appShell")) $("#appShell").inert = false;
  $("#thresholdModalError").textContent = "";
  thresholdModalTrigger = null;
  requestAnimationFrame(() => {
    const replacement = triggerId && triggerAction
      ? $$("#agingRows button, #irisRows button").find(button => button.dataset.id === triggerId && (button.dataset.agingAction || button.dataset.irisAction) === triggerAction)
      : null;
    (replacement || (trigger?.isConnected ? trigger : null))?.focus();
  });
}

function openThresholdModal(mode, record = null, trigger = null) {
  thresholdModalMode = mode;
  thresholdModalTrigger = trigger;
  const editing = Boolean(record);
  $("#thresholdModalTitle").textContent = `${editing ? "编辑" : "新增"}${mode === "aging" ? "老化系数" : " IRIS 基准"}`;
  $("#thresholdRecordId").value = record?.id || "";
  $("#agingModalFields").hidden = mode !== "aging";
  $("#irisModalFields").hidden = mode !== "iris";
  $("#thresholdModalError").textContent = "";
  if (mode === "aging") {
    $("#agingUnit").value = record?.unit || "";
    $("#agingDeviceType").value = record?.deviceType || "";
    $("#agingFactor").value = record?.factor ?? "";
  } else {
    $("#irisName").value = record?.name || "";
    $("#irisDeviceType").value = record?.deviceType || "";
    $("#irisAttention").value = record?.attention ?? "";
    $("#irisAbnormal").value = record?.abnormal ?? "";
    $("#irisDanger").value = record?.danger ?? "";
  }
  if ($("#appShell")) $("#appShell").inert = true;
  $("#thresholdModal").hidden = false;
  requestAnimationFrame(() => (mode === "aging" ? $("#agingUnit") : $("#irisName")).focus());
}

function submitThresholdModal() {
  const id = $("#thresholdRecordId").value || createRecordId(thresholdModalMode === "aging" ? "age" : "iris");
  const errorNode = $("#thresholdModalError");
  if (thresholdModalMode === "aging") {
    const unit = $("#agingUnit").value.trim();
    const deviceType = $("#agingDeviceType").value.trim();
    const factor = Number($("#agingFactor").value);
    if ((!unit && !deviceType) || !Number.isFinite(factor) || factor <= 0) {
      errorNode.textContent = "请填写机组或设备类型，老化系数必须为大于 0 的数值。";
      (!unit && !deviceType ? $("#agingUnit") : $("#agingFactor")).focus();
      return;
    }
    const oldRecord = agingFactors.find(record => record.id === id);
    agingFactors = normalizeAgingFactors(PDCore.upsertById(agingFactors, { id, unit, deviceType, factor, updatedAt: todayText(), applied: Boolean(oldRecord?.applied) }));
    saveThresholdStorage(STORAGE_KEYS.aging, agingFactors, "老化系数已保存。下一步可应用到当前机组。");
    renderAgingFactors();
    renderThresholdSummary();
  } else {
    const name = $("#irisName").value.trim();
    const deviceType = $("#irisDeviceType").value.trim();
    const validation = PDCore.validateThresholds({
      attention: $("#irisAttention").value,
      abnormal: $("#irisAbnormal").value,
      danger: $("#irisDanger").value,
    });
    if (!name || !deviceType || !validation.valid) {
      errorNode.textContent = !name || !deviceType ? "基准名称和设备类型不能为空。" : validation.error;
      (!name ? $("#irisName") : !deviceType ? $("#irisDeviceType") : $("#irisAttention")).focus();
      return;
    }
    irisBenchmarks = PDCore.upsertById(irisBenchmarks, { id, name, deviceType, ...validation.values, updatedAt: todayText() });
    saveThresholdStorage(STORAGE_KEYS.iris, irisBenchmarks, "IRIS 基准已保存。下一步可应用到当前机组。");
    renderIrisBenchmarks();
  }
  closeThresholdModal();
}

function handleAgingAction(button) {
  const record = agingFactors.find(item => item.id === button.dataset.id);
  if (!record) return;
  if (button.dataset.agingAction === "edit") {
    openThresholdModal("aging", record, button);
    return;
  }
  if (button.dataset.agingAction === "delete") {
    if (!window.confirm(`确认删除“${record.unit || record.deviceType}”的老化系数吗？`)) return;
    agingFactors = normalizeAgingFactors(PDCore.removeById(agingFactors, record.id));
    saveThresholdStorage(STORAGE_KEYS.aging, agingFactors, "老化系数已删除。");
  } else {
    agingFactors = normalizeAgingFactors(agingFactors.map(item => ({ ...item, applied: item.id === record.id })));
    saveThresholdStorage(STORAGE_KEYS.aging, agingFactors, `已将老化系数 ${Number(record.factor).toFixed(2)} 应用到当前机组。`);
  }
  renderAgingFactors();
  renderThresholdSummary();
}

function handleIrisAction(button) {
  const record = irisBenchmarks.find(item => item.id === button.dataset.id);
  if (!record) return;
  if (button.dataset.irisAction === "edit") {
    openThresholdModal("iris", record, button);
    return;
  }
  if (button.dataset.irisAction === "delete") {
    if (!window.confirm(`确认删除 IRIS 基准“${record.name}”吗？`)) return;
    irisBenchmarks = PDCore.removeById(irisBenchmarks, record.id);
    saveThresholdStorage(STORAGE_KEYS.iris, irisBenchmarks, "IRIS 基准已删除。");
    renderIrisBenchmarks();
    return;
  }
  thresholdValues = { attention: record.attention, abnormal: record.abnormal, danger: record.danger };
  saveThresholdStorage(STORAGE_KEYS.thresholds, thresholdValues, `已应用“${record.name}”，当前机组阈值已同步。`);
  renderThresholdForm();
  renderThresholdSummary();
}

function importIrisFile(file) {
  if (!file) return;
  const reader = new FileReader();
  reader.addEventListener("load", () => {
    try {
      const parsed = JSON.parse(String(reader.result));
      const validation = PDCore.validateIrisImport(parsed);
      if (!validation.valid) throw new Error(validation.error);
      const seenIds = new Set();
      validation.records.forEach((record, index) => {
        const textFieldsValid = [record.id, record.name, record.deviceType]
          .every(value => typeof value === "string" && value.trim() !== "");
        if (!textFieldsValid) throw new Error(`第 ${index + 1} 条记录的 id、name、deviceType 必须是非空字符串`);
        const normalizedId = record.id.trim();
        if (seenIds.has(normalizedId)) throw new Error(`第 ${index + 1} 条记录的 id 与前项重复`);
        seenIds.add(normalizedId);
      });
      const updatedAt = todayText();
      irisBenchmarks = validation.records.map(record => ({
        ...record,
        id: record.id.trim(),
        name: record.name.trim(),
        deviceType: record.deviceType.trim(),
        updatedAt: record.updatedAt || updatedAt,
      }));
      saveThresholdStorage(STORAGE_KEYS.iris, irisBenchmarks, `已从本地文件导入 ${irisBenchmarks.length} 条 IRIS 基准。`);
      renderIrisBenchmarks();
    } catch (error) {
      showThresholdMessage(`导入失败：${error.message || "文件格式不正确"}，原数据未更改。`, true);
    } finally {
      $("#irisImport").value = "";
    }
  });
  reader.addEventListener("error", () => {
    showThresholdMessage("导入失败：无法读取所选文件，原数据未更改。", true);
    $("#irisImport").value = "";
  });
  reader.readAsText(file, "utf-8");
}

function initThresholdManagement() {
  if (!$("#thresholdForm")) return;
  loadThresholdState();
  renderThresholdManagement();
  if (thresholdStorageReadFailed) showThresholdMessage("部分本地数据无法读取，已回退到内置默认值。", true);

  $$("[data-threshold-tab]").forEach(tab => {
    tab.addEventListener("click", () => selectThresholdTab(tab.dataset.thresholdTab));
    tab.addEventListener("keydown", event => {
      if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
      event.preventDefault();
      const tabs = $$("[data-threshold-tab]");
      const offset = event.key === "ArrowRight" ? 1 : -1;
      const next = tabs[(tabs.indexOf(tab) + offset + tabs.length) % tabs.length];
      selectThresholdTab(next.dataset.thresholdTab);
      next.focus();
    });
  });

  $("#thresholdForm").addEventListener("submit", event => {
    event.preventDefault();
    const validation = PDCore.validateThresholds({
      attention: $("#thresholdAttention").value,
      abnormal: $("#thresholdAbnormal").value,
      danger: $("#thresholdDanger").value,
    });
    if (!validation.valid) {
      showThresholdMessage(validation.error, true);
      $("#thresholdAttention").focus();
      return;
    }
    thresholdValues = validation.values;
    saveThresholdStorage(STORAGE_KEYS.thresholds, thresholdValues, "阈值配置保存成功。作用范围：当前 3# 机组。 ");
    renderThresholdForm();
    renderThresholdSummary();
  });

  $("#addAgingFactor").addEventListener("click", event => openThresholdModal("aging", null, event.currentTarget));
  $("#addIrisBenchmark").addEventListener("click", event => openThresholdModal("iris", null, event.currentTarget));
  $("#agingRows").addEventListener("click", event => {
    const button = event.target.closest("button[data-aging-action]");
    if (button) handleAgingAction(button);
  });
  $("#irisRows").addEventListener("click", event => {
    const button = event.target.closest("button[data-iris-action]");
    if (button) handleIrisAction(button);
  });
  $("#irisDeviceFilter").addEventListener("change", renderIrisBenchmarks);
  $("#irisImport").addEventListener("change", event => importIrisFile(event.target.files?.[0]));
  const irisImportTrigger = $(".file-button[for='irisImport']");
  const irisImport = $("#irisImport");
  irisImportTrigger?.addEventListener("keydown", event => {
    if (event.key !== "Enter" && event.key !== " ") return;
    event.preventDefault();
    irisImport.click();
  });
  $("#thresholdModalForm").addEventListener("submit", event => {
    event.preventDefault();
    submitThresholdModal();
  });
  $("#thresholdModalClose").addEventListener("click", closeThresholdModal);
  $("#thresholdModalCancel").addEventListener("click", closeThresholdModal);
  $("#thresholdModal").addEventListener("click", event => {
    if (event.target === event.currentTarget) closeThresholdModal();
  });
  document.addEventListener("keydown", event => {
    const modal = $("#thresholdModal");
    if (modal.hidden) return;
    if (event.key === "Escape") {
      closeThresholdModal();
      return;
    }
    if (event.key !== "Tab") return;
    const focusable = $$("button, input, select, textarea, [tabindex]:not([tabindex='-1'])", modal)
      .filter(element => !element.disabled && !element.closest("[hidden]"));
    if (!focusable.length) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  });
  $("#restoreThresholdDefaults").addEventListener("click", () => {
    if (!window.confirm("确认恢复阈值、老化系数和 IRIS 基准的内置默认数据吗？")) return;
    let storageCleared = true;
    [STORAGE_KEYS.thresholds, STORAGE_KEYS.aging, STORAGE_KEYS.iris].forEach(key => {
      try {
        localStorage.removeItem(key);
      } catch (error) {
        storageCleared = false;
      }
    });
    thresholdValues = { ...DEFAULT_THRESHOLDS };
    agingFactors = normalizeAgingFactors(cloneDefaults(DEFAULT_AGING_FACTORS));
    irisBenchmarks = cloneDefaults(DEFAULT_IRIS_BENCHMARKS);
    renderThresholdManagement();
    if (storageCleared) {
      showThresholdMessage("已恢复内置默认数据。刷新后仍将使用默认值。 ");
    } else {
      showThresholdMessage("无法完整清理浏览器本地数据，当前页面已恢复默认值，但刷新后可能恢复旧值。", true);
    }
  });
}

function initTables() {
  alarms = readAlarmStorage();
  renderAlarmViews();
  renderHistoryRows(historyRows);
  renderWaveSelection();
  renderExportMenu();
}

function renderHistoryRows(rows) {
  currentHistoryRows = [...rows];
  const body = $("#historyRows");
  if (!body) return;
  body.innerHTML = rows.length
    ? rows.map((r, i) => `<tr data-history-index="${i}"><td>${r[0]}</td><td>${r[1]}</td><td>${r[2]}</td><td>${r[3]}</td><td>${r[4]}</td><td>${r[5]}</td><td>${badge(r[6])}</td><td><button class="ghost" data-action="replay" data-history-index="${i}">回放</button></td></tr>`).join("")
    : `<tr><td colspan="8" class="empty-state">当前条件下没有历史记录</td></tr>`;
}

function stopHistoryPlayback() {
  clearInterval(historyPlaybackTimer);
  historyPlaybackTimer = null;
}

function startHistoryPlayback(row, index = 0) {
  stopHistoryPlayback();
  historyReplaySeed = index + 1;
  const speed = Number.parseInt($("#historySpeed")?.value || "1", 10);
  $("#historyNotice").textContent = `正在以 ${speed}x 回放：${row[1]} ${row[2]}，${row[0]}。`;
  historyPlaybackTimer = setInterval(() => {
    historyReplaySeed += speed;
    $("#historyPrpd").dataset.frame = String(historyReplaySeed);
    drawPrpd("historyPrpd");
  }, 260);
  $("#historyPrpd").dataset.frame = String(historyReplaySeed);
  drawPrpd("historyPrpd");
}

function initNav() {
  $$("#mainNav .nav-btn").forEach(btn => {
    btn.addEventListener("click", async () => {
      if (currentPage === "device" && btn.dataset.page !== "device" && deviceFormDirty) {
        const decision = await requestDeviceDirtyDecision();
        if (decision === "cancel") return;
        if (decision === "save" && !saveCurrentDeviceDraft()) return;
        if (decision === "discard") loadDeviceForm();
      }
      setPage(btn.dataset.page);
    });
  });
  $$(".unit-card").forEach(card => {
    const run = () => selectUnit(Number(card.dataset.unitIndex));
    card.addEventListener("click", run);
    card.addEventListener("keydown", event => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        run();
      }
    });
  });
  const alarmBell = $("#alarmBell");
  alarmBell?.addEventListener("click", () => {
    alarmManagementFilter = "open";
    const statusFilter = $("#alarmStatusFilter");
    if (statusFilter) statusFilter.value = "open";
    setPage("alarm");
    renderAlarmViews();
    const openCount = PDCore.countOpenAlarms(alarms);
    $("#alarmManagementHint").textContent = openCount > 0
      ? `已切换到未确认报警，共 ${openCount} 条。`
      : "已切换到未确认报警，当前没有待处置事件。";
    const alarmManageRows = $("#alarmManageRows");
    requestAnimationFrame(() => {
      const firstActionableRow = $("#alarmManageRows tr[data-index]");
      if (firstActionableRow) firstActionableRow.focus();
      else alarmManageRows?.focus();
    });
  });
  $("#goAlarmBtn")?.addEventListener("click", () => setPage("alarm"));
  $$(".dashboard-alarm-tabs button").forEach(btn => {
    btn.addEventListener("click", () => {
      dashboardAlarmFilter = btn.dataset.alarmFilter;
      $$(".dashboard-alarm-tabs button").forEach(x => x.classList.remove("active"));
      btn.classList.add("active");
      renderDashboardAlarms();
      const label = btn.textContent.trim().replace(/\s+/g, " ");
      btn.title = `已切换到${label}告警`;
      $("#dashboardAlarmHint").textContent = `当前显示：${label}告警`;
    });
  });
  $("#alarmFilterBtn")?.addEventListener("click", () => {
    alarmManagementFilter = $("#alarmStatusFilter")?.value || "all";
    renderAlarmManagement();
    const indexes = managedAlarmIndexes();
    $("#alarmManagementHint").textContent = `当前筛选结果：共 ${indexes.length} 条报警。`;
  });
  $("#confirmAlarmBtn")?.addEventListener("click", () => applyAlarmAction("confirm"));
  $("#closeAlarmBtn")?.addEventListener("click", async event => {
    if (!$("#alarmDispositionNote")?.value.trim()) { $("#alarmManagementHint").textContent = "关闭前请填写处置意见"; $("#alarmDispositionNote")?.focus(); return; }
    const confirmed = await requestConfirmation({ title: "关闭告警", message: `确认关闭 ${alarmNo(selectedAlarmIndex)} 吗？`, confirmLabel: "确认关闭", trigger: event.currentTarget });
    if (confirmed) applyAlarmAction("close");
    else showToast("已取消关闭告警");
  });
  $("#dispatchAlarmBtn")?.addEventListener("click", () => applyAlarmAction("dispatch"));
  $("#historyRows")?.addEventListener("click", event => {
    const button = event.target.closest("button[data-action]");
    if (!button) return;
    const index = Number(button.dataset.historyIndex);
    const row = currentHistoryRows[index];
    $$("#historyRows tr").forEach(tr => tr.classList.toggle("selected", Number(tr.dataset.historyIndex) === index));
    startHistoryPlayback(row, index);
    $("#exportNote").textContent = `当前导出对象：${row[1]} ${row[2]} ${row[0]}。`;
    selectedPulseIndex = Math.min(index % pulseRows.length, pulseRows.length - 1);
    renderWaveSelection(selectedPulseIndex);
    drawAll();
  });
  $("#historyQueryBtn")?.addEventListener("click", () => {
    stopHistoryPlayback();
    const unitChannel = $("#historyUnitChannelFilter").value;
    const level = $("#historyLevelFilter").value;
    const filtered = PDCore.filterHistoryRows(historyRows, unitChannel, level);
    renderHistoryRows(filtered);
    $("#historyNotice").textContent = `已按“${unitChannel} / ${level}”查询，共 ${filtered.length} 条记录。`;
    showToast(`历史数据查询完成：${filtered.length} 条`);
  });
  $("#historyResetBtn")?.addEventListener("click", () => {
    stopHistoryPlayback();
    $("#historyUnitChannelFilter").value = "全部机组";
    $("#historyLevelFilter").value = "全部级别";
    renderHistoryRows(historyRows);
    $("#historyNotice").textContent = "查询条件已重置，请选择历史记录进行回放或查看详情。";
    $$("#historyRows tr").forEach(row => row.classList.remove("selected"));
    showToast("历史查询条件已重置");
  });
  $("#historyPlayBtn")?.addEventListener("click", () => { const row = currentHistoryRows[0]; if (row) startHistoryPlayback(row, 0); else showToast("当前没有可回放记录"); });
  $("#historyPauseBtn")?.addEventListener("click", () => { stopHistoryPlayback(); $("#historyNotice").textContent = "回放已暂停，可继续播放或选择其他记录。"; showToast("PRPD 回放已暂停"); });
  $("#historySpeed")?.addEventListener("change", event => { $("#historyNotice").textContent = `回放速度已调整为 ${event.target.value}。`; });
  $("#trendUnitSelect")?.addEventListener("change", renderTrendTarget);
  $("#trendChannelSelect")?.addEventListener("change", renderTrendTarget);
  $("#exportTrendChartBtn")?.addEventListener("click", event => runButtonAction(event.currentTarget, "生成中…", async () => { exportTrendData(); showToast(`已导出 ${currentTrendProfile.unit} ${currentTrendProfile.channel} 趋势数据`); }));
  $("#applyFilterBtn")?.addEventListener("click", event => runButtonAction(event.currentTarget, "应用中…", async () => { if (applyFilterConfig()) showToast(`滤波器已应用至 ${PDCore.formatDevicePath(deviceContext)}`); }));
  $("#exportDiagPdf")?.addEventListener("click", event => runButtonAction(event.currentTarget, "生成中…", async () => { if (exportDiagnosisReport()) showToast("诊断报告已下载"); }));
  $("#printDiagReport")?.addEventListener("click", () => { if (!diagnosisContext.completed) { showToast("请先完成诊断，再打印报告"); return; } renderDiagnosisReport(); $("#diagReportPreview").hidden = false; $("#diagStatus").textContent = "已打开同版报告打印预览。"; window.print(); });
  $("#fullscreenBtn")?.addEventListener("click", async () => {
    if (!document.fullscreenElement && document.documentElement.requestFullscreen) await document.documentElement.requestFullscreen();
    else if (document.exitFullscreen) await document.exitFullscreen();
    else showToast("当前浏览器不支持全屏模式");
  });
  $("#prpdInspectBtn")?.addEventListener("click", () => showToast("已显示 3#机组 A相 PRPD 图谱摘要"));
  $("#prpdZoomBtn")?.addEventListener("click", event => {
    const chart = $("#prpdChart");
    chart.classList.toggle("chart-zoomed");
    event.currentTarget.textContent = chart.classList.contains("chart-zoomed") ? "－" : "＋";
    showToast(chart.classList.contains("chart-zoomed") ? "PRPD 图谱已放大" : "PRPD 图谱已恢复");
    requestAnimationFrame(drawAll);
  });
  $("#prpdResetBtn")?.addEventListener("click", () => { $("#prpdChart")?.classList.remove("chart-zoomed"); drawPrpd("prpdChart"); showToast("PRPD 图谱视图已复位"); });
  $("#prpsRange")?.addEventListener("input", () => drawPrps());
  $("#exportToggle")?.addEventListener("click", event => {
    event.stopPropagation();
    $("#exportMenu")?.classList.toggle("open");
  });
  $("#exportMenu")?.addEventListener("click", event => {
    const option = event.target.closest(".export-option");
    if (!option) return;
    exportHistoryData(option.dataset.export);
    $("#exportMenu").classList.remove("open");
  });
  $("#saveDeviceConfig")?.addEventListener("click", () => {
    const saved = saveCurrentDeviceDraft();
    const toast = $("#deviceToast");
    if (!toast) return;
    toast.classList.add("show");
    toast.textContent = saved ? `配置已保存：${new Date().toLocaleTimeString("zh-CN", { hour12: false })}` : "配置未保存，请修正标记字段。";
    setTimeout(() => toast.classList.remove("show"), 2600);
  });
  $("#startDiagnosis")?.addEventListener("click", runDiagnosis);
  $("#diagUnitSelect")?.addEventListener("change", updateDiagnosisTarget);
  $("#diagChannelSelect")?.addEventListener("change", updateDiagnosisTarget);
  $("#defectList")?.addEventListener("click", event => {
    const row = event.target.closest(".defect-row");
    if (row) renderDiagnosisDefect(Number(row.dataset.defectIndex));
  });
  $("#previewDiagReport")?.addEventListener("click", () => {
    renderDiagnosisReport();
    $("#diagReportPreview").hidden = !$("#diagReportPreview").hidden;
    $("#diagStage").textContent = "报告预览";
    $("#diagStatus").textContent = diagnosisContext.completed ? "正在预览已完成的诊断报告。" : "正在预览报告草稿，完成诊断后才可下载。";
  });
  ["diagReviewNote", "diagReviewer", "diagSignature", "diagReportDate"].forEach(id => $("#" + id)?.addEventListener("input", renderDiagnosisReport));
  document.addEventListener("click", () => $("#exportMenu")?.classList.remove("open"));
  $$(".side-menu button").forEach(btn => {
    btn.addEventListener("click", () => {
      $$(".side-menu button").forEach(x => x.classList.remove("active"));
      btn.classList.add("active");
      $$(".sys-pane").forEach(p => p.classList.remove("active"));
      $("#sys-" + btn.dataset.sys).classList.add("active");
      drawAll();
    });
  });
}

function resizeCanvas(c) {
  if (!c) return null;
  const rect = c.getBoundingClientRect();
  const dpr = window.devicePixelRatio || 1;
  c.width = Math.max(1, Math.floor(rect.width * dpr));
  c.height = Math.max(1, Math.floor(rect.height * dpr));
  const ctx = c.getContext("2d");
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  return { ctx, w: rect.width, h: rect.height };
}

function clear(ctx, w, h) {
  ctx.clearRect(0, 0, w, h);
  const g = ctx.createLinearGradient(0, 0, 0, h);
  g.addColorStop(0, "rgba(2,22,50,.2)");
  g.addColorStop(1, "rgba(0,8,22,.15)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
}

function grid(ctx, w, h, left = 42, top = 20, right = 20, bottom = 35) {
  const pw = w - left - right;
  const ph = h - top - bottom;
  ctx.strokeStyle = "rgba(82,145,220,.22)";
  ctx.lineWidth = 1;
  for (let i = 0; i <= 10; i++) {
    const x = left + (pw * i) / 10;
    ctx.beginPath(); ctx.moveTo(x, top); ctx.lineTo(x, top + ph); ctx.stroke();
  }
  for (let i = 0; i <= 6; i++) {
    const y = top + (ph * i) / 6;
    ctx.beginPath(); ctx.moveTo(left, y); ctx.lineTo(left + pw, y); ctx.stroke();
  }
  ctx.strokeStyle = "rgba(190,220,255,.65)";
  ctx.beginPath(); ctx.moveTo(left, top + ph); ctx.lineTo(left + pw, top + ph); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(left, top); ctx.lineTo(left, top + ph); ctx.stroke();
  return { left, top, pw, ph };
}

function rand(seed) {
  let x = Math.sin(seed) * 10000;
  return x - Math.floor(x);
}

function drawSpark(c) {
  const r = resizeCanvas(c); if (!r) return;
  const { ctx, w, h } = r;
  ctx.clearRect(0, 0, w, h);
  const seed = Number(c.dataset.seed || 1);
  ctx.strokeStyle = seed === 3 ? "#ff332d" : "#00c5ff";
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (let i = 0; i < 48; i++) {
    const x = (w * i) / 47;
    const y = h - (10 + rand(seed * 33 + i) * (12 + i * 0.25) + Math.sin(i / 3) * 4);
    if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
  }
  ctx.stroke();
}

function drawPrpd(id, hot = true) {
  const c = typeof id === "string" ? $("#" + id) : id;
  const r = resizeCanvas(c); if (!r) return;
  const { ctx, w, h } = r;
  const profile = unitProfiles[selectedUnitIndex] || unitProfiles[2];
  const severity = profile.gauge[0] / 100;
  const replayOffset = c.id === "historyPrpd" ? historyReplaySeed * 137 : 0;
  const seedOffset = profile.seed * 101 + replayOffset;
  clear(ctx, w, h);
  const p = grid(ctx, w, h, 52, 24, 40, 42);
  ctx.fillStyle = "#cfe6ff";
  ctx.font = "12px Arial";
  ctx.fillText("q (pC)", 12, p.top + p.ph / 2);
  ctx.fillText("φ (°)", p.left + p.pw / 2, h - 8);
  ctx.strokeStyle = "rgba(255,255,255,.78)";
  ctx.beginPath();
  for (let i = 0; i <= 360; i++) {
    const x = p.left + (i / 360) * p.pw;
    const y = p.top + p.ph * (0.55 - Math.sin((i / 360) * Math.PI * 2) * 0.47);
    if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
  }
  ctx.stroke();
  for (let i = 0; i < 4600 + severity * 2600; i++) {
    const cluster = rand(i * 7 + seedOffset) > 0.52 ? 285 - profile.seed * 3 : 58 + profile.seed * 5;
    const x = p.left + ((cluster + (rand(i + seedOffset) - 0.5) * (70 + severity * 42)) / 360) * p.pw;
    const amp = Math.pow(rand(i * 9 + 2 + seedOffset), 2.2 - severity * 0.5);
    const y = p.top + p.ph * (0.75 - amp * (0.24 + severity * 0.24) + (rand(i * 11 + seedOffset) - 0.5) * 0.14);
    const intensity = rand(i * 13 + seedOffset);
    ctx.fillStyle = intensity > 0.82 && hot ? "rgba(255,35,24,.75)" : intensity > 0.62 ? "rgba(255,240,0,.65)" : intensity > 0.34 ? "rgba(0,230,255,.45)" : "rgba(0,75,255,.38)";
    ctx.fillRect(x, y, 1.4, 1.4);
  }
  if (c.id === "maskPrpd") {
    phaseMasks.filter(record => record.enabled).forEach(record => {
      const x = p.left + (record.start / 360) * p.pw;
      const width = ((record.end - record.start) / 360) * p.pw;
      ctx.fillStyle = "rgba(255, 49, 70, .18)";
      ctx.fillRect(x, p.top, width, p.ph);
      ctx.strokeStyle = "rgba(255, 92, 108, .8)";
      ctx.strokeRect(x, p.top, width, p.ph);
    });
  }
}

function drawPrps() {
  const c = $("#prpsChart"); const r = resizeCanvas(c); if (!r) return;
  const { ctx, w, h } = r;
  const profile = unitProfiles[selectedUnitIndex] || unitProfiles[2];
  const slider = Number($("#prpsRange")?.value || 72) / 100;
  const seedOffset = profile.seed * 71;
  clear(ctx, w, h);
  const baseY = h - 45, startX = 60, depth = 150, width = w - 130;
  for (let z = 0; z < 60; z++) {
    ctx.beginPath();
    for (let x = 0; x <= 140; x++) {
      const px = startX + (x / 140) * width - z * 1.3;
      const phase = x / 140;
      const drift = (slider - 0.5) * 0.13 + (profile.seed - 2.5) * 0.018;
      const ridge = Math.exp(-Math.pow(phase - (0.22 + drift), 2) / 0.004) + Math.exp(-Math.pow(phase - (0.82 - drift), 2) / 0.006);
      const noise = rand(x * 77 + z * 19 + seedOffset + Math.floor(slider * 40)) * 0.34;
      const val = ridge * (0.25 + profile.gauge[0] / 160 + z / 92) + noise;
      const py = baseY - z * 2.1 - val * 85;
      if (x === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
    }
    const hue = 220 - z * 2;
    ctx.strokeStyle = `hsla(${hue}, 95%, ${45 + z / 2}%, .72)`;
    ctx.stroke();
  }
  ctx.fillStyle = "#dceeff"; ctx.font = "12px Arial"; ctx.fillText("φ (°)", w / 2, h - 10); ctx.fillText("T（周期）", w - 120, h - 36);
}

function drawGauge(el) {
  const c = document.createElement("canvas");
  const old = el.querySelector("canvas");
  if (old) old.remove();
  el.prepend(c);
  const r = resizeCanvas(c); if (!r) return;
  const { ctx, w, h } = r;
  const value = Number(el.dataset.value || 50);
  const cx = w / 2, cy = h * 0.62, radius = Math.min(w, h) * 0.34;
  clear(ctx, w, h);
  ctx.lineWidth = 11;
  const start = Math.PI * 0.78, end = Math.PI * 2.22;
  const colors = [[0, "#21d563"], [0.35, "#cce839"], [0.62, "#ffb000"], [1, "#ff332d"]];
  for (let i = 0; i < colors.length - 1; i++) {
    ctx.beginPath();
    ctx.strokeStyle = colors[i][1];
    ctx.arc(cx, cy, radius, start + (end - start) * colors[i][0], start + (end - start) * colors[i + 1][0]);
    ctx.stroke();
  }
  const angle = start + (end - start) * (value / 100);
  ctx.strokeStyle = "#ff4a25"; ctx.lineWidth = 3;
  ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(cx + Math.cos(angle) * radius * 0.85, cy + Math.sin(angle) * radius * 0.85); ctx.stroke();
  ctx.fillStyle = "#ff432c"; ctx.font = "bold 24px Arial"; ctx.textAlign = "center"; ctx.fillText(el.dataset.num, cx, h - 20);
  ctx.fillStyle = "#d7eaff"; ctx.font = "12px Arial"; ctx.fillText(el.dataset.label, cx, 22);
}

function drawLines(id, series = 3) {
  const c = $("#" + id); const r = resizeCanvas(c); if (!r) return;
  const { ctx, w, h } = r;
  clear(ctx, w, h);
  const p = grid(ctx, w, h, 48, 24, 34, 38);
  const colors = ["#ffd400", "#26df89", "#16a6ff", "#a35cff", "#ff7a00"];
  for (let s = 0; s < series; s++) {
    ctx.strokeStyle = colors[s % colors.length]; ctx.lineWidth = 1.5; ctx.beginPath();
    let yv = 0.35 + s * 0.08;
    for (let i = 0; i < 160; i++) {
      const trendSeed = id === "multiTrend" ? currentTrendProfile.seed * 97 : 0;
      yv += (rand(i * (s + 9) + trendSeed) - 0.5) * 0.06;
      yv = Math.max(0.12, Math.min(0.88, yv));
      const x = p.left + (i / 159) * p.pw;
      const y = p.top + p.ph * (1 - yv);
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    ctx.stroke();
  }
}

function drawSlope() {
  const c = $("#slopeTrend"); const r = resizeCanvas(c); if (!r) return;
  const { ctx, w, h } = r;
  clear(ctx, w, h);
  const p = grid(ctx, w, h, 48, 24, 34, 38);
  ctx.fillStyle = "rgba(255,40,40,.16)";
  ctx.fillRect(p.left + p.pw * 0.78, p.top, p.pw * 0.22, p.ph);
  ctx.setLineDash([6, 4]);
  ["#2a86ff", "#ffb100", "#ff2424"].forEach((color, i) => {
    ctx.strokeStyle = color;
    const y = p.top + p.ph * (0.72 - i * 0.18);
    ctx.beginPath(); ctx.moveTo(p.left, y); ctx.lineTo(p.left + p.pw, y); ctx.stroke();
  });
  ctx.setLineDash([]);
  ctx.strokeStyle = "#ffd400"; ctx.lineWidth = 1.5; ctx.beginPath();
  for (let i = 0; i < 160; i++) {
    const x = p.left + (i / 159) * p.pw;
    const slopeFactor = Math.min(0.82, 0.28 + currentTrendProfile.slope * 0.62);
    const val = Math.pow(i / 159, 2.0) * slopeFactor + rand(i * 17 + currentTrendProfile.seed * 31) * 0.08;
    const y = p.top + p.ph * (0.86 - val);
    if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
  }
  ctx.stroke();
}

function drawWave(id) {
  const c = $("#" + id); const r = resizeCanvas(c); if (!r) return;
  const { ctx, w, h } = r;
  const pulse = pulseRows[selectedPulseIndex] || pulseRows[1];
  const phaseShift = parseFloat(pulse.phase) / 360;
  clear(ctx, w, h);
  const p = grid(ctx, w, h, 40, 24, 18, 34);
  for (let s = 0; s < 16; s++) {
    ctx.strokeStyle = `hsla(${s * 22},90%,62%,.75)`;
    ctx.beginPath();
    for (let i = 0; i < 150; i++) {
      const t = i / 149;
      const env = Math.exp(-Math.pow(t - 0.34 - phaseShift * 0.42 - (rand(s) - .5) * .16, 2) / 0.016);
      const yv = 0.5 + Math.sin(t * 28 + s) * env * (0.14 + rand(s * 5) * 0.14);
      const x = p.left + t * p.pw, y = p.top + yv * p.ph;
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    ctx.stroke();
  }
}

function drawSpectrum(id) {
  const c = $("#" + id); const r = resizeCanvas(c); if (!r) return;
  const { ctx, w, h } = r;
  const pulseOffset = selectedPulseIndex * 0.035;
  clear(ctx, w, h);
  const p = grid(ctx, w, h, 45, 22, 18, 35);
  ctx.strokeStyle = "#00aaff"; ctx.lineWidth = 1;
  ctx.beginPath();
  for (let i = 0; i < 240; i++) {
    const t = i / 239;
    const filterShift = id === "filterChart" ? Math.min(.18, filterConfig.low / Math.max(1, filterConfig.bandwidth)) : 0;
    const highRollOff = id === "filterChart" ? Math.min(.3, filterConfig.high / Math.max(1, filterConfig.bandwidth)) : 0;
    const peaks = Math.exp(-Math.pow(t - (.22 + pulseOffset + filterShift), 2) / .0008) + Math.exp(-Math.pow(t - (.49 - pulseOffset / 2), 2) / .0006) + Math.exp(-Math.pow(t - (.75 - highRollOff / 3 + pulseOffset / 3), 2) / .0012);
    const val = 0.78 - peaks * .35 + rand(i * 14) * .12;
    const x = p.left + t * p.pw, y = p.top + val * p.ph;
    if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
  }
  ctx.stroke();
}

function drawCluster() {
  const c = $("#clusterChart"); const r = resizeCanvas(c); if (!r) return;
  const { ctx, w, h } = r;
  clear(ctx, w, h);
  const p = grid(ctx, w, h, 48, 24, 24, 38);
  const clusters = [[.25, .72, "#66ff4c"], [.5, .35, "#ff3030"], [.72, .74, "#d430ff"], [.46, .78, "#00a6ff"]];
  clusters.forEach((cl, ci) => {
    ctx.fillStyle = cl[2];
    for (let i = 0; i < 320; i++) {
      const x = p.left + (cl[0] + (rand(i * ci + 4) - .5) * .16) * p.pw;
      const y = p.top + (cl[1] + (rand(i * ci + 9) - .5) * .18) * p.ph;
      ctx.fillRect(x, y, 2, 2);
    }
  });
}

function drawRadar() {
  const c = $("#radarChart"); const r = resizeCanvas(c); if (!r) return;
  const { ctx, w, h } = r;
  clear(ctx, w, h);
  const cx = w * 0.5, cy = h * 0.53, rad = Math.min(w * 0.68, h * 0.72) * 0.44;
  const labels = ["相位对称性", "幅值离散度", "相位宽度", "频谱特征", "脉冲形状"];
  ctx.strokeStyle = "rgba(120,180,255,.35)";
  for (let ring = 1; ring <= 5; ring++) {
    ctx.beginPath();
    for (let i = 0; i < labels.length; i++) {
      const a = -Math.PI / 2 + (i / labels.length) * Math.PI * 2;
      const x = cx + Math.cos(a) * rad * ring / 5, y = cy + Math.sin(a) * rad * ring / 5;
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    ctx.closePath(); ctx.stroke();
  }
  labels.forEach((label, i) => {
    const a = -Math.PI / 2 + (i / labels.length) * Math.PI * 2;
    const x = cx + Math.cos(a) * rad * 1.16;
    const y = cy + Math.sin(a) * rad * 1.16;
    ctx.strokeStyle = "rgba(120,180,255,.22)";
    ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(cx + Math.cos(a) * rad, cy + Math.sin(a) * rad); ctx.stroke();
    ctx.fillStyle = "#d8ecff";
    ctx.font = "12px Arial";
    ctx.textAlign = Math.cos(a) > 0.35 ? "left" : Math.cos(a) < -0.35 ? "right" : "center";
    ctx.textBaseline = Math.sin(a) > 0.35 ? "top" : Math.sin(a) < -0.35 ? "bottom" : "middle";
    ctx.fillText(label, x, y);
  });
  ctx.textAlign = "center"; ctx.textBaseline = "middle";
  ctx.fillStyle = "rgba(216,236,255,.7)";
  ctx.font = "11px Arial";
  [0.2, 0.4, 0.6, 0.8, 1.0].forEach(v => ctx.fillText(v.toFixed(1), cx + 6, cy - rad * v));
  const sets = [
    { color: "#00d8ff", vals: [.72, .74, .66, .86, .58], dash: [], fill: "rgba(0,216,255,.12)" },
    { color: "#ff3030", vals: [.88, .82, .86, .70, .62], dash: [7, 5], fill: "rgba(255,48,48,.10)" },
    { color: "#ff8c00", vals: [.48, .70, .92, .68, .74], dash: [7, 5], fill: "rgba(255,140,0,.08)" },
    { color: "#22d46f", vals: [.66, .58, .62, .78, .83], dash: [7, 5], fill: "rgba(34,212,111,.08)" }
  ];
  sets.forEach(({ color, vals, dash, fill }) => {
    ctx.setLineDash(dash);
    ctx.beginPath();
    vals.forEach((v, i) => {
      const a = -Math.PI / 2 + (i / vals.length) * Math.PI * 2;
      const x = cx + Math.cos(a) * rad * v, y = cy + Math.sin(a) * rad * v;
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    });
    ctx.closePath();
    ctx.strokeStyle = color; ctx.lineWidth = 2; ctx.stroke();
    ctx.fillStyle = fill;
    ctx.fill();
  });
  ctx.setLineDash([]);
}

function drawWaterfall() {
  const c = $("#waterfallChart"); const r = resizeCanvas(c); if (!r) return;
  const { ctx, w, h } = r;
  clear(ctx, w, h);
  for (let y = 20; y < h - 25; y += 2) {
    for (let x = 25; x < w - 25; x += 3) {
      const v = rand(x * 3 + y * 7);
      const stripe = Math.exp(-Math.pow(((x - 25) / (w - 50)) - 0.45, 2) / 0.002) + Math.exp(-Math.pow(((x - 25) / (w - 50)) - 0.72, 2) / 0.002);
      const hue = 230 - Math.min(180, (v * 40 + stripe * 90));
      ctx.fillStyle = `hsla(${hue}, 90%, ${35 + v * 35}%, .8)`;
      ctx.fillRect(x, y, 3, 2);
    }
  }
}

function drawHealth() { drawLines("healthChart", 4); }

function drawAll() {
  $$(".spark").forEach(drawSpark);
  $$(".gauge").forEach(drawGauge);
  drawPrpd("prpdChart");
  drawPrpd("historyPrpd");
  drawPrpd("diagPrpd");
  drawPrpd("maskPrpd");
  drawPrps();
  drawLines("multiTrend", 5);
  drawSlope();
  drawWave("waveChart");
  drawSpectrum("fftChart");
  drawSpectrum("filterChart");
  drawSpectrum("spectrumChart");
  drawCluster();
  drawRadar();
  drawWaterfall();
  drawHealth();
}

function tickClock() {
  const now = new Date();
  const pad = n => String(n).padStart(2, "0");
  $("#clock").textContent = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())} ${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`;
}

window.addEventListener("resize", () => requestAnimationFrame(drawAll));
document.addEventListener("DOMContentLoaded", () => {
  initAuthentication();
  initTables();
  initThresholdManagement();
  loadFilterConfig();
  initPhaseMaskManagement();
  initDeviceManagement();
  initSelfCheck();
  initDemoUsers();
  initSystemLogs();
  initDeviceTree();
  initNav();
  applySelectedUnit();
  renderTrendTarget();
  updateDiagnosisTarget();
  renderDiagnosisDefect(0);
  tickClock();
  setInterval(tickClock, 1000);
  renderFreshness();
  setInterval(renderFreshness, 5000);
  setTimeout(drawAll, 50);
});
