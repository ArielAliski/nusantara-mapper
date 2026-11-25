// Validates all human-edited data and compiles it into the bundle the app loads.
//
//   data/regions.yaml + data/base/units.geojson   → region → unit ids
//   data/polities/*.yaml (territory timelines)     → one dissolved polygon per
//                                                    (polity, year range, boundary type, confidence)
//
// Output (public/data/, gitignored):
//   app.json            polity metadata, sources, eras, timescale, region names
//   territories.topojson time-sliced polygons   props: sid, polity, color, from, to, boundary_type, confidence, views
//   labels.geojson      one label point per polity per year range
//   capitals.geojson    capital points with from/to
//   land.geojson        basemap
//
// Usage: npm run data            (build; fails on errors, prints warnings)
//        npm run data -- --list-units [filter]

import fs from 'node:fs';
import path from 'node:path';
import YAML from 'yaml';
import mapshaper from 'mapshaper';
import polylabel from 'polylabel';
import type { Feature, FeatureCollection, MultiPolygon, Polygon, Position } from 'geojson';
import { z } from 'zod';
import {
  BoundaryType,
  Eras,
  GlobalEvents,
  Polity,
  Regions,
  Sources,
  Timescale,
  type TerritoryEntry,
} from './schema.ts';
import { OPEN_END, formatYear, fromAstro, toAstro } from '../src/lib/years.ts';

const ROOT = path.resolve(import.meta.dirname, '..');
const DATA = path.join(ROOT, 'data');
const OUT = path.join(ROOT, 'public', 'data');

const errors: string[] = [];
const warnings: string[] = [];
const err = (m: string) => errors.push(m);
const warn = (m: string) => warnings.push(m);

function readYaml<T>(file: string, schema: z.ZodType<T>): T | undefined {
  const rel = path.relative(ROOT, file);
  let raw: unknown;
  try {
    raw = YAML.parse(fs.readFileSync(file, 'utf8'));
  } catch (e) {
    err(`${rel}: YAML parse error: ${(e as Error).message}`);
    return undefined;
  }
  const res = schema.safeParse(raw);
  if (!res.success) {
    for (const i of res.error.issues) err(`${rel}: ${i.path.join('.') || '(root)'}: ${i.message}`);
    return undefined;
  }
  return res.data;
}

// ───────────────────────── base units ─────────────────────────
type UnitProps = { id: string; name: string; country: string; province: string | null };
const unitsFC = JSON.parse(fs.readFileSync(path.join(DATA, 'base', 'units.geojson'), 'utf8')) as FeatureCollection<
  Polygon | MultiPolygon | null,
  UnitProps
>;
const units = new Map<string, Feature<Polygon | MultiPolygon | null, UnitProps>>();
for (const f of unitsFC.features) units.set(f.properties.id, f);

if (process.argv.includes('--list-units')) {
  const filter = process.argv[process.argv.indexOf('--list-units') + 1]?.toLowerCase() ?? '';
  for (const f of unitsFC.features) {
    const p = f.properties;
    const line = `${p.id.padEnd(34)} ${p.country}/${p.province ?? '?'}`;
    if (line.toLowerCase().includes(filter)) console.log(line);
  }
  process.exit(0);
}

// ───────────────────────── regions ─────────────────────────
const regionsRaw = readYaml(path.join(DATA, 'regions.yaml'), Regions) ?? {};
const regionUnits = new Map<string, Set<string>>();
for (const [rid, r] of Object.entries(regionsRaw)) {
  const set = new Set<string>();
  for (const u of r.units ?? []) {
    if (!units.has(u)) err(`regions.yaml: ${rid}: unknown unit "${u}"`);
    else set.add(u);
  }
  for (const pv of r.provinces ?? []) {
    const [c, p] = pv.split('/');
    const matched = unitsFC.features.filter((f) => f.properties.country === c && f.properties.province === p);
    if (!matched.length) err(`regions.yaml: ${rid}: province "${pv}" matches no units`);
    matched.forEach((f) => set.add(f.properties.id));
  }
  for (const c of r.countries ?? []) {
    const matched = unitsFC.features.filter((f) => f.properties.country === c);
    if (!matched.length) err(`regions.yaml: ${rid}: country "${c}" matches no units`);
    matched.forEach((f) => set.add(f.properties.id));
  }
  for (const u of r.exclude ?? []) set.delete(u);
  if (!set.size) err(`regions.yaml: ${rid}: region is empty`);
  regionUnits.set(rid, set);
}

