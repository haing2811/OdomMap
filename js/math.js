// OdomMap math — pixel <-> millimetre conversion and measurement helpers.
// Uses SEPARATE x and y scale factors (one shared scale would distort the
// ENJOY AI field whose image aspect differs from its field aspect).
// For WRO fields image aspect == field aspect, so sx == sy in practice.

export function computeScales(field, canvasWpx, canvasHpx) {
	const { widthMM, heightMM, imageBoundsPx } = field;
	const bounds = imageBoundsPx || { x: 0, y: 0, w: canvasWpx, h: canvasHpx };

	// pxPerMm per axis: how many canvas pixels represent one millimetre.
	// Maps the field rectangle (widthMM x heightMM) onto the canvas drawing
	// area (canvasWpx x canvasHpx). imageBoundsPx lets the field rectangle
	// be pointed at a sub-region of the image later (TODO: not calibrated yet).
	const sx = canvasWpx / widthMM;
	const sy = canvasHpx / heightMM;

	return { sx, sy, widthMM, heightMM };
}

// Convert canvas px -> mm per axis.
export function toMMx(px, sx) { return px / sx; }
export function toMMy(px, sy) { return px / sy; }

// Convert mm -> canvas px per axis.
export function toCanvasX(mm, sx) { return mm * sx; }
export function toCanvasY(mm, sy) { return mm * sy; }

// Distance between two canvas points in mm (anisotropic-aware).
export function calculateDistance(p1, p2, sx, sy) {
	const dx = toMMx(p2.x - p1.x, sx);
	const dy = toMMy(p2.y - p1.y, sy);
	return Math.sqrt(dx * dx + dy * dy);
}

// Signed angle of the line from p1 to p2, degrees (atan2 on mm deltas).
export function calculateAngle(p1, p2, sx, sy) {
	const dx = toMMx(p2.x - p1.x, sx);
	const dy = toMMy(p2.y - p1.y, sy);
	return (Math.atan2(dy, dx) * 180) / Math.PI;
}

// Acute reference angle (smallest angle vs horizontal, 0..90).
export function referenceAngle(p1, p2, sx, sy) {
	let angle = Math.abs(calculateAngle(p1, p2, sx, sy));
	if (angle > 90) angle = 180 - angle;
	return angle;
}

// Wheel rotations and degrees for a distance (mm).
export function wheelRotations(distMM, wheelDiameterMM) {
	return distMM / (wheelDiameterMM * Math.PI);
}
export function wheelDegrees(rotations) {
	return rotations * 360;
}

// Horizontal / vertical components in mm (absolute).
export function components(p1, p2, sx, sy) {
	return {
		h: Math.abs(toMMx(p2.x - p1.x, sx)),
		v: Math.abs(toMMy(p2.y - p1.y, sy)),
	};
}

// Odometry: rotated coordinates of (canvasX, canvasY) relative to origin,
// in mm, with the Y-axis rotated by odometryOriginAngle degrees.
export function calculateRotatedCoordinates(canvasX, canvasY, originX, originY, angleDeg, sx, sy) {
	const dx = toMMx(canvasX - originX, sx);
	const dy = toMMy(canvasY - originY, sy);
	const angleRad = (angleDeg * Math.PI) / 180;
	// X-axis points at angle; Y-axis points at angle-90 deg from X.
	const odoX = (dx * Math.cos(angleRad) + dy * Math.sin(angleRad));
	const odoY = (dx * Math.sin(angleRad) - dy * Math.cos(angleRad));
	return { odoX, odoY };
}

// Distance from origin to point in mm (odometry), using rotated frame.
export function odometryDistanceFromOrigin(odoX, odoY) {
	return Math.sqrt(odoX * odoX + odoY * odoY);
}

// Edge distance from a canvas point to each field border (in mm).
export function edgeDistances(xPx, yPx, canvasWpx, canvasHpx, sx, sy) {
	return {
		top: toMMy(yPx, sy),
		bottom: toMMy(canvasHpx - yPx, sy),
		left: toMMx(xPx, sx),
		right: toMMx(canvasWpx - xPx, sx),
	};
}

