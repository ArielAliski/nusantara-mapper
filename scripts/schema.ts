// Zod schemas for every human-edited data file. Single source of truth for validation.
import { z } from 'zod';

const year = z
  .number()
  .int()
  .refine((y) => y !== 0, { message: 'Year 0 does not exist (use -1 for 1 BC, 1 for AD 1)' });

const lonLat = z.tuple([z.number().min(-180).max(180), z.number().min(-90).max(90)]);

export const Confidence = z.enum(['high', 'medium', 'low']);
export const BoundaryType = z.enum([
  'documented', // border known from treaties, surveys, reliable maps
  'approximate', // roughly known extent; drawn with modern admin units as stand-ins
  'zone_of_influence', // tributary / hegemony / claim, not administered territory
  'cultural_zone', // archaeological or cultural area, not a polity
  'occupation', // military occupation / annexation not internationally recognised
]);
export type BoundaryType = z.infer<typeof BoundaryType>;

export const PolityType = z.enum([
  'cultural_zone',
  'chiefdom',
  'kingdom',
  'sultanate',
  'empire',
  'colony',
  'protectorate',
  'company_state',
  'state',
]);

const dateRef = z.object({ year, approx: z.boolean().optional() }).strict();

export const TerritoryEntry = z
  .object({
    from: year,
    to: year.nullable(), // exclusive; null = still held today
    regions: z.array(z.string()).optional(),
    countries: z.array(z.string()).optional(),
    except_regions: z.array(z.string()).optional(),
    boundary_type: BoundaryType,
    confidence: Confidence,
    sources: z.array(z.string()).optional(),
    note: z.string().optional(),
    // Estimated (illustrative) gradual change, used only by the "estimated growth" view.
    // The documented view always uses from/to as written.
    grow_from: year.optional(), // areas are gained one by one from this year until `from`
    grow_until: year.optional(), // areas are gained one by one from `from` until this year
    shrink_from: year.optional(), // areas are lost one by one from this year until `to`
    // Point the ramp is ordered around (nearest gained first / farthest lost first).
    // Defaults to the capital or the polity's other territory.
    ramp_seed: lonLat.optional(),
    // Reverse the ramp order (grow: farthest first; shrink: nearest lost first).
    ramp_reverse: z.boolean().optional(),
  })
  .strict()
  .refine((t) => t.to === null || t.to > t.from, { message: '`to` must be after `from`' })
  .refine((t) => t.grow_from == null || t.grow_from < t.from, { message: '`grow_from` must be before `from`' })
  .refine((t) => t.grow_from == null || t.grow_until == null, { message: 'use either `grow_from` or `grow_until`' })
  .refine((t) => t.grow_until == null || (t.grow_until > t.from && (t.to === null || t.grow_until <= t.to)), {
    message: '`grow_until` must lie between `from` and `to`',
  })
  .refine((t) => t.shrink_from == null || (t.to !== null && t.shrink_from > t.from && t.shrink_from < t.to), {
    message: '`shrink_from` must lie between `from` and `to` (and `to` must be set)',
  })
  .refine((t) => t.grow_until == null || t.shrink_from == null || t.grow_until <= t.shrink_from, {
    message: '`grow_until` must not be after `shrink_from`',
  })
  .refine((t) => (t.regions?.length ?? 0) + (t.countries?.length ?? 0) > 0, {
    message: 'territory entry needs `regions` or `countries`',
  });
export type TerritoryEntry = z.infer<typeof TerritoryEntry>;

export const Polity = z
  .object({
    id: z.string().regex(/^[a-z0-9_]+$/),
    name: z.string(),
    names: z
      .array(z.object({ name: z.string(), lang: z.string().optional(), note: z.string().optional() }).strict())
      .default([]),
    type: PolityType,
    period: z.object({ start: dateRef, end: dateRef.nullable() }).strict(),
    color: z.string().regex(/^#[0-9a-fA-F]{6}$/),
    capitals: z
      .array(
        z
          .object({
            name: z.string(),
            from: year.optional(),
            to: year.optional(),
            coords: lonLat.optional(),
            approx: z.boolean().optional(),
            note: z.string().optional(),
          })
          .strict(),
      )
      .default([]),
    summary: z.string(),
    rulers: z
      .array(
        z
          .object({
            name: z.string(),
            from: year.optional(),
            to: year.optional(),
            attested: year.optional(),
            approx: z.boolean().optional(),
            note: z.string().optional(),
          })
          .strict(),
      )
      .default([]),
    religions: z.array(z.string()).default([]),
    events: z
      .array(z.object({ year, approx: z.boolean().optional(), text: z.string() }).strict())
      .default([]),
    emblem: z
      .object({
        file: z.string(),
        license: z.string(),
        source_url: z.string().url(),
        author: z.string().optional(),
        description: z.string().optional(),
      })
      .strict()
      .nullable()
      .default(null),
    confidence: Confidence,
    sources: z.array(z.string()).min(1),
    predecessors: z.array(z.string()).default([]),
    successors: z.array(z.string()).default([]),
    notes: z.string().optional(),
    // Known periods with no territory drawn (silences the gap warning; shown in the info panel).
    unmapped: z
      .array(z.object({ from: year, to: year, note: z.string() }).strict())
      .default([]),
    territory: z.array(TerritoryEntry).min(1),
  })
  .strict();
export type Polity = z.infer<typeof Polity>;

export const Region = z
  .object({
    name: z.string(),
    note: z.string().optional(),
    units: z.array(z.string()).optional(),
    provinces: z.array(z.string()).optional(),
    countries: z.array(z.string()).optional(),
    exclude: z.array(z.string()).optional(),
  })
  .strict();
export const Regions = z.record(z.string(), Region);

export const Source = z
  .object({
    title: z.string(),
    author: z.string().optional(),
    year: z.number().int().optional(),
    publisher: z.string().optional(),
    url: z.string().url().optional(),
    note: z.string().optional(),
  })
  .strict();
export const Sources = z.record(z.string(), Source);

export const Era = z
  .object({ id: z.string(), label: z.string(), year, description: z.string().optional() })
  .strict();
export const Eras = z.array(Era);

export const GlobalEvent = z
  .object({
    year,
    approx: z.boolean().optional(),
    text: z.string(),
    polity: z.string().optional(),
    sources: z.array(z.string()).optional(),
  })
  .strict();
export const GlobalEvents = z.array(GlobalEvent);

export const Timescale = z
  .object({
    min: year,
    max: year,
    segments: z
      .array(
        z
          .object({ from: year, to: year, share: z.number().positive(), play_speed: z.number().positive() })
          .strict(),
      )
      .min(1),
  })
  .strict()
  .superRefine((t, ctx) => {
    const segs = t.segments;
    if (segs[0].from !== t.min) ctx.addIssue({ code: 'custom', message: 'first segment must start at `min`' });
    if (segs.at(-1)!.to !== t.max) ctx.addIssue({ code: 'custom', message: 'last segment must end at `max`' });
    for (let i = 1; i < segs.length; i++)
      if (segs[i].from !== segs[i - 1].to)
        ctx.addIssue({ code: 'custom', message: `segment ${i} must start where segment ${i - 1} ends` });
    const sum = segs.reduce((s, x) => s + x.share, 0);
    if (Math.abs(sum - 1) > 1e-6) ctx.addIssue({ code: 'custom', message: `shares must sum to 1 (got ${sum})` });
  });
export type Timescale = z.infer<typeof Timescale>;
