// Owns the MapLibre map: basemap, time-filtered territory layers, labels, and the
// cross-fade between years.
//
// Territories are pre-sliced at build time into features that are each valid for a
// half-open year range [from, to). For a given year we compute the set of active slice ids
// and split rendering into three layer groups:
//   stable – active both before and after the change (fully visible)
//   in     – newly active (fading in)
//   out    – no longer active (fading out)
// so a region changing hands fades smoothly while everything else stays still.

import {
  AttributionControl,
  Map as MlMap,
  NavigationControl,
  setWorkerUrl,
  type ExpressionSpecification,
  type MapLayerMouseEvent,
} from 'maplibre-gl';
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?url';
import 'maplibre-gl/dist/maplibre-gl.css';
import type { LoadedData } from './data';
import { activeIn } from './data';
import { makePattern, patternId, PATTERN_RATIO, type PatternKind } from './patterns';

setWorkerUrl(workerUrl);

type Group = 'stable' | 'in' | 'out';
const GROUPS: Group[] = ['stable', 'out', 'in'];

const FONT = ['Noto Sans Regular'];
const FONT_BOLD = ['Noto Sans Medium'];
const FONT_ITALIC = ['Noto Sans Italic'];

export interface Theme {
  sea: string;
  land: string;
  coast: string;
  label: string;
  halo: string;
  select: string;
}
export const THEMES: Record<'light' | 'dark', Theme> = {
  light: { sea: '#cfe0ea', land: '#f3efe6', coast: '#b7c6cf', label: '#1d2329', halo: '#ffffffcc', select: '#111111' },
  dark: { sea: '#0f1c26', land: '#26292c', coast: '#3a4a55', label: '#eef1f4', halo: '#000000b3', select: '#ffffff' },
};

// ── style expressions ──────────────────────────────────────────────
const bt = ['get', 'boundary_type'] as ExpressionSpecification;
const conf = ['get', 'confidence'] as ExpressionSpecification;
const isLowApprox: ExpressionSpecification = ['all', ['==', bt, 'approximate'], ['==', conf, 'low']];

const PATTERN_IMAGE: ExpressionSpecification = [
  'concat',
  ['case', ['==', bt, 'cultural_zone'], 'dots-', ['==', bt, 'occupation'], 'cross-', 'hatch-'],
  ['get', 'polity'],
];

/**
 * Visual classes. Each becomes one layer per group with a *constant* opacity, so the
 * cross-fade only updates a uniform per frame instead of re-evaluating paint per feature.
 */
interface StyleClass {
  id: string;
  kind: 'fill' | 'pattern' | 'line';
  filter: ExpressionSpecification;
  opacity: number;
  dash?: number[];
  width?: number;
}
const STYLE_CLASSES: StyleClass[] = [
  // solid fills
  { id: 'fill-doc', kind: 'fill', filter: ['==', bt, 'documented'], opacity: 0.55 },
  { id: 'fill-occ', kind: 'fill', filter: ['==', bt, 'occupation'], opacity: 0.28 },
  { id: 'fill-apx', kind: 'fill', filter: ['all', ['==', bt, 'approximate'], ['!=', conf, 'low']], opacity: 0.42 },
  { id: 'fill-apxlow', kind: 'fill', filter: isLowApprox, opacity: 0.2 },
  // patterns for soft / uncertain areas
  { id: 'pat-zone', kind: 'pattern', filter: ['==', bt, 'zone_of_influence'], opacity: 0.75 },
  { id: 'pat-cult', kind: 'pattern', filter: ['==', bt, 'cultural_zone'], opacity: 0.85 },
  { id: 'pat-occ', kind: 'pattern', filter: ['==', bt, 'occupation'], opacity: 0.7 },
  { id: 'pat-apxlow', kind: 'pattern', filter: isLowApprox, opacity: 0.45 },
  // borders
  { id: 'line-solid', kind: 'line', filter: ['in', bt, ['literal', ['documented', 'occupation']]], opacity: 0.95, width: 1.3 },
  { id: 'line-dash', kind: 'line', filter: ['all', ['==', bt, 'approximate'], ['!=', conf, 'low']], opacity: 0.9, width: 1.2, dash: [3, 2] },
  { id: 'line-dot', kind: 'line', filter: isLowApprox, opacity: 0.7, width: 1, dash: [0.5, 2] },
];
const opacityProp = (c: StyleClass) => (c.kind === 'line' ? 'line-opacity' : 'fill-opacity');
const layerId = (c: StyleClass, g: Group) => `${c.id}-${g}`;

