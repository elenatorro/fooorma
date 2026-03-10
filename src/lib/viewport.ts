/** Minimum zoom level (5%). */
export const MIN_ZOOM = 0.05

/** Maximum zoom level (2000%). */
export const MAX_ZOOM = 20

/**
 * Maximum canvas render scale (zoom × devicePixelRatio capped here).
 * Higher values keep shapes crisp when zooming in, at the cost of more memory.
 * At scale 6 with an A4 artboard (794×1123), the canvas bitmap tops out at ~6740×4764px.
 */
export const MAX_RENDER_SCALE = 6