// ───────────────────────── other shared files ─────────────────────────
const sources = readYaml(path.join(DATA, 'sources.yaml'), Sources) ?? {};
const eras = readYaml(path.join(DATA, 'eras.yaml'), Eras) ?? [];
const globalEvents = readYaml(path.join(DATA, 'events.yaml'), GlobalEvents) ?? [];
const timescale = readYaml(path.join(DATA, 'timescale.yaml'), Timescale);

// ───────────────────────── polities ─────────────────────────
const polityDir = path.join(DATA, 'polities');
const polities: Polity[] = [];
for (const file of fs.readdirSync(polityDir).filter((f) => /\.ya?ml$/.test(f)).sort()) {
  const p = readYaml(path.join(polityDir, file), Polity);
  if (!p) continue;
  if (p.id !== path.basename(file).replace(/\.ya?ml$/, '')) err(`polities/${file}: id "${p.id}" must match file name`);
  polities.push(p);
}
const polityIds = new Set(polities.map((p) => p.id));
globalEvents.forEach((e, i) => {
  for (const s of e.sources ?? []) if (!sources[s]) err(`events.yaml[${i}]: unknown source "${s}"`);
  if (e.polity && !polityIds.has(e.polity)) err(`events.yaml[${i}]: unknown polity "${e.polity}"`);
});

const STRENGTH: Record<BoundaryType, number> = {
  documented: 4,
  occupation: 3,
  approximate: 2,
  zone_of_influence: 1,
  cultural_zone: 0,
};
const CONF_RANK = { high: 2, medium: 1, low: 0 } as const;

function entryUnits(p: Polity, t: TerritoryEntry, where: string): Set<string> {
  const set = new Set<string>();
  for (const r of t.regions ?? []) {
    const u = regionUnits.get(r);
    if (!u) err(`${where}: unknown region "${r}"`);
    else u.forEach((x) => set.add(x));
  }
  for (const c of t.countries ?? []) {
    const matched = unitsFC.features.filter((f) => f.properties.country === c);
    if (!matched.length) err(`${where}: country "${c}" matches no units`);
    matched.forEach((f) => set.add(f.properties.id));
  }
  for (const r of t.except_regions ?? []) {
    const u = regionUnits.get(r);
    if (!u) err(`${where}: unknown region "${r}" in except_regions`);
    else u.forEach((x) => set.delete(x));
  }
  return set;
}

type View = 'both' | 'doc' | 'est';
type Slice = {
  sid: string;
  polity: string;
  from: number;
  to: number; // exclusive, OPEN_END = ongoing
  boundary_type: BoundaryType;
  confidence: 'high' | 'medium' | 'low';
  units: Set<string>;
  view: View;
};
/** A set of units held over [from, to) with one boundary type and confidence. */
type Piece = Omit<Slice, 'sid' | 'polity' | 'view'>;

// ── estimated gradual change ──
// Units are ordered by distance from a seed point (the capital, or the polity's other
// territory) and gained nearest-first or lost farthest-first in up to MAX_STEPS steps.
const MAX_STEPS = 12;
const unitCenter = new Map<string, [number, number] | null>();
function centerOf(u: string): [number, number] | null {
  if (unitCenter.has(u)) return unitCenter.get(u)!;
  const g = units.get(u)?.geometry;
  let c: [number, number] | null = null;
  if (g) {
    let [w, s, e, n] = [Infinity, Infinity, -Infinity, -Infinity];
    const polys = g.type === 'Polygon' ? [g.coordinates] : g.coordinates;
    for (const poly of polys)
      for (const [x, y] of poly[0]) [w, s, e, n] = [Math.min(w, x), Math.min(s, y), Math.max(e, x), Math.max(n, y)];
    c = [(w + e) / 2, (s + n) / 2];
  }
  unitCenter.set(u, c);
  return c;
}
function centroid(ids: Iterable<string>): [number, number] | null {
  let [x, y, k] = [0, 0, 0];
  for (const u of ids) {
    const c = centerOf(u);
    if (c) [x, y, k] = [x + c[0], y + c[1], k + 1];
  }
  return k ? [x / k, y / k] : null;
}
function byDistance(ids: Set<string>, seed: [number, number]): string[] {
  const kx = Math.cos((seed[1] * Math.PI) / 180);
  const d = (u: string) => {
    const c = centerOf(u);
    return c ? Math.hypot((c[0] - seed[0]) * kx, c[1] - seed[1]) : Infinity;
  };
  return [...ids].sort((a, b) => d(a) - d(b) || a.localeCompare(b));
}
/** Pieces for a ramp over [y0, y1): grow = nearest units first, shrink = farthest lost first. */
function ramp(
  ordered: string[],
  y0: number,
  y1: number,
  mode: 'grow' | 'shrink',
  base: Pick<Piece, 'boundary_type' | 'confidence'>,
): Piece[] {
  const [a0, a1] = [toAstro(y0), toAstro(y1)];
  const n = ordered.length;
  const steps = Math.max(1, Math.min(MAX_STEPS, a1 - a0, n));
  const out: Piece[] = [];
  for (let i = 0; i < steps; i++) {
    const from = fromAstro(a0 + Math.round((i * (a1 - a0)) / steps));
    const to = fromAstro(a0 + Math.round(((i + 1) * (a1 - a0)) / steps));
    if (to <= from) continue;
    const changed = Math.round(((i + 1) * n) / (steps + 1));
    const count = mode === 'grow' ? Math.max(1, changed) : n - changed;
    if (count <= 0) continue;
    out.push({ from, to, units: new Set(ordered.slice(0, count)), ...base });
  }
  return out;
}

