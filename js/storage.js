// OdomMap storage — v2 namespaced localStorage keys + migration from v1.
//
// v2 keys:
//   odom:v2:<competition>:<year>:<category>:lines    (array of line sets)
//   odom:v2:<competition>:<year>:<category>:routes   (array of route sets, saved in mm)
//   odom:v2:global:<name>                            (wheel, lastSelection)
//
// v1 keys (read during migration, then LEFT UNTOUCHED for rollback,
// except robot_dimensions which is deleted per product decision):
//   odommap_saved_lines   -> lines+edgeLines stored in MM (scale-independent)
//   rbrizz_saved_routes   -> route points stored in CANVAS PIXELS, no scale saved
//   robot_dimensions      -> deleted

const V2 = (competition, year, category) => `odom:v2:${competition}:${year}:${category}`;
const GLOBAL = (name) => `odom:v2:global:${name}`;

// ------------------------------------------------------------------
// Low level (wrapped in try/catch so storage never breaks the app)
// ------------------------------------------------------------------

function safeGet(key, fallback) {
	try {
		const raw = localStorage.getItem(key);
		return raw === null ? fallback : JSON.parse(raw);
	} catch (e) {
		return fallback;
	}
}

function safeSet(key, value) {
	try {
		localStorage.setItem(key, JSON.stringify(value));
		return true;
	} catch (e) {
		return false;
	}
}

function safeRemove(key) {
	try {
		localStorage.removeItem(key);
		return true;
	} catch (e) {
		return false;
	}
}

// ------------------------------------------------------------------
// v2 API
// ------------------------------------------------------------------

export function getLinesSets(competition, year, category) {
	const key = `${V2(competition, year, category)}:lines`;
	return safeGet(key, []);
}

export function saveLinesSets(competition, year, category, sets) {
	const key = `${V2(competition, year, category)}:lines`;
	return safeSet(key, sets);
}

export function deleteAllLines(competition, year, category) {
	const key = `${V2(competition, year, category)}:lines`;
	return safeRemove(key);
}

export function getRoutes(competition, year, category) {
	const key = `${V2(competition, year, category)}:routes`;
	return safeGet(key, []);
}

export function saveRoutes(competition, year, category, routes) {
	const key = `${V2(competition, year, category)}:routes`;
	return safeSet(key, routes);
}

export function deleteAllRoutes(competition, year, category) {
	const key = `${V2(competition, year, category)}:routes`;
	return safeRemove(key);
}

// Globals
export function getGlobal(name, fallback) {
	return safeGet(GLOBAL(name), fallback);
}
export function setGlobal(name, value) {
	return safeSet(GLOBAL(name), value);
}

// Last selection (competition/year/category) persisted here.
export function getLastSelection() {
	return safeGet(GLOBAL('lastSelection'), null);
}
export function setLastSelection(competition, year, category) {
	return setGlobal('lastSelection', { competition, year, category });
}

// ------------------------------------------------------------------
// Migration (idempotent, try/catch, copies old data leaving v1 keys intact)
// ------------------------------------------------------------------

// v1 -> v2. Old lines were stored in MM (field-agnostic) -> import into every
// WRO field's "legacy/imported" bucket. Old routes were stored in canvas pixels
// WITHOUT the save-time scale, so they cannot be reliably back-converted to mm;
// they are imported as approximate at the current scale and flagged.
//
// Migration is deliberately idempotent: running it twice changes nothing
// (we never rewrite v1 data, only read it).
export function migrateV1toV2({ competition, year, category, pxPerMm }) {
	try {
		// Nothing to migrate if v2 lines already exist for this field.
		const already = safeGet(`${V2(competition, year, category)}:lines`, null);
		if (already !== null && already.length > 0) return;

		const v1Lines = safeGet('odommap_saved_lines', []);
		const v1Routes = safeGet('rbrizz_saved_routes', []);

		// Import v1 lines (MM, scale-independent) into WRO legacy bucket.
		const isWRO = competition === 'wro';
		let legacyLines = [];
		if (isWRO && v1Lines.length > 0) {
			const setName = 'legacy/imported';
			legacyLines = [{
				name: setName,
				timestamp: new Date().toISOString(),
				source: 'v1-odmmap_saved_lines',
				lines: v1Lines.flatMap((set) =>
					set.lines.map((l) => ({
						start: { xMM: l.start.xMM, yMM: l.start.yMM },
						end: { xMM: l.end.xMM, yMM: l.end.yMM },
					}))
				),
				edgeLines: (v1Lines.flatMap((set) => set.edgeLines || [])).map((el) => ({
					edge: el.edge,
					pxMM: el.pxMM,
					pyMM: el.pyMM,
					distMM: el.distMM,
				})),
			}];
			saveLinesSets(competition, year, category, legacyLines);
		}

		// Import v1 routes as approximate (pixels -> mm at current pxPerMm).
		if (v1Routes.length > 0) {
			const routes = v1Routes.map((r) => ({
				name: r.name || 'imported route',
				timestamp: r.timestamp || new Date().toISOString(),
				source: 'v1-rbrizz_saved_routes',
				approx: true,
				note: 'Imported from pixels; save-time scale unknown — verify',
				origin: r.origin
					? { xMM: toMMx(r.origin.x, pxPerMm), yMM: toMMy(r.origin.y, pxPerMm) }
					: null,
				points: (r.points || []).map((p) => ({
					xMM: toMMx(p.x, pxPerMm),
					yMM: toMMy(p.y, pxPerMm),
				})),
				lines: (r.lines || []).map((l) => ({
					start: { xMM: toMMx(l.start.x, pxPerMm), yMM: toMMy(l.start.y, pxPerMm) },
					end: { xMM: toMMx(l.end.x, pxPerMm), yMM: toMMy(l.end.y, pxPerMm) },
				})),
			}));
			saveRoutes(competition, year, category, routes);
		}

		return { importedLines: legacyLines.length > 0, importedRoutes: v1Routes.length > 0 };
	} catch (e) {
		// Migration must never break the app.
		return { error: String(e) };
	}
}

// Delete the robot customization key (per product decision).
export function purgeRobotDimensions() {
	return safeRemove('robot_dimensions');
}

// mm/px helpers reused by migration (pxPerMm = canvas px per mm, uniform).
function toMMx(px, ppm) { return px / ppm; }
function toMMy(px, ppm) { return px / ppm; }
