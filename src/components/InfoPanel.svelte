<script lang="ts">
  import type { AppData, BoundaryType, Polity, Source } from '../lib/types';
  import { activeIn, activeInView } from '../lib/data';
  import { formatRange, formatYear } from '../lib/years';

  interface Props {
    polity: Polity;
    year: number;
    estimated: boolean;
    app: AppData;
    onClose: () => void;
    onJump: (year: number) => void;
    onSelect: (id: string) => void;
    onZoom: () => void;
  }
  let { polity, year, estimated, app, onClose, onJump, onSelect, onZoom }: Props = $props();

  const BT_LABEL: Record<BoundaryType, string> = {
    documented: 'Documented border',
    approximate: 'Approximate extent',
    zone_of_influence: 'Zone of influence / claim',
    cultural_zone: 'Cultural zone',
    occupation: 'Military occupation',
  };
  const TYPE_LABEL: Record<string, string> = {
    cultural_zone: 'Archaeological culture',
    chiefdom: 'Chiefdom',
    kingdom: 'Kingdom',
    sultanate: 'Sultanate',
    empire: 'Empire',
    colony: 'Colony',
    protectorate: 'Protectorate',
    company_state: 'Company state',
    state: 'Sovereign state',
  };

  const p = $derived(polity);
  const period = $derived(
    formatRange(p.period.start.year, p.period.end?.year, {
      fromApprox: p.period.start.approx,
      toApprox: p.period.end?.approx,
    }),
  );
  const exists = $derived(activeIn(year, { from: p.period.start.year, to: p.period.end?.year ?? null }));
  const gap = $derived(p.unmapped?.find((g) => g.from <= year && year < g.to) ?? null);
  const nowEntries = $derived(p.territory.filter((t) => activeInView(year, t, estimated)));

  /** Describes an estimated growth/decline window the selected year falls in, if any. */
  function rampNote(t: Polity['territory'][number]): string | null {
    if (!estimated) return null;
    const range = (a: number, b: number) => `${formatYear(a)}–${formatYear(b)}`;
    if (t.grow_from != null && year >= t.grow_from && year < t.from)
      return `Estimated gradual expansion ${range(t.grow_from, t.from)}, reaching the documented extent in ${formatYear(t.from)}.`;
    if (t.grow_until != null && year >= t.from && year < t.grow_until)
      return `Estimated gradual expansion ${range(t.from, t.grow_until)}.`;
    if (t.shrink_from != null && t.to != null && year >= t.shrink_from && year < t.to)
      return `Estimated gradual decline ${range(t.shrink_from, t.to)}; lost entirely by ${formatYear(t.to)}.`;
    return null;
  }
  // Flag approximation for what is on the map now (or anywhere, if not mapped this year).
  const approximate = $derived(
    (nowEntries.length ? nowEntries : p.territory).some((t) => t.boundary_type !== 'documented'),
  );

  const COUNTRY: Record<string, string> = {
    IDN: 'Indonesia',
    MYS: 'Malaysia',
    SGP: 'Singapore',
    BRN: 'Brunei',
    TLS: 'Timor-Leste',
    PHL: 'the Philippines',
    THA: 'Thailand',
  };
  const regionList = (t: Polity['territory'][number]) => {
    const parts = (t.regions ?? []).map((r) => app.regions[r] ?? r);
    for (const c of t.countries ?? []) parts.push(`all of modern ${COUNTRY[c] ?? c}`);
    let s = parts.join(', ');
    if (t.except_regions?.length) s += ` (except ${t.except_regions.map((r) => app.regions[r] ?? r).join(', ')})`;
    return s;
  };

  const rulerActive = (r: Polity['rulers'][number]) =>
    r.from != null && r.from <= year && (r.to == null || year < r.to);
  const rulerDates = (r: Polity['rulers'][number]) => {
    if (r.attested != null) return `attested ${formatYear(r.attested, { approx: r.approx })}`;
    if (r.from == null && r.to == null) return 'dates unknown';
    return formatRange(r.from, r.to, { fromApprox: r.approx, toApprox: r.approx });
  };
  const capitalActive = (c: Polity['capitals'][number]) =>
    (c.from ?? p.period.start.year) <= year && (c.to == null || year < c.to);

  const allSourceIds = $derived([...new Set([...p.sources, ...p.territory.flatMap((t) => t.sources ?? [])])]);
  const cite = (s: Source) =>
    [s.author, s.year && `(${s.year})`, s.title].filter(Boolean).join(' ') + (s.publisher ? `. ${s.publisher}` : '');

  const nameOf = (id: string) => app.polities.find((x) => x.id === id)?.name;
  const initials = $derived(
    p.name
      .replace(/\(.*\)/, '')
      .split(/\s+/)
      .filter((w) => /^[A-Z]/.test(w))
      .slice(0, 2)
      .map((w) => w[0])
      .join(''),
  );