type Entry = { t: TerritoryEntry; to: number; units: Set<string> };
function seedFor(p: Polity, year: number, self: Entry, entries: Entry[]): [number, number] | null {
  const cap = p.capitals.find(
    (c) => c.coords && (c.from ?? p.period.start.year) <= year && (c.to == null || year < c.to),
  );
  if (cap?.coords) return cap.coords;
  const others = entries.filter((e) => e !== self && e.t.from <= year && year < e.to).flatMap((e) => [...e.units]);
  return centroid(others) ?? centroid(self.units);
}
function estimatedPieces(p: Polity, e: Entry, entries: Entry[]): Piece[] {
  const t = e.t;
  const base = { boundary_type: t.boundary_type, confidence: t.confidence };
  const pieces: Piece[] = [];
  const fullFrom = t.grow_until ?? t.from;
  const fullTo = t.shrink_from ?? e.to;
  if (fullFrom < fullTo) pieces.push({ from: fullFrom, to: fullTo, units: e.units, ...base });
  if (t.grow_from != null || t.grow_until != null) {
    const [g0, g1] = t.grow_from != null ? [t.grow_from, t.from] : [t.from, t.grow_until!];
    const seed = t.ramp_seed ?? seedFor(p, g0, e, entries);
    if (seed) {
      const order = byDistance(e.units, seed);
      pieces.push(...ramp(t.ramp_reverse ? order.reverse() : order, g0, g1, 'grow', base));
    }
  }
  if (t.shrink_from != null) {
    const seed = t.ramp_seed ?? seedFor(p, t.shrink_from, e, entries);
    if (seed) {
      const order = byDistance(e.units, seed);
      pieces.push(...ramp(t.ramp_reverse ? order.reverse() : order, t.shrink_from, e.to, 'shrink', base));
    }
  }
  return pieces;
}

/** Break a polity's pieces at every change and group units by boundary type / confidence. */
function slicePieces(
  polity: string,
  pieces: Piece[],
  view: View,
  gapCheck?: { start: number; end: number; where: string; known: { from: number; to: number }[] },
): Slice[] {
  const result: Slice[] = [];
  const extra = gapCheck ? [gapCheck.start, gapCheck.end] : [];
  const points = [...new Set([...extra, ...pieces.flatMap((e) => [e.from, e.to])])].sort((a, b) => a - b);
  const lastByKey = new Map<string, Slice>();
  for (let i = 0; i < points.length - 1; i++) {
    const [a, b] = [points[i], points[i + 1]];
    const active = pieces.filter((e) => e.from <= a && e.to >= b);
    if (!active.length) {
      // A polity that exists but has no mapped territory is usually a data mistake.
      if (gapCheck && a >= gapCheck.start && b <= gapCheck.end && !gapCheck.known.some((g) => g.from <= a && b <= g.to))
        warn(
          `${gapCheck.where}: no territory mapped ${formatYear(a)}–${b === OPEN_END ? 'present' : formatYear(b)} although the polity exists`,
        );
      continue;
    }
    // Each unit goes to its strongest claim within this polity.
    const best = new Map<string, Piece>();
    for (const e of active)
      for (const u of e.units) {
        const cur = best.get(u);
        if (
          !cur ||
          STRENGTH[e.boundary_type] > STRENGTH[cur.boundary_type] ||
          (STRENGTH[e.boundary_type] === STRENGTH[cur.boundary_type] &&
            CONF_RANK[e.confidence] > CONF_RANK[cur.confidence])
        )
          best.set(u, e);
      }
    const groups = new Map<string, Slice>();
    for (const [u, t] of best) {
      const key = `${t.boundary_type}|${t.confidence}`;
      let s = groups.get(key);
      if (!s) {
        s = { sid: '', polity, from: a, to: b, boundary_type: t.boundary_type, confidence: t.confidence, units: new Set(), view };
        groups.set(key, s);
      }
      s.units.add(u);
    }
    // Merge with the previous slice when nothing changed for this type/confidence, so
    // unchanged territory stays one feature (smaller output, no needless cross-fade).
    for (const g of groups.values()) {
      const key = `${g.boundary_type}|${g.confidence}|${[...g.units].sort().join(',')}`;
      const prev = lastByKey.get(key);
      if (prev && prev.to === g.from) prev.to = g.to;
      else {
        result.push(g);
        lastByKey.set(key, g);
      }
    }
  }
  return result;
}