/**
 * Features valid in `year` for the current view. Territory and label features carry
 * `views`: 'both', 'doc' (documented view only) or 'est' (estimated growth view only).
 */
const yearFilter = (year: number, hiddenView: 'doc' | 'est'): ExpressionSpecification => [
  'all',
  ['<=', ['get', 'from'], year],
  ['>', ['get', 'to'], year],
  ['!=', ['coalesce', ['get', 'views'], 'both'], hiddenView],
];

/** Initial view: the whole archipelago. */
const HOME_BOUNDS: [[number, number], [number, number]] = [
  [94, -11.5],
  [141.5, 8.5],
];

export interface RendererOptions {
  container: HTMLElement;
  data: LoadedData;
  theme: 'light' | 'dark';
  onSelect: (polity: string | null) => void;
  onReady: () => void;
  reducedMotion: boolean;
  /** Show estimated gradual growth/decline instead of documented steps only. */
  estimated: boolean;
}

export class MapRenderer {
  map: MlMap;
  private data: LoadedData;
  private year: number | null = null;
  private active = new Set<string>();
  private fade: { raf: number; timer: ReturnType<typeof setTimeout>; resolve: () => void } | null = null;
  private selected: string | null = null;
  private hovered: string | null = null;
  private ready = false;
  private pendingYear: number | null = null;
  private reducedMotion: boolean;
  private estimated: boolean;
  private theme: 'light' | 'dark';

  constructor(private opts: RendererOptions) {
    this.data = opts.data;
    this.reducedMotion = opts.reducedMotion;
    this.estimated = opts.estimated;
    this.theme = opts.theme;
    const t = THEMES[opts.theme];
    this.map = new MlMap({
      container: opts.container,
      bounds: HOME_BOUNDS,
      fitBoundsOptions: { padding: 20 },
      minZoom: 2,
      maxZoom: 10,
      maxBounds: [
        [70, -30],
        [170, 35],
      ],
      attributionControl: false,
      dragRotate: false,
      pitchWithRotate: false,
      style: {
        version: 8,
        // Resolve the base first; new URL() would percent-encode the {fontstack}/{range} tokens.
        glyphs: new URL(`${import.meta.env.BASE_URL}fonts/`, location.href).href + '{fontstack}/{range}.pbf',
        sources: {
          land: { type: 'geojson', data: this.data.land },
          territories: { type: 'geojson', data: this.data.territories, promoteId: 'sid' },
          labels: { type: 'geojson', data: this.data.labels },
          capitals: { type: 'geojson', data: this.data.capitals },
        },
        layers: [
          { id: 'sea', type: 'background', paint: { 'background-color': t.sea } },
          { id: 'land', type: 'fill', source: 'land', paint: { 'fill-color': t.land } },
          { id: 'coast', type: 'line', source: 'land', paint: { 'line-color': t.coast, 'line-width': 0.6 } },
        ],
      },
    });
    this.map.touchZoomRotate.disableRotation();
    this.map.keyboard.disableRotation();
    this.map.addControl(new NavigationControl({ showCompass: false }), 'top-right');
    this.map.addControl(
      new AttributionControl({
        compact: true,
        customAttribution:
          'Boundaries: <a href="https://www.geoboundaries.org/" target="_blank" rel="noopener">BPS / OCHA via geoBoundaries</a> (CC BY 3.0 IGO), ' +
          '<a href="https://www.naturalearthdata.com/" target="_blank" rel="noopener">Natural Earth</a>',
      }),
      'bottom-right',
    );
    this.map.on('load', () => this.onLoad());
    // Test hook: ?debug exposes the renderer for automated browser checks.
    if (new URLSearchParams(location.search).has('debug')) (window as unknown as { __renderer: MapRenderer }).__renderer = this;
  }

