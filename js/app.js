// OdomMap — main application.

// Modules:
// config.js (data), math.js (conversions), storage.js (persistence).

// All measurements are computed in mm from canvas px via separate x/y
// scales.
import { COMPETITIONS, DEFAULT_COMPETITION, DEFAULT_YEAR, DEFAULT_CATEGORY,	fieldFor, competitions, competitionLabel, yearsFor, categoriesFor,	resolveSelection, selectionToParams, STORAGE } from './config.js';
import { computeScales, toMMx, toMMy, toCanvasX, toCanvasY,	calculateDistance, calculateAngle, referenceAngle,	wheelRotations, wheelDegrees, components,	normalizeHeading, fieldToXY, segmentHeading, segmentLength, turnAtPoint, bearingFromHeading } from './math.js';
import { getLinesSets, saveLinesSets, deleteAllLines,	getRoutes, saveRoutes, deleteAllRoutes,	getGlobal, setGlobal, getLastSelection, setLastSelection,	migrateV1toV2, purgeRobotDimensions,
	getOdoSession, saveOdoSession, clearOdoSession } from './storage.js';
// ---------------------------------------------------------------------------// Constants// ---------------------------------------------------------------------------
// ---------------------------------------------------------------------------
// DOM
// ---------------------------------------------------------------------------
const sel = (id) => document.getElementById(id);
// Canvas paint tokens — read once at module scope, never getComputedStyle in
const LINE = (() => {	const cs = getComputedStyle(document.documentElement);	const g = (name) => cs.getPropertyValue(name).trim();	return {		measure: g('--line-measure') || '#EF4444',		halo: g('--line-halo') || '#FFFFFF',		current: g('--line-current') || '#EF4444',		earlier: g('--line-earlier') || '#9CA3AF',		angle: g('--angle-blue') || '#2563EB',		edge: g('--edge-line') || '#9CA3AF',		axis: g('--odometry-axis') || '#9CA3AF',		route: g('--route-line') || '#EF4444',		crosshair: g('--crosshair') || '#6B7280',		helper: g('--helper') || '#F59E0B',		helperHalo: g('--helper-halo') || '#111827',
	legGreen: g('--leg-green') || '#22C55E',
	odometryAxisHalo: g('--odometry-axis-halo') || 'var(--bg-void)',
	odometryAxis: g('--odometry-axis') || '#9CA3AF',
	originDot: g('--origin-dot') || 'var(--line-halo)',
	originRing: g('--origin-ring') || 'var(--border)',
	pointFill: g('--point-fill') || 'var(--line-halo)',
	pointRing: g('--point-ring') || 'var(--line-measure)',
	textFill: g('--text-fill') || 'var(--line-halo)',
	textOutline: g('--text-outline') || 'var(--bg-void)',
				dark: g('--bg-void') || '#0A0A0B',		angleFill: g('--angle-text-fill') || '#2563EB',		angleOutline: g('--angle-text-outline') || '#FFFFFF',		distFill: g('--distance-text-fill') || '#FFFFFF',		distOutline: g('--distance-text-outline') || '#EF4444',		font: g('--font-mono') || 'Geist Mono, monospace',	}}
)();
const elLoading = sel('loading');
const elCanvasContainer = sel('canvas-container');
const elCanvas = sel('canvas');
const elSelCompetition = sel('sel-competition');
const elSelYear = sel('sel-year');
const elSelCategory = sel('sel-category');
const elWheel = sel('wheel-diameter');
const elUnitSwitch = sel('sw-unit');
const elModeBtns = Array.from(document.querySelectorAll('#modebar .modebtn'));
const elInstallBtn = sel('install-btn');
// ---------------------------------------------------------------------------// Selection state// ---------------------------------------------------------------------------
let selection = { competition: DEFAULT_COMPETITION, year: DEFAULT_YEAR, category: DEFAULT_CATEGORY }
;
// ---------------------------------------------------------------------------// Canvas / scale state// ---------------------------------------------------------------------------
let ctx = null;
let fieldImg = null;
	let canvasW = 0, canvasH = 0;
	let sx = 1, sy = 1;            // CSS px per mm, per axis (CSS canvas coords)
// Last CSS size + dpr the canvas was laid out at. Guard holds across
// initCanvas calls so browser zoom / resize re-lays out only when needed.
let lastAppliedCss = { w: -1, h: -1, dpr: -1 };
let scaleReady = false;
let pendingRedraw = false;
// ---------------------------------------------------------------------------// App state// ---------------------------------------------------------------------------

