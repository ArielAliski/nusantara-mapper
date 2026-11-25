// Piecewise-linear mapping between slider position (0..1) and historical year.
// Each segment of the timescale gets a fixed share of the slider width, so sparse ancient
// periods are compressed and dense modern periods are stretched.
import type { Timescale } from './types';
import { fromAstro, toAstro, type HistYear } from './years';

export function yearToPos(ts: Timescale, year: HistYear): number {
  let start = 0;
  for (const s of ts.segments) {
    if (year <= s.to || s === ts.segments.at(-1)) {
      const a0 = toAstro(s.from);
      const a1 = toAstro(s.to);
      const t = Math.min(1, Math.max(0, (toAstro(year) - a0) / (a1 - a0)));
      return start + t * s.share;
    }
    start += s.share;
  }
  return 1;
}

export function posToYear(ts: Timescale, pos: number): HistYear {
  const p = Math.min(1, Math.max(0, pos));
  let start = 0;
  for (const s of ts.segments) {
    if (p <= start + s.share || s === ts.segments.at(-1)) {
      const t = s.share === 0 ? 0 : (p - start) / s.share;
      const a0 = toAstro(s.from);
      const a1 = toAstro(s.to);
      return fromAstro(a0 + t * (a1 - a0));
    }
    start += s.share;
  }
  return ts.max;
}

/** Years per second used by the Play button at a given year. */
export function playSpeedAt(ts: Timescale, year: HistYear): number {
  for (const s of ts.segments) if (year < s.to) return s.play_speed;
  return ts.segments.at(-1)!.play_speed;
}
