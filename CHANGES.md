# OdomMap.html — Personal Modifications

Original project: https://github.com/haing2811/OdomMap  
Modified file: `OdomMap.html` (same file, same dependencies — no additional files required)

I only came across your project and OdomMap a few days ago and we immediately started using it during training. All changes are **purely additive** — no original functionality has been removed or broken.

---

## 1. Show Right Triangle — unchecked by default

**What:** The „Show Right Triangle" checkbox in the Display section is no longer checked on startup.

**Why:** The triangle overlay clutters the view when drawing shorter lines. The user can still enable it manually when needed.

**Changes:**
- HTML: removed `checked` attribute from `<input id="show-triangle">`
- JS: `let showTriangle = true` → `let showTriangle = false`

---

## 2. Show Grid — grid available in all modes

**What:** Added a „Show Grid" checkbox to the Display section. The 100 mm coordinate grid can now be shown in Normal and Route modes, not only in Odometry mode.

**Why:** Useful for spatial orientation when drawing lines in Normal mode without switching to Odometry mode.

**Changes:**
- HTML: new `<div class="toggle-item">` with `<input id="show-grid">`
- JS: new variable `let showGrid = false`
- JS: grid condition `if (currentMode === 'odometry')` → `if (currentMode === 'odometry' || showGrid)`
- JS: new event listener for `show-grid` checkbox

---

## 3. Edge Measure — measure distance from any field edge

**What:** New „Edge Measure" section in the sidebar with 4 buttons (▲ Top, ◄ Left, Right ►, ▼ Bottom). After selecting a direction, each click on the canvas draws a cyan line from the selected edge to the clicked point and displays the distance in mm — always **inside** the canvas area.

- Labels always stay **within the visible canvas** (never rendered outside the image)
- Multiple measurements can be placed at once
- **Right-click** on the canvas deactivates edge measure mode
- The active button is highlighted in red
- „Clear Edge Lines" button removes all edge measurements

**Why:** WRO competitions require precise robot positioning relative to field edges. This feature allows quick distance marking without drawing full measurement lines.

**Changes:**
- CSS: new styles `.edge-btn`, `.edge-btn-group`, `.edge-btn.active`
- HTML: new sidebar section `id="edge-measure-section"`
- JS: new variables `edgeMeasureMode`, `edgeLines[]`
- JS: drawing in `draw()` — saved edge lines and live preview
- JS: `canvas.click` — captures click when edge mode is active
- JS: `canvas.contextmenu` — right-click deactivates edge mode
- JS: `btn-clear-all` now also clears `edgeLines`
- JS: event listeners for 4 edge buttons + clear button

---

## 4. Saved Lines — save and reload drawn lines

**What:** New „Saved Lines" section in the sidebar. Allows saving the currently drawn lines and edge measurements to `localStorage` (persists across browser sessions) and reloading them later.

- **💾 Save Current Lines** — saves the current set (name = date/time)
- **Load** — reloads the selected set back onto the canvas
- **X** — deletes a single saved set
- **Delete All** — clears all saved sets
- List is sorted **newest first**
- Coordinates are stored in **mm** (scale-independent, works correctly after window resize)

**Why:** Between training sessions it's useful to recall specific measurement setups for particular field scenarios without redrawing everything from scratch.

**Changes:**
- HTML: new sidebar section `id="saved-lines-section"`
- JS: functions `getSavedLinesSets()`, `saveLinesSetsToStorage()`, `updateSavedLinesList()`
- JS: `window.loadLinesSet(idx)`, `window.deleteLinesSet(idx)`
- JS: event listeners for save/delete-all buttons
- JS: `window.load` — initialises the list on page load

---

## 5. Bugfix: angle label no longer renders outside the canvas

**What:** The angle text (e.g. „90.0°") that appears when drawing lines now always stays within the visible canvas area. In the original, when a line's start point was near the edge, the label would appear outside the image.

**Changes:**
- JS: added coordinate clamping in `drawAngleText()`:
  ```js
  const margin = 30;
  const tx = Math.max(margin, Math.min(canvasWidth - margin, start.x));
  const ty = Math.max(margin, Math.min(canvasHeight - margin, start.y + 25));
  ```

---

## 6. Bugfix: Saved Routes section hidden in Normal mode

**What:** In the original, the „Saved Routes" section was always visible regardless of the active mode (because `updateSavedRoutesList()` always set `display: block`). It now only appears when Route mode is active.

**Changes:**
- JS: added guard in `updateSavedRoutesList()`: `if (currentMode !== 'route') { section.style.display = 'none'; return; }`

---

## File summary

| File | Description |
|---|---|
| `OdomMap.html` | Modified version with all changes listed above |
| `OdomMap-main/OdomMap.html` | Original version (untouched) |
| `CHANGES.md` | This document |

All other files (`sw.js`, `manifest.json`, `GameField/`, `Logo/`) are identical to the original.