</script>

<article class="panel" aria-labelledby="panel-title">
  <header>
    <div class="emblem" style:--c={p.color}>
      {#if p.emblem}
        <img src={`${import.meta.env.BASE_URL}${p.emblem.file}`} alt={p.emblem.description ?? `Emblem of ${p.name}`} />
      {:else}
        <span class="placeholder" title="No licensed emblem available">{initials}</span>
      {/if}
    </div>
    <div class="titles">
      <h2 id="panel-title">{p.name}</h2>
      <div class="meta">{TYPE_LABEL[p.type] ?? p.type} · {period}</div>
    </div>
    <button class="close" onclick={onClose} aria-label="Close panel">×</button>
  </header>

  <div class="badges">
    <span class={`badge conf-${p.confidence}`}>Confidence: {p.confidence}</span>
    {#if approximate}<span class="badge warn">Borders approximate</span>{/if}
    <button class="link" onclick={onZoom}>Zoom to</button>
  </div>

  {#if p.names.length}
    <p class="alt-names">
      {#each p.names as n, i}
        <span title={n.note}>{n.name}{#if n.lang}<span class="lang">{' '}({n.lang})</span>{/if}</span>{#if i < p.names.length - 1}{'; '}{/if}
      {/each}
    </p>
  {/if}

  <section class="now">
    <h3>In {formatYear(year)}</h3>
    {#if !exists}
      <p class="muted">Not on the map in this year. Existed {period}.</p>
    {:else if !nowEntries.length}
      <p class="muted">
        {#if gap}Not on the map {formatRange(gap.from, gap.to)}: {gap.note}{:else}No territory is mapped for this year.{/if}
      </p>
    {:else}
      <ul class="entries">
        {#each nowEntries as t}
          <li>
            <div class="entry-head">
              <span class={`swatch bt-${t.boundary_type}`} class:low={t.confidence === 'low'} style:--c={p.color}></span>
              <strong>{BT_LABEL[t.boundary_type]}</strong>
              <span class={`badge small conf-${t.confidence}`}>{t.confidence}</span>
              <span class="range">{formatRange(t.from, t.to)}</span>
            </div>
            <div class="regions">{regionList(t)}</div>
            {#if rampNote(t)}
              <p class="estimate">
                <strong>Illustrative:</strong> {rampNote(t)} Only part of this area is drawn; the order and
                pace are estimates, not historical record.
              </p>
            {/if}
            {#if t.note}<p class="note">{t.note}</p>{/if}
          </li>
        {/each}
      </ul>
    {/if}
  </section>

  <section>
    <p>{p.summary}</p>
  </section>

  <section class="facts">
    <dl>
      {#if p.capitals.length}
        <dt>Capital</dt>
        <dd>
          {#each p.capitals as c}
            <div class:current={capitalActive(c)}>
              {c.approx ? 'c. ' : ''}{c.name}
              {#if p.capitals.length > 1}<span class="muted"> ({formatRange(c.from ?? p.period.start.year, c.to)})</span>{/if}
              {#if c.note}<span class="muted"> – {c.note}</span>{/if}
            </div>
          {/each}
        </dd>
      {:else}
        <dt>Capital</dt>
        <dd class="muted">Unknown</dd>
      {/if}
      <dt>Religion</dt>
      <dd>{p.religions.join(', ') || 'Unknown'}</dd>
    </dl>
  </section>

  {#if p.rulers.length}
    <section>
      <h3>Rulers</h3>
      <ul class="rulers">
        {#each p.rulers as r}
          <li class:current={rulerActive(r)}>
            <span>{r.name}</span>
            <span class="muted">{rulerDates(r)}</span>
            {#if r.note}<div class="note">{r.note}</div>{/if}
          </li>
        {/each}
      </ul>
    </section>
  {/if}

  {#if p.events.length}
    <section>
      <h3>Notable events</h3>
      <ol class="events">
        {#each p.events as e}
          <li>
            <button class="year-link" onclick={() => onJump(e.year)} title="Jump to this year">
              {formatYear(e.year, { approx: e.approx })}
            </button>
            <span>{e.text}</span>
          </li>
        {/each}
      </ol>
    </section>
  {/if}

  {#if p.predecessors.length || p.successors.length}
    <section class="links">
      {#if p.predecessors.length}
        <div>
          Preceded by:
          {#each p.predecessors as id}
            {#if nameOf(id)}<button class="link" onclick={() => onSelect(id)}>{nameOf(id)}</button>{:else}<span class="muted">{id}</span>{/if}
          {/each}
        </div>
      {/if}
      {#if p.successors.length}
        <div>
          Succeeded by:
          {#each p.successors as id}
            {#if nameOf(id)}<button class="link" onclick={() => onSelect(id)}>{nameOf(id)}</button>{:else}<span class="muted">{id}</span>{/if}
          {/each}
        </div>
      {/if}
    </section>
  {/if}

  {#if p.notes}
    <section class="caveat">
      <h3>About this data</h3>
      <p>{p.notes}</p>
    </section>
  {/if}

  <section>
    <h3>Sources</h3>
    <ul class="sources">
      {#each allSourceIds as id}
        {@const s = app.sources[id]}
        {#if s}
          <li>
            {#if s.url}<a href={s.url} target="_blank" rel="noopener">{cite(s)}</a>{:else}{cite(s)}{/if}
            {#if s.note}<div class="muted">{s.note}</div>{/if}
          </li>
        {/if}
      {/each}
    </ul>
    {#if p.emblem}
      <p class="muted small">
        Emblem: <a href={p.emblem.source_url} target="_blank" rel="noopener">source</a>, {p.emblem.license}{p.emblem.author ? `, ${p.emblem.author}` : ''}.
      </p>
    {/if}
  </section>
</article>

<style>
  .panel {
    display: flex;
    flex-direction: column;
    gap: 14px;
    font-size: 0.92rem;
    line-height: 1.5;
  }
  header {
    display: flex;
    gap: 12px;
    align-items: flex-start;
  }
  .emblem {
    width: 52px;
    height: 52px;
    flex: none;
    border-radius: 10px;
    overflow: hidden;
    display: grid;
    place-items: center;
    background: color-mix(in srgb, var(--c) 18%, var(--surface));
    border: 1px solid color-mix(in srgb, var(--c) 45%, transparent);
  }
  .emblem img {
    width: 100%;
    height: 100%;
    object-fit: contain;
  }
  .placeholder {
    font-weight: 700;
    font-size: 1.05rem;
    color: var(--c);
    letter-spacing: 0.02em;
  }
  .titles {
    flex: 1;
    min-width: 0;
  }
  h2 {
    margin: 0;
    font-size: 1.3rem;
    line-height: 1.25;
  }
  h3 {
    margin: 0 0 6px;
    font-size: 0.78rem;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    color: var(--text-muted);
  }
  .meta {
    color: var(--text-muted);
    font-size: 0.85rem;
  }
  .close {
    border: none;
    background: none;
    color: var(--text-muted);
    font-size: 1.6rem;
    line-height: 1;
    cursor: pointer;
    padding: 0 4px;
  }
  .close:hover {
    color: var(--text);
  }
  section p {
    margin: 0;
  }
  .badges {
    display: flex;
    gap: 6px;
    flex-wrap: wrap;
    align-items: center;
  }
  .badge {
    font-size: 0.75rem;
    padding: 2px 8px;
    border-radius: 999px;
    background: var(--chip);
    white-space: nowrap;
  }
  .badge.small {
    font-size: 0.7rem;
    padding: 0 6px;
  }
  .conf-high {
    background: var(--conf-high-bg);
    color: var(--conf-high);
  }
  .conf-medium {
    background: var(--conf-med-bg);
    color: var(--conf-med);
  }
  .conf-low {
    background: var(--conf-low-bg);
    color: var(--conf-low);
  }
  .warn {
    background: var(--conf-med-bg);
    color: var(--conf-med);
  }
  .alt-names {
    color: var(--text-muted);
    font-size: 0.85rem;
  }
  .lang {
    opacity: 0.8;
  }
  .now {
    background: var(--surface-2);
    border-radius: 10px;
    padding: 10px 12px;
  }
  .entries {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 10px;
  }
  .entry-head {
    display: flex;
    align-items: center;
    gap: 6px;
    flex-wrap: wrap;
  }
  .range {
    margin-left: auto;
    color: var(--text-muted);
    font-size: 0.8rem;
    font-variant-numeric: tabular-nums;
  }
  .regions {
    font-size: 0.85rem;
  }
  .note {
    font-size: 0.82rem;
    color: var(--text-muted);
    margin-top: 2px;
  }
  .estimate {
    font-size: 0.8rem;
    margin-top: 4px;
    padding: 4px 8px;
    border-radius: 6px;
    background: var(--conf-med-bg);
    color: var(--conf-med);
  }
  .swatch {
    width: 16px;
    height: 12px;
    border-radius: 3px;
    flex: none;
    border: 1.5px solid var(--c);
    background: color-mix(in srgb, var(--c) 45%, transparent);
  }
  .swatch.bt-approximate {
    border-style: dashed;
    background: color-mix(in srgb, var(--c) 30%, transparent);
  }
  .swatch.bt-approximate.low,
  .swatch.bt-zone_of_influence {
    border-style: dotted;
    background: repeating-linear-gradient(-45deg, var(--c) 0 1.5px, transparent 1.5px 5px);
  }
  .swatch.bt-zone_of_influence {
    border: none;
  }
  .swatch.bt-cultural_zone {
    border: none;
    background: radial-gradient(var(--c) 1.2px, transparent 1.4px) 0 0 / 5px 5px;
  }
  .swatch.bt-occupation {
    background:
      repeating-linear-gradient(45deg, var(--c) 0 1.2px, transparent 1.2px 5px),
      repeating-linear-gradient(-45deg, var(--c) 0 1.2px, transparent 1.2px 5px);
  }
  dl {
    display: grid;
    grid-template-columns: auto 1fr;
    gap: 4px 12px;
    margin: 0;
  }
  dt {
    color: var(--text-muted);
  }
  dd {
    margin: 0;
  }
  .current {
    font-weight: 650;
  }
  .rulers,
  .events,
  .sources {
    margin: 0;
    padding: 0;
    list-style: none;
    display: flex;
    flex-direction: column;
    gap: 4px;
  }
  .rulers li {
    display: flex;
    flex-wrap: wrap;
    justify-content: space-between;
    gap: 0 10px;
    padding: 2px 6px;
    margin: 0 -6px;
    border-radius: 6px;
  }
  .rulers li.current {
    background: var(--surface-2);
  }
  .rulers .note {
    flex-basis: 100%;
    font-weight: 400;
  }
  .events li {
    display: grid;
    grid-template-columns: 5.5rem 1fr;
    gap: 8px;
  }
  .year-link,
  .link {
    font: inherit;
    background: none;
    border: none;
    padding: 0;
    color: var(--link);
    cursor: pointer;
    text-align: left;
    font-variant-numeric: tabular-nums;
  }
  .year-link:hover,
  .link:hover {
    text-decoration: underline;
  }
  .badges .link {
    margin-left: auto;
    font-size: 0.85rem;
  }
  .links {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }
  .links .link {
    margin-left: 4px;
  }
  .caveat {
    border-left: 3px solid var(--conf-med);
    padding-left: 10px;
  }
  .sources li {
    font-size: 0.83rem;
  }
  .sources a {
    color: var(--link);
  }
  .muted {
    color: var(--text-muted);
  }
  .small {
    font-size: 0.78rem;
  }
</style>
