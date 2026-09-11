# Phase 1a-i — File Split + Dark Mode — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Split the single 1604-line `index.html` into `index.html` + `styles.css` + `app.js` + `cloud.js` without changing any behavior, then add a warm dark mode with a persisted theme toggle.

**Architecture:** Behavior-preserving extraction first (the classic `<script>` becomes an external classic script so its top-level functions stay global; the ESM `<script type="module">` becomes an external module — the `window.__ft*` / `window.__ftCloud` contract between them is unchanged). Dark mode is added as `html.dark` CSS-variable overrides plus a small theme module that reads/writes `localStorage` and respects `prefers-color-scheme` on first run.

**Tech Stack:** Vanilla HTML/CSS/JS, Firebase Web SDK 10.13.2 (ESM), GitHub Pages (static, direct deploy from `main`). No build step.

## Global Constraints

- **Behavior parity (Task 1):** the split must change ONLY the location of code, never its content. The extracted file bodies must be byte-identical to the original blocks.
- **Script types preserved:** `app.js` is a CLASSIC script (`<script src="app.js">`, no `type=module`, no `defer`) so its top-level `function t(){}`, `toast`, `closeSheet`, `render` etc. remain global. `cloud.js` is `<script type="module" src="cloud.js">`. Load order: `app.js` before `cloud.js`, both after the body markup, exactly where the inline blocks were.
- **Cross-script contract (do not break):** `app.js` exposes `window.__ftApplyRemote`, `window.__ftGetState`, `window.__ftResizeImage`, `window.__ftEscapeHtml`, `window.__ftTimeAgo`, `window.__ftSetEditable`, and reads `window.__ftCloud`. `cloud.js` sets `window.__ftCloud = {...}` and calls the `window.__ft*` functions + globals `t`, `toast`, `closeSheet`. Keep every one.
- **`t()` is the only path for user-facing text** (project rule); any new string goes through `t()` with `ar`+`en` keys.
- **Theme persistence is per-device via `localStorage`** for now (key `ft_theme`). Moving it to `users/{uid}.profile` is Phase 1c — do NOT write it to any Firestore doc here.
- **Palette stays the manuscript identity** (Amiri/Cairo, paper/emerald/gold). Dark values come from the approved mockup `docs/design/home-mockup.html`.
- **Deploy:** GitHub Pages serves the repo root, so the new `styles.css`/`app.js`/`cloud.js` at root are served as siblings — relative links (`href="styles.css"`) work both locally and on Pages.
- **No new dependencies.** The rules test harness (`npm run test:rules`) is unaffected and must still pass.
- **Commit attribution:** end messages with `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`.

---

## File Structure

| File | State | Responsibility |
|---|---|---|
| `index.html` | Modify | Markup + `<link>`/`<script src>` references only |
| `styles.css` | Create | All CSS (from the `<style>` block) + dark-mode overrides |
| `app.js` | Create | Classic script: i18n, state, render, UI (from lines 327-1093) |
| `cloud.js` | Create | ESM Firebase module (from lines 1097-1601) |

Current exact block boundaries in `index.html` (verify before extracting — earlier edits may shift by ±1):
- `<style>` at line 9, `</style>` at line 210 (CSS body = lines 10-209)
- classic `<script>` at line 326, `</script>` at line 1094 (JS body = lines 327-1093)
- `<script type="module">` at line 1096, `</script>` at line 1602 (module body = lines 1097-1601)

---

## Task 1: Split into styles.css + app.js + cloud.js (behavior-preserving)

**Files:**
- Create: `styles.css`, `app.js`, `cloud.js`
- Modify: `index.html` (replace the three inline blocks with references)

**Interfaces:**
- Consumes: nothing.
- Produces: the same runtime app, now in four files. The `window.__ft*` / `window.__ftCloud` contract and all globals are unchanged.

- [ ] **Step 1: Re-confirm the exact block boundaries**

