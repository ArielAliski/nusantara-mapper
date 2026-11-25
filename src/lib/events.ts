// Merges polity events and region-wide events into one chronological feed.
import type { AppData } from './types';

export interface FeedEvent {
  id: string;
  year: number;
  approx: boolean;
  text: string;
  polity: string | null;
  polityName: string | null;
  color: string | null;
}

export function buildFeed(app: AppData): FeedEvent[] {
  const byId = new Map(app.polities.map((p) => [p.id, p]));
  const out: FeedEvent[] = [];
  for (const p of app.polities)
    p.events.forEach((e, i) =>
      out.push({
        id: `${p.id}:${i}`,
        year: e.year,
        approx: !!e.approx,
        text: e.text,
        polity: p.id,
        polityName: p.name,
        color: p.color,
      }),
    );
  app.events.forEach((e, i) => {
    const p = e.polity ? byId.get(e.polity) : undefined;
    out.push({
      id: `global:${i}`,
      year: e.year,
      approx: !!e.approx,
      text: e.text,
      polity: p?.id ?? null,
      polityName: p?.name ?? null,
      color: p?.color ?? null,
    });
  });
  // Stable chronological order; global events after polity events of the same year.
  return out.sort((a, b) => a.year - b.year);
}

/** Index of the last event at or before `year` (-1 if none). */
export function lastIndexAtOrBefore(feed: FeedEvent[], year: number): number {
  let lo = 0;
  let hi = feed.length - 1;
  let ans = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (feed[mid].year <= year) {
      ans = mid;
      lo = mid + 1;
    } else hi = mid - 1;
  }
  return ans;
}

/**
 * Events to announce when the year changes from `prev` to `next`: everything passed when
 * moving forward by a modest step (playback, stepping), otherwise only events in `next` itself.
 */
export function eventsCrossed(feed: FeedEvent[], prev: number | null, next: number): FeedEvent[] {
  if (prev != null && next > prev && next - prev <= 25) return feed.filter((e) => e.year > prev && e.year <= next);
  return feed.filter((e) => e.year === next);
}