const slices: Slice[] = [];

for (const p of polities) {
  const where = `polities/${p.id}`;
  // reference checks
  for (const s of p.sources) if (!sources[s]) err(`${where}: unknown source "${s}"`);
  for (const id of [...p.predecessors, ...p.successors])
    if (!polityIds.has(id)) warn(`${where}: predecessor/successor "${id}" is not (yet) in the dataset`);
  if (p.emblem && !fs.existsSync(path.join(ROOT, 'public', p.emblem.file)))
    err(`${where}: emblem file public/${p.emblem.file} not found`);
  const pStart = p.period.start.year;
  const pEnd = p.period.end?.year ?? OPEN_END;
  if (pEnd <= pStart) err(`${where}: period end must be after start`);

  const entries: Entry[] = p.territory.map((t, i) => {
    const w = `${where}.territory[${i}]`;
    for (const s of t.sources ?? []) if (!sources[s]) err(`${w}: unknown source "${s}"`);
    const to = t.to ?? OPEN_END;
    if ((t.grow_from ?? t.from) < pStart || to > pEnd)
      warn(
        `${w}: ${formatYear(t.grow_from ?? t.from)}–${t.to == null ? 'present' : formatYear(t.to)} lies outside the polity's period`,
      );
    return { t, to, units: entryUnits(p, t, w) };
  });

  const docPieces: Piece[] = entries.map((e) => ({
    from: e.t.from,
    to: e.to,
    units: e.units,
    boundary_type: e.t.boundary_type,
    confidence: e.t.confidence,
  }));
  const doc = slicePieces(p.id, docPieces, 'doc', { start: pStart, end: pEnd, where, known: p.unmapped });
  const hasEstimate = p.territory.some((t) => t.grow_from != null || t.grow_until != null || t.shrink_from != null);
  if (!hasEstimate) {
    doc.forEach((s) => (s.view = 'both'));
    slices.push(...doc);
    continue;
  }
  const est = slicePieces(p.id, entries.flatMap((e) => estimatedPieces(p, e, entries)), 'est');
  // Slices identical in both views are stored once.
  const key = (s: Slice) => `${s.from}|${s.to}|${s.boundary_type}|${s.confidence}|${[...s.units].sort().join(',')}`;
  const estByKey = new Map(est.map((s) => [key(s), s]));
  for (const s of doc) {
    if (estByKey.delete(key(s))) s.view = 'both';
    slices.push(s);
  }
  slices.push(...estByKey.values());
}
let sidCounter = 0;
for (const s of slices) s.sid = `${s.polity}#${sidCounter++}`;

// Overlap check between polities (ignoring zones of influence and cultural zones).
const hard = slices.filter((s) => STRENGTH[s.boundary_type] >= STRENGTH.approximate);
const reported = new Set<string>();
for (let i = 0; i < hard.length; i++)
  for (let j = i + 1; j < hard.length; j++) {
    const [s1, s2] = [hard[i], hard[j]];
    if (s1.polity === s2.polity || s1.from >= s2.to || s2.from >= s1.to) continue;
    // Documented and estimated slices are never shown together.
    if ((s1.view === 'doc' && s2.view === 'est') || (s1.view === 'est' && s2.view === 'doc')) continue;
    const shared = [...s1.units].filter((u) => s2.units.has(u));
    if (!shared.length) continue;
    const key = `${s1.polity}|${s2.polity}|${shared[0]}`;
    if (reported.has(key)) continue;
    reported.add(key);
    const inView = s1.view === 'est' || s2.view === 'est' ? ' [estimated view]' : '';
    warn(
      `overlap${inView}: ${s1.polity} and ${s2.polity} both hold ${shared.length} unit(s) (e.g. ${shared[0]}) ` +
        `during ${formatYear(Math.max(s1.from, s2.from))}–${formatYear(Math.min(s1.to, s2.to))}`,
    );
  }