let wheelDiameter = Number(getGlobal('wheel', 62.4));
// Unit in which all linear field measurements are shown: 'mm' or wheel-rotation 'deg'.
let unit = (() => { const u = getGlobal('unit', 'mm'); return u === 'deg' ? 'deg' : 'mm'; })();
let showTriangle = false;
// Normal mode
let startPoint = null;   // {x,y} CSS px
let endPoint = null;     // {x,y} CSS px
let mousePos = { x: 0, y: 0 }
;
let isMouseOver = false;
let lines = [];          // [{start:{x,y}, end:{x,y}}]
let edgeMeasureMode = null; // 'top'|'bottom'|'left'|'right'|null
let edgeLines = [];      // [{edge, px, py}]// Odometry mode
let odoOrigin = null;        // {x,y} CSS px
let odoHeading = 0;          // degrees: 0 = screen up, clockwise positive
let odoStep = 1;             // 1 = place origin | 2 = set heading | 3 = plot points
let odoPoints = [];          // [{x,y} CSS px]
let odoHoverPoint = null;    // hovered point index
let odoSelectedPoint = null; // selected point index
let odoDrag = null;          // 'origin' | point index | null
let odoPending = null;       // pending pointer {x,y} while plotting
let odoConnect = true;       // View: connect points
let odoSnap = true;          // Snap to axes
// Route mode
let routeOrigin = null;   // {x,y} backing px
let routePoints = [];     // [{x,y}]
let routeLines = [];      // [{start,end}]
let routePendingLine = null;
let hoveredNodeIndex = null;
let draggedNodeIndex = null;
// ---------------------------------------------------------------------------// Init// ---------------------------------------------------------------------------
function init() {	const boot = () => {		setupSelectionUI();		setupModeUI();		setupWheelUI();		setupCanvasUI();		setupResizeObserver();		restoreOrDefaultSelection();		draw();		updatePanel();	}
;	// Boot once fonts are ready, or after 3s as a fallback so the app	// never stays stuck on the loading screen if a font fails to
 Promise.race([		document.fonts.ready,		new Promise(r => setTimeout(r, 3000))	]).then(boot);	if ('serviceWorker' in navigator) {		window.addEventListener('load', () => {			navigator.serviceWorker.register('./sw.js').catch((e) => {
				console.warn('[OdomMap] Service worker registration failed:', e);
			});
		});	}
	let deferredInstall;
	window.addEventListener('beforeinstallprompt', (e) => {
		e.preventDefault();
		deferredInstall = e;
		elInstallBtn.classList.remove('hidden');
		elInstallBtn.addEventListener('click', () => {
			deferredInstall.prompt();
			deferredInstall.userChoice.then(() => {
				deferredInstall = null;
				elInstallBtn.classList.add('hidden');
			});
		});
	}, { once: true });

	window.addEventListener('appinstalled', () => {
		elInstallBtn.classList.add('hidden');
	});
}
function catLabel(cat) {	const cap = cat.charAt(0).toUpperCase() + cat.slice(1);	return cap.replace('-', ' ');
}
function setupSelectionUI() {	elSelCompetition.innerHTML = competitions().map(code =>		`<option value="${code}">${competitionLabel(code)}</option>`	).join('');	function fillYears() {		elSelYear.innerHTML = yearsFor(selection.competition).map(y =>			`<option value="${y}">${y}</option>`		).join('');	}	function fillCategories() {		const cats = categoriesFor(selection.competition, selection.year);		elSelCategory.innerHTML = cats.map(c => `<option value="${c}">${catLabel(c)}</option>`).join('');	}	fillYears();	fillCategories();	const onChange = () => {
		selection.competition = elSelCompetition.value;
		// Remember the user's picks before we rebuild the <select> options,
		// which would otherwise reset each select's value to its first option.
		const nextYear = elSelYear.value;
		const nextCat = elSelCategory.value;
		fillYears();
		if (yearsFor(selection.competition).includes(Number(nextYear))) {
			selection.year = nextYear;
		} else {
			selection.year = String(yearsFor(selection.competition)[0]);
		}
		elSelYear.value = selection.year;
		fillCategories();
		const cats = categoriesFor(selection.competition, selection.year);
		if (cats.includes(nextCat)) {
			selection.category = nextCat;
		} else {
			selection.category = cats[0];
		}
		elSelCategory.value = selection.category;
		setLastSelection(selection.competition, selection.year, selection.category);
		writeURLParams();
		resetModeState();
		loadField();
		draw();
		updatePanel();
	}
;	elSelCompetition.addEventListener('change', onChange);	elSelYear.addEventListener('change', () => {		selection.year = elSelYear.value;		fillCategories();		onChange();	}
);	elSelCategory.addEventListener('change', () => {		selection.category = elSelCategory.value;		onChange();	}
);	window.updateFieldNote = (field) => {		const noteEl = sel('field-note');		if (!noteEl) return;		if (field && field.note) { noteEl.textContent = field.note; noteEl.style.display = 'block'; }		else { noteEl.style.display = 'none'; }	}
;
}
function setupModeUI() {	document.querySelectorAll('#modebar .modebtn').forEach(btn => {		btn.addEventListener('click', () => {			setMode(btn.dataset.mode);		}
);	}
);
}
function setMode(mode) {	currentMode = mode;	elModeBtns.forEach(btn => btn.classList.toggle('active', btn.dataset.mode === mode));	resetModeState();	writeURLParams();	draw();	updatePanel();
	if (mode === 'odometry') { loadOdoSession(); updatePanel(); }
}
let currentMode = 'normal';
function resetModeState() {	startPoint = null; endPoint = null;	odoOrigin = null; odoHeading = 0; odoStep = 1; odoPoints = []; odoPending = null; odoDrag = null; odoHoverPoint = null; odoSelectedPoint = null;	routeOrigin = null; routePoints = []; routeLines = []; routePendingLine = null;	hoveredNodeIndex = null; draggedNodeIndex = null;	edgeMeasureMode = null;
}
function restoreOrDefaultSelection() {	const remembered = getLastSelection();	const urlSel = resolveSelection(urlParams(), remembered);	selection = urlSel;	elSelCompetition.value = selection.competition;	elSelYear.value = selection.year;	elSelCategory.value = selection.category;	const field = fieldFor(selection.competition, selection.year, selection.category);	wheelDiameter = field ? Number(field.wheelDefaultMM) : 62.4;	elWheel.value = wheelDiameter;	setLastSelection(selection.competition, selection.year, selection.category);	writeURLParams();	window.updateFieldNote(field);	loadField();
}
function urlParams() { return new URLSearchParams(window.location.search); }
function writeURLParams() {	const params = selectionToParams(selection);	history.pushState({ path: window.location.pathname }
, '', `${window.location.pathname}?${params}${window.location.hash}`);
}
// ---------------------------------------------------------------------------// Wheel// ---------------------------------------------------------------------------
function setupWheelUI() {	elWheel.value = wheelDiameter;	elWheel.addEventListener('input', (e) => {		const v = Number(e.target.value);		if (v && v > 0) { wheelDiameter = v; setGlobal('wheel', wheelDiameter); scheduleDraw(); }	}
);
    function refreshUnitUI() {
        const deg = unit === 'deg';
        elUnitSwitch.setAttribute('data-active-2', deg);
        elUnitSwitch.querySelectorAll('[role="radio"]').forEach((b) => {
            b.setAttribute('aria-checked', b.dataset.unit === unit);
        });
    }
    refreshUnitUI();
    elUnitSwitch.addEventListener('click', (e) => {
        const b = e.target.closest('[role="radio"]');
        if (!b) return;
        const next = b.dataset.unit;
        if (next === unit) return;
        unit = next;
        setGlobal('unit', unit);
        refreshUnitUI();
        scheduleDraw();
        updatePanel();
    });
    elUnitSwitch.addEventListener('keydown', (e) => {
        if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
            e.preventDefault();
            const radios = Array.from(elUnitSwitch.querySelectorAll('[role="radio"]'));
            const idx = radios.indexOf(document.activeElement);
            const next = radios[(idx + (e.key === 'ArrowRight' ? 1 : -1) + radios.length) % radios.length];
            next.focus();
            next.setAttribute('aria-checked', 'true');
            const prev = radios[(idx + radios.length - 1) % radios.length];
            if (prev !== next) prev.setAttribute('aria-checked', 'false');
            e.stopPropagation();
            return;
        }
        if (e.key === ' ' || e.key === 'Enter') {
            e.preventDefault();
            const b = document.activeElement;
            if (b && b.dataset.unit) {
                unit = b.dataset.unit;
                setGlobal('unit', unit);
                refreshUnitUI();
                scheduleDraw();
                updatePanel();
            }
        }
    });
}
// Convert a length (mm) into the current display unit.
function toUnit(lenMM) {	return unit === 'deg' ? lenMM * 360 / (wheelDiameter * Math.PI) : lenMM;	}
// Format a length (mm) into the current display unit with the right suffix.
function fmtUnit(lenMM) {	const v = toUnit(lenMM);	return unit === 'deg' ? v.toFixed(1) + '°' : v.toFixed(1) + ' mm';	}
// ---------------------------------------------------------------------------// Canvas input// ---------------------------------------------------------------------------
function setupCanvasUI() {	ctx = elCanvas.getContext('2d');	// Hidden until the first fit applies so nothing renders at a stale
 elCanvas.style.visibility = 'hidden';	elCanvasContainer.addEventListener('pointerdown', (e) => {		const p = pointerToBacking(e);		if (p) { elCanvasContainer.focus(); if (e.button !== 0) { e.preventDefault(); e.stopPropagation(); } else { onPointerDown(e.button, p.x, p.y); } }	}
);	elCanvasContainer.addEventListener('auxclick', (e) => { e.preventDefault(); e.stopPropagation(); }
);	elCanvasContainer.addEventListener('contextmenu', (e) => { e.preventDefault(); e.stopPropagation(); }
);	elCanvasContainer.addEventListener('pointermove', (e) => {		const p = pointerToBacking(e);		if (p) {			mousePos = p;			isMouseOver = true;			if (currentMode === 'route' && draggedNodeIndex !== null) {				routePoints[draggedNodeIndex] = { x: p.x, y: p.y }
;				rebuildRouteLines();				scheduleDraw();				updatePanel();				return;			}			if (currentMode === 'odometry' && odoDrag !== null) {				odoDragMove(p.x, p.y);				return;			}			scheduleDraw();		}	}
);	elCanvasContainer.addEventListener('pointerleave', () => { isMouseOver = false; scheduleDraw(); }
);	elCanvasContainer.addEventListener('pointerup', (e) => {		if (currentMode === 'route') draggedNodeIndex = null;		if (currentMode === 'odometry' && odoDrag !== null) { odoDrag = null; }		scheduleDraw();	}
);	document.addEventListener('keydown', (e) => {		if (e.key === 'Escape') { cancelCurrentAction(); draw(); updatePanel(); }	}
);
}	let resizeTimer = null;	function setupResizeObserver() {		const stage = document.querySelector('.canvas-stage');		const ro = new ResizeObserver(() => {			if (resizeTimer) clearTimeout(resizeTimer);			resizeTimer = setTimeout(() => {				initCanvas();				scheduleDraw();				updatePanel();			}
, 150);		}
);		ro.observe(stage || elCanvasContainer);		window.addEventListener('orientationchange', () => {			if (resizeTimer) clearTimeout(resizeTimer);			resizeTimer = setTimeout(() => {				initCanvas();				scheduleDraw();				updatePanel();			}
, 150);		}
);	}	function pointerToBacking(e) {	// Pointer CSS px from the canvas's own rect (ctx is scaled by dpr,
	// so every canvas coordinate in this app is CSS px).
	const rect = elCanvas.getBoundingClientRect();	const x = e.clientX - rect.left;	const y = e.clientY - rect.top;
	if (x < 0 || y < 0 || x > rect.width || y > rect.height) return null;
	return { x, y }
	;
}
function cancelCurrentAction() {	startPoint = null; endPoint = null;	routePendingLine = null;	edgeMeasureMode = null;	if (currentMode === 'odometry') {
		if (odoStep === 2) { odoStep = 1; odoOrigin = null; odoHeading = 0; odoPoints = []; odoDrag = null; odoPending = null; }
		else { odoPending = null; odoDrag = null; }
		scheduleDraw();
	}
}
// ---------------------------------------------------------------------------// Field// ---------------------------------------------------------------------------
function currentField() {	return fieldFor(selection.competition, selection.year, selection.category);
}
function loadField() {	const field = currentField();	elLoading.classList.remove('hidden');	scaleReady = false;	fieldImg = null;	window.updateFieldNote(field);	const img = new Image();	img.onload = () => {		fieldImg = img;		initCanvas();		scaleReady = true;		elLoading.classList.add('hidden');		runMigrationForCurrentField();		scheduleDraw();	}
;	img.onerror = () => {		fieldImg = null;		initCanvas();		scaleReady = true;		elLoading.classList.add('hidden');		runMigrationForCurrentField();		scheduleDraw();	}
;	img.src = field.image;
}
// Pure best-fit: largest CSS canvas preserving the field's exact aspect inside// the
// Pad is applied exactly once per axis; no 1px/mm cap; no minimum.
// scale = canvas px per mm, equal on both axes; once aspect is preserved. Never reads the canvas's own previous size.
 export function fit(stageW, stageH, fieldWmm, fieldHmm, pad) {	const availW = Math.max(stageW - pad, 0);	const availH = Math.max(stageH - pad, 0);	const aspect = fieldWmm / fieldHmm;	let cssW = availW;	let cssH = cssW / aspect;	if (cssH > availH) {		cssH = availH;		cssW = cssH * aspect;	}	const scale = cssW / fieldWmm;	return { cssW, cssH, scale }
;
}
function initCanvas() {
	const field = currentField();
	const rect = elCanvasContainer.getBoundingClientRect();
	const stageW = rect.width;
	const stageH = rect.height;
	// Use the *current* device pixel ratio (not a boot-time snapshot) so
	// browser zoom re-lays out the canvas correctly.
	const dpr = window.devicePixelRatio || 1;

	const f = fit(stageW, stageH, field.widthMM, field.heightMM, 16);
	// Snap CSS size so cssW*dpr and cssH*dpr are exact integers: backing store
	// = css * dpr with no sub-pixel creep; canvas sits flush in its cell
	// (place-items center, no transform centering).
	let cssW = Math.round(f.cssW * dpr) / dpr;
	let cssH = Math.round(f.cssH * dpr) / dpr;
	const w = Math.floor(cssW);
	const h = Math.floor(cssH);
	// canvasW/canvasH hold CSS px (the coordinate space used by pointer events,
	// draw(), crosshair and all measurement code). Only the backing store is
	// scaled by dpr via elCanvas.width/height + ctx.setTransform(dpr).
	if (w === lastAppliedCss.w && h === lastAppliedCss.h && dpr === lastAppliedCss.dpr) return;
	lastAppliedCss = { w, h, dpr };
	canvasW = w;
	canvasH = h;
	elCanvas.width = Math.round(w * dpr);
	elCanvas.height = Math.round(h * dpr);
	elCanvas.style.width = w + 'px';
	elCanvas.style.height = h + 'px';
	elCanvas.style.visibility = '';
	ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
	if (ctx) ctx.imageSmoothingQuality = 'high';
	// Scales in CSS px per mm (computeScales receives CSS canvas px). No dpr
	// division: sx/sy run in the same CSS px space as pointerToBacking().
	// Recompute on every field change even when CSS size stays identical.
	const s = computeScales(field, canvasW, canvasH);
	sx = s.sx;
	sy = s.sy;
	scaleReady = true;
}function runMigrationForCurrentField() {	// sx/sy are CSS px/mm; v1 route points live in backing px -> restore
	// backing px/mm for the v1->v2 conversion: backing px/mm = CSS px/mm * dpr.
	const dpr = window.devicePixelRatio || 1;
	const ppm = Math.sqrt(sx * sy) * dpr;
	migrateV1toV2({ competition: selection.competition, year: selection.year, category: selection.category, pxPerMm: ppm }
	);
	purgeRobotDimensions();}
