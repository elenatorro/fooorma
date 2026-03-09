/** Minimum zoom level (5%). */
export const MIN_ZOOM = 0.05

/** Maximum zoom level (2000%). */
export const MAX_ZOOM = 20

/**
 * Maximum canvas render scale (zoom × devicePixelRatio capped here).
 * Prevents the canvas bitmap from exceeding ~4096px on the long side at any zoom,
 * keeping memory usage bounded. Visual zoom (CSS transform) is unaffected.
 */
export const MAX_RENDER_SCALE = 4
