# File Protocol Fullscreen Fallback Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Keep fullscreen navigation and the second-click exit behavior reliable when the prototype is opened directly through `file://`, while preserving native fullscreen on HTTP/HTTPS.

**Architecture:** A pure protocol resolver in `core.js` selects `viewport` mode for `file:` and `native` mode otherwise. The UI controller in `app.js` uses one combined state model for native and CSS fullscreen; `styles.css` implements the viewport fallback without entering the browser’s native fullscreen top layer.

**Tech Stack:** Static HTML, CSS, vanilla JavaScript, Fullscreen API, Node.js built-in test runner.

---

## File Map

- Modify `core.js`: expose a deterministic protocol-to-fullscreen-mode resolver.
- Modify `tests/core.test.js`: unit-test file, HTTP, and HTTPS mode selection.
- Modify `app.js`: combine native and CSS fullscreen state and make toggling protocol-aware.
- Modify `tests/fullscreen.test.js`: lock the UI controller to the protocol resolver and verify second-click removal.
- Modify `styles.css`: share viewport dimensions between native and CSS fullscreen and add fixed positioning for the file fallback.

The main worktree contains unrelated user changes in `styles.css`,
`tests/structure.test.js`, and `assets/hydro-generator-login.jpg`. Execute this
plan in an isolated worktree. When later merging to `main`, preserve and restore
those user changes.

### Task 1: Protocol mode resolver

**Files:**
- Modify: `core.js`
- Modify: `tests/core.test.js`

- [ ] **Step 1: Write the failing unit test**

Append to `tests/core.test.js`:

```js
test("resolveFullscreenMode uses viewport fallback only for file protocol", () => {
  assert.equal(PDCore.resolveFullscreenMode("file:"), "viewport");
  assert.equal(PDCore.resolveFullscreenMode("http:"), "native");
  assert.equal(PDCore.resolveFullscreenMode("https:"), "native");
  assert.equal(PDCore.resolveFullscreenMode(undefined), "native");
});
```

- [ ] **Step 2: Run the focused test and verify RED**

Run:

```bash
node --test --test-name-pattern="resolveFullscreenMode" tests/core.test.js
```

Expected: FAIL with `PDCore.resolveFullscreenMode is not a function`.

- [ ] **Step 3: Implement the minimal resolver**

Add this pure function near the other exported helpers in `core.js`:

```js
function resolveFullscreenMode(protocol) {
  return protocol === "file:" ? "viewport" : "native";
}
```

Add `resolveFullscreenMode` to the exported `PDCore` object without changing any
existing export.

- [ ] **Step 4: Run focused and full tests and verify GREEN**

Run:

```bash
node --test --test-name-pattern="resolveFullscreenMode" tests/core.test.js
node --test tests/*.test.js
node --check core.js
```

Expected: the focused test passes, the complete suite has zero failures, and the
syntax check exits 0.

- [ ] **Step 5: Commit the resolver**

```bash
git add core.js tests/core.test.js
git commit -m "feat: resolve fullscreen mode by protocol"
```

### Task 2: Combined fullscreen state machine

**Files:**
- Modify: `app.js`
- Modify: `tests/fullscreen.test.js`

- [ ] **Step 1: Write the failing controller tests**

Append to `tests/fullscreen.test.js`:

```js
test("file protocol uses CSS fullscreen and second toggle removes it", () => {
  assert.match(app, /PDCore\.resolveFullscreenMode\(window\.location\.protocol\)/);
  assert.match(app, /mode\s*===\s*"viewport"[\s\S]*classList\.add\("is-viewport-fullscreen"\)/);
  assert.match(app, /viewportActive[\s\S]*classList\.remove\("is-viewport-fullscreen"\)/);
});

test("fullscreen button state combines native and viewport fullscreen", () => {
  assert.match(app, /function getFullscreenState\(/);
  assert.match(app, /nativeActive[\s\S]*viewportActive[\s\S]*active:\s*nativeActive\s*\|\|\s*viewportActive/);
  assert.match(app, /const\s*\{\s*active\s*\}\s*=\s*getFullscreenState\(\)/);
});
```

- [ ] **Step 2: Run the focused tests and verify RED**

Run:

```bash
node --test --test-name-pattern="file protocol|combines native" tests/fullscreen.test.js
```

Expected: both tests fail because `getFullscreenState()` and the viewport class
toggle do not exist.

- [ ] **Step 3: Replace single-source native state with combined state**

Add this function immediately before `syncFullscreenState()` in `app.js`:

```js
function getFullscreenState() {
  const appShell = $("#appShell");
  const nativeActive = document.fullscreenElement === appShell;
  const viewportActive = Boolean(appShell?.classList.contains("is-viewport-fullscreen"));
  return {
    appShell,
    nativeActive,
    viewportActive,
    active: nativeActive || viewportActive,
  };
}
```

Replace `syncFullscreenState()` with:

```js
function syncFullscreenState() {
  const { active } = getFullscreenState();
  const button = $("#fullscreenBtn");
  if (!button) return;
  button.setAttribute("aria-label", active ? "退出全屏" : "进入全屏");
  button.title = active ? "退出全屏" : "全屏";
  requestAnimationFrame(drawAll);
}
```

- [ ] **Step 4: Make toggling protocol-aware**

Replace `toggleFullscreen()` with:

```js
async function toggleFullscreen() {
  const { appShell, nativeActive, viewportActive } = getFullscreenState();
  try {
    if (viewportActive) {
      appShell.classList.remove("is-viewport-fullscreen");
      syncFullscreenState();
      return true;
    }
    if (nativeActive) {
      if (!document.exitFullscreen) {
        showToast("当前浏览器不支持全屏模式");
        return false;
      }
      await document.exitFullscreen();
      return true;
    }

    const mode = PDCore.resolveFullscreenMode(window.location.protocol);
    if (mode === "viewport") {
      appShell?.classList.add("is-viewport-fullscreen");
      syncFullscreenState();
      return true;
    }
    if (!appShell?.requestFullscreen) {
      showToast("当前浏览器不支持全屏模式");
      return false;
    }
    await appShell.requestFullscreen();
    return true;
  } catch {
    appShell?.classList.remove("is-viewport-fullscreen");
    showToast("全屏切换失败，请重试");
    syncFullscreenState();
    return false;
  }
}
```

Keep `fullscreenchange` and `fullscreenerror` listeners in `initFullscreen()`.

- [ ] **Step 5: Run focused and full tests and verify GREEN**

Run:

```bash
node --test tests/fullscreen.test.js
node --test tests/*.test.js
node --check app.js
git diff --check
```

Expected: all tests pass, syntax check exits 0, and no whitespace errors appear.

- [ ] **Step 6: Commit the state machine**

```bash
git add app.js tests/fullscreen.test.js
git commit -m "fix: add file protocol fullscreen fallback"
```

### Task 3: Viewport fullscreen layout

**Files:**
- Modify: `styles.css`
- Modify: `tests/fullscreen.test.js`

- [ ] **Step 1: Replace the native-only CSS test with the failing fallback test**

Replace the existing test named
`appShell fullscreen owns the full viewport without overflow` in
`tests/fullscreen.test.js` with:

```js
test("viewport fullscreen fills the file page without native top-layer routing", () => {
  const shared = css.match(/#appShell:fullscreen,\s*#appShell\.is-viewport-fullscreen\s*\{([^}]*)\}/);
  assert.ok(shared, "native and viewport fullscreen must share a bounded rule");
  for (const declaration of [
    /width:\s*100vw/,
    /height:\s*100vh/,
    /overflow:\s*hidden/,
    /background:\s*var\(--bg\)/,
  ]) assert.match(shared[1], declaration);

  const viewport = css.match(/#appShell\.is-viewport-fullscreen\s*\{([^}]*)\}/);
  assert.ok(viewport, "viewport fullscreen rule must exist");
  assert.match(viewport[1], /position:\s*fixed/);
  assert.match(viewport[1], /inset:\s*0/);
});
```

- [ ] **Step 2: Run the focused test and verify RED**

Run:

```bash
node --test --test-name-pattern="viewport fullscreen fills" tests/fullscreen.test.js
```

Expected: FAIL because `.is-viewport-fullscreen` is absent.

- [ ] **Step 3: Implement the shared and viewport-only rules**

Replace the existing `#appShell:fullscreen` rule in `styles.css` with:

```css
#appShell:fullscreen,
#appShell.is-viewport-fullscreen {
  width: 100vw;
  height: 100vh;
  overflow: hidden;
  background: var(--bg);
}

#appShell.is-viewport-fullscreen {
  position: fixed;
  inset: 0;
}
```

Do not change `.topbar`, `.main-nav`, `.nav-btn`, or their pointer-event rules.

- [ ] **Step 4: Run focused and full tests and verify GREEN**

Run:

```bash
node --test tests/fullscreen.test.js
node --test tests/*.test.js
git diff --check
```

Expected: all tests pass and `git diff --check` emits no output.

- [ ] **Step 5: Commit the layout fallback**

```bash
git add styles.css tests/fullscreen.test.js
git commit -m "fix: style viewport fullscreen fallback"
```

### Task 4: Dual-mode regression and user acceptance

**Files:**
- Verify: `core.js`
- Verify: `app.js`
- Verify: `styles.css`
- Verify: `tests/core.test.js`
- Verify: `tests/fullscreen.test.js`

- [ ] **Step 1: Verify the HTTP native path**

Run from the isolated worktree:

```bash
python3 -m http.server 8772
```

Open `http://127.0.0.1:8772/`, sign in, click “⛶”, and verify:

- the button changes to `aria-label="退出全屏"`;
- 数据处理、报警管理、设备管理、系统设置 all switch pages;
- the second click exits and restores `aria-label="进入全屏"`;
- no horizontal overflow appears.

- [ ] **Step 2: Verify the file fallback through automated contracts**

Run:

```bash
node --test --test-name-pattern="resolveFullscreenMode|file protocol|viewport fullscreen" tests/core.test.js tests/fullscreen.test.js
```

Expected: all file-mode contract tests pass, proving that `file:` selects viewport
mode, adds/removes the CSS class, and uses fixed inset layout.

Browser automation is prohibited from interacting with `file://` pages in this
environment. Do not claim interactive file-mode acceptance from HTTP evidence.

- [ ] **Step 3: Request user acceptance on the actual file page**

Ask the user to reload:

```text
file:///Users/lee/Documents/New%20project_jufang/html_system_prototype/index.html
```

The user must verify:

1. Click “⛶”.
2. Click 实时监测驾驶舱、历史数据分析、长周期趋势分析、系统设置.
3. Click the same “⛶” button again.
4. Confirm all four pages switch and the second click restores the prior layout.

- [ ] **Step 4: Run final automated verification**

Run:

```bash
node --check core.js
node --check app.js
node --test tests/*.test.js
git diff --check
git status --short
git log --oneline --decorate -6
```

Expected: syntax checks exit 0, the complete suite has zero failures, the isolated
worktree is clean, and the three fallback commits are visible.