// ---------------------------------------------------------------------------// Render loop// ---------------------------------------------------------------------------
function scheduleDraw() {	if (!pendingRedraw) {		pendingRedraw = true;		requestAnimationFrame(draw);	}
}
function draw() {	pendingRedraw = false;	if (!ctx || !scaleReady) return;	const field = currentField();	ctx.clearRect(0, 0, canvasW, canvasH);	if (fieldImg) {		ctx.drawImage(fieldImg, 0, 0, canvasW, canvasH);	} else {		drawPlaceholderGrid();	}	if (currentMode === 'normal') drawNormal();	else if (currentMode === 'odometry') drawOdometry();	else if (currentMode === 'route') drawRoute();	drawCrosshair();	updateReadouts();}
function drawPlaceholderGrid() {	ctx.strokeStyle = LINE.earlier; ctx.lineWidth = 1;	for (let x = 0; x <= canvasW; x += 80) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, canvasH); ctx.stroke(); }	for (let y = 0; y <= canvasH; y += 80) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(canvasW, y); ctx.stroke(); }
}
function drawCrosshair() {	// thin neutral crosshair ~45% opacity; follows the pointer only while
	// it is over the field — nothing drawn when the pointer is away.
	if (!isMouseOver) return;
	const p = mousePos;
	ctx.save();	ctx.strokeStyle = LINE.crosshair;	ctx.lineWidth = 1;	ctx.globalAlpha = 0.45;
	ctx.beginPath();	ctx.moveTo(0, p.y); ctx.lineTo(canvasW, p.y);
	ctx.moveTo(p.x, 0); ctx.lineTo(p.x, canvasH);
	ctx.stroke();	ctx.restore();}
function drawMeasureLine(x1, y1, x2, y2, active, opacity) {	// shared line style: solid red core, white casing (~2.5px each side),
 // round caps, fixed on-screen width, white dot + red ring endpoints
	const lw = active ? 4 : 3;	const a = opacity === undefined ? 1 : opacity;	ctx.save();	ctx.globalAlpha = a;	ctx.lineCap = 'round';	ctx.setLineDash([]);	ctx.strokeStyle = LINE.halo;	ctx.lineWidth = lw + 5;	ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();	ctx.strokeStyle = LINE.measure;	ctx.lineWidth = lw;	ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();	// endpoints: solid white dot + red ring
	ctx.fillStyle = LINE.halo;	ctx.beginPath(); ctx.arc(x1, y1, 5, 0, Math.PI * 2); ctx.fill();	ctx.beginPath(); ctx.arc(x2, y2, 5, 0, Math.PI * 2); ctx.fill();	ctx.strokeStyle = LINE.measure;	ctx.lineWidth = 2;	ctx.beginPath(); ctx.arc(x1, y1, 5, 0, Math.PI * 2); ctx.stroke();	ctx.beginPath(); ctx.arc(x2, y2, 5, 0, Math.PI * 2); ctx.stroke();	ctx.restore();}
function drawHelperLine(x1, y1, x2, y2) {	// dashed helper geometry: dark halo + neutral/amber core, thinner than measure lines
	ctx.save();	ctx.lineCap = 'round';	ctx.strokeStyle = LINE.helperHalo;	ctx.lineWidth = 3;	ctx.setLineDash([6, 5]);	ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();	ctx.strokeStyle = LINE.helper;	ctx.lineWidth = 1.5;	ctx.setLineDash([4, 4]);	ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();	ctx.restore();}
function drawEdgeLine(el) {	let x1, y1, x2, y2;	if (el.edge === 'top')    { x1 = el.px; y1 = 0; x2 = el.px; y2 = el.py; }	else if (el.edge === 'bottom') { x1 = el.px; y1 = canvasH; x2 = el.px; y2 = el.py; }	else if (el.edge === 'left')   { x1 = 0; y1 = el.py; x2 = el.px; y2 = el.py; }	else { x1 = canvasW; y1 = el.py; x2 = el.px; y2 = el.py; }	drawHelperLine(x1, y1, x2, y2);}
function drawEdgePreview(mx, my) {	let x1, y1, x2, y2, distMM;	if (edgeMeasureMode === 'top')    { x1 = mx; y1 = 0; x2 = mx; y2 = my; distMM = toMMy(my, sy); }	else if (edgeMeasureMode === 'bottom') { x1 = mx; y1 = canvasH; x2 = mx; y2 = my; distMM = toMMy(canvasH - my, sy); }	else if (edgeMeasureMode === 'left')   { x1 = 0; y1 = my; x2 = mx; y2 = my; distMM = toMMx(mx, sx); }	else { x1 = canvasW; y1 = my; x2 = mx; y2 = my; distMM = toMMx(canvasW - mx, sx); }	drawHelperLine(x1, y1, x2, y2);	drawChip(fmtUnit(distMM), mx, my > canvasH / 2 ? my - 16 : my + 16, LINE.helper);}
function drawRightTriangle(p1, p2) {	// right-triangle legs: green dashed 8/5 with a white casing each side
	ctx.save();	ctx.lineCap = 'round';
	ctx.strokeStyle = '#FFFFFF';	ctx.lineWidth = 4;	ctx.setLineDash([8, 5]);
	ctx.beginPath();	ctx.moveTo(p1.x, p1.y); ctx.lineTo(p2.x, p1.y);	ctx.moveTo(p2.x, p1.y); ctx.lineTo(p2.x, p2.y);	ctx.stroke();
	ctx.strokeStyle = LINE.legGreen;	ctx.lineWidth = 2;	ctx.setLineDash([8, 5]);
	ctx.beginPath();	ctx.moveTo(p1.x, p1.y); ctx.lineTo(p2.x, p1.y);	ctx.moveTo(p2.x, p1.y); ctx.lineTo(p2.x, p2.y);	ctx.stroke();
	// leg labels: bold 16px CSS mono, green fill + white outline, outside the
	// triangle (offset opposite the interior) and clamped so they never leave
	// the canvas or cover the distance/angle labels.
	const hMM = Math.abs(p2.x - p1.x) / sx;	const vMM = Math.abs(p2.y - p1.y) / sy;
	ctx.font = 'bold 16px ' + LINE.font;
	ctx.strokeStyle = LINE.halo;	ctx.lineWidth = 4;	ctx.lineJoin = 'round';
	ctx.fillStyle = LINE.legGreen;
	ctx.save();	const cw = canvasW;	const ch = canvasH;
	const place = (text, x, y, align, baseline) => {
		ctx.textAlign = align;	ctx.textBaseline = baseline;
		const tw = ctx.measureText(text).width;
		let tx = x;
		if (align === 'center') { tx = Math.min(Math.max(x, tw / 2), cw - tw / 2); }
		else if (align === 'right') { tx = Math.min(Math.max(x, tw), cw); }
		else { tx = Math.min(Math.max(x, 0), cw - tw); }
		const ty = Math.min(Math.max(y, 18), ch);		ctx.strokeText(text, tx, ty);
		ctx.fillText(text, tx, ty);
	}
	;
	// horizontal leg label: above/below the leg, outside the triangle interior
	const hx = (p1.x + p2.x) / 2;	const hy = p1.y;	const hoff = (p2.y > p1.y) ? -24 : 24;
	place(fmtUnit(hMM), hx, hy + hoff, 'center', hoff < 0 ? 'bottom' : 'top');	// vertical leg label: left/right of the leg, outside the triangle interior
	const vx = p2.x;	const vy = (p1.y + p2.y) / 2;	const voff = (p2.x > p1.x) ? -26 : 26;
	place(fmtUnit(vMM), vx + voff, vy, voff < 0 ? 'right' : 'left', 'middle');
	ctx.restore();	ctx.restore();}
