# QA Remediation Batch 3 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add executable system self-check, front-end user administration, searchable/exportable logs, and shared freshness/error states.

**Architecture:** Use deterministic timers for demo self-checks, explicit front-end-only user records, append-only local demo logs, and one shared freshness controller. Clearly label production integration boundaries.

**Tech Stack:** HTML, CSS, browser JavaScript, localStorage, Blob/ObjectURL, Node test runner.

---

### Task 1: Executable hardware self-check

- [ ] Write failing structural tests for start/cancel/retry/failure-mode controls and unit tests for `summarizeSelfCheck(items)`.
- [ ] Verify RED.
- [ ] Add idle/running/passed/failed states, deterministic staged progress, cancel, retry, and “simulate one failure”. Disable duplicate starts and stop timers on page leave.
- [ ] Append completion/failure to system logs.
- [ ] Run tests and commit: `git commit -am "feat: add executable hardware self check"`.

### Task 2: Front-end user administration

- [ ] Write failing tests for `validateDemoUser`, duplicate usernames, role normalization, enable/disable transition, and stable add/edit/action nodes.
- [ ] Verify RED.
- [ ] Add a visible “前端权限演示” boundary notice, add-user modal, role select, and enable/disable action. Persist to `pd-monitor.demo-users`.
- [ ] Do not extend login beyond admin; explicitly state production authentication/RBAC is not simulated.
- [ ] Append changes to logs; run tests and commit: `git commit -am "feat: add demo user administration"`.

### Task 3: Searchable and exportable logs

- [ ] Write failing tests for `filterSystemLogs(logs, filters)`, CSV serializer, stable user/action filters, empty state, detail, and export nodes.
- [ ] Verify RED.
- [ ] Store append-only demo logs in `pd-monitor.system-logs`; query by user/action, show details, and download UTF-8 BOM CSV.
- [ ] Add logs for alarm, device, user, and self-check actions through one `appendSystemLog` function.
- [ ] Run tests and commit: `git commit -am "feat: query and export demo system logs"`.

### Task 4: Shared async state and freshness

- [ ] Write failing tests for `getFreshnessState(lastUpdated, now, thresholdMs)` and DOM contracts for last-updated, stale warning, loading, empty, error, and retry.
- [ ] Verify RED.
- [ ] Add `lastDataUpdatedAt` and render normal/stale states in the status bar. Refresh the timestamp on simulated data updates.
- [ ] Create reusable `setPanelState(panel, state, message, retry)` for loading/empty/error overlays without erasing the last valid data.
- [ ] Add demo retry paths to report generation, filter application, self-check, and device/alarm saves.
- [ ] Run full tests and commit: `git commit -am "feat: add shared freshness and error states"`.

### Task 5: Batch 3 and full QA acceptance

- [ ] Verify self-check pass/fail/retry, user add/role/disable persistence, log query/detail/export, and stale/recovered data states.
- [ ] Verify 1366×768 and 1920×1080 layouts, keyboard access, modal focus, and no unexpected horizontal overflow.
- [ ] Run `node --test tests/*.test.js` and `git diff --check`; expected zero failures/output.
- [ ] Record production-only deferred items in README or QA mapping without claiming them fixed.