if (errors.length) {
  console.error(`\n✖ ${errors.length} error(s):`);
  errors.forEach((e) => console.error('  - ' + e));
  warnings.forEach((w) => console.warn('  ! ' + w));
  process.exit(1);
}

// ───────────────────────── geometry: dissolve units into slices ─────────────────────────
// Slices overlap each other in time (the same unit appears in many slices), so each slice is
// dissolved on its own; mapshaper's topology-based dissolve expects non-overlapping input.
// Results are cached by unit set, since many slices share the same set of units.
const dissolveCache = new Map<string, Polygon | MultiPolygon | null>();
async function dissolveUnits(ids: Set<string>): Promise<Polygon | MultiPolygon | null> {
  const key = [...ids].sort().join(',');
  if (dissolveCache.has(key)) return dissolveCache.get(key)!;
  const fc: FeatureCollection = {
    type: 'FeatureCollection',
    features: [...ids]
      .map((u) => units.get(u)!.geometry)
      .filter((g): g is Polygon | MultiPolygon => !!g) // tiny islets can vanish in simplification
      .map((geometry) => ({ type: 'Feature', geometry, properties: {} })),
  };
  const out = await mapshaper.applyCommands('-i in.json -dissolve -o out.json format=geojson geojson-type=FeatureCollection precision=0.001', {
    'in.json': fc,
  });
  const res = JSON.parse(String(out['out.json'])) as FeatureCollection<Polygon | MultiPolygon>;
  const geom = res.features[0]?.geometry ?? null;
  dissolveCache.set(key, geom);
  return geom;
}

const territories: FeatureCollection<Polygon | MultiPolygon> = { type: 'FeatureCollection', features: [] };
const polityColor = new Map(polities.map((p) => [p.id, p.color]));
// Weaker claims first, so they render underneath firmer territory.
slices.sort((a, b) => STRENGTH[a.boundary_type] - STRENGTH[b.boundary_type]);
for (const s of slices) {
  const geometry = await dissolveUnits(s.units);
  if (!geometry) {
    warn(`slice ${s.sid} has no geometry after dissolve (dropped)`);
    continue;
  }
  territories.features.push({
    type: 'Feature',
    geometry,
    properties: {
      sid: s.sid,
      polity: s.polity,
      color: polityColor.get(s.polity),
      from: s.from,
      to: s.to,
      boundary_type: s.boundary_type,
      confidence: s.confidence,
      views: s.view,
    },
  });
}

// ───────────────────────── labels ─────────────────────────
function ringArea(r: Position[]): number {
  let a = 0;
  for (let i = 0, j = r.length - 1; i < r.length; j = i++) a += (r[j][0] + r[i][0]) * (r[j][1] - r[i][1]);
  return Math.abs(a / 2);
}
function polygons(g: Polygon | MultiPolygon): Position[][][] {
  return g.type === 'Polygon' ? [g.coordinates] : g.coordinates;
}

