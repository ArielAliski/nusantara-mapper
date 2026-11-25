import { describe, expect, it } from 'vitest';
import { addYears, clampYear, formatYear, fromAstro, toAstro, yearsBetween } from '../src/lib/years';
import { posToYear, yearToPos, playSpeedAt } from '../src/lib/timescale';
import type { Timescale } from '../src/lib/types';

describe('years (no year 0)', () => {
  it('converts to and from astronomical years', () => {
    expect(toAstro(1)).toBe(1);
    expect(toAstro(-1)).toBe(0);
    expect(toAstro(-1500)).toBe(-1499);
    expect(fromAstro(0)).toBe(-1);
    expect(fromAstro(1)).toBe(1);
    expect(() => toAstro(0)).toThrow();
  });

  it('steps across the BC/AD boundary without visiting 0', () => {
    expect(addYears(-1, 1)).toBe(1);
    expect(addYears(1, -1)).toBe(-1);
    expect(addYears(-5, 10)).toBe(6);
    expect(yearsBetween(-1, 1)).toBe(1);
    expect(yearsBetween(-1500, 2026)).toBe(3525);
  });

  it('clamps and never returns 0', () => {
    expect(clampYear(0, -1500, 2026)).toBe(1);
    expect(clampYear(3000, -1500, 2026)).toBe(2026);
    expect(clampYear(-2000, -1500, 2026)).toBe(-1500);
  });

  it('formats years', () => {
    expect(formatYear(-1500)).toBe('1500 BC');
    expect(formatYear(1)).toBe('AD 1');
    expect(formatYear(450, { approx: true })).toBe('c. AD 450');
    expect(formatYear(1293)).toBe('1293');
  });
});

describe('timescale', () => {
  const ts: Timescale = {
    min: -1500,
    max: 2026,
    segments: [
      { from: -1500, to: 1, share: 0.2, play_speed: 50 },
      { from: 1, to: 1800, share: 0.5, play_speed: 10 },
      { from: 1800, to: 2026, share: 0.3, play_speed: 2 },
    ],
  };

  it('maps segment boundaries to cumulative shares', () => {
    expect(yearToPos(ts, -1500)).toBeCloseTo(0);
    expect(yearToPos(ts, 1)).toBeCloseTo(0.2);
    expect(yearToPos(ts, 1800)).toBeCloseTo(0.7);
    expect(yearToPos(ts, 2026)).toBeCloseTo(1);
  });

  it('round-trips every year in the modern segment exactly', () => {
    for (let y = 1800; y <= 2026; y++) expect(posToYear(ts, yearToPos(ts, y))).toBe(y);
  });

  it('never returns year 0', () => {
    for (let i = 0; i <= 2000; i++) expect(posToYear(ts, i / 2000)).not.toBe(0);
  });

  it('play speed follows the segment', () => {
    expect(playSpeedAt(ts, -1000)).toBe(50);
    expect(playSpeedAt(ts, 1365)).toBe(10);
    expect(playSpeedAt(ts, 2026)).toBe(2);
  });
});
