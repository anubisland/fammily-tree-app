# Phase 1a-ii — App Shell + Home + Settings — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development. Steps use `- [ ]`.

**Goal:** Add the bottom navigation, a Home screen with colored section cards, and a Settings screen — matching the approved mockup — without breaking the existing tree, moments, auth, or sheet behavior.

**Architecture:** Wrap the existing tree DOM (banner + toolbar + stage) as the `tree` tab panel; re-home the existing `#momentsScreen` as the `moments` tab; add new `home` and `settings` tab panels; add a fixed bottom nav; a small router in `app.js` shows one panel at a time. The app opens on the `tree` tab (spec: the tree is the start). The dark-mode toggle moves from the banner into Settings.

**Tech Stack:** Vanilla HTML/CSS/JS split across index.html/styles.css/app.js/cloud.js; Firebase; GitHub Pages.

## Global Constraints

- **Do not break the tree render path.** `render()` in `app.js` targets `#stage`/`#canvas`/`#treeRoot`/`#statRow`/`#emptyWrap` — keep those IDs and their DOM intact; only wrap them in a panel container.
- **Approved visual reference:** `docs/design/home-mockup.html` — colors, card tints, masthead (family name in Amiri beside app name + gold tadhib rule), stat row, cards, completion meter, bottom nav with gold active underline. Reuse the exact tint variables (`--t-tree/--t-feed/--t-search/--t-members`) and add them to `styles.css` `:root` and `html.dark`.
- **`t()` is the only path for user-facing text** — every new label gets `ar`+`en` keys in the `I18N` table.
- **Auth stays a pre-login overlay** (`#authGate`) above everything; the nav + panels are only relevant post-login. The bottom nav is hidden while `#authGate` is visible.
- **Icons:** the mockup uses emoji; keep simple emoji/glyphs for now (icon-font migration is out of scope).
- **Default tab = `tree`.** Persist the last tab in `localStorage['ft_tab']`.
- **Dark toggle moves to Settings** — remove the temporary banner `#themeBtn` (Phase 1a-i) and add the control in Settings; keep `applyTheme`/`ft_theme` logic.
- **No new dependencies. No build step.** Deploy is Pages from `main`.
- Commit attribution: `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`.

---

## File Structure

| File | State | Responsibility |
|---|---|---|
| `index.html` | Modify | Wrap tree DOM in `#tab-tree`; add `#tab-home`, `#tab-settings`; move `#momentsScreen`→`#tab-moments`; add `<nav class="bottom-nav">`; remove banner `#themeBtn` |
| `styles.css` | Modify | Card tints, `.leaf`, masthead/tadhib, `.bottom-nav`, `.tab-panel`, settings rows; dark variants |
| `app.js` | Modify | `showTab(name)` router + nav wiring; `renderHome()` (stats, cards, meter); `renderSettings()`; move theme control into settings |

---

## Task 1: App shell — bottom nav + tab router + panel restructure

**Files:** Modify `index.html`, `styles.css`, `app.js`

**Interfaces:**
- Produces: `window.__ftShowTab(name)` / `showTab(name)` with `name ∈ {'home','tree','moments','settings'}`; `localStorage['ft_tab']`; panels `#tab-home #tab-tree #tab-moments #tab-settings`; `.bottom-nav` with `.nav-item[data-tab]`.