const bySid = new Map(territories.features.map((f) => [f.properties!.sid as string, f]));
// One label per polity per year interval (between any of its slice boundaries), placed on the
// largest polygon of its firmest boundary type. Consecutive intervals with the same placement merge.
// Computed separately for the documented and the estimated view; identical labels are shared.
function labelsFor(view: 'doc' | 'est'): Feature[] {
  const out: Feature[] = [];
  for (const p of polities) {
    const own = slices.filter((s) => s.polity === p.id && bySid.has(s.sid) && (s.view === 'both' || s.view === view));
    out.push(...polityLabels(p, own));
  }
  return out;
}
function polityLabels(p: Polity, own: Slice[]): Feature[] {
  const labelFeatures: Feature[] = [];
  const pts = [...new Set(own.flatMap((s) => [s.from, s.to]))].sort((a, b) => a - b);
  let last: Feature | null = null;
  for (let i = 0; i < pts.length - 1; i++) {
    const [a, b] = [pts[i], pts[i + 1]];
    const group = own.filter((s) => s.from <= a && s.to >= b);
    if (!group.length) continue;
    const topStrength = Math.max(...group.map((s) => STRENGTH[s.boundary_type]));
    let bestPoly: Position[][] | null = null;
    let bestArea = 0;
    let totalArea = 0;
    for (const s of group)
      for (const poly of polygons(bySid.get(s.sid)!.geometry)) {
        const area = ringArea(poly[0]);
        totalArea += area;
        if (STRENGTH[s.boundary_type] === topStrength && area > bestArea) [bestPoly, bestArea] = [poly, area];
      }
    if (!bestPoly) continue;
    const pt = polylabel(bestPoly as [number, number][][], 0.01);
    const coords = [+pt[0].toFixed(4), +pt[1].toFixed(4)];
    const lp = last?.properties as { to: number; area: number } | undefined;
    const lc = (last?.geometry as { coordinates: number[] } | undefined)?.coordinates;
    if (last && lp!.to === a && lc![0] === coords[0] && lc![1] === coords[1]) {
      lp!.to = b;
      lp!.area = Math.max(lp!.area, +totalArea.toFixed(3));
      continue;
    }
    last = {
      type: 'Feature',
      geometry: { type: 'Point', coordinates: coords },
      properties: { polity: p.id, name: p.name, from: a, to: b, area: +totalArea.toFixed(3) },
    };
    labelFeatures.push(last);
  }
  return labelFeatures;
}
const labelKey = (f: Feature) => JSON.stringify([f.properties, (f.geometry as { coordinates: number[] }).coordinates]);
const docLabels = labelsFor('doc');
const estLabels = new Map(labelsFor('est').map((f) => [labelKey(f), f]));
const labelFeatures: Feature[] = [];
for (const f of docLabels) {
  const shared = estLabels.delete(labelKey(f));
  f.properties!.views = shared ? 'both' : 'doc';
  labelFeatures.push(f);
}
for (const f of estLabels.values()) {
  f.properties!.views = 'est';
  labelFeatures.push(f);
}

// ───────────────────────── capitals ─────────────────────────
const capitalFeatures: Feature[] = [];
for (const p of polities)
  for (const c of p.capitals) {
    if (!c.coords) continue;
    capitalFeatures.push({
      type: 'Feature',
      geometry: { type: 'Point', coordinates: c.coords },
      properties: {
        polity: p.id,
        name: c.name,
        from: c.from ?? p.period.start.year,
        to: c.to ?? p.period.end?.year ?? OPEN_END,
      },
    });
  }

// ───────────────────────── app.json ─────────────────────────
const regionNames = Object.fromEntries(Object.entries(regionsRaw).map(([k, v]) => [k, v.name]));
const app = {
  generated: new Date().toISOString(),
  timescale,
  eras,
  events: globalEvents,
  sources,
  regions: regionNames,
  polities: polities.map((p) => ({
    ...p,
    territory: p.territory.map((t) => ({ ...t, to: t.to ?? null })),
  })),
};

fs.mkdirSync(OUT, { recursive: true });
const write = (name: string, obj: unknown) => fs.writeFileSync(path.join(OUT, name), JSON.stringify(obj));
write('app.json', app);
// TopoJSON: the many time slices share most of their borders, so storing shared arcs once
// shrinks the file several-fold. The app converts it back to GeoJSON on load.
const topo = await mapshaper.applyCommands(
  '-i territories.json name=territories -o territories.topojson format=topojson quantization=200000',
  { 'territories.json': territories },
);
fs.writeFileSync(path.join(OUT, 'territories.topojson'), String(topo['territories.topojson']));
fs.rmSync(path.join(OUT, 'territories.geojson'), { force: true });
write('labels.geojson', { type: 'FeatureCollection', features: labelFeatures });
write('capitals.geojson', { type: 'FeatureCollection', features: capitalFeatures });
fs.copyFileSync(path.join(DATA, 'base', 'land.geojson'), path.join(OUT, 'land.geojson'));

const kb = (f: string) => (fs.statSync(path.join(OUT, f)).size / 1024).toFixed(0) + ' KB';
console.log(
  `✔ ${polities.length} polities, ${slices.length} time slices, ${labelFeatures.length} labels ` +
    `(territories ${kb('territories.topojson')}, app ${kb('app.json')})`,
);
if (warnings.length) {
  console.warn(`! ${warnings.length} warning(s):`);
  warnings.forEach((w) => console.warn('  - ' + w));
}