function drawDistanceLabel(p1, p2) {	const dx = p2.x - p1.x;	const dy = p2.y - p1.y;	const len = Math.hypot(dx, dy);	if (len < 24) return;	// offset perpendicular to the line so the label never sits on the line
	const mx = (p1.x + p2.x) / 2;	const my = (p1.y + p2.y) / 2;	const nx = -dy / len;	const ny = dx / len;	const x = mx + nx * 26;	const y = my + ny * 26;	const text = fmtUnit(calculateDistance(p1, p2, sx, sy));	ctx.save();	ctx.textAlign = 'center'; ctx.textBaseline = 'middle';	ctx.font = 'bold 18px ' + LINE.font;	ctx.strokeStyle = LINE.distOutline;	ctx.lineWidth = 4;	ctx.lineJoin = 'round';	ctx.strokeText(text, x, y);	ctx.fillStyle = LINE.distFill;	ctx.fillText(text, x, y);	ctx.restore();}
function drawAngleLabel(p1, p2) {	// reference angle at the
// start (vertex): blue fill + white outline
	const ang = referenceAngle(p1, p2, sx, sy);	ctx.save();	ctx.textAlign = 'center'; ctx.textBaseline = 'middle';	ctx.font = 'bold 18px ' + LINE.font;	ctx.strokeStyle = LINE.angleOutline;	ctx.lineWidth = 4;	ctx.lineJoin = 'round';	ctx.strokeText(ang.toFixed(0) + '°', p1.x, p1.y - 30);	ctx.fillStyle = LINE.angleFill;	ctx.fillText(ang.toFixed(0) + '°', p1.x, p1.y - 30);	ctx.restore();}
function drawNormal() {	const end = endPoint || mousePos;	if (startPoint) {		drawMeasureLine(startPoint.x, startPoint.y, end.x, end.y, true);		drawDistanceLabel(startPoint, end);		drawAngleLabel(startPoint, end);	}	lines.forEach((l, i) => {		const active = (i === lines.length - 1 && startPoint === null);		drawMeasureLine(l.start.x, l.start.y, l.end.x, l.end.y, active);		drawDistanceLabel(l.start, l.end);		drawAngleLabel(l.start, l.end);		if (showTriangle) drawRightTriangle(l.start, l.end);	}
);	if (edgeMeasureMode && isMouseOver) drawEdgePreview(mousePos.x, mousePos.y);	edgeLines.forEach(drawEdgeLine);}
function drawChip(text, x, y, color) {	ctx.save();	ctx.textAlign = 'center'; ctx.textBaseline = 'middle';	ctx.font = '600 11px ' + LINE.font;	ctx.fillStyle = LINE.dark;	ctx.fillText(text, x + 1, y + 1); // dark halo
	ctx.fillStyle = color;	ctx.fillText(text, x, y);	ctx.restore();}
function drawChipRotated(text, x, y, color) {	ctx.save();	ctx.translate(x, y); ctx.rotate(-Math.PI / 2);	ctx.textAlign = 'center'; ctx.textBaseline = 'middle';	ctx.font = '600 11px ' + LINE.font;	ctx.fillStyle = LINE.dark;	ctx.fillText(text, 1, 1);	ctx.fillStyle = color;	ctx.fillText(text, 0, 0);	ctx.restore();}
function updateReadouts() {	const set = (id, val, filled) => {		const e = sel(id); if (!e) return;		const v = e.querySelector('.value'); if (v) { v.textContent = val; v.classList.toggle('filled', filled); }	}
;	const dash = '–'; // muted en-dash
// placeholder (not the odd double-hyphen)
	if (currentMode !== 'normal') {		set('n-dist', dash, false); set('n-ang', dash, false); set('n-rot', dash, false);		set('n-deg', dash, false); set('n-h', dash, false); set('n-v', dash, false);		return;	}	const end = endPoint || mousePos;	if (startPoint) {		const dist = calculateDistance(startPoint, end, sx, sy);		const ang = referenceAngle(startPoint, end, sx, sy);		const r = wheelRotations(dist, wheelDiameter);		const comp = components(startPoint, end, sx, sy);		set('n-dist', fmtUnit(dist), true);		set('n-ang', ang.toFixed(1), true);		set('n-rot', r.toFixed(2), true);		set('n-deg', wheelDegrees(r).toFixed(1), true);		set('n-h', fmtUnit(comp.h), true);		set('n-v', fmtUnit(comp.v), true);	} else {		set('n-dist', dash, false); set('n-ang', dash, false); set('n-rot', dash, false);		set('n-deg', dash, false); set('n-h', dash, false); set('n-v', dash, false);	}
}
function onPointerDown(button, x, y) {	if (currentMode === 'normal') onNormalDown(x, y);	else if (currentMode === 'odometry') onOdoDown(button, x, y);	else if (currentMode === 'route') onRouteDown(x, y);}

function onNormalDown(x, y) {
	if (edgeMeasureMode) {
		edgeLines.push({ edge: edgeMeasureMode, px: x, py: y });
		edgeMeasureMode = null;
		scheduleDraw();
		return;
	}
	if (!startPoint) { startPoint = { x, y }; endPoint = null; }
	else { endPoint = { x, y }; lines.push({ start: { x: startPoint.x, y: startPoint.y }, end: { x: endPoint.x, y: endPoint.y } }); startPoint = null; endPoint = null; }
	scheduleDraw();
	updatePanel();
}

function clearAllLines() {
	lines = [];
	edgeLines = [];
	startPoint = null;
	endPoint = null;
	scheduleDraw();
	updatePanel();
}
// ---------------------------------------------------------------------------// Odometry mode// ---------------------------------------------------------------------------
const HEADING_ARROW_R = 86;
const SNAP_DEG = 5;
const ODO_HIT_R = 14;

let odoAlt = false; // Alt held (disables heading snap)

function odoForward(hDeg) { const r = hDeg * Math.PI / 180; return { x: Math.sin(r), y: -Math.cos(r) }; }
function odoRight(hDeg) { const r = hDeg * Math.PI / 180; return { x: Math.cos(r), y: Math.sin(r) }; }

function odoHeadingFromPointer() {
	if (!odoOrigin || !isMouseOver) return odoHeading;
	const dx = mousePos.x - odoOrigin.x;
	const dy = mousePos.y - odoOrigin.y;
	return normalizeHeading((Math.atan2(dx, -dy) * 180) / Math.PI);
}

function odoSnapCandidate(h) {
	const s = Math.round(h / 90) * 90;
	const d = ((h - s + 180) % 360 + 360) % 360;
	return d <= SNAP_DEG ? s : null;
}

// Snap a pointer position to the origin or either axis line through the origin.
function odoSnapPoint(x, y) {
	if (!odoOrigin) return null;
	const f = odoForward(odoHeading);
	const r = odoRight(odoHeading);
	const dx = x - odoOrigin.x;
	const dy = y - odoOrigin.y;
	if (Math.hypot(dx, dy) < ODO_HIT_R) return odoOrigin;
	const alongF = dx * f.x + dy * f.y;
	const alongR = dx * r.x + dy * r.y;
	const onF = { x: odoOrigin.x + f.x * alongF, y: odoOrigin.y + f.y * alongF };
	const onR = { x: odoOrigin.x + r.x * alongR, y: odoOrigin.y + r.y * alongR };
	let best = null; let bestD = 10;
	const dF = Math.hypot(x - onF.x, y - onF.y); if (dF < bestD) { bestD = dF; best = onF; }
	const dR = Math.hypot(x - onR.x, y - onR.y); if (dR < bestD) best = onR;
	return best;
}

