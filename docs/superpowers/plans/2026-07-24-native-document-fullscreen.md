# Native Document Fullscreen Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the upper-right “⛶” button enter true browser fullscreen from both `file://` and HTTP/HTTPS while preserving all eight navigation actions and reversible exit behavior.

**Architecture:** Use `document.documentElement` as the single native Fullscreen API target. Derive state only from `document.fullscreenElement`, remove the protocol resolver and CSS viewport-fullscreen simulation, and retain the existing lifecycle listeners, error feedback, and redraw path.

**Tech Stack:** Static HTML, CSS, browser Fullscreen API, vanilla JavaScript, Node.js built-in test runner.

---

### Task 1: Replace obsolete fullscreen contract tests

**Files:**
- Modify: `tests/fullscreen.test.js`
- Modify: `tests/core.test.js`

- [ ] **Step 1: Write the failing native-root fullscreen tests**

Replace the first, third, fourth, and fifth tests in `tests/fullscreen.test.js` with:

```js
test("fullscreen is owned by the document root and synchronized through lifecycle events", () => {
  assert.match(app, /const\\s+fullscreenTarget\\s*=\\s*document\\.documentElement/);
  assert.match(app, /fullscreenTarget\\.requestFullscreen\\(\\)/);
  assert.doesNotMatch(app, /appShell\\.requestFullscreen\\(\\)/);
  assert.match(app, /fullscreenchange[\\s\\S]*syncFullscreenState/);
  assert.match(app, /fullscreenerror[\\s\\S]*syncFullscreenState/);
  assert.match(app, /catch[\\s\\S]*全屏切换失败，请重试/);
});

test("document fullscreen gives appShell the full viewport without CSS simulation", () => {
  const rootRule = css.match(/:root:fullscreen\\s*\\{([^}]*)\\}/);
  assert.ok(rootRule, "root fullscreen rule must exist");
  assert.match(rootRule[1], /background:\\s*var\\(--bg\\)/);

  const shellRule = css.match(/:root:fullscreen\\s+#appShell\\s*\\{([^}]*)\\}/);
  assert.ok(shellRule, "appShell must fill the fullscreen document");
  for (const declaration of [
    /width:\\s*100vw/,
    /height:\\s*100vh/,
    /overflow:\\s*hidden/,
  ]) assert.match(shellRule[1], declaration);

  assert.doesNotMatch(css, /is-viewport-fullscreen/);
});

test("all protocols use native fullscreen and second toggle exits it", () => {
  assert.doesNotMatch(app, /resolveFullscreenMode/);
  assert.doesNotMatch(app, /is-viewport-fullscreen/);
  assert.match(app, /document\\.fullscreenElement\\s*===\\s*fullscreenTarget/);
  assert.match(app, /if\\s*\\(active\\)[\\s\\S]*document\\.exitFullscreen\\(\\)/);
  assert.match(app, /fullscreenTarget\\.requestFullscreen\\(\\)/);
});

test("fullscreen button state follows only the native document state", () => {
  assert.match(app, /function getFullscreenState\\(/);
  assert.match(app, /const\\s+fullscreenTarget\\s*=\\s*document\\.documentElement/);
  assert.match(app, /active:\\s*document\\.fullscreenElement\\s*===\\s*fullscreenTarget/);
  assert.match(app, /const\\s*\\{\\s*active\\s*\\}\\s*=\\s*getFullscreenState\\(\\)/);
});
```

Delete the `resolveFullscreenMode uses viewport fallback only for file protocol` test from `tests/core.test.js`.

- [ ] **Step 2: Run the focused tests and verify RED**

Run:

```bash
node --test tests/fullscreen.test.js tests/core.test.js
```

Expected: FAIL because `app.js` still selects the CSS viewport branch and `styles.css` still contains `is-viewport-fullscreen`.

- [ ] **Step 3: Commit the failing regression tests**

```bash
git add tests/fullscreen.test.js tests/core.test.js
git commit -m "test: require native document fullscreen"
```

### Task 2: Implement one native fullscreen state machine

**Files:**
- Modify: `app.js:1858-1920`
- Modify: `core.js:650-652,654-699`

