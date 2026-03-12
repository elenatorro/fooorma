const SIZES = [9, 10, 11, 12, 13, 14, 16, 18, 20]
const KEY = 'fooorma_code_font'

export function initEditorFont() {
  const saved = parseInt(localStorage.getItem(KEY) ?? '11') || 11
  document.documentElement.style.setProperty('--cm-font-size', `${saved}px`)
}

export function getEditorFontSize(): number {
  return parseInt(localStorage.getItem(KEY) ?? '11') || 11
}

export function adjustEditorFontSize(delta: 1 | -1): void {
  const current = parseInt(document.documentElement.style.getPropertyValue('--cm-font-size') || '11') || 11
  const idx = SIZES.indexOf(current)
  const base = idx === -1 ? SIZES.findIndex(s => s > current) - 1 : idx
  const next = SIZES[Math.max(0, Math.min(SIZES.length - 1, base + delta))] ?? current
  document.documentElement.style.setProperty('--cm-font-size', `${next}px`)
  localStorage.setItem(KEY, String(next))
}
