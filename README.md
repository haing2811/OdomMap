# 🗺️ OdomMap

Browser-based field measurement and odometry assistant for **WRO** and **ENJOY AI** robotics competitions. Measure paths on field artwork, compute wheel rotations/degrees, run odometry relative to an origin, and plan routes — fully offline, no build step, no dependencies.

## Features

- **Measure mode** — two-click line measurement: distance (mm), absolute angle (acute reference), wheel rotations & degrees (from wheel diameter), horizontal/vertical, right-triangle legs, edge-to-point distance with edge lines.
- **Odometry mode** — place an origin, set a snapped angle indicator (0/90/180/‑90), rotated axes, X/Y/angle/distance readout, Add Point / Add Line, Record → Python `(x, y)` tuple output, Copy to clipboard.
- **Route mode** — place waypoints, drag nodes, delete the selected node (Escape cancels), save/load/unload routes.
- **Field selection** — competition → year → category, remembered and reflected in the URL (`?c=wro&y=2026&cat=elementary`, `?c=enjoyai&y=2026&cat=inventions-trail`).
- **Display** — field artwork auto-fits the stage at exact aspect (upscales past 1 px/mm where needed); solid red measure lines with white halo; white fill + red outline distance labels; blue angle labels + arcs; neutral graphite UI; no grid overlay; dashed helper geometry (right-triangle legs, edge lines, odometry axes).
- **PWA** — installable, works offline (field images + fonts cached), served at site root and under `/odom-map/`.

## Competitions & fields

| Competition | Field | Robot max | Image |
|---|---|---|---|
| WRO (2023–2026) | 2362 × 1143 mm | 250 × 250 mm | `GameField/WRO/<year>/<Category>.png` |
| ENJOY AI 2026 | 2160 × 1200 mm | 300 × 300 mm | `GameField/EnjoyAI/InventionTrails.jpg` |

The ENJOY AI "Inventions Trail" image is an official sample map — the event map may differ (a note is shown when selected).

## Deliberately not included

- No start box for any competition (the odometry origin is placed by you).
- No robot customization / custom robot size (footprint is fixed from `robotMaxMM`).
- No HyperLib dependency or link.

## Getting started

Open `index.html` (or `OdomMap.html`, which redirects to it) directly in a modern browser, or serve the folder over HTTP. All paths are relative, so it works from the site root **and** under the `/odom-map/` subpath.

## License

MIT — see [LICENSE](LICENSE).
