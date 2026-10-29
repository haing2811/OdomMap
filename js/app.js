// OdomMap — main application.

// Modules:
// config.js (data), math.js (conversions), storage.js (persistence).

// All measurements are computed in mm from canvas px via separate x/y
// scales.
import { COMPETITIONS, DEFAULT_COMPETITION, DEFAULT_YEAR, DEFAULT_CATEGORY,	fieldFor, competitions, competitionLabel, yearsFor, categoriesFor,	resolveSelection, selectionToParams, STORAGE } from './config.js';
import { computeScales, toMMx, toMMy, toCanvasX, toCanvasY,	calculateDistance, calculateAngle, referenceAngle,	wheelRotations, wheelDegrees, components, calculateRotatedCoordinates,	odometryDistanceFromOrigin } from './math.js';
import { getLinesSets, saveLinesSets, deleteAllLines,	getRoutes, saveRoutes, deleteAllRoutes,	getGlobal, setGlobal, getLastSelection, setLastSelection,	migrateV1toV2, purgeRobotDimensions } from './storage.js';
// ---------------------------------------------------------------------------// Constants// ---------------------------------------------------------------------------
const SNAP_THRESHOLD_PX = 14;   // 
// canvas (backing) px
const ANGLE_SNAP_STEP = 90;     // degrees
// ---------------------------------------------------------------------------
// DOM
// ---------------------------------------------------------------------------
const sel = (id) => document.getElementById(id);
// Canvas paint tokens — read once at module scope, never getComputedStyle in
const LINE = (() => {	const cs = getComputedStyle(document.documentElement);	const g = (name) => cs.getPropertyValue(name).trim();	return {		measure: g('--line-measure') || '#EF4444',		halo: g('--line-halo') || '#FFFFFF',		current: g('--line-current') || '#EF4444',		earlier: g('--line-earlier') || '#9CA3AF',		angle: g('--angle-blue') || '#2563EB',		edge: g('--edge-line') || '#9CA3AF',		axis: g('--odometry-axis') || '#9CA3AF',		route: g('--route-line') || '#EF4444',		crosshair: g('--crosshair') || '#6B7280',		helper: g('--helper') || '#F59E0B',		helperHalo: g('--helper-halo') || '#111827',
	legGreen: g('--leg-green') || '#22C55E',
				dark: g('--bg-void') || '#0A0A0B',		angleFill: g('--angle-text-fill') || '#2563EB',		angleOutline: g('--angle-text-outline') || '#FFFFFF',		distFill: g('--distance-text-fill') || '#FFFFFF',		distOutline: g('--distance-text-outline') || '#EF4444',		font: g('--font-mono') || 'Geist Mono, monospace',	}}
)();
const elLoading = sel('loading');
const elCanvasContainer = sel('canvas-container');
const elCanvas = sel('canvas');
const elSelCompetition = sel('sel-competition');
const elSelYear = sel('sel-year');
const elSelCategory = sel('sel-category');
const elWheel = sel('wheel-diameter');
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
let odometryOrigin = null;        // {x,y} backing px
let odometryOriginAngle = 0;      // degrees
let isAngleIndicatorActive = false;
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
	let installPromptSeen = false;
	window.addEventListener('beforeinstallprompt', (e) => {
		e.preventDefault();
		deferredInstall = e;
		installPromptSeen = true;
		console.info('[OdomMap PWA] beforeinstallprompt received; install button shown');
		elInstallBtn.classList.remove('hidden');
		elInstallBtn.addEventListener('click', () => {
			deferredInstall.prompt();
			deferredInstall.userChoice.then((choice) => {
				console.info('[OdomMap PWA] install userChoice:', choice.outcome);
				deferredInstall = null;
				elInstallBtn.classList.add('hidden');
			});
		});
	}, { once: true });

	// If the browser never offers beforeinstallprompt on this origin, the PWA
	// install UI is deferred to the browser's omnibox (per-origin engagement
	// gating). Log so the difference between origins is observable.
	setTimeout(() => {
		if (!installPromptSeen) {
			console.info('[OdomMap PWA] no beforeinstallprompt on this origin; install via browser omnibox if available');
		}
	}, 0);

	window.addEventListener('appinstalled', () => {
		console.info('[OdomMap PWA] appinstalled');
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
}
let currentMode = 'normal';
function resetModeState() {	startPoint = null; endPoint = null;	odometryOrigin = null; odometryOriginAngle = 0; isAngleIndicatorActive = false;	routeOrigin = null; routePoints = []; routeLines = []; routePendingLine = null;	hoveredNodeIndex = null; draggedNodeIndex = null;	edgeMeasureMode = null;
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
}
// ---------------------------------------------------------------------------// Canvas input// ---------------------------------------------------------------------------
function setupCanvasUI() {	ctx = elCanvas.getContext('2d');	// Hidden until the first fit applies so nothing renders at a stale
 elCanvas.style.visibility = 'hidden';	elCanvasContainer.addEventListener('pointerdown', (e) => {		const p = pointerToBacking(e);		if (p) { elCanvasContainer.focus(); onPointerDown(p.x, p.y); }	}
);	elCanvasContainer.addEventListener('pointermove', (e) => {		const p = pointerToBacking(e);		if (p) {			mousePos = p;			isMouseOver = true;			if (draggedNodeIndex !== null && currentMode === 'route') {				routePoints[draggedNodeIndex] = { x: p.x, y: p.y }
;				rebuildRouteLines();				scheduleDraw();				updatePanel();				return;			}			scheduleDraw();		}	}
);	elCanvasContainer.addEventListener('pointerleave', () => { isMouseOver = false; scheduleDraw(); }
);	elCanvasContainer.addEventListener('pointerup', () => { draggedNodeIndex = null; scheduleDraw(); }
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
function cancelCurrentAction() {	startPoint = null; endPoint = null;	isAngleIndicatorActive = false;	routePendingLine = null;	edgeMeasureMode = null;
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
function drawMeasureLine(x1, y1, x2, y2, active) {	// solid red measure line ~4px with a white halo
 // casing (~2.5px each side), round caps
const lw = active ? 4 : 3;	ctx.save();	ctx.lineCap = 'round';	ctx.setLineDash([]);	ctx.strokeStyle = LINE.halo;	ctx.lineWidth = lw + 5;	ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();	ctx.strokeStyle = LINE.measure;	ctx.lineWidth = lw;	ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();	// endpoints: solid white dot + red ring
	ctx.fillStyle = LINE.halo;	ctx.beginPath(); ctx.arc(x1, y1, 5, 0, Math.PI * 2); ctx.fill();	ctx.beginPath(); ctx.arc(x2, y2, 5, 0, Math.PI * 2); ctx.fill();	ctx.strokeStyle = LINE.measure;	ctx.lineWidth = 2;	ctx.beginPath(); ctx.arc(x1, y1, 5, 0, Math.PI * 2); ctx.stroke();	ctx.beginPath(); ctx.arc(x2, y2, 5, 0, Math.PI * 2); ctx.stroke();	ctx.restore();}
function drawHelperLine(x1, y1, x2, y2) {	// dashed helper geometry: dark halo + neutral/amber core, thinner than measure lines
	ctx.save();	ctx.lineCap = 'round';	ctx.strokeStyle = LINE.helperHalo;	ctx.lineWidth = 3;	ctx.setLineDash([6, 5]);	ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();	ctx.strokeStyle = LINE.helper;	ctx.lineWidth = 1.5;	ctx.setLineDash([4, 4]);	ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();	ctx.restore();}
function drawEdgeLine(el) {	let x1, y1, x2, y2;	if (el.edge === 'top')    { x1 = el.px; y1 = 0; x2 = el.px; y2 = el.py; }	else if (el.edge === 'bottom') { x1 = el.px; y1 = canvasH; x2 = el.px; y2 = el.py; }	else if (el.edge === 'left')   { x1 = 0; y1 = el.py; x2 = el.px; y2 = el.py; }	else { x1 = canvasW; y1 = el.py; x2 = el.px; y2 = el.py; }	drawHelperLine(x1, y1, x2, y2);}
function drawEdgePreview(mx, my) {	let x1, y1, x2, y2, distMM;	if (edgeMeasureMode === 'top')    { x1 = mx; y1 = 0; x2 = mx; y2 = my; distMM = toMMy(my, sy); }	else if (edgeMeasureMode === 'bottom') { x1 = mx; y1 = canvasH; x2 = mx; y2 = my; distMM = toMMy(canvasH - my, sy); }	else if (edgeMeasureMode === 'left')   { x1 = 0; y1 = my; x2 = mx; y2 = my; distMM = toMMx(mx, sx); }	else { x1 = canvasW; y1 = my; x2 = mx; y2 = my; distMM = toMMx(canvasW - mx, sx); }	drawHelperLine(x1, y1, x2, y2);	drawChip(distMM.toFixed(1) + ' mm', mx, my > canvasH / 2 ? my - 16 : my + 16, LINE.helper);}
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
	place(hMM.toFixed(0) + ' mm', hx, hy + hoff, 'center', hoff < 0 ? 'bottom' : 'top');	// vertical leg label: left/right of the leg, outside the triangle interior
	const vx = p2.x;	const vy = (p1.y + p2.y) / 2;	const voff = (p2.x > p1.x) ? -26 : 26;
	place(vMM.toFixed(0) + ' mm', vx + voff, vy, voff < 0 ? 'right' : 'left', 'middle');
	ctx.restore();	ctx.restore();}
function drawDistanceLabel(p1, p2) {	const dx = p2.x - p1.x;	const dy = p2.y - p1.y;	const len = Math.hypot(dx, dy);	if (len < 24) return;	// offset perpendicular to the line so the label never sits on the line
	const mx = (p1.x + p2.x) / 2;	const my = (p1.y + p2.y) / 2;	const nx = -dy / len;	const ny = dx / len;	const x = mx + nx * 26;	const y = my + ny * 26;	const text = calculateDistance(p1, p2, sx, sy).toFixed(1) + ' mm';	ctx.save();	ctx.textAlign = 'center'; ctx.textBaseline = 'middle';	ctx.font = 'bold 18px ' + LINE.font;	ctx.strokeStyle = LINE.distOutline;	ctx.lineWidth = 4;	ctx.lineJoin = 'round';	ctx.strokeText(text, x, y);	ctx.fillStyle = LINE.distFill;	ctx.fillText(text, x, y);	ctx.restore();}
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
	if (currentMode !== 'normal') {		set('n-dist', dash, false); set('n-ang', dash, false); set('n-rot', dash, false);		set('n-deg', dash, false); set('n-h', dash, false); set('n-v', dash, false);		return;	}	const end = endPoint || mousePos;	if (startPoint) {		const dist = calculateDistance(startPoint, end, sx, sy);		const ang = referenceAngle(startPoint, end, sx, sy);		const r = wheelRotations(dist, wheelDiameter);		const comp = components(startPoint, end, sx, sy);		set('n-dist', dist.toFixed(1), true);		set('n-ang', ang.toFixed(1), true);		set('n-rot', r.toFixed(2), true);		set('n-deg', wheelDegrees(r).toFixed(1), true);		set('n-h', comp.h.toFixed(1), true);		set('n-v', comp.v.toFixed(1), true);	} else {		set('n-dist', dash, false); set('n-ang', dash, false); set('n-rot', dash, false);		set('n-deg', dash, false); set('n-h', dash, false); set('n-v', dash, false);	}
}
function onPointerDown(x, y) {	if (currentMode === 'normal') onNormalDown(x, y);	else if (currentMode === 'odometry') onOdoDown(x, y);	else if (currentMode === 'route') onRouteDown(x, y);}
function onNormalDown(x, y) {	if (edgeMeasureMode) {
		edgeLines.push({ edge: edgeMeasureMode, px: x, py: y }
	);
		edgeMeasureMode = null;
		scheduleDraw();
		return;
	}
	if (!startPoint) { startPoint = { x, y }
	; endPoint = null; }
	else { endPoint = { x, y }
	; lines.push({ start: { x: startPoint.x, y: startPoint.y }
	, end: { x: endPoint.x, y: endPoint.y }
	}); startPoint = null; endPoint = null; }
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
function drawOdometry() {	if (odometryOrigin) {		const angleRad = (odometryOriginAngle * Math.PI) / 180;		const len = Math.max(canvasW, canvasH) * 1.2;		const xDir = { x: Math.cos(angleRad), y: Math.sin(angleRad) }
;		const yDir = { x: Math.sin(angleRad), y: -Math.cos(angleRad) }
;		ctx.save();		ctx.strokeStyle = LINE.axis; ctx.lineWidth = 2; ctx.setLineDash([6, 5]);		ctx.beginPath();		ctx.moveTo(odometryOrigin.x, odometryOrigin.y);		ctx.lineTo(odometryOrigin.x + xDir.x * len, odometryOrigin.y + xDir.y * len);		ctx.moveTo(odometryOrigin.x, odometryOrigin.y);		ctx.lineTo(odometryOrigin.x + yDir.x * len, odometryOrigin.y + yDir.y * len);		ctx.stroke();		ctx.restore();		ctx.fillStyle = LINE.axis;		ctx.beginPath(); ctx.arc(odometryOrigin.x, odometryOrigin.y, 6, 0, Math.PI * 2); ctx.fill();		ctx.strokeStyle = LINE.dark; ctx.lineWidth = 2; ctx.stroke();		if (isAngleIndicatorActive && isMouseOver) {			const r = 60;			ctx.save();			ctx.strokeStyle = LINE.helper; ctx.lineWidth = 2; ctx.setLineDash([6, 5]);			ctx.beginPath(); ctx.arc(odometryOrigin.x, odometryOrigin.y, r, 0, (odometryOriginAngle * Math.PI) / 180); ctx.stroke();			ctx.restore();			const snapped = snapAngle(odometryOriginAngle);			if (Math.abs(snapped - odometryOriginAngle) < 15) drawChip(snapped + '°', odometryOrigin.x, odometryOrigin.y - 80, LINE.helper);		}		if (isMouseOver) {			const rot = calculateRotatedCoordinates(mousePos.x, mousePos.y, odometryOrigin.x, odometryOrigin.y, odometryOriginAngle, sx, sy);			const dist = odometryDistanceFromOrigin(rot.odoX, rot.odoY);			const a = Math.atan2(mousePos.y - odometryOrigin.y, mousePos.x - odometryOrigin.x) * 180 / Math.PI;			drawChip('X ' + rot.odoX.toFixed(1) + '  Y ' + rot.odoY.toFixed(1) + ' mm', mousePos.x, mousePos.y - 18, LINE.axis);			drawChip('∠ ' + a.toFixed(1) + '°', mousePos.x, mousePos.y + 16, LINE.helper);			updateOdoReadouts(rot.odoX, rot.odoY, dist);		}	}
}
function updateOdoReadouts(x, y, dist) {	const set = (id, v) => { const e = sel(id); if (e) e.textContent = v; }
;	set('o-x', x.toFixed(1) + ' mm');	set('o-y', y.toFixed(1) + ' mm');	set('o-ang', odometryOriginAngle.toFixed(1) + '°');	set('o-dist', dist.toFixed(1) + ' mm');	set('o-origin', odometryOrigin ? 'set (click to reset)' : 'click field to place origin');}
function onOdoDown(x, y) {	if (!odometryOrigin) {		odometryOrigin = { x, y }
; odometryOriginAngle = 0; isAngleIndicatorActive = true;		scheduleDraw(); updatePanel(); return;	}	if (isAngleIndicatorActive) {		const dx = x - odometryOrigin.x; const dy = y - odometryOrigin.y;		let angle = (Math.atan2(dy, dx) * 180) / Math.PI;		odometryOriginAngle = ((angle - 90) % 360 + 360) % 360;		const snapped = snapAngle(odometryOriginAngle);		if (Math.abs(snapped - odometryOriginAngle) < 15) odometryOriginAngle = snapped;		isAngleIndicatorActive = false;		scheduleDraw(); updatePanel(); return;	}	// add point at click
	if (!routePoints.some(p => Math.hypot(p.x - x, p.y - y) < SNAP_THRESHOLD_PX)) routePoints.push({ x, y }
);	scheduleDraw(); updatePanel();}
function snapAngle(a) { return Math.round(a / ANGLE_SNAP_STEP) * ANGLE_SNAP_STEP; }
// Rebuild route line segments from the current
// waypoints (kept in sync while dragging).
function rebuildRouteLines() {	routeLines = [];	for (let i = 1; i < routePoints.length; i++) {		routeLines.push({ start: routePoints[i - 1], end: routePoints[i] }
);	}
}
// ---------------------------------------------------------------------------// Route mode// ---------------------------------------------------------------------------
function drawRoute() {	if (routeOrigin) {		ctx.fillStyle = LINE.halo;		ctx.beginPath(); ctx.arc(routeOrigin.x, routeOrigin.y, 6, 0, Math.PI * 2); ctx.fill();		ctx.strokeStyle = LINE.helper; ctx.lineWidth = 2; ctx.stroke();		ctx.fillStyle = LINE.dark; ctx.font = 'bold 10px monospace'; ctx.textAlign = 'center';		ctx.fillText('O', routeOrigin.x, routeOrigin.y - 10);	}	routeLines.forEach(l => drawLine(l.start.x, l.start.y, l.end.x, l.end.y, LINE.route, 3, [], false));	// pending line from last point to mouse
	const last = routePoints.length ? routePoints[routePoints.length - 1] : (routeOrigin || null);	if (last && isMouseOver) {		drawLine(last.x, last.y, mousePos.x, mousePos.y, LINE.route, 3, [6, 5], true);	}	if (routePendingLine) drawLine(routePendingLine.start.x, routePendingLine.start.y, routePendingLine.end.x, routePendingLine.end.y, LINE.route, 3, [6, 5], true);	routePoints.forEach((p, i) => {		const hovered = i === hoveredNodeIndex; const dragged = i === draggedNodeIndex;		const r = dragged ? 7 : hovered ? 6 : 5;		ctx.fillStyle = LINE.halo;		ctx.beginPath(); ctx.arc(p.x, p.y, r, 0, Math.PI * 2); ctx.fill();		ctx.strokeStyle = dragged ? LINE.axis : LINE.helper; ctx.lineWidth = dragged ? 3 : 2; ctx.stroke();		ctx.fillStyle = LINE.dark; ctx.font = 'bold 10px monospace'; ctx.textAlign = 'center';		ctx.fillText(String(i + 1), p.x, p.y - 9);	}
);	if (draggedNodeIndex !== null || hoveredNodeIndex !== null) {		drawChip('Drag node · Escape to cancel', canvasW / 2, 30, LINE.helper);	}
}
function onRouteDown(x, y) {	const hit = routePoints.findIndex(p => Math.hypot(p.x - x, p.y - y) < SNAP_THRESHOLD_PX);	if (hit >= 0) { hoveredNodeIndex = hit; draggedNodeIndex = hit; scheduleDraw(); updatePanel(); return; }	if (!routeOrigin) { routeOrigin = { x, y }
; routePoints = [{ x, y }
]; scheduleDraw(); updatePanel(); return; }	routePoints.push({ x, y }
);	if (routePoints.length >= 2) routeLines.push({ start: routePoints[routePoints.length - 2], end: routePoints[routePoints.length - 1] }
);	routePendingLine = null;	scheduleDraw(); updatePanel();}
// ---------------------------------------------------------------------------//
// Panels (rebuilt on mode change only)
// ---------------------------------------------------------------------------
function updatePanel() {	const panel = sel('mode-panel');	if (!panel) return;	const field = currentField();	if (currentMode === 'normal') {		panel.innerHTML = normalPanelHTML();		wireNormalPanel();	} else if (currentMode === 'odometry') {		panel.innerHTML = odometryPanelHTML();		wireOdometryPanel();		updateOdoReadouts(0, 0, 0);	} else {		panel.innerHTML = routePanelHTML();		wireRoutePanel();	}	renderSavedLines();	renderSavedRoutes();}
function esc(id) { return String(id).replace(/[&<>"']/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' })[c]); }function buttonsHTML() {	return `
		<div class="btn-group btn-row">
			<button class="btn btn-secondary btn-full" id="btn-new-line">New Line</button>
			<button class="btn btn-secondary btn-full" id="btn-delete-last">Delete Last</button>
			<button class="btn btn-outline btn-full" id="btn-clear-all">Clear All</button>
		</div>
		`;}function confirmHTML() {	return `		<div class="confirm-row">			<span class="confirm-text">Clear all measured lines?</span>			<button class="btn btn-outline btn-small" id="btn-confirm-cancel">Cancel</button>			<button class="btn btn-outline btn-small" id="btn-confirm-ok">Clear</button>		</div>	`;}function normalPanelHTML() {	const field = currentField();	return `		<section class="section open">			<div class="section-header"><h3>Measure</h3><div class="section-toggle"></div></div>			<div class="section-body">				<div class="readout"><span class="label">Distance</span><kbd id="n-dist"><span class="value">–</span><span class="unit">mm</span></kbd></div>				<div class="readout"><span class="label">Angle</span><kbd id="n-ang"><span class="value">–</span><span class="unit">°</span></kbd></div>				<div class="readout"><span class="label">Rotations</span><kbd id="n-rot"><span class="value">–</span></kbd></div>				<div class="readout"><span class="label">Degrees</span><kbd id="n-deg"><span class="value">–</span><span class="unit">°</span></kbd></div>				<div class="readout"><span class="label">Horizontal</span><kbd id="n-h"><span class="value">–</span><span class="unit">mm</span></kbd></div>				<div class="readout"><span class="label">Vertical</span><kbd id="n-v"><span class="value">–</span><span class="unit">mm</span></kbd></div>				${buttonsHTML()}				<div class="view-section">					<h3 class="view-heading">View</h3>					<div class="view-row">						<span>Right triangle</span>						<span class="view-hint">Show horizontal and vertical legs</span>						<button role="switch" aria-checked=${showTriangle} class="switch" id="sw-tri"></button>					</div>					</div>			</div>		</section>	`;}function wireNormalPanel() {	const bind = (id, fn) => { const b = sel(id); if (b) b.addEventListener('click', fn); };	bind('btn-new-line', () => { startPoint = null; endPoint = null; scheduleDraw(); updatePanel(); });	bind('btn-delete-last', () => { lines.pop(); startPoint = null; endPoint = null; scheduleDraw(); updatePanel(); });	bind('btn-clear-all', clearAllLines);
	/* View switches: clicking the whole row toggles the switch; the switch itself handles Space/Enter natively. */	bind('sw-tri', () => { showTriangle = !showTriangle; scheduleDraw(); updatePanel(); });	Array.from(document.querySelectorAll('.view-row')).forEach(row => {		row.addEventListener('click', (e) => {			if (e.target.closest('button')) return; /* the switch button has its own handler */			const sw = row.querySelector('.switch');			if (sw) sw.click();		}, true);	});}function odometryPanelHTML() {	return `	<section class="section open">		<div class="section-header"><h3>Odometry</h3><div class="section-toggle"></div></div>		<div class="section-body">			<div class="readout"><span class="label">Origin</span><span id="o-origin">click field to place origin</span></div>			<div class="readout"><span class="label">X</span><kbd id="o-x">-- mm</kbd></div>			<div class="readout"><span class="label">Y</span><kbd id="o-y">-- mm</kbd></div>			<div class="readout"><span class="label">Angle</span><kbd id="o-ang">-- °</kbd></div>			<div class="readout"><span class="label">Dist from origin</span><kbd id="o-dist">-- mm</kbd></div>			<div class="btn-group">				<button class="btn btn-primary btn-small btn-full" id="btn-o-reset">Reset Origin</button>				<button class="btn btn-secondary btn-small btn-full" id="btn-o-add-point">Add Point</button>				<button class="btn btn-secondary btn-small btn-full" id="btn-o-add-line">Add Line</button>			</div>			<div class="btn-group mt-2">				<button class="btn btn-secondary btn-small btn-full" id="btn-o-record">Record</button>				<button class="btn btn-secondary btn-small btn-full" id="btn-o-stop" disabled>Stop</button>				<button class="btn btn-secondary btn-small btn-full" id="btn-o-copy" disabled>Copy</button>			</div>			<textarea id="o-python" readonly class="py-output">[ ]</textarea>		</div>	</section>`;}let recordingPoints = [];function wireOdometryPanel() {	const bind = (id, fn) => { const b = sel(id); if (b) b.addEventListener('click', fn); };	bind('btn-o-reset', () => { odometryOrigin = null; odometryOriginAngle = 0; isAngleIndicatorActive = false; routePoints = []; routeLines = []; scheduleDraw(); updatePanel(); });	bind('btn-o-record', startRecording);	bind('btn-o-stop', stopRecording);	bind('btn-o-copy', copyPython);}function startRecording() { recordingPoints = []; setBtn('btn-o-record', true); setBtn('btn-o-stop', false); setBtn('btn-o-copy', true); updatePanel(); }function stopRecording() { setBtn('btn-o-record', false); setBtn('btn-o-stop', true); setBtn('btn-o-copy', recordingPoints.length === 0); updatePanel(); }function setBtn(id, disabled) { const b = sel(id); if (b) b.disabled = disabled; }function copyPython() {	const ta = sel('o-python'); if (!ta.value) return;	navigator.clipboard.writeText(ta.value).then(() => {		const b = sel('btn-o-copy'); const old = b.textContent;		b.textContent = 'Copied!'; setTimeout(() => { b.textContent = old; }, 2000);	});}function routePanelHTML() {	return `	<section class="section open">		<div class="section-header"><h3>Route</h3><div class="section-toggle"></div></div>		<div class="section-body">			<div class="readout"><span class="label">Origin</span><span id="r-origin">${routeOrigin ? 'set' : 'click field to set origin'}</span></div>			<div class="readout"><span class="label">Waypoints</span><kbd id="r-count">${routePoints.length}</kbd></div>			<div class="btn-group">				<button class="btn btn-secondary btn-small btn-full" id="btn-r-clear-route">Clear Route</button>				<button class="btn btn-primary btn-small btn-full" id="btn-r-save-route" ${routeOrigin && routePoints.length ? '' : 'disabled'}>Save Route</button>			</div>			<div class="btn-group mt-2">				<button class="btn btn-secondary btn-small btn-full" id="btn-r-unload">Unload</button>				<button class="btn btn-danger btn-small btn-full" id="btn-r-delete-all">Delete All</button>			</div>			<div class="empty" id="r-list-hint">Route nodes shown on field</div>		</div>	</section>	<section class="section open">		<div class="section-header"><h3>Saved Routes</h3><div class="section-toggle"></div></div>		<div class="section-body" id="saved-routes-body"><div class="empty">No saved routes</div></div>		<div class="btn-group">			<button class="btn btn-secondary btn-small btn-full" id="btn-r-delete-all-routes">Delete All</button>		</div>	</section>`;}function wireRoutePanel() {	const bind = (id, fn) => { const b = sel(id); if (b) b.addEventListener('click', fn); };	bind('btn-r-clear-route', () => { routeOrigin = null; routePoints = []; routeLines = []; routePendingLine = null; hoveredNodeIndex = null; draggedNodeIndex = null; scheduleDraw(); updatePanel(); });	bind('btn-r-save-route', saveCurrentRoute);	bind('btn-r-unload', () => { routeOrigin = null; routePoints = []; routeLines = []; routePendingLine = null; hoveredNodeIndex = null; draggedNodeIndex = null; scheduleDraw(); updatePanel(); });	bind('btn-r-delete-all-routes', () => { deleteAllRoutes(selection.competition, selection.year, selection.category); renderSavedRoutes(); });}function saveCurrentRoute() {	if (!routeOrigin || routePoints.length === 0) return;	const now = new Date();	const r = {		name: now.toLocaleDateString() + ' ' + now.toLocaleTimeString(),		timestamp: now.toISOString(),		origin: { xMM: toMMx(routeOrigin.x, sx), yMM: toMMy(routeOrigin.y, sy) },		points: routePoints.map(p => ({ xMM: toMMx(p.x, sx), yMM: toMMy(p.y, sy) })),		lines: routeLines.map(l => ({ start: { xMM: toMMx(l.start.x, sx), yMM: toMMy(l.start.y, sy) }, end: { xMM: toMMx(l.end.x, sx), yMM: toMMy(l.end.y, sy) } })),	};	const routes = getRoutes(selection.competition, selection.year, selection.category);	routes.push(r);	saveRoutes(selection.competition, selection.year, selection.category, routes);	renderSavedRoutes();	updatePanel();}// ---------------------------------------------------------------------------
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

function renderSavedRoutes() {
    const body = sel("saved-routes-body");
    if (!body) return;
    const routes = getRoutes(selection.competition, selection.year, selection.category);
    body.innerHTML = "";
    if (routes.length === 0) {
        body.innerHTML = '<div class="empty">No saved routes</div>';
        return;
    }
    routes.slice().reverse().forEach((rt, i) => {
        const realIdx = routes.length - 1 - i;
        const div = document.createElement("div");
        div.className = "saved-item";
        div.innerHTML = `<div><div class="name">${esc(rt.name)}</div><div class="meta">${rt.points.length} pts ${rt.approx ? "→mm" : ""}</div></div><div class="chip-actions"><button class="btn btn-secondary btn-small" onclick="appLoadRoute(${realIdx})">Load</button><button class="btn btn-danger btn-small" onclick="appDeleteRoute(${realIdx})">X</button></div>`;
        body.appendChild(div);
    });
}

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