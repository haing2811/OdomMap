// OdomMap config — single source of truth for every field.
// One config object holds every field's image path, physical size (mm),
// robot max footprint (mm), default wheel diameter (mm) and optional note.
// Nothing here depends on the DOM.

export const WHEEL_DEFAULT_MM = 62.4;
export const ROBOT_WRO_MM = 250;   // WRO max robot footprint 250 x 250 mm
export const ROBOT_ENJOYAI_MM = 300; // ENJOY AI max robot footprint 300 x 300 mm

// ---------------------------------------------------------------------------
// Field definitions
// ---------------------------------------------------------------------------

// WRO field image aspect: 2362 / 1143 = 2.0665... matches every WRO artwork
// (18599 x 9000 px -> 2.0666), so a single shared scale is exact for WRO fields.
const WRO_FIELD = (year, category) => ({
	image: `GameField/WRO/${year}/${category}.webp`,
	widthMM: 2362,
	heightMM: 1143,
	robotMaxMM: { w: ROBOT_WRO_MM, h: ROBOT_WRO_MM },
	wheelDefaultMM: WHEEL_DEFAULT_MM,
});

export const COMPETITIONS = {
	wro: {
		label: 'WRO',
		years: [2023, 2024, 2025, 2026],
		// exact category file stems on disk (case-sensitive); 2025 Senior is "Senior-1.png"
		categories: {
			2023: ['Elementary', 'Junior', 'Senior', 'RoboSports'],
			2024: ['Elementary', 'Junior', 'Senior', 'RoboSports'],
			2025: ['Elementary', 'Junior', 'RoboSports', 'Senior-1'],
			2026: ['Elementary', 'Junior', 'Senior', 'RoboSports'],
		},
		field(year, category) {
			return WRO_FIELD(year, category);
		},
	},
	enjoyai: {
		label: 'ENJOY AI',
		years: [2026],
		categories: {
			2026: ['inventions-trail'],
		},
		field() {
			// ENJOY AI "Inventions Trail": 2160 x 1200 mm field, aspect 1.8000.
			// Image 1823 x 1022 px (aspect 1.7838) -> separate x/y scale factors.
			// imageBoundsPx is intentionally omitted (whole image) -> TODO: calibrate
			// whether the image includes the field border frame or is cropped.
			return {
				image: 'GameField/EnjoyAI/InventionTrails.jpg',
				widthMM: 2160,
				heightMM: 1200,
				robotMaxMM: { w: ROBOT_ENJOYAI_MM, h: ROBOT_ENJOYAI_MM },
				wheelDefaultMM: WHEEL_DEFAULT_MM,
				note: 'Official sample map, the event map may differ',
				imageBoundsPx: undefined, // {x, y, w, h} default: whole image
			};
		},
	},
};

// ---------------------------------------------------------------------------
// URL / storage defaults
// ---------------------------------------------------------------------------

// Per-field default selection (remembered selection overrides this first).
export const DEFAULT_COMPETITION = 'wro';
export const DEFAULT_YEAR = '2026';
export const DEFAULT_CATEGORY = 'Elementary';

// Public helpers --------------------------------------------------------------

export function competitions() {
	return Object.keys(COMPETITIONS);
}

export function competitionLabel(code) {
	const c = COMPETITIONS[code];
	return c ? c.label : code;
}

export function yearsFor(code) {
	const c = COMPETITIONS[code];
	return c ? c.years.slice() : [];
}

export function categoriesFor(code, year) {
	const c = COMPETITIONS[code];
	return c && c.categories[year] ? c.categories[year].slice() : [];
}

export function fieldFor(code, year, category) {
	const c = COMPETITIONS[code];
	if (!c || !c.field) return null;
	return c.field(year, category);
}

// Resolve a field spec from URL params, falling back to remembered then default.
// Returns { competition, year, category }.
export function resolveSelection(urlParams, remembered) {
	const comp = urlParams.get('c') || remembered?.competition || DEFAULT_COMPETITION;
	const yearRaw = urlParams.get('y') || remembered?.year || DEFAULT_YEAR;
	const year = String(yearRaw);
	const cat = urlParams.get('cat') || remembered?.category || DEFAULT_CATEGORY;

	const validComp = COMPETITIONS[comp] ? comp : DEFAULT_COMPETITION;
	const validYears = yearsFor(validComp);
	const validYear = validYears.includes(Number(year)) ? String(year) : String(validYears[validYears.length - 1]);
	const validCats = categoriesFor(validComp, validYear);
	const validCat = validCats.includes(cat) ? cat : validCats[0];

	return { competition: validComp, year: validYear, category: validCat };
}

export function selectionToParams({ competition, year, category }) {
	return `c=${encodeURIComponent(competition)}&y=${encodeURIComponent(year)}&cat=${encodeURIComponent(category)}`;
}

// Storage key helpers (v2 namespaced keys)
export const STORAGE = {
	lines: (code, year, category, name) =>
		`odom:v2:${code}:${year}:${category}:${name || 'lines'}`,
	routes: (code, year, category, name) =>
		`odom:v2:${code}:${year}:${category}:${name || 'routes'}`,
	global: (name) => `odom:v2:global:${name}`,
	legacyBucketName: 'legacy/imported',
};
