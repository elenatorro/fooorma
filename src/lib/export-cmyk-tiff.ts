/**
 * Encode an RGB ImageData as an uncompressed CMYK TIFF.
 * Uses naive RGB→CMYK conversion (no ICC profile).
 */
export function encodeCmykTiff(imageData: ImageData): Blob {
  const { width, height, data } = imageData
  const pixelCount = width * height

  // ── RGB → CMYK conversion ────────────────────────────────────────────────
  const cmyk = new Uint8Array(pixelCount * 4)
  for (let i = 0; i < pixelCount; i++) {
    const ri = i * 4
    const r = data[ri] / 255
    const g = data[ri + 1] / 255
    const b = data[ri + 2] / 255

    const k = 1 - Math.max(r, g, b)
    if (k >= 1) {
      cmyk[i * 4]     = 0    // C
      cmyk[i * 4 + 1] = 0    // M
      cmyk[i * 4 + 2] = 0    // Y
      cmyk[i * 4 + 3] = 255  // K
    } else {
      const inv = 1 / (1 - k)
      cmyk[i * 4]     = Math.round(((1 - r - k) * inv) * 255)
      cmyk[i * 4 + 1] = Math.round(((1 - g - k) * inv) * 255)
      cmyk[i * 4 + 2] = Math.round(((1 - b - k) * inv) * 255)
      cmyk[i * 4 + 3] = Math.round(k * 255)
    }
  }

  // ── TIFF encoding (uncompressed, big-endian) ─────────────────────────────
  // IFD entries for CMYK TIFF
  const ifdEntries = [
    // tag, type, count, value
    [256, 3, 1, width],            // ImageWidth        (SHORT)
    [257, 3, 1, height],           // ImageLength       (SHORT)
    [258, 3, 4, 0],               // BitsPerSample     (4 x SHORT, offset later)
    [259, 3, 1, 1],               // Compression       (None)
    [262, 3, 1, 5],               // PhotometricInterp (CMYK = 5)
    [273, 4, 1, 0],               // StripOffsets      (LONG, patched later)
    [277, 3, 1, 4],               // SamplesPerPixel   (4)
    [278, 3, 1, height],          // RowsPerStrip      (all rows in one strip)
    [279, 4, 1, pixelCount * 4],  // StripByteCounts   (LONG)
    [282, 5, 1, 0],               // XResolution       (RATIONAL, offset later)
    [283, 5, 1, 0],               // YResolution       (RATIONAL, offset later)
    [296, 3, 1, 2],               // ResolutionUnit    (inch)
    [338, 3, 1, 0],               // ExtraSamples      — not needed for 4-channel CMYK
  ]
  // Remove ExtraSamples — CMYK with 4 samples doesn't need it
  ifdEntries.pop()

  const numEntries = ifdEntries.length
  // Layout:
  //   0–7:    TIFF header (8 bytes)
  //   8–9:    IFD entry count (2 bytes)
  //   10...:  IFD entries (12 bytes each)
  //   after:  next-IFD pointer (4 bytes)
  //   then:   BitsPerSample data (8 bytes)
  //   then:   XResolution rational (8 bytes)
  //   then:   YResolution rational (8 bytes)
  //   then:   pixel data
  const ifdOffset = 8
  const ifdSize = 2 + numEntries * 12 + 4
  const extraDataOffset = ifdOffset + ifdSize
  const bpsOffset = extraDataOffset           // 4 shorts = 8 bytes
  const xresOffset = bpsOffset + 8            // rational = 8 bytes
  const yresOffset = xresOffset + 8           // rational = 8 bytes
  const pixelDataOffset = yresOffset + 8

  const totalSize = pixelDataOffset + pixelCount * 4
  const buf = new ArrayBuffer(totalSize)
  const view = new DataView(buf)
  const bytes = new Uint8Array(buf)

  // ── Header ──
  view.setUint16(0, 0x4D4D)         // Big-endian ("MM")
  view.setUint16(2, 42)             // TIFF magic
  view.setUint32(4, ifdOffset)      // Offset to first IFD

  // ── IFD ──
  let pos = ifdOffset
  view.setUint16(pos, numEntries); pos += 2

  // Patch offset values
  ifdEntries[2][3] = bpsOffset      // BitsPerSample offset
  ifdEntries[5][3] = pixelDataOffset // StripOffsets
  ifdEntries[9][3] = xresOffset     // XResolution offset
  ifdEntries[10][3] = yresOffset    // YResolution offset

  for (const [tag, type, count, value] of ifdEntries) {
    view.setUint16(pos, tag);     pos += 2
    view.setUint16(pos, type);    pos += 2
    view.setUint32(pos, count);   pos += 4
    // Value/offset field (4 bytes)
    if (type === 3 && count === 1) {
      // SHORT: value in first 2 bytes of the 4-byte field
      view.setUint16(pos, value); pos += 4
    } else {
      view.setUint32(pos, value); pos += 4
    }
  }
  // Next IFD offset (0 = no more IFDs)
  view.setUint32(pos, 0)

  // ── BitsPerSample: 8, 8, 8, 8 ──
  view.setUint16(bpsOffset, 8)
  view.setUint16(bpsOffset + 2, 8)
  view.setUint16(bpsOffset + 4, 8)
  view.setUint16(bpsOffset + 6, 8)

  // ── XResolution: 300/1 ──
  view.setUint32(xresOffset, 300)
  view.setUint32(xresOffset + 4, 1)

  // ── YResolution: 300/1 ──
  view.setUint32(yresOffset, 300)
  view.setUint32(yresOffset + 4, 1)

  // ── Pixel data ──
  bytes.set(cmyk, pixelDataOffset)

  return new Blob([buf], { type: 'image/tiff' })
}

/**
 * Simulate CMYK soft-proof: RGB → CMYK → RGB round-trip.
 * Mutates the ImageData in-place.
 */
export function applyCmykSoftProof(imageData: ImageData): void {
  const { data } = imageData
  for (let i = 0; i < data.length; i += 4) {
    const r = data[i] / 255
    const g = data[i + 1] / 255
    const b = data[i + 2] / 255

    const k = 1 - Math.max(r, g, b)
    let c: number, m: number, y: number
    if (k >= 1) {
      c = 0; m = 0; y = 0
    } else {
      const inv = 1 / (1 - k)
      c = (1 - r - k) * inv
      m = (1 - g - k) * inv
      y = (1 - b - k) * inv
    }

    // CMYK → RGB
    data[i]     = Math.round(255 * (1 - c) * (1 - k))
    data[i + 1] = Math.round(255 * (1 - m) * (1 - k))
    data[i + 2] = Math.round(255 * (1 - y) * (1 - k))
    // alpha unchanged
  }
}