  private onLoad() {
    const { map } = this;
    // Patterns for every polity colour.
    for (const p of this.data.app.polities)
      for (const kind of ['hatch', 'dots', 'cross'] as PatternKind[])
        map.addImage(patternId(kind, p.id), makePattern(kind, p.color), { pixelRatio: PATTERN_RATIO });

    const t = THEMES[this.theme];
    const none: ExpressionSpecification = ['==', ['get', 'sid'], '__none__'];
    // Fills and patterns first (all groups), then borders on top.
    const order: StyleClass['kind'][][] = [['fill', 'pattern'], ['line']];
    for (const kinds of order)
      for (const g of GROUPS)
        for (const c of STYLE_CLASSES.filter((x) => kinds.includes(x.kind))) {
          const filter: ExpressionSpecification = ['all', c.filter, none];
          if (c.kind === 'fill')
            map.addLayer({
              id: layerId(c, g),
              type: 'fill',
              source: 'territories',
              filter,
              paint: { 'fill-color': ['get', 'color'], 'fill-opacity': c.opacity },
            });
          else if (c.kind === 'pattern')
            map.addLayer({
              id: layerId(c, g),
              type: 'fill',
              source: 'territories',
              filter,
              paint: { 'fill-pattern': PATTERN_IMAGE, 'fill-opacity': c.opacity },
            });
          else
            map.addLayer({
              id: layerId(c, g),
              type: 'line',
              source: 'territories',
              filter,
              layout: c.dash ? { 'line-cap': 'round' } : {},
              paint: {
                'line-color': ['get', 'color'],
                'line-width': c.width ?? 1,
                'line-opacity': c.opacity,
                ...(c.dash ? { 'line-dasharray': c.dash } : {}),
              },
            });
        }
    map.addLayer({
      id: 'hover',
      type: 'line',
      source: 'territories',
      filter: none,
      paint: { 'line-color': ['get', 'color'], 'line-width': 2.5, 'line-opacity': 0.9 },
    });
    map.addLayer({
      id: 'selected',
      type: 'line',
      source: 'territories',
      filter: none,
      paint: { 'line-color': t.select, 'line-width': 2.2, 'line-opacity': 0.85 },
    });
    map.addLayer({
      id: 'capitals-dot',
      type: 'circle',
      source: 'capitals',
      minzoom: 4.5,
      filter: none,
      paint: {
        'circle-radius': 3,
        'circle-color': t.label,
        'circle-stroke-color': t.halo,
        'circle-stroke-width': 1.5,
      },
    });
    map.addLayer({
      id: 'capitals-label',
      type: 'symbol',
      source: 'capitals',
      minzoom: 5,
      filter: none,
      layout: {
        'text-field': ['get', 'name'],
        'text-font': FONT_ITALIC,
        'text-size': 11,
        'text-offset': [0, 0.9],
        'text-anchor': 'top',
        'text-max-width': 8,
      },
      paint: { 'text-color': t.label, 'text-halo-color': t.halo, 'text-halo-width': 1.4 },
    });
    map.addLayer({
      id: 'labels',
      type: 'symbol',
      source: 'labels',
      filter: none,
      layout: {
        'text-field': ['get', 'name'],
        'text-font': FONT_BOLD,
        'text-size': ['interpolate', ['linear'], ['zoom'], 3, 11, 6, 15, 9, 18],
        'text-letter-spacing': 0.04,
        'text-max-width': 9,
        'symbol-sort-key': ['-', 0, ['get', 'area']],
        'text-padding': 4,
      },
      paint: { 'text-color': t.label, 'text-halo-color': t.halo, 'text-halo-width': 1.6 },
    });

    // Interaction
    const hitLayers = GROUPS.flatMap((g) => STYLE_CLASSES.filter((c) => c.kind !== 'line').map((c) => layerId(c, g)));
    map.on('click', (e) => {
      const f = this.pick(e, hitLayers);
      this.opts.onSelect(f);
    });
    map.on('mousemove', (e) => {
      const f = this.pick(e, hitLayers);
      map.getCanvas().style.cursor = f ? 'pointer' : '';
      if (f !== this.hovered) {
        this.hovered = f;
        this.updateHighlight();
      }
    });
    map.on('mouseout', () => {
      this.hovered = null;
      this.updateHighlight();
    });

    // Refit now that the container has its final size (matters on small screens).
    map.fitBounds(HOME_BOUNDS, { padding: 10, duration: 0 });
    this.ready = true;
    this.setTheme(this.theme); // the base layers were created with the initial theme
    this.opts.onReady();
    if (this.pendingYear != null) this.setYear(this.pendingYear, false);
  }

