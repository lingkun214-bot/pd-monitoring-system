const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.join(__dirname, "..");
const html = fs.readFileSync(path.join(root, "index.html"), "utf8");
const css = fs.readFileSync(path.join(root, "styles.css"), "utf8");
const app = fs.readFileSync(path.join(root, "app.js"), "utf8");

test("登录视图与系统主体具有稳定节点", () => {
  for (const id of [
    "loginView",
    "loginForm",
    "loginUsername",
    "loginPassword",
    "loginError",
    "passwordToggle",
    "appShell",
    "logoutBtn",
  ]) {
    assert.match(html, new RegExp(`id=["']${id}["']`));
  }
});

test("登录表单具有可见标签和可访问错误提示", () => {
  assert.match(html, /<label[^>]*for=["']loginUsername["'][^>]*>\s*账户\s*<\/label>/);
  assert.match(html, /<label[^>]*for=["']loginPassword["'][^>]*>\s*密码\s*<\/label>/);
  assert.match(html, /id=["']loginError["'][^>]*role=["']alert["']/);
});

test("core.js 在 app.js 之前加载", () => {
  assert.ok(html.indexOf("./core.js") < html.indexOf("./app.js"));
});

test("登录样式使用项目背景并支持视图隐藏与窄屏居中", () => {
  assert.match(css, /hydro-generator-login\.jpg/);
  assert.match(css, /\.login-view\[hidden\][\s\S]*\.app-shell\[hidden\]/);
  assert.match(css, /@media\s*\(max-width:\s*760px\)[\s\S]*\.login-card[\s\S]*margin-inline:\s*auto/);
});

test("认证使用固定本地键并通过 PDCore 校验", () => {
  assert.match(app, /pd-monitor\.authenticated/);
  assert.match(app, /PDCore\.isValidLogin/);
  assert.match(app, /localStorage\.removeItem/);
});

test("三个阈值页签及管理操作节点存在", () => {
  for (const token of [
    'data-threshold-tab="thresholds"',
    'data-threshold-tab="aging"',
    'data-threshold-tab="iris"',
    'id="thresholdForm"',
    'id="agingRows"',
    'id="irisRows"',
    'id="irisImport"',
    'id="thresholdModal"',
  ]) {
    assert.ok(html.includes(token), token);
  }
});

test("编辑模态关闭后按记录标识聚焦重建后的操作按钮", () => {
  assert.match(app, /const triggerId = trigger\?\.dataset\.id/);
  assert.match(app, /#agingRows button, #irisRows button/);
  assert.match(app, /button\.dataset\.id === triggerId/);
  assert.doesNotMatch(app, /thresholdModalTrigger\?\.focus\(\)/);
});

test("顶部报警铃铛与未确认数量具有稳定且可访问的节点", () => {
  assert.match(html, /<button[^>]*id=["']alarmBell["'][^>]*aria-label=["']未处理报警["'][^>]*>[\s\S]*?<svg[\s\S]*?id=["']alarmBadge["'][\s\S]*?<\/button>/);
  assert.match(html, /id=["']dashboardOpenAlarmCount["']/);
  assert.doesNotMatch(html, /data-alarm-filter=["']open["'][^>]*>未确认\s*<b>5<\/b>/);
});

test("未确认数量统一由 PDCore 计算并同步到铃铛与驾驶舱", () => {
  assert.match(app, /PDCore\.countOpenAlarms\(alarms\)/);
  assert.match(app, /alarmBadge\.hidden\s*=\s*openCount\s*===\s*0/);
  assert.match(app, /dashboardOpenAlarmCount\.textContent\s*=\s*String\(openCount\)/);
});

test("报警处置动作具有稳定节点并在更新状态后统一重渲染", () => {
  for (const id of ["confirmAlarmBtn", "dispatchAlarmBtn", "closeAlarmBtn", "alarmManagementHint"]) {
    assert.match(html, new RegExp(`id=["']${id}["']`));
  }
  assert.match(app, /PDCore\.transitionAlarm\(alarms\[selectedAlarmIndex\]/);
  assert.match(app, /renderAlarmViews\(\)/);
  assert.match(app, /alarmBell[\s\S]*setPage\(["']alarm["']\)/);
});

test("报警铃铛可访问名称随未确认数量同步", () => {
  assert.match(app, /const accessibleLabel\s*=\s*openCount\s*>\s*0\s*\?\s*`未处理报警：\$\{openCount\} 条`\s*:\s*["']暂无未处理报警["']/);
  assert.match(app, /alarmBell\.setAttribute\(["']aria-label["'],\s*accessibleLabel\)/);
});

test("报警管理行支持鼠标和键盘复用同一选择逻辑", () => {
  assert.match(app, /<tr[^`]*tabindex=["']0["'][^`]*role=["']button["']/);
  assert.match(app, /function selectManagedAlarmRow\(row\)/);
  assert.match(app, /row\.addEventListener\(["']click["'],\s*\(\)\s*=>\s*selectManagedAlarmRow\(row\)\)/);
  assert.match(app, /event\.key\s*!==\s*["']Enter["'][\s\S]*event\.key\s*!==\s*["'] ["'][\s\S]*selectManagedAlarmRow\(row\)/);
});

test("报警状态从专用本地键读取合法数组并在处置后持久化", () => {
  assert.match(app, /alarms:\s*["']pd-monitor\.alarms["']/);
  assert.match(app, /function validateAlarmRecords\(records\)/);
  assert.match(app, /let alarms\s*=\s*DEFAULT_ALARMS\.map/);
  assert.match(app, /readAlarmStorage\(\)/);
  assert.match(app, /localStorage\.setItem\(STORAGE_KEYS\.alarms,\s*JSON\.stringify\(alarms\)\)/);
  assert.match(app, /alarms\[selectedAlarmIndex\]\s*=\s*result\.record;[\s\S]{0,500}saveAlarmStorage\(\);[\s\S]{0,500}renderAlarmViews\(\)/);
});

test("恢复默认仅在全部本地键清理成功时承诺刷新仍为默认", () => {
  assert.match(app, /let storageCleared\s*=\s*true/);
  assert.match(app, /storageCleared\s*=\s*false/);
  assert.match(app, /if\s*\(storageCleared\)[\s\S]*刷新后仍将使用默认值/);
  assert.match(app, /else[\s\S]*刷新后可能恢复旧值/);
});

test("删除当前老化系数后会选择并持久化新的当前记录", () => {
  assert.match(app, /agingFactors\s*=\s*normalizeAgingFactors\(PDCore\.removeById\(agingFactors,\s*record\.id\)\)/);
  assert.match(app, /saveThresholdStorage\(STORAGE_KEYS\.aging,\s*agingFactors/);
  assert.match(app, /renderAgingFactors\(\);\s*renderThresholdSummary\(\)/);
});

test("老化系数在初始化、读取和所有写入入口均归一化为唯一当前记录", () => {
  assert.match(app, /function normalizeAgingFactors\(records\)/);
  assert.match(app, /let agingFactors\s*=\s*normalizeAgingFactors\(DEFAULT_AGING_FACTORS/);
  assert.match(app, /agingFactors\s*=\s*normalizeAgingFactors\(readThresholdStorage\([\s\S]*?STORAGE_KEYS\.aging/);
  assert.match(app, /agingFactors\s*=\s*normalizeAgingFactors\(PDCore\.upsertById\(agingFactors/);
  assert.match(app, /agingFactors\s*=\s*normalizeAgingFactors\(PDCore\.removeById\(agingFactors/);
  assert.match(app, /agingFactors\s*=\s*normalizeAgingFactors\(agingFactors\.map\(item\s*=>\s*\(\{\s*\.\.\.item,\s*applied:\s*item\.id\s*===\s*record\.id\s*\}\)\)\)/);
});

test("IRIS 导入入口支持键盘聚焦、激活和清晰焦点样式", () => {
  assert.match(html, /<label[^>]*class=["'][^"']*file-button[^"']*["'][^>]*for=["']irisImport["'][^>]*tabindex=["']0["'][^>]*role=["']button["']/);
  assert.match(app, /irisImportTrigger[\s\S]*event\.key\s*!==\s*["']Enter["'][\s\S]*event\.key\s*!==\s*["'] ["'][\s\S]*irisImport\.click\(\)/);
  assert.match(css, /\.file-button:focus-visible[\s\S]*outline:/);
});

test("铃铛筛选报警后将焦点移至首条可操作行或空状态容器", () => {
  assert.match(html, /id=["']alarmManageRows["'][^>]*tabindex=["']-1["']/);
  assert.match(app, /requestAnimationFrame\(\(\)\s*=>\s*\{[\s\S]*#alarmManageRows tr\[data-index\][\s\S]*alarmManageRows\?\.focus\(\)/);
});

test("仅历史、趋势和数据处理页面暴露设备上下文容器", () => {
  for (const page of ["history", "trend", "processing"]) {
    assert.match(html, new RegExp(`id=["']${page}["'][\\s\\S]*?data-device-page=["']${page}["']`));
  }
  for (const page of ["diagnosis", "alarm", "device", "system"]) {
    assert.doesNotMatch(html, new RegExp(`id=["']${page}["'][^>]*data-device-page=`));
  }
  assert.match(html, /id=["']deviceTreeToggle["']/);
  assert.match(html, /id=["']deviceTreeSearch["']/);
  assert.match(html, /id=["']currentDevicePath["']/);
});

test("历史列表只保留回放动作并支持条件筛选和动态播放", () => {
  assert.doesNotMatch(app, /data-action=["']detail["']/);
  assert.match(html, /id=["']historyUnitChannelFilter["']/);
  assert.match(html, /id=["']historyLevelFilter["']/);
  assert.match(app, /PDCore\.filterHistoryRows/);
  assert.match(app, /function renderHistoryRows\(/);
  assert.match(app, /historyPlaybackTimer/);
  assert.match(app, /historyReplaySeed\s*\+=/);
});

test("原始脉冲波形面板不再提供装饰性关闭按钮", () => {
  assert.doesNotMatch(html, /原始脉冲波形查询[\s\S]{0,150}关闭\s*×/);
});

test("历史、趋势、诊断、处理与全屏操作具有稳定闭环节点", () => {
  for (const id of ["fullscreenBtn", "prpdInspectBtn", "prpdZoomBtn", "prpdResetBtn", "historyQueryBtn", "historyResetBtn", "historyPlayBtn", "historyPauseBtn", "historySpeed", "exportTrendChartBtn", "exportDiagPdf", "printDiagReport", "applyFilterBtn", "saveDeviceConfig"]) {
    assert.match(html, new RegExp(`id=["']${id}["']`), id);
    assert.match(app, new RegExp(`#${id}|${id}`), `${id} handler`);
  }
  assert.match(app, /function runButtonAction\(/);
});

test("危险报警操作具有确认与取消路径", () => {
  for (const id of ["confirmDialog", "confirmDialogCancel", "confirmDialogAccept"]) assert.match(html, new RegExp(`id=["']${id}["']`));
  assert.match(app, /function requestConfirmation\(/);
  assert.match(app, /closeAlarmBtn[\s\S]*requestConfirmation/);
});

test("设备树在导航换行断点避开顶部按钮与底部状态栏", () => {
  assert.match(css, /\.topbar\s*\{[\s\S]*?position:\s*relative;[\s\S]*?z-index:\s*40/);
  assert.match(css, /@media\s*\(max-width:\s*1180px\)[\s\S]*?\.device-tree\s*\{[\s\S]*?top:\s*142px;[\s\S]*?bottom:\s*62px/);
  assert.match(css, /@media\s*\(max-width:\s*1180px\)[\s\S]*?\.history-export[^\{]*\{[\s\S]*?top:\s*142px/);
});

test("历史导出提供真实 CSV、JSON 和波形下载闭环", () => {
  for (const type of ["CSV", "JSON", "WAVEFORM"]) {
    assert.match(app, new RegExp(`data-export|${type}`));
  }
  assert.match(app, /function downloadBlob\(/);
  assert.match(app, /new Blob\(/);
  assert.match(app, /URL\.createObjectURL/);
  assert.match(app, /URL\.revokeObjectURL/);
  assert.match(app, /PDCore\.serializeHistoryCsv/);
  assert.match(app, /PDCore\.buildHistoryExportPayload/);
  assert.match(app, /currentHistoryRows\.length\s*===\s*0/);
});

test("趋势目标选择联动摘要、图表和可下载数据", () => {
  for (const id of ["trendUnitSelect", "trendChannelSelect", "trendTargetSummary", "trendCurrentUnit", "trendSlopeLabel", "trendSummaryRows"]) {
    assert.match(html, new RegExp(`id=["']${id}["']`), id);
  }
  assert.match(app, /function renderTrendTarget\(/);
  assert.match(app, /PDCore\.deriveTrendProfile/);
  assert.match(app, /trendUnitSelect[\s\S]*addEventListener\(["']change["']/);
  assert.match(app, /trendChannelSelect[\s\S]*addEventListener\(["']change["']/);
  assert.match(app, /function exportTrendData\([\s\S]*downloadBlob/);
  assert.match(app, /exportTrendChartBtn[\s\S]*exportTrendData/);
});

test("诊断上下文统一驱动封面、预览、下载和打印", () => {
  for (const id of ["diagReportTarget", "diagReviewNote", "diagReviewer", "diagSignature", "diagReportDate", "diagReportPreview", "previewDiagReport", "exportDiagPdf", "printDiagReport"]) {
    assert.match(html, new RegExp(`id=["']${id}["']`), id);
  }
  assert.match(app, /let diagnosisContext\s*=/);
  assert.match(app, /function renderDiagnosisReport\(/);
  assert.match(app, /PDCore\.buildDiagnosisReport/);
  assert.match(app, /diagUnitSelect[\s\S]*disabled\s*=\s*true/);
  assert.match(app, /diagChannelSelect[\s\S]*disabled\s*=\s*true/);
  assert.match(app, /exportDiagPdf[\s\S]*exportDiagnosisReport/);
  assert.match(app, /printDiagReport[\s\S]*window\.print/);
});

test("数字滤波器具备数值校验、结果反馈和本地持久化", () => {
  for (const id of ["filterLow", "filterHigh", "filterAttenuation", "filterBandwidth", "filterResultSummary", "applyFilterBtn"]) {
    assert.match(html, new RegExp(`id=["']${id}["']`), id);
  }
  assert.match(html, /id=["']filterLow["'][^>]*type=["']number["']/);
  assert.match(app, /filterConfig:\s*["']pd-monitor\.filter-config["']/);
  assert.match(app, /PDCore\.validateFilterConfig/);
  assert.match(app, /localStorage\.setItem\(STORAGE_KEYS\.filterConfig/);
  assert.match(app, /function loadFilterConfig\(/);
});

test("相位屏蔽窗支持新增、编辑、启停、删除与持久化", () => {
  for (const id of ["addPhaseMaskBtn", "phaseMaskRows", "phaseMaskModal", "phaseMaskForm", "phaseMaskStart", "phaseMaskEnd", "phaseMaskReason", "phaseMaskSave", "phaseMaskCancel"]) {
    assert.match(html, new RegExp(`id=["']${id}["']`), id);
  }
  assert.match(app, /phaseMasks:\s*["']pd-monitor\.phase-masks["']/);
  assert.match(app, /PDCore\.validateMaskWindow/);
  for (const action of ["edit", "toggle", "delete"]) assert.match(app, new RegExp(`data-mask-action=["']${action}["']`));
  assert.match(app, /localStorage\.setItem\(STORAGE_KEYS\.phaseMasks/);
  assert.match(app, /drawPrpd\(["']maskPrpd["']\)/);
});

test("报警列表支持机组、等级、状态组合筛选和旧数据迁移", () => {
  for (const id of ["alarmUnitFilter", "alarmLevelFilter", "alarmStatusFilter", "alarmFilterBtn", "alarmManagementHint"]) {
    assert.match(html, new RegExp(`id=["']${id}["']`), id);
  }
  assert.match(app, /PDCore\.normalizeAlarmRecord/);
  assert.match(app, /PDCore\.filterAlarms/);
  assert.match(app, /共 \$\{indexes\.length\} 条/);
});

test("报警处置使用状态机并要求派发组和处置意见", () => {
  assert.match(html, /id=["']alarmDispatchGroup["']/);
  assert.match(html, /id=["']alarmDispositionNote["']/);
  assert.match(app, /PDCore\.transitionAlarm/);
  assert.match(app, /function applyAlarmAction\(/);
  assert.match(app, /appendSystemLog\(/);
  assert.match(app, /alarm\.status\s*===\s*["']已关闭["']/);
});

test("设备行可选择并同步加载配置表单", () => {
  for (const id of ["deviceRows", "deviceType", "deviceName", "deviceCalibration", "deviceDepth", "deviceImpedance", "saveDeviceConfig", "deviceDirtyDialog", "deviceDirtySave", "deviceDirtyDiscard", "deviceDirtyCancel"]) {
    assert.match(html, new RegExp(`id=["']${id}["']`), id);
  }
  assert.match(app, /let selectedDeviceId\s*=/);
  assert.match(app, /let deviceFormDirty\s*=\s*false/);
  assert.match(app, /function renderDeviceRows\(/);
  assert.match(app, /function loadDeviceForm\(/);
  assert.match(app, /data-device-id=/);
  assert.match(app, /event\.key\s*!==\s*["']Enter["'][\s\S]*event\.key\s*!==\s*["'] ["']/);
});

test("设备配置使用数值校验并刷新后保留", () => {
  for (const id of ["deviceCalibration", "deviceDepth", "deviceImpedance"]) assert.match(html, new RegExp(`id=["']${id}["'][^>]*type=["']number["']`));
  assert.match(app, /devices:\s*["']pd-monitor\.devices["']/);
  assert.match(app, /PDCore\.validateDeviceConfig/);
  assert.match(app, /localStorage\.setItem\(STORAGE_KEYS\.devices/);
  assert.match(app, /function loadDevices\(/);
});

test("硬件自检支持启动、取消、失败模拟和重试", () => {
  for (const id of ["startSelfCheckBtn", "cancelSelfCheckBtn", "retrySelfCheckBtn", "selfCheckFailureMode", "selfCheckStatus", "selfCheckProgress", "selfCheckRows"]) assert.match(html, new RegExp(`id=["']${id}["']`));
  assert.match(app, /PDCore\.summarizeSelfCheck/);
  assert.match(app, /function startSelfCheck\(/);
  assert.match(app, /function cancelSelfCheck\(/);
  assert.match(app, /selfCheckTimer/);
});

test("用户管理明确为前端演示并支持新增编辑启停", () => {
  for (const id of ["demoUserNotice", "addDemoUserBtn", "demoUserRows", "demoUserModal", "demoUserForm", "demoUsername", "demoUserRole", "demoUserEnabled"]) assert.match(html, new RegExp(`id=["']${id}["']`));
  assert.match(app, /demoUsers:\s*["']pd-monitor\.demo-users["']/);
  assert.match(app, /PDCore\.validateDemoUser/);
  for (const action of ["edit", "toggle"]) assert.match(app, new RegExp(`data-demo-user-action=["']${action}["']`));
});

test("system logs expose stable query, detail, and export controls", () => {
  for (const id of ["systemLogUserFilter", "systemLogActionFilter", "querySystemLogsBtn", "exportSystemLogsBtn", "systemLogHint", "systemLogRows", "systemLogDetail"]) {
    assert.match(html, new RegExp(`id=["']${id}["']`));
  }
  assert.match(app, /function renderSystemLogs\(/);
  assert.match(app, /serializeSystemLogsCsv/);
});

test("shared asynchronous feedback exposes freshness and retryable panel states", () => {
  for (const id of ["lastDataUpdated", "staleDataWarning"]) assert.match(html, new RegExp(`id=["']${id}["']`));
  assert.match(app, /function markDataUpdated\(/);
  assert.match(app, /function setPanelState\(/);
  assert.match(app, /data-state/);
  assert.match(css, /\.panel-state-overlay/);
});