- [ ] **Step 1: Restructure the body into tab panels (index.html)**
Wrap the existing tree view — `.banner` + `#storageWarn` + `#toolbar` + `#stage` — in `<section id="tab-tree" class="tab-panel">…</section>`. Move the existing `#momentsScreen` markup into `<section id="tab-moments" class="tab-panel">…</section>` (drop its slide-over open/close mechanics; it's now a tab). Add empty `<section id="tab-home" class="tab-panel"></section>` and `<section id="tab-settings" class="tab-panel"></section>` (populated by JS in Tasks 2-3). Keep `#authGate`, `#overlay`, `#sheet`, `#toast` OUTSIDE the panels (global). After the panels, add:
```html
<nav class="bottom-nav" id="bottomNav" style="display:none;">
  <button class="nav-item" data-tab="home"><span class="ni">⌂</span><span id="nav_home"></span></button>
  <button class="nav-item" data-tab="tree"><span class="ni">🌳</span><span id="nav_tree"></span></button>
  <button class="nav-item" data-tab="moments"><span class="ni">📰</span><span id="nav_moments"></span></button>
  <button class="nav-item" data-tab="settings"><span class="ni">⚙</span><span id="nav_settings"></span></button>
</nav>
```

- [ ] **Step 2: Add panel + nav CSS (styles.css)**
Add `.tab-panel{display:none;} .tab-panel.active{display:block;}` and the `.bottom-nav` / `.nav-item` styles from the mockup (fixed to bottom, `--nav-bg`, gold active underline). Add card-tint vars (`--t-tree/--t-feed/--t-search/--t-members`) to `:root` and `html.dark` (values from the mockup). Give the app body bottom padding so content clears the fixed nav.

- [ ] **Step 3: Router + nav wiring (app.js)**
Add:
```javascript
function showTab(name){
  var tabs=['home','tree','moments','settings'];
  if(tabs.indexOf(name)<0) name='tree';
  tabs.forEach(function(t){
    var p=document.getElementById('tab-'+t); if(p) p.classList.toggle('active', t===name);
  });
  document.querySelectorAll('.bottom-nav .nav-item').forEach(function(b){
    b.classList.toggle('active', b.getAttribute('data-tab')===name);
  });
  try{ localStorage.setItem('ft_tab', name); }catch(e){}
  if(name==='home' && window.__ftRenderHome) window.__ftRenderHome();
  if(name==='settings' && window.__ftRenderSettings) window.__ftRenderSettings();
}
window.__ftShowTab=showTab;
```
Wire nav buttons (`data-tab`) to `showTab`, show `#bottomNav` once auth passes (where the app currently reveals the tree post-login — search where `authGate.classList.add('hidden')` / editable UI is set), and call `showTab(localStorage.getItem('ft_tab')||'tree')` after login. Add i18n keys `navHome/navTree/navMoments/navSettings` and set the four `#nav_*` labels in `applyLang()`.

- [ ] **Step 4: Verify (manual)** — serve, log in: bottom nav shows; tapping each tab switches panels; tree still renders and is the default; moments still lists/posts; reload keeps the last tab; no console errors. Report what was checked (human login step named if you can't log in).

- [ ] **Step 5: Commit** `feat: bottom nav + tab router + panel restructure`

---

## Task 2: Home screen (masthead, stats, cards, completion meter)

**Files:** Modify `app.js` (`renderHome`), `styles.css` (leaf/masthead/meter), `index.html` (none beyond `#tab-home`)

**Interfaces:** Consumes `showTab`, `state` (people map), `t()`. Produces `window.__ftRenderHome()`.

- [ ] **Step 1:** Add `.leaf`, masthead/`.tadhib`, `.meter-card`, `.section-eyebrow` CSS from the mockup to `styles.css` (light + dark).
- [ ] **Step 2:** Implement `renderHome()` in `app.js` building `#tab-home` innerHTML per the mockup: masthead (app name `t('appName')` + family name from `state.familyName` + tadhib rule), stat row (people count, generation count, photo count computed from `state`), 4 cards (tree/moments/search/members) each calling `showTab(...)` on click (search/members can `showTab('tree')` or a toast placeholder for now — note which), and a completion meter (percent = filled fields / total; a hint naming one missing item). All text via `t()`. Numbers via Arabic-Indic if `state.lang==='ar'` (reuse any existing number formatting; else plain).
- [ ] **Step 3:** Export `window.__ftRenderHome`; call it from `showTab('home')`.
- [ ] **Step 4: Verify (manual)** — Home tab shows masthead with the real family name, live counts, colored cards that navigate, and the meter. Dark mode looks right.
- [ ] **Step 5: Commit** `feat: home screen with section cards + completion meter`

---

## Task 3: Settings screen (language, dark mode, font size, family, invite, members, sign out)

**Files:** Modify `app.js` (`renderSettings`), `styles.css` (settings rows), `index.html` (remove banner `#themeBtn`)

**Interfaces:** Consumes `applyTheme`/`ft_theme`, existing language toggle, `createInvite`/members/sign-out (via `window.__ftCloud`). Produces `window.__ftRenderSettings()`.

- [ ] **Step 1:** Remove the temporary banner `#themeBtn` (index.html) and its banner-only wiring in `app.js` (keep `applyTheme`, the module, and pre-paint line).
- [ ] **Step 2:** Add settings-row CSS from the mockup (grouped card rows with dividers).
- [ ] **Step 3:** Implement `renderSettings()` building `#tab-settings`: **Appearance/Language** group — language (ar/EN, reuse existing lang switch), dark mode (a 3-state control: فاتح/داكن/تلقائي calling `applyTheme`), font size (a 3-level control; if not yet wired to CSS, render it and persist `ft_fontscale` with a note it applies in a later task). **Family** group — family name (opens the existing edit), دعوة فرد (calls `window.__ftCloud.createInvite('editor')` when `canEditCloud`), أفراد العائلة (existing members view), تثبيت التطبيق (placeholder row, wired in Phase 1a-iii PWA), تسجيل الخروج (existing signOut). All via `t()`; guard invite on `canEditCloud`.
- [ ] **Step 4:** Export `window.__ftRenderSettings`; call from `showTab('settings')`.
- [ ] **Step 5: Verify (manual)** — Settings tab shows all rows; language switch works and doesn't kill dark mode; dark control flips theme; invite copies a link; sign out works. Dark mode styling correct.
- [ ] **Step 6: Commit** `feat: settings screen (appearance, language, family, invite, sign out)`

---

## Self-Review
- Spec coverage: bottom nav + home + settings (mockup) → Tasks 1-3; immersive tree + PWA are later plans. Dark toggle relocation → Task 3 Step 1.
- Placeholder note: search/members cards and font-size/PWA rows are intentionally wired as navigation-or-placeholder with an explicit note (their full features are later phases) — not silent stubs; each must show a real control or a clear "coming" affordance, never a dead click.
- Type consistency: `showTab`/`__ftShowTab`, `__ftRenderHome`, `__ftRenderSettings`, `ft_tab`, tint vars `--t-*`, panel ids `#tab-*` used identically across tasks.
- Risk: Task 1 restructures the body; the tree render path IDs must be preserved. Keep Task 1 a standalone commit; verify the tree renders before proceeding.
