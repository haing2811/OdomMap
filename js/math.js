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