Run:
```bash
grep -nE '^<style>$|^</style>$|^<script>$|^<script type="module">$|^</script>$' index.html
```
Expected: five lines — `<style>`, `</style>`, `<script>`, `<script type="module">`, `</script>` (the closing `</script>` of the classic block and of the module block). Record the four numbers you need: STYLE_OPEN, STYLE_CLOSE, JS_OPEN, JS_CLOSE (first `</script>`), MOD_OPEN, MOD_CLOSE (second `</script>`).

- [ ] **Step 2: Extract the three bodies to the new files (content-preserving)**

Using the confirmed line numbers (example uses the current 10-209 / 327-1093 / 1097-1601):
```bash
sed -n '10,209p'   index.html > styles.css
sed -n '327,1093p' index.html > app.js
sed -n '1097,1601p' index.html > cloud.js
```
Adjust the ranges to the numbers from Step 1 (body = open+1 .. close-1).

- [ ] **Step 3: Verify each extracted file is byte-identical to its source block**

Run:
```bash
diff <(sed -n '10,209p' index.html)   styles.css && echo "styles OK"
diff <(sed -n '327,1093p' index.html) app.js    && echo "app OK"
diff <(sed -n '1097,1601p' index.html) cloud.js && echo "cloud OK"
```
Expected: three empty diffs and `styles OK` / `app OK` / `cloud OK`. If any diff is non-empty, the ranges are wrong — fix and redo.

- [ ] **Step 4: Replace the inline blocks in index.html with references**

Edit `index.html`:
- Replace the whole `<style> … </style>` block (lines STYLE_OPEN..STYLE_CLOSE) with a single line, keeping it inside `<head>`:
  ```html
  <link rel="stylesheet" href="styles.css">
  ```
- Replace the whole classic `<script> … </script>` block (JS_OPEN..JS_CLOSE) with:
  ```html
  <script src="app.js"></script>
  ```
- Replace the whole module `<script type="module"> … </script>` block (MOD_OPEN..MOD_CLOSE) with:
  ```html
  <script type="module" src="cloud.js"></script>
  ```
Keep the relative order and position (link in head; `app.js` then `cloud.js` at the end of body, where the inline scripts were).

- [ ] **Step 5: Verify index.html now references the files and inlines nothing**

Run:
```bash
grep -nE 'styles\.css|app\.js|cloud\.js' index.html
grep -c '<style>' index.html          # expect 0
grep -c 'firebasejs' index.html        # expect 0 (moved into cloud.js)
wc -l index.html styles.css app.js cloud.js
```
Expected: the three references present; `<style>` count 0; `firebasejs` count 0; `index.html` is now roughly its markup size (~120 lines).

- [ ] **Step 6: Load the app and confirm identical behavior (manual)**

Run a static server and open it:
```bash
python -m http.server 5599
```
In a browser at `http://localhost:5599`: confirm the login screen renders styled (fonts + colors present → `styles.css` linked), open DevTools console and confirm **zero errors** (→ `app.js` globals and `cloud.js` module both loaded and the `window.__ft*` contract resolves). The Firebase auth screen appearing styled with no `ReferenceError`/`is not defined` in console is the pass signal. Note in the report that verification was manual (no client test harness) and list what you checked.

- [ ] **Step 7: Confirm the rules suite is unaffected**

Run: `npm run test:rules`
Expected: `40 passed, 0 failed` (this change does not touch rules; the check guards against accidental collateral).

- [ ] **Step 8: Commit**

