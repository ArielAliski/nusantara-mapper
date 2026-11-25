// Year convention used everywhere in this project:
//   historical years are signed integers, negative = BC, positive = AD, and 0 does not exist.
//   -1 is 1 BC, 1 is AD 1.
// For arithmetic (durations, interpolation) we convert to "astronomical" years where
// 1 BC = 0, 2 BC = -1, … so the number line is continuous.

export type HistYear = number;

export function isValidYear(y: number): boolean {
  return Number.isInteger(y) && y !== 0;
}

/** Historical year → astronomical year (continuous, has a 0). */
export function toAstro(y: HistYear): number {
  if (y === 0) throw new RangeError('Year 0 does not exist');
  return y > 0 ? y : y + 1;
}

/** Astronomical year → historical year. */
export function fromAstro(a: number): HistYear {
  const r = Math.round(a);
  return r > 0 ? r : r - 1;
}

/** Move a historical year by `delta` years, skipping the non-existent year 0. */
export function addYears(y: HistYear, delta: number): HistYear {
  return fromAstro(toAstro(y) + delta);
}

/** Number of years from `a` to `b` (b − a), correct across the BC/AD boundary. */
export function yearsBetween(a: HistYear, b: HistYear): number {
  return toAstro(b) - toAstro(a);
}

export function clampYear(y: HistYear, min: HistYear, max: HistYear): HistYear {
  if (y < min) return min;
  if (y > max) return max;
  return y === 0 ? 1 : y;
}

/** "1500 BC", "AD 1", "1293" (AD is only written for the first millennium). */
export function formatYear(y: HistYear, opts: { approx?: boolean } = {}): string {
  const c = opts.approx ? 'c. ' : '';
  if (y < 0) return `${c}${-y} BC`;
  if (y < 1000) return `${c}AD ${y}`;
  return `${c}${y}`;
}

/** Format a half-open range [from, to) for display; `to` is the first year it no longer applies. */
export function formatRange(
  from: HistYear | null | undefined,
  to: HistYear | null | undefined,
  opts: { fromApprox?: boolean; toApprox?: boolean } = {},
): string {
  const f = from == null ? '?' : formatYear(from, { approx: opts.fromApprox });
  const t = to == null ? 'present' : formatYear(to, { approx: opts.toApprox });
  return `${f} – ${t}`;
}

/** Sentinel used in built data for "still active" (open-ended) ranges. */
export const OPEN_END = 100000;
