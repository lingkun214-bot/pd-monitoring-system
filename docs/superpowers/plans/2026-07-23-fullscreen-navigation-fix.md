# Fullscreen Navigation Fix Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make all top navigation buttons remain operable after the application enters native fullscreen through the top-right “⛶” button.

**Architecture:** Fullscreen ownership moves from the root document element to `#appShell`, which contains the header, navigation, page content, and status bar. A small fullscreen controller will toggle the Fullscreen API, synchronize accessible button state on lifecycle events, handle failures, and request a chart redraw after the viewport changes.

**Tech Stack:** Static HTML, CSS, vanilla JavaScript Fullscreen API, Node.js built-in test runner.

---

## File Map

- Create `tests/fullscreen.test.js`: focused structural regressions for fullscreen ownership, lifecycle handling, navigation preservation, and fullscreen CSS.
- Modify `app.js`: add fullscreen state synchronization and replace the inline root-document fullscreen handler.
- Modify `styles.css`: define the `#appShell:fullscreen` layout boundary.
- Do not modify `index.html`: the existing `#appShell`, eight navigation buttons, and `#fullscreenBtn` are sufficient.

The main worktree already contains unrelated user changes in `styles.css`,
`tests/structure.test.js`, and `assets/hydro-generator-login.jpg`. Preserve them.
When committing the fullscreen CSS task, stage only the new
`#appShell:fullscreen` hunk from `styles.css`.

### Task 1: Fullscreen lifecycle controller

**Files:**
- Create: `tests/fullscreen.test.js`
- Modify: `app.js:1991-1995`

- [ ] **Step 1: Write the failing lifecycle test**

Create `tests/fullscreen.test.js`:

```js
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const app = fs.readFileSync(path.join(root, "app.js"), "utf8");
const html = fs.readFileSync(path.join(root, "index.html"), "utf8");
const css = fs.readFileSync(path.join(root, "styles.css"), "utf8");

test("fullscreen is owned by appShell and synchronized through lifecycle events", () => {
  assert.match(app, /function syncFullscreenState\(/);
  assert.match(app, /function toggleFullscreen\(/);
  assert.match(app, /appShell[\s\S]*requestFullscreen\(\)/);
  assert.doesNotMatch(app, /document\.documentElement\.requestFullscreen\(\)/);
  assert.match(app, /fullscreenchange[\s\S]*syncFullscreenState/);
  assert.match(app, /fullscreenerror[\s\S]*syncFullscreenState/);
  assert.match(app, /catch[\s\S]*全屏切换失败，请重试/);
});

test("fullscreen state keeps the existing unified navigation path", () => {
  const navButtons = [...html.matchAll(/class="nav-btn[^"]*"[^>]*data-page="([^"]+)"/g)]
    .map(match => match[1]);
  assert.deepEqual(navButtons, [
    "dashboard",
    "history",
    "trend",
    "diagnosis",
    "processing",
    "alarm",
    "device",
    "system",
  ]);
  assert.match(app, /\$\$\("#mainNav \.nav-btn"\)[\s\S]*addEventListener\("click"/);
  assert.match(app, /setPage\(btn\.dataset\.page\)/);
});
```

- [ ] **Step 2: Run the focused test and verify RED**

Run:

```bash
node --test tests/fullscreen.test.js
```

Expected: the navigation preservation test passes, while the lifecycle test fails
because `syncFullscreenState`, `toggleFullscreen`, and app-shell fullscreen ownership
do not exist.

- [ ] **Step 3: Add the minimal fullscreen controller**

In `app.js`, add these functions immediately before `initNav()`:

```js
function syncFullscreenState() {
  const appShell = $("#appShell");
  const button = $("#fullscreenBtn");
  if (!button) return;
  const active = document.fullscreenElement === appShell;
  button.setAttribute("aria-label", active ? "退出全屏" : "进入全屏");
  button.title = active ? "退出全屏" : "全屏";
  requestAnimationFrame(drawAll);
}

async function toggleFullscreen() {
  const appShell = $("#appShell");
  try {
    if (!document.fullscreenElement) {
      if (!appShell?.requestFullscreen) {
        showToast("当前浏览器不支持全屏模式");
        return false;
      }
      await appShell.requestFullscreen();
    } else {
      if (!document.exitFullscreen) {
        showToast("当前浏览器不支持全屏模式");
        return false;
      }
      await document.exitFullscreen();
    }
    return true;
  } catch {
    showToast("全屏切换失败，请重试");
    syncFullscreenState();
    return false;
  }
}

function initFullscreen() {
  $("#fullscreenBtn")?.addEventListener("click", toggleFullscreen);
  document.addEventListener("fullscreenchange", syncFullscreenState);
  document.addEventListener("fullscreenerror", syncFullscreenState);
  syncFullscreenState();
}
```

Remove the existing inline `#fullscreenBtn` listener from `initNav()`:

