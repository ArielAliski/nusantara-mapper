import type { AppData, LabelFC, TerritoryFC } from './types';
import type { FeatureCollection } from 'geojson';
import { feature } from 'topojson-client';
import type { Topology } from 'topojson-specification';

export interface LoadedData {
  app: AppData;
  territories: TerritoryFC;
  labels: LabelFC;
  capitals: FeatureCollection;
  land: FeatureCollection;
}

const url = (f: string) => `${import.meta.env.BASE_URL}data/${f}`;

async function getJson<T>(file: string): Promise<T> {
  const res = await fetch(url(file));
  if (!res.ok) throw new Error(`Could not load ${file} (${res.status}). Did you run "npm run data"?`);
  return res.json() as Promise<T>;
}

export async function loadData(): Promise<LoadedData> {
  const [app, territories, labels, capitals, land] = await Promise.all([
    getJson<AppData>('app.json'),
    getJson<Topology>('territories.topojson').then((t) => feature(t, t.objects.territories) as unknown as TerritoryFC),
    getJson<LabelFC>('labels.geojson'),
    getJson<FeatureCollection>('capitals.geojson'),
    getJson<FeatureCollection>('land.geojson'),
  ]);
  return { app, territories, labels, capitals, land };
}

/** Is a [from, to) range active in `year`? */
export const activeIn = (year: number, r: { from: number; to: number | null }) =>
  r.from <= year && (r.to == null || year < r.to);

/**
 * Is a territory entry drawn in `year`? In the estimated view an entry also shows during its
 * estimated growth window before `from` (`grow_from`).
 */
export const activeInView = (
  year: number,
  t: { from: number; to: number | null; grow_from?: number },
  estimated: boolean,
) => activeIn(year, { from: estimated && t.grow_from != null ? t.grow_from : t.from, to: t.to });