// ---------------------------------------------------------------------------
// Odometry coordinate convention (mm, field coords: x right, y down).
// All stored data stays in mm; px<->mm conversion happens per axis via sx/sy
// only at the pointer/draw boundary. Heading h: 0 = screen up, clockwise
// positive, normalized to (-180, 180].
//
// Forward unit f = (sin h, -cos h); Right unit r = (cos h, sin h).
// For a field point P relative to origin O (d = P - O):
//   Y = d . f = dx*sin h - dy*cos h   (forward)
//   X = d . r = dx*cos h + dy*sin h   (right of the heading)
// The (X,Y) matrix [[cos,sin],[sin,-cos]] is symmetric and self-inverse, so
// (X,Y) -> field mm round-trips exactly.
// This matches the HEAD rotated-coordinate formulas (same products of cos/sin).
// ---------------------------------------------------------------------------

const DEG = Math.PI / 180;

// Normalize a heading to (-180, 180].
export function normalizeHeading(h) {
	let a = ((h % 360) + 360) % 360; // [0, 360)
	if (a > 180) a -= 360;          // (-180, 180]
	return a;
}

// Forward and right unit vectors for a heading (screen coords, y down).
export function headingVectors(hDeg) {
	const h = normalizeHeading(hDeg) * DEG;
	return {
		f: { x: Math.sin(h), y: -Math.cos(h) }, // forward (screen up at h = 0)
		r: { x: Math.cos(h), y: Math.sin(h) },  // right of the heading
	};
}

// Canvas px -> odometry (X, Y) mm relative to origin in the heading frame.
export function fieldToXY(px, py, originPx, originPy, headingDeg, sx, sy) {
	const dx = toMMx(px - originPx, sx);
	const dy = toMMy(py - originPy, sy);
	const { f, r } = headingVectors(headingDeg);
	return {
		X: dx * r.x + dy * r.y,
		Y: dx * f.x + dy * f.y,
	};
}

// Odometry (X, Y) mm -> field mm (inverse of fieldToXY; self-inverse reflection).
export function XYToFieldMm(X, Y, originMm, headingDeg) {
	const { f, r } = headingVectors(headingDeg);
	const dx = X * r.x + Y * f.x;
	const dy = X * r.y + Y * f.y;
	return { x: originMm.x + dx, y: originMm.y + dy };
}

// Distance from the origin to a point, mm.
export function distanceFromOrigin(X, Y) { return Math.hypot(X, Y); }

// Bearing from the heading, degrees, clockwise positive.
export function bearingFromHeading(X, Y) {
	return normalizeHeading(Math.atan2(X, Y) * 180 / Math.PI);
}

// Absolute heading (0 = screen up, clockwise positive) of travel from A to B.
export function segmentHeading(ax, ay, bx, by) {
	return normalizeHeading(Math.atan2(bx - ax, -(by - ay)) * 180 / Math.PI);
}

// Segment length between two field points, mm (anisotropy-aware via sx/sy).
export function segmentLength(ax, ay, bx, by, sx, sy) {
	return calculateDistance({ x: ax, y: ay }, { x: bx, y: by }, sx, sy);
}

// Signed turn at a point: change from previous direction to this direction,
// normalized to (-180, 180], clockwise positive. For the first segment the
// "previous direction" is the origin heading.
export function turnAtPoint(prevHeadingDeg, thisHeadingDeg) {
	return normalizeHeading(thisHeadingDeg - prevHeadingDeg);
}

// Rotate a stored (X, Y) point by deltaDeg about the origin (standard rotation).
export function rotateXY(X, Y, deltaDeg) {
	const d = normalizeHeading(deltaDeg) * DEG;
	const c = Math.cos(d);
	const s = Math.sin(d);
	return { X: X * c - Y * s, Y: X * s + Y * c };
}
