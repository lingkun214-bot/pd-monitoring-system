# QA Remediation Batch 2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close alarm dispatch/close workflows and make device configuration selectable, validated, and persistent.

**Architecture:** Normalize alarm records from arrays into records with workflow metadata while supporting migration; isolate state-machine and device validation logic in `core.js`; keep UI mutations transactional in `app.js`.

**Tech Stack:** HTML, CSS, browser JavaScript, localStorage, Node test runner.

---

### Task 1: Alarm record migration and combined filtering

**Files:** Modify `core.js`, `app.js`, `index.html`, tests.

- [ ] Write failing tests for `normalizeAlarmRecord`, `filterAlarms({ unit, level, status })`, migration of existing four-item arrays, and corrupt storage fallback.
- [ ] Verify RED.
- [ ] Add `alarmUnitFilter` and `alarmLevelFilter`; store records as `{ time, level, content, status, unit, assignee, note, operator, handledAt }`.
- [ ] Render result counts and empty state; keep bell/dashboard counts derived from status.
- [ ] Run tests and commit: `git commit -am "feat: add combined alarm filtering"`.

### Task 2: Alarm workflow state machine

- [ ] Write failing tests for `transitionAlarm(record, action, payload)` covering required note/group, illegal repeated transitions, closed terminal state, and immutable output.
- [ ] Verify RED.
- [ ] Add processing-group select. Dispatch requires group and note; close requires note and confirmation. Record operator `admin` and ISO timestamp. Disable actions by current status and while saving.
- [ ] Persist the complete record, refresh detail/list/counts, append a system log entry, and retain input on failure.
- [ ] Run tests and commit: `git commit -am "feat: enforce persistent alarm workflow"`.

### Task 3: Selectable device records

**Files:** Modify `index.html`, `app.js`, `styles.css`, tests.

- [ ] Write failing tests for CH01/CH04 row buttons, `selectedDeviceId`, form loading, selected styling, and keyboard activation.
- [ ] Verify RED.
- [ ] Replace static table rows with `renderDeviceRows()`. Clicking or pressing Enter selects a record and fills the form.
- [ ] Track form dirty state. Before switching a dirty record or page, use the existing confirmation dialog for save/discard/cancel semantics.
- [ ] Run tests and commit: `git commit -am "feat: link device rows to configuration form"`.

### Task 4: Device validation and persistence

- [ ] Write failing tests for `validateDeviceConfig` covering empty name, non-positive factor, non-integer depth, non-positive impedance, and valid data.
- [ ] Verify RED.
- [ ] Replace unit-suffixed free text fields with number inputs plus visible unit labels. Save only valid normalized values to `pd-monitor.devices`.
- [ ] Update selected row and detail together; handle corrupt storage with default fallback and a visible warning.
- [ ] Run full tests and `git diff --check`.
- [ ] Commit: `git commit -am "feat: validate and persist device configuration"`.

### Task 5: Batch 2 browser acceptance

- [ ] Verify alarm filters, required fields, dispatch, close, illegal repeats, badge synchronization, and refresh persistence.
- [ ] Verify CH01/CH04 load distinct values, invalid saves fail, valid saves update rows, dirty-switch warning works, and refresh restores changes.
- [ ] Run full tests; expected zero failures.

