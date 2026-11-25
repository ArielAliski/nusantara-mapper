// One-time / occasional script: downloads open boundary datasets and turns them into
//   data/base/units.geojson  – modern admin units used as building blocks for historical regions
//   data/base/land.geojson   – coastline basemap for the whole map view
// Run with:  npm run base
// Raw downloads are cached in .cache/raw (gitignored). Outputs are committed.
//
// Sources and licenses (see data/base/ATTRIBUTION.md):
//   - Indonesia regencies/cities (ADM2): BPS / WFP / OCHA ROAP via geoBoundaries, CC BY 3.0 IGO
//   - Other countries' provinces/states + land: Natural Earth 10m, public domain

import fs from 'node:fs';
import path from 'node:path';
import mapshaper from 'mapshaper';

const ROOT = path.resolve(import.meta.dirname, '..');
const RAW = path.join(ROOT, '.cache', 'raw');
const TMP = path.join(ROOT, '.cache', 'tmp');
const OUT = path.join(ROOT, 'data', 'base');

const SOURCES = {
  'idn_adm2.geojson':
    'https://github.com/wmgeolab/geoBoundaries/raw/9469f09/releaseData/gbOpen/IDN/ADM2/geoBoundaries-IDN-ADM2_simplified.geojson',
  'ne_admin1.geojson':
    'https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_10m_admin_1_states_provinces.geojson',
  'ne_land.geojson':
    'https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_10m_land.geojson',
};

// Countries (besides Indonesia) whose first-level units we use as building blocks.
// Units the spatial join cannot place (offshore islands outside NE polygons).
const PROVINCE_OVERRIDES = { 'Kepulauan Seribu': 'Jakarta Raya' };

const OTHER_COUNTRIES = ['MYS', 'SGP', 'BRN', 'TLS', 'PHL', 'THA'];
// Map extent kept in the basemap [w, s, e, n]
const BBOX = [88, -16, 152, 24];

async function download() {
  fs.mkdirSync(RAW, { recursive: true });
  for (const [file, url] of Object.entries(SOURCES)) {
    const dest = path.join(RAW, file);
    if (fs.existsSync(dest)) continue;
    console.log(`Downloading ${file} …`);
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Download failed (${res.status}): ${url}`);
    fs.writeFileSync(dest, Buffer.from(await res.arrayBuffer()));
  }
}

const ms = (cmd) => mapshaper.runCommands(cmd);
const q = (p) => `"${p.replaceAll('\\', '/')}"`;
const slug = (s) =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_|_$/g, '');

async function main() {
  await download();
  fs.mkdirSync(TMP, { recursive: true });
  fs.mkdirSync(OUT, { recursive: true });
  const raw = (f) => q(path.join(RAW, f));
  const tmp = (f) => q(path.join(TMP, f));

  // 1. Indonesian regencies, tagged with their province (largest overlap with NE provinces).
  await ms(
    `-i ${raw('ne_admin1.geojson')} name=prov ` +
      `-filter 'adm0_a3 == "IDN"' -filter-fields name -rename-fields province=name ` +
      `-i ${raw('idn_adm2.geojson')} name=idn ` +
      `-join prov largest-overlap fields=province ` +
      `-each 'country = "IDN", name = shapeName' -filter-fields name,country,province ` +
      `-o ${tmp('idn_units.json')} format=geojson`,
  );

  // 2. Other countries' first-level units from Natural Earth, with Indonesian territory erased
  //    so the two sources do not overlap along land borders (Borneo, Timor).
  const list = OTHER_COUNTRIES.map((c) => `"${c}"`).join(',');
  await ms(
    `-i ${tmp('idn_units.json')} name=idn -dissolve name=idn_all ` +
      `-i ${raw('ne_admin1.geojson')} name=other ` +
      `-filter '[${list}].includes(adm0_a3)' ` +
      `-each 'country = adm0_a3, province = name, code = adm1_code' -filter-fields name,country,province,code ` +
      `-erase idn_all ` +
      `-o ${tmp('other_units.json')} format=geojson`,
  );

  // 3. Merge, give every unit a stable readable id, simplify with shared topology.
  const idn = JSON.parse(fs.readFileSync(path.join(TMP, 'idn_units.json')));
  const other = JSON.parse(fs.readFileSync(path.join(TMP, 'other_units.json')));
  const seen = new Set();
  const features = [];
  for (const f of [...idn.features, ...other.features]) {
    const p = f.properties;
    p.province ??= PROVINCE_OVERRIDES[p.name];
    let id = `${p.country}:${slug(p.name)}`;
    if (seen.has(id)) id = `${id}_${slug(p.code ?? p.province ?? 'x')}`;
    if (seen.has(id)) throw new Error(`Duplicate unit id ${id}`);
    seen.add(id);
    if (!p.province) console.warn(`  ! no province for ${id}`);
    features.push({
      type: 'Feature',
      properties: { id, name: p.name, country: p.country, province: p.province ?? null },
      geometry: f.geometry,
    });
  }
  fs.writeFileSync(path.join(TMP, 'units_merged.json'), JSON.stringify({ type: 'FeatureCollection', features }));

  await ms(
    `-i ${tmp('units_merged.json')} ` +
      `-clean snap-interval=0.0005 ` +
      `-simplify 6% weighted keep-shapes ` +
      `-filter-slivers min-area=0.05km2 ` +
      `-o ${q(path.join(OUT, 'units.geojson'))} format=geojson precision=0.0001`,
  );

  // 4. Land basemap clipped to the map extent.
  await ms(
    `-i ${raw('ne_land.geojson')} -clip bbox=${BBOX.join(',')} ` +
      `-simplify 12% weighted keep-shapes -filter-slivers min-area=1km2 ` +
      `-o ${q(path.join(OUT, 'land.geojson'))} format=geojson precision=0.0001`,
  );

  const size = (f) => (fs.statSync(path.join(OUT, f)).size / 1e6).toFixed(2) + ' MB';
  console.log(`units.geojson: ${features.length} units, ${size('units.geojson')}`);
  console.log(`land.geojson: ${size('land.geojson')}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
