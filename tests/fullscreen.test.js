const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const app = fs.readFileSync(path.join(root, "app.js"), "utf8");
const html = fs.readFileSync(path.join(root, "index.html"), "utf8");
const css = fs.readFileSync(path.join(root, "styles.css"), "utf8");

test("fullscreen is owned by the document root and synchronized through lifecycle events", () => {
  assert.match(app, /const\s+fullscreenTarget\s*=\s*document\.documentElement/);
  assert.match(app, /fullscreenTarget\.requestFullscreen\(\)/);
  assert.doesNotMatch(app, /appShell\.requestFullscreen\(\)/);
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

test("document fullscreen gives appShell the full viewport without CSS simulation", () => {
  const rootRule = css.match(/:root:fullscreen\s*\{([^}]*)\}/);
  assert.ok(rootRule, "root fullscreen rule must exist");
  assert.match(rootRule[1], /background:\s*var\(--bg\)/);

  const shellRule = css.match(/:root:fullscreen\s+#appShell\s*\{([^}]*)\}/);
  assert.ok(shellRule, "appShell must fill the fullscreen document");
  for (const declaration of [
    /width:\s*100vw/,
    /height:\s*100vh/,
    /overflow:\s*hidden/,
  ]) assert.match(shellRule[1], declaration);

  assert.doesNotMatch(css, /is-viewport-fullscreen/);
});

test("all protocols use native fullscreen and second toggle exits it", () => {
  assert.doesNotMatch(app, /resolveFullscreenMode/);
  assert.doesNotMatch(app, /is-viewport-fullscreen/);
  assert.match(app, /document\.fullscreenElement\s*===\s*fullscreenTarget/);
  assert.match(app, /if\s*\(active\)[\s\S]*document\.exitFullscreen\(\)/);
  assert.match(app, /fullscreenTarget\.requestFullscreen\(\)/);
});

test("fullscreen button state follows only the native document state", () => {
  assert.match(app, /function getFullscreenState\(/);
  assert.match(app, /const\s+fullscreenTarget\s*=\s*document\.documentElement/);
  assert.match(app, /active:\s*document\.fullscreenElement\s*===\s*fullscreenTarget/);
  assert.match(app, /const\s*\{\s*active\s*\}\s*=\s*getFullscreenState\(\)/);
});
