// Shapes of the built data in public/data/ (see scripts/build-data.ts).
import type { FeatureCollection, MultiPolygon, Point, Polygon } from 'geojson';

export type Confidence = 'high' | 'medium' | 'low';
export type BoundaryType = 'documented' | 'approximate' | 'zone_of_influence' | 'cultural_zone' | 'occupation';

export interface DateRef {
  year: number;
  approx?: boolean;
}

export interface TerritoryEntry {
  from: number;
  to: number | null;
  regions?: string[];
  countries?: string[];
  except_regions?: string[];
  boundary_type: BoundaryType;
  confidence: Confidence;
  sources?: string[];
  note?: string;
  grow_from?: number;
  grow_until?: number;
  shrink_from?: number;
}

export interface Polity {
  id: string;
  name: string;
  names: { name: string; lang?: string; note?: string }[];
  type: string;
  period: { start: DateRef; end: DateRef | null };
  color: string;
  capitals: { name: string; from?: number; to?: number; coords?: [number, number]; approx?: boolean; note?: string }[];
  summary: string;
  rulers: { name: string; from?: number; to?: number; attested?: number; approx?: boolean; note?: string }[];
  religions: string[];
  events: { year: number; approx?: boolean; text: string }[];
  emblem: { file: string; license: string; source_url: string; author?: string; description?: string } | null;
  confidence: Confidence;
  sources: string[];
  predecessors: string[];
  successors: string[];
  notes?: string;
  unmapped: { from: number; to: number; note: string }[];
  territory: TerritoryEntry[];
}

export interface Source {
  title: string;
  author?: string;
  year?: number;
  publisher?: string;
  url?: string;
  note?: string;
}

export interface Era {
  id: string;
  label: string;
  year: number;
  description?: string;
}

export interface Segment {
  from: number;
  to: number;
  share: number;
  play_speed: number;
}

export interface Timescale {
  min: number;
  max: number;
  segments: Segment[];
}

export interface GlobalEvent {
  year: number;
  approx?: boolean;
  text: string;
  polity?: string;
  sources?: string[];
}

export interface AppData {
  generated: string;
  timescale: Timescale;
  eras: Era[];
  events: GlobalEvent[];
  sources: Record<string, Source>;
  regions: Record<string, string>;
  polities: Polity[];
}

export interface TerritoryProps {
  sid: string;
  polity: string;
  color: string;
  from: number;
  to: number;
  boundary_type: BoundaryType;
  confidence: Confidence;
  /** Which view shows this feature: both, documented only, or estimated growth only. */
  views?: 'both' | 'doc' | 'est';
}
export type TerritoryFC = FeatureCollection<Polygon | MultiPolygon, TerritoryProps>;

export interface LabelProps {
  polity: string;
  name: string;
  from: number;
  to: number;
  area: number;
  views?: 'both' | 'doc' | 'est';
}
export type LabelFC = FeatureCollection<Point, LabelProps>;
