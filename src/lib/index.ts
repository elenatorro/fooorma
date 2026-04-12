/**
 * Fooorma — standalone procedural art library.
 *
 * Evaluate code strings into shapes and render them onto a Canvas2D context.
 */

import { evaluateQuery } from './query/index'
import { renderLayers2D } from './layers/renderer2d'
import { BUILTIN_PALETTES } from './palettes/index'
import type { Layer, Pattern } from './layers/types'

export { evaluateQuery }
export type { QueryResult } from './query/index'
export { renderLayers2D }
export { BUILTIN_PALETTES }
export type { Palette } from './palettes/index'
export type {
  Shape,
  ShapeType,
  ShapeColor,
  ShapeStroke,
  ShapeGeom,
  ShapeTransform,
  ShapeEffect,
  Layer,
  Pattern,
  Gradient,
  LinearGradient,
  RadialGradient,
  ColorStop,
  Material3D,
} from './layers/types'

/**
 * Convenience: evaluate code and render onto a canvas in one call.
 *
 * @param code      Fooorma code string
 * @param canvas    Target canvas element
 * @param options   Optional overrides
 * @returns         The shapes and any errors from evaluation
 */
export function render(
  code: string,
  canvas: HTMLCanvasElement,
  options: {
    artW?: number
    artH?: number
    scale?: number
    bgColor?: string
    palettes?: { name: string; colors: string[] }[]
    stamps?: Pattern[]
  } = {},
) {
  const artW = options.artW ?? 794
  const artH = options.artH ?? 1123
  const scale = options.scale ?? 1

  canvas.width = artW * scale
  canvas.height = artH * scale

  const ctx = canvas.getContext('2d')!
  ctx.setTransform(scale, 0, 0, scale, 0, 0)

  const palettes = options.palettes ?? []
  const stamps = options.stamps ?? []

  const result = evaluateQuery(code, artW, artH, palettes, stamps)

  const layer: Layer = {
    id: 'lib-layer',
    name: 'Layer',
    visible: true,
    bgColor: options.bgColor,
    mode: 'code',
    shapes: result.shapes,
    query: code,
  }

  renderLayers2D(ctx, [layer], artW, artH)

  return result
}