  /** Topmost polity under the pointer: firmer boundary types win over zones. */
  private pick(e: MapLayerMouseEvent | { point: { x: number; y: number } }, layers: string[]): string | null {
    const feats = this.map.queryRenderedFeatures([e.point.x, e.point.y], { layers });
    if (!feats.length) return null;
    const rank: Record<string, number> = { documented: 4, occupation: 3, approximate: 2, zone_of_influence: 1, cultural_zone: 0 };
    feats.sort((a, b) => rank[b.properties.boundary_type] - rank[a.properties.boundary_type]);
    return feats[0].properties.polity as string;
  }

  /** Slice ids active in a year. */
  private activeSet(year: number): Set<string> {
    const s = new Set<string>();
    for (const f of this.data.territories.features)
      if (activeIn(year, f.properties) && this.inView(f.properties.views)) s.add(f.properties.sid);
    return s;
  }

  private get hiddenView(): 'doc' | 'est' {
    return this.estimated ? 'doc' : 'est';
  }
  private inView(views: string | undefined) {
    return (views ?? 'both') !== this.hiddenView;
  }

  /** Switch between documented-only and estimated-growth territory. */
  setEstimated(on: boolean) {
    if (on === this.estimated) return;
    this.estimated = on;
    if (this.ready && this.year != null) this.setYear(this.year, true);
  }

  private setGroup(g: Group, sids: string[]) {
    const ids: ExpressionSpecification = ['in', ['get', 'sid'], ['literal', sids]];
    for (const c of STYLE_CLASSES) this.map.setFilter(layerId(c, g), ['all', c.filter, ids]);
  }

  private setGroupOpacity(g: Group, k: number) {
    for (const c of STYLE_CLASSES) this.map.setPaintProperty(layerId(c, g), opacityProp(c), c.opacity * k);
  }

  private finishFade() {
    if (!this.fade) return;
    cancelAnimationFrame(this.fade.raf);
    clearTimeout(this.fade.timer);
    const f = this.fade;
    this.fade = null;
    f.resolve();
  }