```bash
git add index.html styles.css app.js cloud.js
git commit -m "refactor: split index.html into styles.css + app.js + cloud.js

Behavior-preserving extraction: each new file is byte-identical to the
inline block it came from (verified by diff). app.js stays a classic
script so its top-level functions remain global; cloud.js stays an ES
module. The window.__ft*/window.__ftCloud contract between them is
unchanged. No build step; GitHub Pages serves the siblings directly.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 2: Dark-mode palette (`html.dark` variable overrides)

**Files:**
- Modify: `styles.css` (append a dark block; add `color-scheme`)

**Interfaces:**
- Consumes: the `:root` variables defined at the top of `styles.css`.
- Produces: a complete dark palette activated by adding class `dark` to `<html>` (the element already carries `id="htmlRoot"` and toggles `lang-en`). Task 3 adds the toggle that sets the class.

- [ ] **Step 1: Add `color-scheme` to `:root` and `html.dark`**

At the end of the `:root{ … }` rule in `styles.css`, ensure the root declares a light scheme; then append the dark override block AFTER the existing `html.lang-en{…}` line so it wins. Append to `styles.css`:
```css
:root{ color-scheme: light; }
html.dark{
  color-scheme: dark;
  --paper:#17120B; --paper-deep:#211A10; --ink:#EDE3CE; --ink-soft:#B8A98C;
  --emerald:#2E8B72; --emerald-deep:#256F5C; --gold:#D6A94A; --gold-soft:#5A4A24;
  --teal:#3E9AA4; --plum:#B07C9C; --card:#221A10; --line:#3E3320; --danger:#C56A5A;
  --shadow: 0 1px 2px rgba(0,0,0,.30), 0 8px 22px rgba(0,0,0,.35);
}
```
These values are from the approved mockup `docs/design/home-mockup.html`.

- [ ] **Step 2: Fix any hardcoded light backgrounds that break in dark**

Search for hardcoded near-white backgrounds/text used as surfaces (not the intentional cream-on-emerald text):
```bash
grep -nE '#FFF|#FFFCF5|#F6EFDD|background:#F|background: *#F' styles.css | head -40
```
For each hit that is a **surface background** (e.g. a panel/card/input using `#FFF…` directly instead of `var(--card)`/`var(--paper)`), replace the literal with the matching variable so it flips in dark. Do NOT change `#F6EFDD` where it is **text/icon color on the emerald banner or on an emerald/gold fill** — that cream stays correct on those fills in both modes. Record each replacement in the report with its selector.

- [ ] **Step 3: Verify dark palette renders (manual, temporary class)**

With `python -m http.server 5599` running, open the app, and in DevTools console run `document.documentElement.classList.add('dark')`. Confirm: the ground turns warm brown-black (not pure black), text is readable cream, the emerald banner brightens, inputs/cards use dark surfaces (no white boxes). Then `document.documentElement.classList.remove('dark')` returns to light. Screenshot both if the environment allows; list any element that stayed light and fix it in Step 2.

- [ ] **Step 4: Commit**

```bash
git add styles.css
git commit -m "feat: add warm dark-mode palette (html.dark variable overrides)

A deep manuscript-brown ground (not cold black) keyed on the existing
CSS variables, values from the approved mockup. Surfaces that used
literal near-white are repointed to var(--card)/var(--paper) so they
flip. Activated by class 'dark' on <html>; the toggle lands in Task 3.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 3: Theme system + toggle (persisted, respects OS)

**Files:**
- Modify: `app.js` (add a theme module + call it on load), `index.html` (add a toggle button in the banner actions), and the i18n table in `app.js` (new keys).

**Interfaces:**
- Consumes: `html.dark` styling from Task 2; the existing i18n `t()` and the banner-actions container in `index.html`.
- Produces: `window.__ftApplyTheme(mode)` where `mode ∈ {'light','dark','auto'}`; the persisted key `localStorage['ft_theme']`; a banner button `#themeBtn` that cycles the theme.

- [ ] **Step 1: Add the theme module near the top of `app.js`**

Add, right after the i18n section (near the existing `applyLang`/persistence code), this self-contained module:
```javascript
/* ============== Theme ============== */
function ftReadTheme(){ try { return localStorage.getItem('ft_theme') || 'auto'; } catch(e){ return 'auto'; } }
function ftPrefersDark(){ return window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches; }
function ftResolveDark(mode){ return mode === 'dark' || (mode === 'auto' && ftPrefersDark()); }
function applyTheme(mode){
  var m = (mode === 'light' || mode === 'dark') ? mode : 'auto';
  document.documentElement.classList.toggle('dark', ftResolveDark(m));
  try { localStorage.setItem('ft_theme', m); } catch(e){}
  var btn = document.getElementById('themeBtn');
  if(btn){ btn.textContent = ftResolveDark(m) ? '☀' : '☾'; btn.title = t(ftResolveDark(m) ? 'themeLight' : 'themeDark'); }
}
window.__ftApplyTheme = applyTheme;
// Re-resolve on OS change while in 'auto'
if(window.matchMedia){
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', function(){
    if(ftReadTheme() === 'auto') applyTheme('auto');
  });
}
```