function hitOdo(x, y) {
	if (!odoOrigin) return null;
	if (Math.hypot(x - odoOrigin.x, y - odoOrigin.y) < ODO_HIT_R) return 'origin';
	for (let i = 0; i < odoPoints.length; i++) {
		const p = odoPoints[i];
		if (Math.hypot(x - p.x, y - p.y) < ODO_HIT_R) return i;
	}
	return null;
}

function odoDrawArrow(hDeg) {
	const f = odoForward(hDeg);
	const tx = odoOrigin.x + f.x * HEADING_ARROW_R;
	const ty = odoOrigin.y + f.y * HEADING_ARROW_R;
	ctx.save(); ctx.lineCap = 'round'; ctx.setLineDash([]);
	ctx.strokeStyle = LINE.halo; ctx.lineWidth = 7;
	ctx.beginPath(); ctx.moveTo(odoOrigin.x, odoOrigin.y); ctx.lineTo(tx, ty); ctx.stroke();
	ctx.strokeStyle = LINE.angle; ctx.lineWidth = 4;
	ctx.beginPath(); ctx.moveTo(odoOrigin.x, odoOrigin.y); ctx.lineTo(tx, ty); ctx.stroke();
	const bx = odoOrigin.x + f.x * (HEADING_ARROW_R - 16);
	const by = odoOrigin.y + f.y * (HEADING_ARROW_R - 16);
	const px = -f.y, py = f.x;
	ctx.fillStyle = LINE.angle;
	ctx.beginPath(); ctx.moveTo(tx, ty);
	ctx.lineTo(bx + px * 7, by + py * 7);
	ctx.lineTo(bx - px * 7, by - py * 7);
	ctx.closePath(); ctx.fill();
	ctx.restore();
	ctx.save(); ctx.strokeStyle = LINE.angle; ctx.lineWidth = 3; ctx.setLineDash([]);
	ctx.beginPath(); ctx.arc(odoOrigin.x, odoOrigin.y, 38, -Math.PI / 2, -Math.PI / 2 + hDeg * Math.PI / 180, false); ctx.stroke();
	ctx.restore();
	return { x: tx, y: ty };
}

function drawTextOutlined(text, x, y, fill, outline) {
	ctx.save(); ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.font = '600 12px ' + LINE.font;
	ctx.strokeStyle = outline; ctx.lineWidth = 4; ctx.lineJoin = 'round';
	ctx.strokeText(text, x, y);
	ctx.fillStyle = fill; ctx.fillText(text, x, y);
	ctx.restore();
}

function drawOdometry() {
	if (odoOrigin) {
		const len = Math.max(canvasW, canvasH) * 1.2;
		const f = odoForward(odoHeading);
		const r = odoRight(odoHeading);
		ctx.save(); ctx.lineCap = 'round';
		ctx.strokeStyle = LINE.odometryAxisHalo; ctx.lineWidth = 4; ctx.setLineDash([6, 5]);
		ctx.beginPath(); ctx.moveTo(odoOrigin.x, odoOrigin.y); ctx.lineTo(odoOrigin.x + f.x * len, odoOrigin.y + f.y * len); ctx.stroke();
		ctx.beginPath(); ctx.moveTo(odoOrigin.x, odoOrigin.y); ctx.lineTo(odoOrigin.x + r.x * len, odoOrigin.y + r.y * len); ctx.stroke();
		ctx.strokeStyle = LINE.odometryAxis; ctx.lineWidth = 2; ctx.setLineDash([6, 5]);
		ctx.beginPath(); ctx.moveTo(odoOrigin.x, odoOrigin.y); ctx.lineTo(odoOrigin.x + f.x * len, odoOrigin.y + f.y * len); ctx.stroke();
		ctx.beginPath(); ctx.moveTo(odoOrigin.x, odoOrigin.y); ctx.lineTo(odoOrigin.x + r.x * len, odoOrigin.y + r.y * len); ctx.stroke();
		ctx.restore();
		ctx.fillStyle = LINE.originDot; ctx.beginPath(); ctx.arc(odoOrigin.x, odoOrigin.y, 7, 0, Math.PI * 2); ctx.fill();
		ctx.strokeStyle = LINE.originRing; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(odoOrigin.x, odoOrigin.y, 7, 0, Math.PI * 2); ctx.stroke();
		ctx.fillStyle = LINE.textOutline; ctx.font = 'bold 10px ' + LINE.font; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
		ctx.fillText('Origin (0, 0)', odoOrigin.x, odoOrigin.y - 14);
	}
	const effHeading = odoStep === 2 ? odoHeadingFromPointer() : odoHeading;
	let tip = null;
	if (odoOrigin && odoStep >= 2) {
		tip = odoDrawArrow(effHeading);
		if (odoStep === 2 && isMouseOver) {
			drawTextOutlined('Heading ' + effHeading.toFixed(1) + '°', tip.x, tip.y - 26, LINE.angle, LINE.textOutline);
		}
	}
	// path (shared red/white line style)
	if (odoOrigin) {
		const pts = [odoOrigin, ...odoPoints];
		if (odoConnect) {
			for (let i = 1; i < pts.length; i++) drawMeasureLine(pts[i - 1].x, pts[i - 1].y, pts[i].x, pts[i].y, false, 1);
		}
		if (odoPending) {
			const last = pts.length ? pts[pts.length - 1] : odoOrigin;
			drawMeasureLine(last.x, last.y, odoPending.x, odoPending.y, false, 0.7);
		}
		odoPoints.forEach((p, i) => {
			const hovering = i === odoHoverPoint;
			const selected = i === odoSelectedPoint;
			const dragging = odoDrag === i;
			const rad = dragging ? 8 : selected ? 6 : hovering ? 6 : 5;
			ctx.fillStyle = LINE.pointFill; ctx.beginPath(); ctx.arc(p.x, p.y, rad, 0, Math.PI * 2); ctx.fill();
			ctx.strokeStyle = dragging ? LINE.originRing : LINE.pointRing; ctx.lineWidth = (selected || dragging) ? 3 : 2;
			ctx.beginPath(); ctx.arc(p.x, p.y, rad, 0, Math.PI * 2); ctx.stroke();
			ctx.fillStyle = LINE.textOutline; ctx.font = 'bold 10px ' + LINE.font; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
			ctx.fillText(String(i + 1), p.x, p.y - rad - 7);
		});
	}
	// live readout + pointer chip while plotting
	if (odoOrigin && odoStep >= 2 && isMouseOver) {
		const mm = fieldToXY(mousePos.x, mousePos.y, odoOrigin.x, odoOrigin.y, odoHeading, sx, sy);
		const dist = Math.hypot(mm.X, mm.Y);
		updateOdoLive(mm.X, mm.Y, dist, bearingFromHeading(mm.X, mm.Y));
		if (odoStep === 3 && odoPoints.length) {
			const prev = fieldToXY(odoPoints[odoPoints.length - 1].x, odoPoints[odoPoints.length - 1].y, odoOrigin.x, odoOrigin.y, odoHeading, sx, sy);
			const seg = Math.hypot(mm.X - prev.X, mm.Y - prev.Y);
			drawTextOutlined(fmtUnit(mm.X) + ', ' + fmtUnit(mm.Y) + '  ·  ' + fmtUnit(seg), mousePos.x, mousePos.y - 26, LINE.textFill, LINE.textOutline);
		}
	}
}

function odoDragMove(x, y) {
	if (odoDrag === 'origin') odoOrigin = { x, y };
	else if (odoDrag !== null && odoDrag < odoPoints.length) odoPoints[odoDrag] = { x, y };
	scheduleDraw();
	updatePanel();
	saveOdoSessionNow();
}

function saveOdoSessionNow() {
	if (!odoOrigin) { clearOdoSession(selection.competition, selection.year, selection.category); return; }
	saveOdoSession(selection.competition, selection.year, selection.category, {
		originMM: { x: toMMx(odoOrigin.x, sx), y: toMMy(odoOrigin.y, sy) },
		heading: odoHeading,
		step: odoStep,
		pointsMM: odoPoints.map(p => ({ x: toMMx(p.x, sx), y: toMMy(p.y, sy) })),
		connect: odoConnect,
		snap: odoSnap,
	});
}

function loadOdoSession() {
	const ses = getOdoSession(selection.competition, selection.year, selection.category);
	if (!ses) return;
	odoOrigin = { x: toCanvasX(ses.originMM.x, sx), y: toCanvasY(ses.originMM.y, sy) };
	odoHeading = ses.heading === undefined ? 0 : ses.heading;
	odoStep = ses.step === undefined ? 3 : ses.step;
	odoPoints = (ses.pointsMM || []).map(mm => ({ x: toCanvasX(mm.x, sx), y: toCanvasY(mm.y, sy) }));
	odoConnect = ses.connect === undefined ? true : ses.connect;
	odoSnap = ses.snap === undefined ? true : ses.snap;
}

