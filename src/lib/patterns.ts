// Generates small repeating fill patterns per polity colour, used for uncertain or soft zones:
//   hatch – diagonal lines  (zones of influence, low-confidence approximate extents)
//   dots  – dot grid        (cultural / archaeological zones)
//   cross – cross-hatching  (military occupation)
export type PatternKind = 'hatch' | 'dots' | 'cross';

const SIZE = 12; // CSS pixels
const RATIO = 2;

export function makePattern(kind: PatternKind, color: string): ImageData {
  const px = SIZE * RATIO;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = px;
  const ctx = canvas.getContext('2d')!;
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.lineWidth = 1.4 * RATIO;
  ctx.lineCap = 'square';

  const diag = (dir: 1 | -1) => {
    // Three strokes so the pattern tiles seamlessly across cell edges.
    for (const off of [-px, 0, px]) {
      ctx.beginPath();
      if (dir === 1) {
        ctx.moveTo(off, px);
        ctx.lineTo(off + px, 0);
      } else {
        ctx.moveTo(off, 0);
        ctx.lineTo(off + px, px);
      }
      ctx.stroke();
    }
  };

  if (kind === 'hatch') diag(1);
  if (kind === 'cross') {
    diag(1);
    diag(-1);
  }
  if (kind === 'dots') {
    const r = 1.6 * RATIO;
    for (const [x, y] of [
      [px / 4, px / 4],
      [(3 * px) / 4, (3 * px) / 4],
    ]) {
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  return ctx.getImageData(0, 0, px, px);
}

export const PATTERN_RATIO = RATIO;
export const patternId = (kind: PatternKind, polity: string) => `${kind}-${polity}`;