  /**
   * Show the map for `year`. Territory that changes hands cross-fades over `duration` ms
   * (0 = instant). Calling again mid-fade completes the previous fade immediately.
   */
  setYear(year: number, animate = true, duration = 450) {
    if (!this.ready) {
      this.pendingYear = year;
      return;
    }
    this.finishFade();
    const next = this.activeSet(year);
    const prev = this.active;
    const incoming = [...next].filter((s) => !prev.has(s));
    const outgoing = [...prev].filter((s) => !next.has(s));
    const stable = [...next].filter((s) => prev.has(s));
    this.year = year;
    this.active = next;

    const yf = yearFilter(year, this.hiddenView);
    this.map.setFilter('labels', yf);
    this.map.setFilter('capitals-dot', yf);
    this.map.setFilter('capitals-label', yf);
    this.updateHighlight();

    const commit = () => {
      this.setGroup('stable', [...next]);
      this.setGroup('in', []);
      this.setGroup('out', []);
      this.setGroupOpacity('in', 1);
      this.setGroupOpacity('out', 1);
    };

    if (!animate || this.reducedMotion || duration < 30 || (!incoming.length && !outgoing.length)) {
      commit();
      return;
    }

    this.setGroup('stable', stable);
    this.setGroup('in', incoming);
    this.setGroup('out', outgoing);
    this.setGroupOpacity('in', 0);
    this.setGroupOpacity('out', 1);
    const start = performance.now();
    const step = (now: number) => {
      const t = Math.min(1, (now - start) / duration);
      const e = t * t * (3 - 2 * t); // smoothstep
      this.setGroupOpacity('in', e);
      this.setGroupOpacity('out', 1 - e);
      if (t < 1 && this.fade) this.fade.raf = requestAnimationFrame(step);
      else this.finishFade();
    };
    // The timer guarantees completion when animation frames are paused (background tabs).
    this.fade = {
      raf: requestAnimationFrame(step),
      timer: setTimeout(() => this.finishFade(), duration + 100),
      resolve: commit,
    };
  }

  setSelected(polity: string | null) {
    this.selected = polity;
    if (this.ready) this.updateHighlight();
  }

  private updateHighlight() {
    if (this.year == null) return;
    const yf = yearFilter(this.year, this.hiddenView);
    const none: ExpressionSpecification = ['==', ['get', 'sid'], '__none__'];
    this.map.setFilter(
      'selected',
      this.selected ? ['all', yf, ['==', ['get', 'polity'], this.selected], ['!=', bt, 'zone_of_influence']] : none,
    );
    this.map.setFilter(
      'hover',
      this.hovered && this.hovered !== this.selected
        ? ['all', yf, ['==', ['get', 'polity'], this.hovered], ['!=', bt, 'zone_of_influence']]
        : none,
    );
  }

  setTheme(name: 'light' | 'dark') {
    this.theme = name;
    if (!this.ready) return;
    const t = THEMES[name];
    const m = this.map;
    m.setPaintProperty('sea', 'background-color', t.sea);
    m.setPaintProperty('land', 'fill-color', t.land);
    m.setPaintProperty('coast', 'line-color', t.coast);
    m.setPaintProperty('selected', 'line-color', t.select);
    for (const id of ['labels', 'capitals-label']) {
      m.setPaintProperty(id, 'text-color', t.label);
      m.setPaintProperty(id, 'text-halo-color', t.halo);
    }
    m.setPaintProperty('capitals-dot', 'circle-color', t.label);
    m.setPaintProperty('capitals-dot', 'circle-stroke-color', t.halo);
  }

  /** Zoom to a polity's extent in the current year. */
  fitPolity(polity: string) {
    if (this.year == null) return;
    let [w, s, e, n] = [Infinity, Infinity, -Infinity, -Infinity];
    for (const f of this.data.territories.features) {
      const p = f.properties;
      if (p.polity !== polity || !activeIn(this.year, p) || !this.inView(p.views) || p.boundary_type === 'zone_of_influence')
        continue;
      const polys = f.geometry.type === 'Polygon' ? [f.geometry.coordinates] : f.geometry.coordinates;
      for (const poly of polys)
        for (const [x, y] of poly[0]) {
          w = Math.min(w, x);
          e = Math.max(e, x);
          s = Math.min(s, y);
          n = Math.max(n, y);
        }
    }
    if (w === Infinity) return;
    this.map.fitBounds(
      [
        [w, s],
        [e, n],
      ],
      { padding: 60, maxZoom: 7, duration: this.reducedMotion ? 0 : 800 },
    );
  }

  destroy() {
    this.finishFade();
    this.map.remove();
  }
}