function clearOdoSessionNow() { clearOdoSession(selection.competition, selection.year, selection.category); }

function odoAddPoint(x, y) {
	let nx = x, ny = y;
	if (odoSnap) { const s = odoSnapPoint(x, y); if (s) { nx = s.x; ny = s.y; } }
	odoPoints.push({ x: nx, y: ny }); odoPending = null;
	scheduleDraw(); updatePanel(); saveOdoSessionNow();
}

function onOdoDown(button, x, y) {
	if (button !== 0) return;
	if (odoStep === 1) {
		odoOrigin = { x, y }; odoHeading = 0; odoStep = 2; odoPoints = []; odoPending = null; odoDrag = null;
		scheduleDraw(); updatePanel(); saveOdoSessionNow(); return;
	}
	if (odoStep === 2) {
		let h = odoHeadingFromPointer();
		if (!odoAlt) { const sn = odoSnapCandidate(h); if (sn !== null) h = sn; }
		odoHeading = h; odoStep = 3; odoPending = null; odoDrag = null;
		scheduleDraw(); updatePanel(); saveOdoSessionNow(); return;
	}
	// step 3: dragging origin/point takes precedence over plotting
	const hit = hitOdo(x, y);
	if (hit !== null) { odoDrag = hit; scheduleDraw(); return; }
	odoAddPoint(x, y);
}

function resetOdometry() {
	odoOrigin = null; odoHeading = 0; odoStep = 1; odoPoints = []; odoPending = null; odoDrag = null; odoHoverPoint = null; odoSelectedPoint = null;
	scheduleDraw(); updatePanel(); clearOdoSessionNow();
}

function odoUndoLast() {
	if (odoPoints.length) { odoPoints.pop(); }
	if (odoPoints.length === 0 && odoStep === 3) { odoStep = 2; }
	scheduleDraw(); updatePanel(); saveOdoSessionNow();
}
function odoDeleteSelected() {
	if (odoSelectedPoint === null) return;
	odoPoints.splice(odoSelectedPoint, 1);
	if (odoSelectedPoint >= odoPoints.length) odoSelectedPoint = odoPoints.length > 0 ? odoPoints.length - 1 : null;
	scheduleDraw(); updatePanel(); saveOdoSessionNow();
}
function odoClearPoints() { odoPoints = []; odoSelectedPoint = null; odoStep = odoOrigin ? 2 : 1; scheduleDraw(); updatePanel(); saveOdoSessionNow(); }

function updateOdoLive(X, Y, dist, bearing) {
	const set = (id, val) => { const e = sel(id); if (e) e.textContent = val; };
	set('o-x', fmtUnit(X), true);
	set('o-y', fmtUnit(Y), true);
	set('o-dist', fmtUnit(dist), true);
	set('o-bearing', bearing.toFixed(1) + '°', true);
}

function odometryPanelHTML() {
	const stepLabel = (n) => ['1 Place origin', '2 Set heading', '3 Plot points'][n - 1];
	const active = odoStep;
	return `<section class="section open">
	<div class="section-header"><h3>Odometry</h3><div class="section-toggle"></div></div>
	<div class="section-body">
		<div class="odo-steps">
			<div class="odo-step ${active === 1 ? 'odo-step-current' : ''} ${active > 1 ? 'odo-step-done' : ''}" data-step="1">${stepLabel(1)}</div>
			<div class="odo-step ${active === 2 ? 'odo-step-current' : ''} ${active > 2 ? 'odo-step-done' : ''}" data-step="2">${stepLabel(2)}</div>
			<div class="odo-step ${active === 3 ? 'odo-step-current' : ''} ${active > 3 ? 'odo-step-done' : ''}" data-step="3">${stepLabel(3)}</div>
		</div>
		<div class="odo-instr" id="odo-instr">${odoInstr()}</div>
		<div class="odo-readouts">
			<div class="readout"><span class="label">X</span><kbd id="o-x">-- mm</kbd></div>
			<div class="readout"><span class="label">Y</span><kbd id="o-y">-- mm</kbd></div>
			<div class="readout"><span class="label">Distance</span><kbd id="o-dist">-- mm</kbd></div>
			<div class="readout"><span class="label">Bearing</span><kbd id="o-bearing">-- °</kbd></div>
		</div>
		<div class="odo-heading">
			<label>Heading</label>
			<input type="number" id="o-h" value="${odoHeading.toFixed(1)}" step="0.1" min="-180" max="180">
			<div class="odo-quick"><button class="btn odo-quick-btn" data-heading="0">0</button><button class="btn odo-quick-btn" data-heading="90">90</button><button class="btn odo-quick-btn" data-heading="180">180</button><button class="btn odo-quick-btn" data-heading="-90">-90</button></div>
		</div>
		<table class="odo-table">
			<thead><tr><th>#</th><th>X</th><th>Y</th><th>Dist</th><th>Turn</th></tr></thead>
			<tbody id="o-points-body"></tbody>
		</table>
		<div class="odo-actions">
			<button class="btn btn-outline btn-full" id="btn-o-undo">Undo last</button>
			<button class="btn btn-outline btn-full" id="btn-o-delete">Delete selected</button>
			<button class="btn btn-outline btn-full" id="btn-o-clear">Clear points</button>
			<button class="btn btn-outline btn-full" id="btn-o-reset">Reset origin</button>
		</div>
		<div class="odo-view">
			<label>Connect points</label>
			<button role="switch" aria-checked="${odoConnect}" class="switch" id="sw-odo-connect"></button>
		</div>
		<div class="odo-python">
			<div class="odo-python-head"><span>Python</span><span id="o-python-count">(${odoPoints.length})</span></div>
			<textarea id="o-python" readonly class="py-output">[${odoPoints.map(p => { const m = fieldToXY(p.x, p.y, odoOrigin.x, odoOrigin.y, odoHeading, sx, sy); return '(' + m.X.toFixed(1) + ', ' + m.Y.toFixed(1) + ')'; }).join(', ')}]</textarea>
			<button class="btn btn-outline btn-full" id="btn-o-copy">Copy</button>
		</div>
	</div>
</section>`;
}

function odoInstr() {
	if (odoStep === 1) return 'Click the field to place the origin.';
	if (odoStep === 2) return 'Drag the arrow to set the heading, then click to confirm (Alt = no snap).';
	return 'Click to plot a point. Drag a point or the origin to reposition.';
}

function wireOdometryPanel() {
	const bind = (id, fn) => { const b = sel(id); if (b) b.addEventListener('click', fn); };
	bind('btn-o-undo', odoUndoLast);
	bind('btn-o-delete', () => { odoDeleteSelected(); });
	bind('btn-o-clear', odoClearPoints);
	bind('btn-o-reset', resetOdometry);
	bind('btn-o-copy', copyPython);
	const hIn = sel('o-h');
	if (hIn) {
		hIn.addEventListener('change', () => {
			const v = Number(hIn.value);
			if (Number.isFinite(v)) { odoHeading = normalizeHeading(v); odoStep = 3; odoDrag = null; odoPending = null; scheduleDraw(); updatePanel(); saveOdoSessionNow(); }
		});
		hIn.addEventListener('input', () => { updatePanel(); });
	}
	document.querySelectorAll('.odo-quick-btn').forEach(b => {
		b.addEventListener('click', () => {
			odoHeading = Number(b.dataset.heading); odoStep = 3; odoDrag = null; odoPending = null;
			scheduleDraw(); updatePanel(); saveOdoSessionNow();
		});
	});
	const sw = sel('sw-odo-connect');
	if (sw) {
		sw.addEventListener('click', () => { odoConnect = !odoConnect; sw.setAttribute('aria-checked', odoConnect); scheduleDraw(); updatePanel(); saveOdoSessionNow(); });
	}
	Array.from(document.querySelectorAll('.odo-table tbody tr')).forEach((tr, i) => {
		tr.addEventListener('click', () => { odoSelectedPoint = i; odoHoverPoint = null; scheduleDraw(); updatePanel(); saveOdoSessionNow(); });
	});
}

