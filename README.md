# 🗺️ RBRIZZ Distance Map

<div align="center">


**A visual field distance calculator and odometry assistant built for WRO.**  
Measure paths, calculate wheel rotations, and plan robot movement — all on an interactive field map.

</div>

---

## 📸 Overview

RBRIZZ Distance Map is a browser-based tool that overlays competition field images and lets you:

- 📏 Click to draw measurement lines across the field
- 🔄 Instantly calculate wheel rotations and degrees for any path
- 🧭 Use Odometry Mode to track X/Y position relative to an origin point
- 📐 Visualize right-triangle breakdowns of diagonal paths
- 🗓️ Switch between competition years (2023–2026) and categories

---

## 🚀 Getting Started

### ✅ Prerequisites

No installation required. Just a modern web browser:

| Browser | Support |
|---|---|
| 🟢 Chrome | ✅ Recommended |
| 🟢 Firefox | ✅ Supported |
| 🟢 Edge | ✅ Supported |
| 🟡 Safari | ⚠️ May vary |

### 📂 File Structure

```
rbrizz-distance-map/
├── rbrizz_distance_map.html   # Main application file
├── iconrb.png                 # RobotRizz logo (header icon)
└── GameField/                 # Field image assets
    ├── 2026/
    │   ├── Elementary.png
    │   ├── Junior.png
    │   ├── Senior.png
    │   └── RoboSports.png
    ├── 2025/
    ├── 2024/
    └── 2023/
```

### ▶️ Running the App

1. **Clone or download** this repository
2. Place your field images inside `GameField/<year>/` as `<Category>.png`
3. Open `rbrizz_distance_map.html` directly in your browser

> ⚡ No server needed — it runs entirely client-side!

---

## 🎮 How to Use

### 📏 Distance Measurement

| Step | Action |
|---|---|
| 1️⃣ | **Click** on the canvas to set the **start point** |
| 2️⃣ | **Move** your mouse — live measurements appear in the sidebar |
| 3️⃣ | **Click again** to lock the **end point** |
| 4️⃣ | A new line is saved; repeat to draw more |
| 🖱️ Right-click | Cancels the current line |

### 🔢 Measurements Shown

| Value | Description |
|---|---|
| 📏 Distance | Straight-line distance in mm |
| 📐 Angle | Absolute angle from horizontal (°) |
| 🔄 Wheel Rotations | Full rotations needed for your wheel diameter |
| 🔵 Wheel Degrees | Motor degrees needed |
| ↔️ Horizontal | X-axis component (mm) |
| ↕️ Vertical | Y-axis component (mm) |

### ⚙️ Wheel Diameter

Enter your robot's wheel diameter (in mm) in the **top control bar**.  
Default: `62.4 mm`

> 🧮 The tool recalculates wheel rotations and degrees automatically.

---

## 🧭 Odometry Mode

Odometry Mode helps you plan and visualize robot position relative to a **custom origin point**.

### How to activate:

1. Check ✅ **Odometry Mode** in the sidebar
2. **Click** on the field to set your **origin (0, 0)**
3. Use **Add Point** or **Add Line** to mark robot positions and paths

### Odometry Sidebar shows:

| Value | Meaning |
|---|---|
| X | Horizontal distance from origin (mm) |
| Y | Vertical distance from origin (mm, upward positive) |
| Angle | Direction from origin (°) |

---

## 🏟️ Field Selection

Use the dropdowns in the **header** to choose:

| Selector | Options |
|---|---|
| 📅 Year | 2023, 2024, 2025, 2026 |
| 🏆 Category | Elementary, Junior, Senior, RoboSports |

> Field images load from `GameField/<year>/<category>.png`. If an image is missing, the tool gracefully falls back to a grid-only view.

**Field dimensions:** `2362 mm × 1143 mm`  
**Max robot size:** `250 mm × 250 mm`

---

## 🛠️ Toolbar Reference

| Button | Action |
|---|---|
| 🆕 New Line | Resets the current line drawing |
| 🗑️ Delete Last | Removes the most recently drawn line |
| 🧹 Clear All | Clears all lines (and odometry data in Odometry Mode) |

---

## 🎨 Display Options

| Toggle | Effect |
|---|---|
| 🔵 Show Right Triangle | Displays horizontal/vertical leg breakdown of each line |
| 📡 Odometry Mode | Enables origin-relative X/Y coordinate tracking |
| 🔆 Grid Opacity Slider | Adjusts the grid overlay brightness (Odometry Mode only) |

---

## 🤝 Contributing

Contributions are welcome! To contribute:

1. 🍴 Fork this repository
2. 🌿 Create a new branch: `git checkout -b feature/your-feature`
3. 💾 Commit your changes: `git commit -m "Add your feature"`
4. 📤 Push to the branch: `git push origin feature/your-feature`
5. 🔃 Open a Pull Request

Please keep code clean and well-commented. New field images should follow the existing `GameField/<year>/<Category>.png` naming convention.

---

## 📜 License

This project is licensed under the **MIT License** — see the [LICENSE](LICENSE) file for full details.

---

<div align="center">

⭐ If this tool helped your team, give it a star!

</div>
