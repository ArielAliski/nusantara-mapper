import { describe, expect, it } from 'vitest';
import { eventsCrossed, lastIndexAtOrBefore, type FeedEvent } from '../src/lib/events';
import { activeInView } from '../src/lib/data';

const ev = (year: number): FeedEvent => ({
  id: String(year),
  year,
  approx: false,
  text: `event ${year}`,
  polity: null,
  polityName: null,
  color: null,
});
const feed = [ev(-300), ev(414), ev(1293), ev(1293), ev(1343), ev(1478)];

describe('events feed', () => {
  it('finds the last event at or before a year', () => {
    expect(lastIndexAtOrBefore(feed, -1000)).toBe(-1);
    expect(lastIndexAtOrBefore(feed, 1293)).toBe(3);
    expect(lastIndexAtOrBefore(feed, 1400)).toBe(4);
    expect(lastIndexAtOrBefore(feed, 2026)).toBe(5);
  });

  it('announces events passed on a small forward step', () => {
    expect(eventsCrossed(feed, 1290, 1300).map((e) => e.year)).toEqual([1293, 1293]);
    expect(eventsCrossed(feed, 1293, 1294)).toEqual([]);
  });

  it('only announces the exact year after a jump or going back', () => {
    expect(eventsCrossed(feed, 1000, 1343).map((e) => e.year)).toEqual([1343]);
    expect(eventsCrossed(feed, 1500, 1400)).toEqual([]);
    expect(eventsCrossed(feed, null, 1478).map((e) => e.year)).toEqual([1478]);
  });
});

describe('estimated view activity', () => {
  const t = { from: 1365, to: 1400, grow_from: 1336 };
  it('shows growth windows only in the estimated view', () => {
    expect(activeInView(1340, t, true)).toBe(true);
    expect(activeInView(1340, t, false)).toBe(false);
    expect(activeInView(1365, t, false)).toBe(true);
    expect(activeInView(1400, t, true)).toBe(false);
  });
});