function copyPython() {
	const ta = sel('o-python'); if (!ta || !ta.value) return;
	navigator.clipboard.writeText(ta.value).then(() => {
		const b = sel('btn-o-copy'); const old = b.textContent;
		b.textContent = 'Copied!'; setTimeout(() => { b.textContent = old; }, 2000);
	});
}
// ---------------------------------------------------------------------------// Route mode// ---------------------------------------------------------------------------
function drawRoute() {
	if (routeOrigin) {
		ctx.fillStyle = LINE.originDot; ctx.beginPath(); ctx.arc(routeOrigin.x, routeOrigin.y, 7, 0, Math.PI * 2); ctx.fill();
		ctx.strokeStyle = LINE.originRing; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(routeOrigin.x, routeOrigin.y, 7, 0, Math.PI * 2); ctx.stroke();
		ctx.fillStyle = LINE.textOutline; ctx.font = 'bold 10px ' + LINE.font; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
		ctx.fillText('Start', routeOrigin.x, routeOrigin.y - 14);
	}
	routeLines.forEach(l => drawMeasureLine(l.start.x, l.start.y, l.end.x, l.end.y, false, 1));
	routeLines.forEach(l => drawDistanceLabel(l.start, l.end));
	const last = routePoints.length ? routePoints[routePoints.length - 1] : (routeOrigin || null);
	if (last && isMouseOver) { drawMeasureLine(last.x, last.y, mousePos.x, mousePos.y, false, 0.7); }
	if (routePendingLine) { drawMeasureLine(routePendingLine.start.x, routePendingLine.start.y, routePendingLine.end.x, routePendingLine.end.y, false, 0.7); drawDistanceLabel(routePendingLine.start, routePendingLine.end); }
	routePoints.forEach((p, i) => {
		const hovered = i === hoveredNodeIndex;
		const selected = i === draggedNodeIndex;
		const rad = selected ? 8 : hovered ? 6 : 5;
		ctx.fillStyle = LINE.pointFill; ctx.beginPath(); ctx.arc(p.x, p.y, rad, 0, Math.PI * 2); ctx.fill();
		ctx.strokeStyle = selected ? LINE.originRing : LINE.pointRing; ctx.lineWidth = selected ? 3 : 2;
		ctx.beginPath(); ctx.arc(p.x, p.y, rad, 0, Math.PI * 2); ctx.stroke();
		ctx.fillStyle = LINE.textOutline; ctx.font = 'bold 11px ' + LINE.font; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
		ctx.fillText(String(i + 1), p.x, p.y - rad - 7);
	});
	if (draggedNodeIndex !== null || hoveredNodeIndex !== null) {
		drawTextOutlined('Drag node · Escape to cancel', canvasW / 2, 30, LINE.textFill, LINE.textOutline);
	}
}

function routeTotalMM() {
	let total = 0;
	for (let i = 1; i < routePoints.length; i++) total += segmentLength(routePoints[i - 1].x, routePoints[i - 1].y, routePoints[i].x, routePoints[i].y, sx, sy);
	return total;
}

function onRouteDown(x, y) {
	const hit = routePoints.findIndex(p => Math.hypot(p.x - x, p.y - y) < ODO_HIT_R);
	if (hit >= 0) { hoveredNodeIndex = hit; draggedNodeIndex = hit; scheduleDraw(); updatePanel(); return; }
	if (!routeOrigin) { routeOrigin = { x, y }; routePoints = [{ x, y }]; scheduleDraw(); updatePanel(); return; }
	routePoints.push({ x, y });
	if (routePoints.length >= 2) routeLines.push({ start: routePoints[routePoints.length - 2], end: routePoints[routePoints.length - 1] });
	routePendingLine = null;
	scheduleDraw(); updatePanel();
}

function resetRoute() {
	routeOrigin = null; routePoints = []; routeLines = []; routePendingLine = null; hoveredNodeIndex = null; draggedNodeIndex = null;
	scheduleDraw(); updatePanel();
}

function routeDeleteNode(idx) {
	if (idx === null || idx < 0 || idx >= routePoints.length) return;
	routePoints.splice(idx, 1);
	routeLines = [];
	for (let i = 1; i < routePoints.length; i++) routeLines.push({ start: routePoints[i - 1], end: routePoints[i] });
	if (draggedNodeIndex === idx) draggedNodeIndex = null;
	else if (draggedNodeIndex !== null && draggedNodeIndex > idx) draggedNodeIndex--;
	hoveredNodeIndex = null;
	scheduleDraw(); updatePanel();
}

function routePanelHTML() {
	const count = routePoints.length;
	const total = routeTotalMM();
	const rows = routePoints.map((p, i) => {
		const rel = i === 0 ? { x: 0, y: 0 } : fieldToXY(p.x, p.y, routePoints[0].x, routePoints[0].y, 0, sx, sy);
		const seg = i === 0 ? 0 : segmentLength(routePoints[i - 1].x, routePoints[i - 1].y, p.x, p.y, sx, sy);
		return `<tr><td>${i + 1}</td><td>${fmtUnit(rel.x)}</td><td>${fmtUnit(rel.y)}</td><td>${fmtUnit(seg)}</td></tr>`;
	}).join('');
	return `<section class="section open">
	<div class="section-header"><h3>Route</h3><div class="section-toggle"></div></div>
	<div class="section-body">
		<div class="route-readouts">
			<div class="readout"><span class="label">Start</span><span id="r-origin">${routeOrigin ? 'set' : 'click field to set origin'}</span></div>
			<div class="readout"><span class="label">Waypoints</span><kbd id="r-count">${count}</kbd></div>
			<div class="readout"><span class="label">Total length</span><kbd id="r-total">${fmtUnit(total)}</kbd></div>
		</div>
		<table class="odo-table">
			<thead><tr><th>#</th><th>X</th><th>Y</th><th>Seg</th></tr></thead>
			<tbody id="r-points-body">${rows}</tbody>
		</table>
		<div class="odo-actions">
			<button class="btn btn-outline btn-full" id="btn-r-delete-node">Delete node</button>
			<button class="btn btn-outline btn-full" id="btn-r-undo">Undo last</button>
			<button class="btn btn-outline btn-full" id="btn-r-clear-route">Clear route</button>
			<button class="btn btn-outline btn-full" id="btn-r-save-route" ${count ? '' : 'disabled'}>Save route</button>
		</div>
		<div class="saved-routes">
			<h4 class="saved-heading">Saved routes</h4>
			<div id="saved-routes-body"></div>
			<div class="saved-confirm d-none" id="saved-confirm-delete-all">
				<span>Delete all saved routes?</span>
				<button class="btn btn-outline btn-small" id="btn-saved-cancel">Cancel</button>
				<button class="btn btn-outline btn-small" id="btn-saved-ok">Delete all</button>
			</div>
			<div class="odo-actions">
				<button class="btn btn-outline btn-full" id="btn-r-delete-all-routes">Delete all saved routes</button>
			</div>
		</div>
	</div>
</section>`;
}

function wireRoutePanel() {
	const bind = (id, fn) => { const b = sel(id); if (b) b.addEventListener('click', fn); };
	bind('btn-r-delete-node', () => { routeDeleteNode(draggedNodeIndex !== null ? draggedNodeIndex : hoveredNodeIndex); });
	bind('btn-r-undo', () => { if (routePoints.length) { routePoints.pop(); routeLines = []; for (let i = 1; i < routePoints.length; i++) routeLines.push({ start: routePoints[i - 1], end: routePoints[i] }); } scheduleDraw(); updatePanel(); });
	bind('btn-r-clear-route', resetRoute);
	bind('btn-r-save-route', saveCurrentRoute);
	bind('btn-r-delete-all-routes', () => { const c = sel('saved-confirm-delete-all'); if (c) c.classList.toggle('d-none'); });
	bind('btn-saved-cancel', () => { const c = sel('saved-confirm-delete-all'); if (c) c.classList.add('d-none'); });
	bind('btn-saved-ok', () => { deleteAllRoutes(selection.competition, selection.year, selection.category); renderSavedRoutes(); const c = sel('saved-confirm-delete-all'); if (c) c.classList.add('d-none'); });
	Array.from(document.querySelectorAll('#r-points-body tr')).forEach((tr, i) => {
		tr.addEventListener('click', () => { draggedNodeIndex = null; hoveredNodeIndex = i; scheduleDraw(); updatePanel(); });
	});
}

function renderSavedRoutes() {
	const body = sel('saved-routes-body'); if (!body) return;
	const routes = getRoutes(selection.competition, selection.year, selection.category);
	body.innerHTML = '';
	if (routes.length === 0) { body.innerHTML = '<div class="empty">No saved routes</div>'; return; }
	routes.slice().reverse().forEach((rt, i) => {
		const realIdx = routes.length - 1 - i;
		const total = (rt.lines || []).reduce((s, l) => {
			const dx = l.end.xMM - l.start.xMM, dy = l.end.yMM - l.start.yMM;
			return s + Math.hypot(dx, dy);
		}, 0);
		const div = document.createElement('div');
		div.className = 'saved-item';
		div.innerHTML = `<div><div class="name">${esc(rt.name)}</div><div class="meta">${rt.points.length} pts · ${total.toFixed(1)} mm</div></div><div class="chip-actions"><button class="btn btn-outline btn-small" onclick="appLoadRoute(${realIdx})">Load</button><button class="btn btn-outline btn-small" onclick="appDeleteRoute(${realIdx})">X</button></div>`;
		body.appendChild(div);
	});
}

function rebuildRouteLines() {	routeLines = [];	for (let i = 1; i < routePoints.length; i++) {		routeLines.push({ start: routePoints[i - 1], end: routePoints[i] }
);	}
}