- [ ] **Step 2: Apply the theme as early as possible on load**

At the very start of `app.js` (before any rendering, ideally the first executable lines), call:
```javascript
try { document.documentElement.classList.toggle('dark',
  (function(m){ return m === 'dark' || (m === 'auto' && window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches); })(localStorage.getItem('ft_theme') || 'auto')); } catch(e){}
```
This sets the class before first paint to avoid a light flash. `applyTheme()` (Step 1) is still called later once the DOM/i18n exist, to wire the button label.

- [ ] **Step 3: Add the i18n keys**

In the `I18N` table in `app.js`, add to the `ar`+`en` object form used by the file:
```javascript
themeDark:{ar:'الوضع الداكن', en:'Dark mode'},
themeLight:{ar:'الوضع الفاتح', en:'Light mode'},
```

- [ ] **Step 4: Add the toggle button to the banner**

In `index.html`, inside the banner actions container (the `.banner-actions` group holding the existing icon buttons), add before the other buttons:
```html
<button class="icon-btn" id="themeBtn" title="الوضع الداكن">☾</button>
```
(The `.icon-btn` class already exists.)

- [ ] **Step 5: Wire the button + initialize label**

Where the app initializes UI on load (near the existing `applyLang(); render();` bootstrap in `app.js`), add:
```javascript
applyTheme(ftReadTheme());
var themeBtn = document.getElementById('themeBtn');
if(themeBtn){ themeBtn.onclick = function(){
  var cur = ftReadTheme();
  applyTheme(cur === 'dark' ? 'light' : (cur === 'light' ? 'auto' : 'dark'));
}; }
```
The cycle is dark → light → auto → dark. `applyTheme` updates the button glyph (☾/☀) and title each time.

- [ ] **Step 6: Verify (manual)**

Serve and open the app. Confirm: the theme button appears in the banner; clicking it flips light/dark and the glyph updates; reloading preserves the choice (localStorage); with the choice cleared (`localStorage.removeItem('ft_theme')`) the app follows the OS theme. Confirm no console errors.

- [ ] **Step 7: Commit**

```bash
git add app.js index.html
git commit -m "feat: persisted theme toggle (light/dark/auto) in the banner

applyTheme() resolves dark from an explicit choice or the OS setting,
sets html.dark before first paint to avoid a flash, persists to
localStorage (per-device; moves to the user profile in Phase 1c), and
re-resolves on OS change while in auto. A banner icon-btn cycles
dark -> light -> auto. Text routed through t().

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Self-Review

**Spec coverage (this plan's slice of Phase 1a):** file split → Task 1; dark mode → Tasks 2-3. The larger redesign surfaces (home screen, bottom nav, settings screen, immersive tree) are Plan 1a-ii; PWA is Plan 1a-iii — explicitly out of scope here and noted so no task is missing for this plan's goal. The temporary banner toggle (Task 3) is replaced by the Settings screen control in 1a-ii.

**Placeholder scan:** no TBD/TODO; every code step carries real code; the only ranges left to the implementer (line numbers in Task 1) are explicitly re-confirmed in Step 1 with a command, because earlier commits may shift them — that is a re-verification instruction, not a placeholder.

**Type consistency:** `applyTheme(mode)` / `window.__ftApplyTheme` / `ft_theme` / `#themeBtn` / keys `themeDark`,`themeLight` are used identically across Tasks 2-3. `html.dark` is the single activation hook shared by Task 2 (styling) and Task 3 (toggle).

**Risk note for the executor:** Task 1 is the only risky task (a refactor of a working, now-secure app). Its byte-identical `diff` checks (Step 3) plus the console-clean load (Step 6) are the safety net. Because there is no client test harness, keep Task 1 a standalone commit so it can be reverted independently if the manual load reveals a regression.