- [ ] **Step 1: Replace the fullscreen state and toggle functions**

Replace `getFullscreenState()` and `toggleFullscreen()` with:

```js
function getFullscreenState() {
  const fullscreenTarget = document.documentElement;
  return {
    fullscreenTarget,
    active: document.fullscreenElement === fullscreenTarget,
  };
}

async function toggleFullscreen() {
  const { fullscreenTarget, active } = getFullscreenState();
  try {
    if (active) {
      if (!document.exitFullscreen) {
        showToast("当前浏览器不支持全屏模式");
        return false;
      }
      await document.exitFullscreen();
      return true;
    }
    if (!fullscreenTarget?.requestFullscreen) {
      showToast("当前浏览器不支持全屏模式");
      return false;
    }
    await fullscreenTarget.requestFullscreen();
    return true;
  } catch {
    showToast("全屏切换失败，请重试");
    syncFullscreenState();
    return false;
  }
}
```

Keep `syncFullscreenState()` and `initFullscreen()` unchanged so the button label, `fullscreenchange`, `fullscreenerror`, and `drawAll()` behavior remain centralized.

- [ ] **Step 2: Remove the obsolete protocol resolver**

Delete:

```js
function resolveFullscreenMode(protocol) {
  return protocol === "file:" ? "viewport" : "native";
}
```

Remove `resolveFullscreenMode,` from the exported `PDCore` object.

- [ ] **Step 3: Run syntax and focused tests and verify GREEN**

Run:

```bash
node --check app.js
node --check core.js
node --test tests/fullscreen.test.js tests/core.test.js
```

Expected: all commands exit 0 and the focused tests report no failures.

- [ ] **Step 4: Commit the native state machine**

```bash
git add app.js core.js
git commit -m "fix: use document root for native fullscreen"
```

### Task 3: Remove CSS simulated fullscreen

**Files:**
- Modify: `styles.css:130-141`

- [ ] **Step 1: Replace the fullscreen rules**

Replace the shared native/viewport rule and viewport fixed-position rule with:

```css
:root:fullscreen {
  background: var(--bg);
}

:root:fullscreen #appShell {
  width: 100vw;
  height: 100vh;
  overflow: hidden;
  background: var(--bg);
}
```

- [ ] **Step 2: Run focused tests and verify GREEN**

Run:

```bash
node --test tests/fullscreen.test.js
```

Expected: all fullscreen tests pass and the CSS simulation absence assertion passes.

- [ ] **Step 3: Commit the CSS cleanup**

```bash
git add styles.css
git commit -m "fix: style native document fullscreen"
```

### Task 4: Verify regression and browser behavior

**Files:**
- Verify: `app.js`
- Verify: `core.js`
- Verify: `styles.css`
- Verify: `tests/*.test.js`

- [ ] **Step 1: Run the complete automated verification**

Run:

```bash
node --check app.js
node --check core.js
node --test tests/*.test.js
git diff --check
```

Expected: both syntax checks exit 0, all tests pass, and `git diff --check` prints nothing.

- [ ] **Step 2: Verify native fullscreen over HTTP**

Serve the project locally, sign in with the approved demo credentials, and verify:

1. Clicking “⛶” changes its accessible name from `进入全屏` to `退出全屏`.
2. The complete document enters native fullscreen.
3. Each of the eight main navigation buttons activates its matching page.
4. The document has no horizontal overflow.
5. Clicking the button again exits fullscreen and restores `进入全屏`.

- [ ] **Step 3: Perform file-protocol acceptance**

In the user’s existing `file:///.../index.html` tab, ask the user to refresh and verify:

1. Clicking “⛶” hides the browser frame and visibly enlarges the system.
2. All eight navigation buttons remain actionable.
3. Clicking “⛶” again restores the previous browser size.

Browser automation may not inspect a `file://` page when blocked by its URL security policy, so this acceptance step must not be replaced with indirect browser control.

- [ ] **Step 4: Inspect final repository state**

Run:

```bash
git status --short --branch
git log --oneline --decorate -6
```

Expected: implementation commits are present; pre-existing user changes to the login JPG asset, `styles.css`, and `tests/structure.test.js` remain preserved and identifiable.