window.addEventListener('keydown', e => { if (e.key === 'Alt') { odoAlt = true; } });
window.addEventListener('keyup', e => { if (e.key === 'Alt') { odoAlt = false; } });

// Panels (rebuilt on mode change only)
// ---------------------------------------------------------------------------
function updatePanel() {	const panel = sel('mode-panel');	if (!panel) return;	const field = currentField();	if (currentMode === 'normal') {		panel.innerHTML = normalPanelHTML();		wireNormalPanel();	} else if (currentMode === 'odometry') {		panel.innerHTML = odometryPanelHTML();		wireOdometryPanel();		updateOdoLive(0, 0, 0, 0);	} else {		panel.innerHTML = routePanelHTML();		wireRoutePanel();	}	renderSavedLines();	renderSavedRoutes();}
function esc(id) { return String(id).replace(/[&<>"']/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' })[c]); }function buttonsHTML() {	return `
		<div class="btn-group btn-row">
			<button class="btn btn-secondary btn-full" id="btn-new-line">New Line</button>
			<button class="btn btn-secondary btn-full" id="btn-delete-last">Delete Last</button>
			<button class="btn btn-outline btn-full" id="btn-clear-all">Clear All</button>
		</div>
		`;}function confirmHTML() {	return `		<div class="confirm-row">			<span class="confirm-text">Clear all measured lines?</span>			<button class="btn btn-outline btn-small" id="btn-confirm-cancel">Cancel</button>			<button class="btn btn-outline btn-small" id="btn-confirm-ok">Clear</button>		</div>	`;}function normalPanelHTML() {	const field = currentField();	return `		<section class="section open">			<div class="section-header"><h3>Measure</h3><div class="section-toggle"></div></div>			<div class="section-body">				<div class="readout"><span class="label">Distance</span><kbd id="n-dist"><span class="value">–</span><span class="unit">${unit === 'deg' ? '°' : 'mm'}</span></kbd></div>				<div class="readout"><span class="label">Angle</span><kbd id="n-ang"><span class="value">–</span><span class="unit">°</span></kbd></div>				<div class="readout"><span class="label">Rotations</span><kbd id="n-rot"><span class="value">–</span></kbd></div>				<div class="readout"><span class="label">Degrees</span><kbd id="n-deg"><span class="value">–</span><span class="unit">°</span></kbd></div>				<div class="readout"><span class="label">Horizontal</span><kbd id="n-h"><span class="value">–</span><span class="unit">${unit === 'deg' ? '°' : 'mm'}</span></kbd></div>				<div class="readout"><span class="label">Vertical</span><kbd id="n-v"><span class="value">–</span><span class="unit">${unit === 'deg' ? '°' : 'mm'}</span></kbd></div>				${buttonsHTML()}				<div class="view-section">					<h3 class="view-heading">View</h3>					<div class="view-row">						<span>Right triangle</span>						<span class="view-hint">Show horizontal and vertical legs</span>						<button role="switch" aria-checked=${showTriangle} class="switch" id="sw-tri"></button>					</div>					</div>			</div>		</section>	`;}function wireNormalPanel() {	const bind = (id, fn) => { const b = sel(id); if (b) b.addEventListener('click', fn); };	bind('btn-new-line', () => { startPoint = null; endPoint = null; scheduleDraw(); updatePanel(); });	bind('btn-delete-last', () => { lines.pop(); startPoint = null; endPoint = null; scheduleDraw(); updatePanel(); });	bind('btn-clear-all', clearAllLines);
	/* View switches: clicking the whole row toggles the switch; the switch itself handles Space/Enter natively. */	bind('sw-tri', () => { showTriangle = !showTriangle; scheduleDraw(); updatePanel(); });	Array.from(document.querySelectorAll('.view-row')).forEach(row => {		row.addEventListener('click', (e) => {			if (e.target.closest('button')) return; /* the switch button has its own handler */			const sw = row.querySelector('.switch');			if (sw) sw.click();		}, true);	});}function saveCurrentRoute() {	if (!routeOrigin || routePoints.length === 0) return;	const now = new Date();	const r = {		name: now.toLocaleDateString() + ' ' + now.toLocaleTimeString(),		timestamp: now.toISOString(),		origin: { xMM: toMMx(routeOrigin.x, sx), yMM: toMMy(routeOrigin.y, sy) },		points: routePoints.map(p => ({ xMM: toMMx(p.x, sx), yMM: toMMy(p.y, sy) })),		lines: routeLines.map(l => ({ start: { xMM: toMMx(l.start.x, sx), yMM: toMMy(l.start.y, sy) }, end: { xMM: toMMx(l.end.x, sx), yMM: toMMy(l.end.y, sy) } })),	};	const routes = getRoutes(selection.competition, selection.year, selection.category);	routes.push(r);	saveRoutes(selection.competition, selection.year, selection.category, routes);	renderSavedRoutes();	updatePanel();}// ---------------------------------------------------------------------------
// ---------------------------------------------------------------------------
// Saved lists
// ---------------------------------------------------------------------------
function saveCurrentLines() {
    if (lines.length === 0 && edgeLines.length === 0) return;
    const now = new Date();
    const mmLines = lines.map(l => ({ start: { xMM: toMMx(l.start.x, sx), yMM: toMMy(l.start.y, sy) }, end: { xMM: toMMx(l.end.x, sx), yMM: toMMy(l.end.y, sy) } }));
    const mmEdges = edgeLines.map(el => ({ edge: el.edge, pxMM: toMMx(el.px, sx), pyMM: toMMy(el.py, sy) }));
    const sets = getLinesSets(selection.competition, selection.year, selection.category);
    sets.push({ name: now.toLocaleDateString() + " " + now.toLocaleTimeString(), timestamp: now.toISOString(), lines: mmLines, edgeLines: mmEdges });
    saveLinesSets(selection.competition, selection.year, selection.category, sets);
    renderSavedLines();
}

function renderSavedLines() {
    const body = sel("saved-lines-body");
    if (!body) return;
    const sets = getLinesSets(selection.competition, selection.year, selection.category);
    body.innerHTML = "";
    if (sets.length === 0) {
        body.innerHTML = '<div class="empty">No saved lines</div>';
        return;
    }
    sets.slice().reverse().forEach((set, i) => {
        const realIdx = sets.length - 1 - i;
        const div = document.createElement("div");
        div.className = "saved-item";
        div.innerHTML = `<div><div class="name">${esc(set.name)}</div><div class="meta">${set.lines.length} lines ${set.edgeLines ? set.edgeLines.length + " edges" : ""}</div></div><div class="chip-actions"><button class="btn btn-secondary btn-small" onclick="appLoadLinesSet(${realIdx})">Load</button><button class="btn btn-danger btn-small" onclick="appDeleteLinesSet(${realIdx})">X</button></div>`;
        body.appendChild(div);
    });
}

window.appLoadLinesSet = (idx) => {
    const sets = getLinesSets(selection.competition, selection.year, selection.category);
    const set = sets[idx];
    if (!set) return;
    lines = set.lines.map(l => ({ start: { x: toCanvasX(l.start.xMM, sx), y: toCanvasY(l.start.yMM, sy) }, end: { x: toCanvasX(l.end.xMM, sx), y: toCanvasY(l.end.yMM, sy) } }));
    edgeLines = (set.edgeLines || []).map(el => ({ edge: el.edge, px: toCanvasX(el.pxMM, sx), py: toCanvasY(el.pyMM, sy) }));
    scheduleDraw();
    renderSavedLines();
};

window.appDeleteLinesSet = (idx) => {
    const sets = getLinesSets(selection.competition, selection.year, selection.category);
    sets.splice(idx, 1);
    saveLinesSets(selection.competition, selection.year, selection.category, sets);
    renderSavedLines();
};

window.appLoadRoute = (idx) => {
    const routes = getRoutes(selection.competition, selection.year, selection.category);
    const rt = routes[idx];
    if (!rt) return;
    routeOrigin = rt.origin ? { x: toCanvasX(rt.origin.xMM, sx), y: toCanvasY(rt.origin.yMM, sy) } : null;
    routePoints = rt.points.map(p => ({ x: toCanvasX(p.xMM, sx), y: toCanvasY(p.yMM, sy) }));
    routeLines = rt.lines.map(l => ({ start: { x: toCanvasX(l.start.xMM, sx), y: toCanvasY(l.start.yMM, sy) }, end: { x: toCanvasX(l.end.xMM, sx), y: toCanvasY(l.end.yMM, sy) } }));
    scheduleDraw();
    updatePanel();
};

window.appDeleteRoute = (idx) => {
    const routes = getRoutes(selection.competition, selection.year, selection.category);
    routes.splice(idx, 1);
    saveRoutes(selection.competition, selection.year, selection.category, routes);
    renderSavedRoutes();
};



// ---------------------------------------------------------------------------
// Boot
// ---------------------------------------------------------------------------
init();