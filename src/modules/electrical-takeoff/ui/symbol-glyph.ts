/** Packed 64×64 1-bit mask (row-major, MSB first) to ImageData. Empty when the payload is not a mask. */
export function maskB64ToImageData(maskB64: string, colorHex = '#111827'): ImageData | null {
  const raw = maskB64.trim();
  if (!raw) return null;
  let bytes: Uint8Array;
  try {
    const binary = atob(raw);
    bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  } catch {
    return null;
  }
  if (bytes.length < 512) return null;
  const rgb = hexToRgb(colorHex);
  const data = new Uint8ClampedArray(64 * 64 * 4);
  let ink = 0;
  for (let i = 0; i < 64 * 64; i += 1) {
    const bit = (bytes[Math.floor(i / 8)]! >> (7 - (i % 8))) & 1;
    const o = i * 4;
    if (bit) {
      data[o] = rgb[0];
      data[o + 1] = rgb[1];
      data[o + 2] = rgb[2];
      data[o + 3] = 255;
      ink += 1;
    } else {
      data[o] = 255;
      data[o + 1] = 255;
      data[o + 2] = 255;
      data[o + 3] = 255;
    }
  }
  if (ink < 8) return null;
  return new ImageData(data, 64, 64);
}

function hexToRgb(hex: string): [number, number, number] {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m?.[1]) return [17, 24, 39];
  const n = Number.parseInt(m[1], 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