```js
$("#fullscreenBtn")?.addEventListener("click", async () => {
  if (!document.fullscreenElement && document.documentElement.requestFullscreen) await document.documentElement.requestFullscreen();
  else if (document.exitFullscreen) await document.exitFullscreen();
  else showToast("当前浏览器不支持全屏模式");
});
```

In the `DOMContentLoaded` callback, call `initFullscreen()` immediately after
`initNav()`:

```js
initNav();
initFullscreen();
applySelectedUnit();
```

- [ ] **Step 4: Run focused and full tests and verify GREEN**

Run:

```bash
node --test tests/fullscreen.test.js
node --test tests/*.test.js
node --check app.js
```

Expected: all focused tests pass, the full suite has zero failures, and the syntax
check exits with code 0.

- [ ] **Step 5: Commit the lifecycle controller**

```bash
git add app.js tests/fullscreen.test.js
git commit -m "fix: bind fullscreen to application shell"
```

Expected: only `app.js` and `tests/fullscreen.test.js` are included in the commit.

### Task 2: Explicit fullscreen layout boundary

**Files:**
- Modify: `tests/fullscreen.test.js`
- Modify: `styles.css:128-129`

- [ ] **Step 1: Add the failing fullscreen CSS test**

Append to `tests/fullscreen.test.js`:

```js
test("appShell fullscreen owns the full viewport without overflow", () => {
  assert.match(
    css,
    /#appShell:fullscreen\s*\{[\s\S]*width:\s*100vw;[\s\S]*height:\s*100vh;[\s\S]*overflow:\s*hidden;[\s\S]*background:\s*var\(--bg\);/
  );
});
```

- [ ] **Step 2: Run the focused test and verify RED**

Run:

```bash
node --test --test-name-pattern="appShell fullscreen owns" tests/fullscreen.test.js
```

Expected: FAIL because `#appShell:fullscreen` does not exist.

- [ ] **Step 3: Add the minimal fullscreen style**

Immediately after the existing `.app-shell` rule in `styles.css`, add:

```css
#appShell:fullscreen {
  width: 100vw;
  height: 100vh;
  overflow: hidden;
  background: var(--bg);
}
```

Do not change `.topbar` z-index or add `pointer-events`; hit testing showed no
overlapping page element, so those changes would mask rather than fix the boundary.

- [ ] **Step 4: Run focused and full tests and verify GREEN**

Run:

```bash
node --test tests/fullscreen.test.js
node --test tests/*.test.js
git diff --check
```

Expected: all tests pass and `git diff --check` produces no output.

- [ ] **Step 5: Commit only the fullscreen CSS hunk**

First stage the focused test:

```bash
git add tests/fullscreen.test.js
```

Then interactively stage only the hunk containing `#appShell:fullscreen`:

```bash
git add -p styles.css
```

Answer `n` to the pre-existing `hydro-generator-login.jpg` hunks and `y` only to
the new fullscreen hunk. Confirm the staged patch:

```bash
git diff --cached --check
git diff --cached --stat
```

Expected staged files: `tests/fullscreen.test.js` and `styles.css`, with no login
background URL change staged.

Commit:

```bash
git commit -m "fix: constrain application fullscreen layout"
```

### Task 3: Browser regression and final verification

**Files:**
- Verify: `index.html`
- Verify: `app.js`
- Verify: `styles.css`
- Verify: `tests/fullscreen.test.js`

- [ ] **Step 1: Start the local prototype**

Run from the repository root:

```bash
python3 -m http.server 8771
```

Open `http://127.0.0.1:8771/` and sign in with the authorized demo credentials.

- [ ] **Step 2: Verify fullscreen entry and the four reported navigation targets**

Click the top-right “⛶” button. In fullscreen, click these buttons in order:

1. 数据处理
2. 报警管理
3. 设备管理
4. 系统设置

After each click, verify:

- exactly one matching navigation button is active;
- its corresponding `.page` section is active and visible;
- no modal or transparent element intercepts the next navigation click;
- `document.documentElement.scrollWidth <= document.documentElement.clientWidth`.

- [ ] **Step 3: Verify fullscreen exit and state synchronization**

Click the same fullscreen button again and verify:

- `document.fullscreenElement` becomes `null`;
- the button has `aria-label="进入全屏"` and `title="全屏"`;
- dashboard and all eight navigation buttons remain operable;
- Canvas charts are rendered at the restored viewport size.

- [ ] **Step 4: Run final automated verification**

Run:

```bash
node --check app.js
node --test tests/*.test.js
git diff --check
git status --short
```

Expected:

- syntax check exits 0;
- the complete test suite has zero failures;
- no whitespace errors;
- only the user's pre-existing JPG login background changes remain unstaged.

- [ ] **Step 5: Record final commit history**

Run:

```bash
git log --oneline --decorate -5
```

Expected: the two fullscreen fix commits appear above the approved design and plan
documentation commits.
