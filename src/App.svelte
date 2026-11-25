<script lang="ts">
  import { onDestroy } from 'svelte';
  import TimeSlider from './components/TimeSlider.svelte';
  import InfoPanel from './components/InfoPanel.svelte';
  import Legend from './components/Legend.svelte';
  import EventsFeed from './components/EventsFeed.svelte';
  import { activeInView, loadData, type LoadedData } from './lib/data';
  import { buildFeed, eventsCrossed, type FeedEvent } from './lib/events';
  import { MapRenderer } from './lib/mapRenderer';
  import { playSpeedAt } from './lib/timescale';
  import { addYears, clampYear, formatYear, isValidYear } from './lib/years';

  const DEFAULT_YEAR = 1365;

  // ── state ──
  // Raw (non-proxied) state: the GeoJSON is large and never mutated.
  let data = $state.raw<LoadedData | null>(null);
  let loadError = $state<string | null>(null);
  let year = $state(DEFAULT_YEAR);
  let selected = $state<string | null>(null);
  let playing = $state(false);
  let speed = $state(1);
  let mapReady = $state(false);
  let barH = $state(150);
  let mapEl: HTMLDivElement | undefined = $state();
  let renderer: MapRenderer | null = null;

  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;

  // ── estimated gradual growth (on by default; choice remembered per browser) ──
  let estimated = $state(readEstimated());
  function readEstimated(): boolean {
    try {
      return localStorage.getItem('estimated') !== 'off';
    } catch {
      return true;
    }
  }
  function setEstimated(on: boolean) {
    estimated = on;
    try {
      localStorage.setItem('estimated', on ? 'on' : 'off');
    } catch {
      /* storage unavailable */
    }
  }
  $effect(() => {
    const on = estimated;
    if (mapReady) renderer?.setEstimated(on);
  });

  // ── left card tabs ──
  let tab = $state<'events' | 'legend'>('events');
  let sideOpen = $state(!matchMedia('(max-width: 760px)').matches);
  function openTab(t: 'events' | 'legend') {
    if (sideOpen && tab === t) sideOpen = false;
    else {
      tab = t;
      sideOpen = true;
    }
  }

  // ── theme (follows the OS unless toggled; toggle remembered per browser) ──
  const darkMq = matchMedia('(prefers-color-scheme: dark)');
  let themePref = $state<'auto' | 'light' | 'dark'>(readPref());
  let systemDark = $state(darkMq.matches);
  darkMq.addEventListener('change', (e) => (systemDark = e.matches));
  const theme = $derived(themePref === 'auto' ? (systemDark ? 'dark' : 'light') : themePref);
  function readPref(): 'auto' | 'light' | 'dark' {
    try {
      const v = localStorage.getItem('theme');
      return v === 'light' || v === 'dark' ? v : 'auto';
    } catch {
      return 'auto';
    }
  }
  function toggleTheme() {
    themePref = theme === 'dark' ? 'light' : 'dark';
    try {
      localStorage.setItem('theme', themePref);
    } catch {
      /* storage unavailable */
    }
  }
  $effect(() => {
    if (themePref === 'auto') document.documentElement.removeAttribute('data-theme');
    else document.documentElement.setAttribute('data-theme', themePref);
    renderer?.setTheme(theme);
  });

  // ── URL hash: #year=1365&polity=majapahit ──
  function readHash() {
    const h = new URLSearchParams(location.hash.slice(1));
    const y = Number(h.get('year'));
    if (h.has('year') && isValidYear(y)) year = y;
    selected = h.get('polity');
  }
  readHash();
  // Back/forward and edited or pasted links. Our own updates use replaceState, which does not fire this.
  window.addEventListener('hashchange', readHash);
  $effect(() => {
    const h = new URLSearchParams();
    h.set('year', String(year));
    if (selected) h.set('polity', selected);
    history.replaceState(null, '', `#${h}`);
  });

  // ── data + map ──
  loadData()
    .then((d) => {
      data = d;
      year = clampYear(year, d.app.timescale.min, d.app.timescale.max);
      if (selected && !d.app.polities.some((p) => p.id === selected)) selected = null;
    })
    .catch((e) => (loadError = String(e.message ?? e)));

  $effect(() => {
    if (!data || !mapEl || renderer) return;
    renderer = new MapRenderer({
      container: mapEl,
      data,
      theme,
      reducedMotion,
      estimated,
      onSelect: (id) => (selected = id),
      onReady: () => (mapReady = true),
    });
  });
  onDestroy(() => renderer?.destroy());

  const ts = $derived(data?.app.timescale);
  const yearsPerSecond = $derived(ts ? playSpeedAt(ts, year) * speed : 1);
  // Fade length: long when stepping by hand, shorter than one step while playing.
  const fadeMs = $derived(playing ? Math.min(450, 900 / yearsPerSecond) : 450);

  $effect(() => {
    if (mapReady) renderer?.setYear(year, true, fadeMs);
  });
  $effect(() => {
    if (mapReady) renderer?.setSelected(selected);
  });

  // ── playback ──
  let raf = 0;
  let last = 0;
  let acc = 0;
  function tick(now: number) {
    if (!ts) return;
    const dt = Math.min(0.25, (now - last) / 1000);
    last = now;
    acc += dt * playSpeedAt(ts, year) * speed;
    if (acc >= 1) {
      const n = Math.floor(acc);
      acc -= n;
      const next = clampYear(addYears(year, n), ts.min, ts.max);
      year = next;
      if (next >= ts.max) {
        playing = false;
        return;
      }
    }
    raf = requestAnimationFrame(tick);
  }
  function togglePlay() {
    if (!ts) return;
    playing = !playing;
    if (playing) {
      if (year >= ts.max) year = ts.min;
      acc = 0;
      last = performance.now();
      raf = requestAnimationFrame(tick);
    } else cancelAnimationFrame(raf);
  }
  function setYear(y: number) {
    year = y;
  }

  // Global shortcuts when nothing in particular has focus.
  function onKey(e: KeyboardEvent) {
    if (!ts) return;
    const el = document.activeElement;
    if (el && el !== document.body) return;
    const big = e.shiftKey ? 10 : 1;
    if (e.key === 'ArrowRight') year = clampYear(addYears(year, big), ts.min, ts.max);
    else if (e.key === 'ArrowLeft') year = clampYear(addYears(year, -big), ts.min, ts.max);
    else if (e.key === ' ') togglePlay();
    else if (e.key === 'Escape') selected = null;
    else return;
    e.preventDefault();
  }

  const polity = $derived(data?.app.polities.find((p) => p.id === selected) ?? null);
  const visible = $derived(
    data ? data.app.polities.filter((p) => p.territory.some((t) => activeInView(year, t, estimated))) : [],
  );

  // ── events feed + toast for events passed while stepping or playing ──
  const feed = $derived(data ? buildFeed(data.app) : []);
  let toast = $state<FeedEvent[]>([]);
  let toastTimer: ReturnType<typeof setTimeout> | undefined;
  let prevYear: number | null = null;
  $effect(() => {
    const y = year;
    if (!feed.length) return;
    const crossed = eventsCrossed(feed, prevYear, y);
    const smallStepForward = prevYear != null && y > prevYear && y - prevYear <= 25;
    prevYear = y;
    if (!crossed.length) {
      // Keep a recent announcement while stepping forward; drop it after jumps or going back.
      if (!smallStepForward) toast = [];
      return;
    }
    toast = crossed.slice(-2);
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => (toast = []), playing ? 3500 : 6000);
  });

  $effect(() => {
    document.title = polity ? `${polity.name} · ${formatYear(year)} · Nusantara Mapper` : `${formatYear(year)} · Nusantara Mapper`;
  });
</script>

<svelte:window onkeydown={onKey} />

<div class="app" class:has-panel={!!polity} style:--bar-h={`${barH}px`}>
  <div class="map" bind:this={mapEl} role="application" aria-label="Historical map of the Nusantara region"></div>

  <header class="card brand">
    <div class="title-row">
      <h1>Nusantara Mapper</h1>
      <button class="theme" onclick={toggleTheme} aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} theme`} title="Toggle theme">
        {theme === 'dark' ? '☀' : '☾'}
      </button>
    </div>
    <p class="sub">Political history of maritime Southeast Asia, 1500 BC – 2026</p>
    {#if data}
      <div class="present">
        <h2 class="mini">Mapped in {formatYear(year)}</h2>
        {#if visible.length}
          <ul class="chips">
            {#each visible as p (p.id)}
              <li>
                <button class:active={selected === p.id} style:--c={p.color} onclick={() => (selected = p.id)}>
                  <span class="dot" aria-hidden="true"></span>{p.name}
                </button>
              </li>
            {/each}
          </ul>
        {:else}
          <p class="fine">No polities mapped for this year yet.</p>
        {/if}
      </div>
      <div class="tabs" role="tablist" aria-label="Side panel">
        <button role="tab" aria-selected={sideOpen && tab === 'events'} class:on={sideOpen && tab === 'events'} onclick={() => openTab('events')}>
          What&rsquo;s happening
        </button>
        <button role="tab" aria-selected={sideOpen && tab === 'legend'} class:on={sideOpen && tab === 'legend'} onclick={() => openTab('legend')}>
          Legend
        </button>
      </div>
      {#if sideOpen}
        <div role="tabpanel">
          {#if tab === 'events'}
            <EventsFeed {feed} {year} onJump={setYear} onSelect={(id) => (selected = id)} />
          {:else}
            <Legend {estimated} onEstimated={setEstimated} />
          {/if}
        </div>
      {/if}
    {/if}
  </header>

  {#if polity && data}
    <aside class="card panel-wrap" aria-label="Polity details">
      <InfoPanel
        {polity}
        {year}
        {estimated}
        app={data.app}
        onClose={() => (selected = null)}
        onJump={setYear}
        onSelect={(id) => (selected = id)}
        onZoom={() => renderer?.fitPolity(polity.id)}
      />
    </aside>
  {/if}

  <footer class="card bar" bind:clientHeight={barH}>
    {#if data && ts}
      <TimeSlider
        timescale={ts}
        eras={data.app.eras}
        {year}
        {playing}
        {speed}
        onYear={setYear}
        onTogglePlay={togglePlay}
        onSpeed={(s) => (speed = s)}
      />
    {:else if loadError}
      <p class="error" role="alert">{loadError}</p>
    {:else}
      <p class="loading">Loading map data…</p>
    {/if}
  </footer>

  {#if toast.length}
    <div class="toast" role="status" aria-live="polite">
      {#each toast as e (e.id)}
        <div class="toast-item">
          <span class="toast-year">{formatYear(e.year, { approx: e.approx })}</span>
          <span>{e.text}</span>
        </div>
      {/each}
    </div>
  {/if}

  {#if mapReady && !visible.length}
    <div class="empty-note" role="status">No polities are mapped for {formatYear(year)} yet.</div>
  {/if}
</div>

<style>
  .app {
    position: fixed;
    inset: 0;
    overflow: hidden;
  }
  .map {
    position: absolute;
    inset: 0;
  }
  .card {
    position: absolute;
    background: var(--panel);
    color: var(--text);
    border: 1px solid var(--border);
    border-radius: 14px;
    box-shadow: var(--shadow);
    backdrop-filter: blur(8px);
  }
  .brand {
    top: 12px;
    left: 12px;
    width: 290px;
    max-height: calc(100% - var(--bar-h) - 52px);
    overflow-y: auto;
    padding: 12px 14px;
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  .title-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
  }
  h1 {
    margin: 0;
    font-size: 1.1rem;
    letter-spacing: -0.01em;
  }
  .sub {
    margin: 0;
    color: var(--text-muted);
    font-size: 0.8rem;
  }
  .mini {
    margin: 0 0 4px;
    font-size: 0.72rem;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    color: var(--text-muted);
  }
  .fine {
    margin: 0;
    color: var(--text-muted);
    font-size: 0.76rem;
  }
  .chips {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-wrap: wrap;
    gap: 4px;
  }
  .chips button {
    font: inherit;
    font-size: 0.78rem;
    display: flex;
    align-items: center;
    gap: 5px;
    padding: 2px 8px;
    border-radius: 999px;
    border: 1px solid var(--border);
    background: var(--surface);
    color: var(--text);
    cursor: pointer;
  }
  .chips button.active,
  .chips button:hover {
    border-color: var(--c);
  }
  .dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: var(--c);
  }
  .tabs {
    display: flex;
    gap: 4px;
    border-bottom: 1px solid var(--border);
  }
  .tabs button {
    font: inherit;
    font-size: 0.82rem;
    font-weight: 600;
    background: none;
    border: none;
    border-bottom: 2px solid transparent;
    color: var(--text-muted);
    padding: 4px 6px 6px;
    margin-bottom: -1px;
    cursor: pointer;
  }
  .tabs button.on {
    color: var(--text);
    border-bottom-color: var(--accent);
  }
  .toast {
    position: absolute;
    left: 50%;
    top: 14px;
    transform: translateX(-50%);
    max-width: min(520px, calc(100% - 32px));
    background: var(--panel);
    color: var(--text);
    border: 1px solid var(--border);
    border-left: 3px solid var(--accent);
    border-radius: 10px;
    box-shadow: var(--shadow);
    padding: 8px 12px;
    font-size: 0.85rem;
    display: flex;
    flex-direction: column;
    gap: 4px;
    pointer-events: none;
    animation: toast-in 0.25s ease-out;
    z-index: 3;
  }
  .toast-item {
    display: flex;
    gap: 8px;
  }
  .toast-year {
    font-weight: 700;
    font-variant-numeric: tabular-nums;
    white-space: nowrap;
  }
  @keyframes toast-in {
    from {
      opacity: 0;
      transform: translate(-50%, -6px);
    }
  }
  @media (prefers-reduced-motion: reduce) {
    .toast {
      animation: none;
    }
  }
  .theme {
    border: 1px solid var(--border);
    background: var(--surface);
    color: var(--text);
    border-radius: 8px;
    width: 30px;
    height: 30px;
    cursor: pointer;
  }
  .panel-wrap {
    top: 12px;
    right: 56px;
    bottom: calc(var(--bar-h) + 38px);
    width: 380px;
    overflow-y: auto;
    padding: 14px 16px;
  }
  .bar {
    left: 12px;
    right: 12px;
    bottom: 26px;
    padding: 8px 14px 6px;
  }
  .loading,
  .error {
    margin: 10px 0;
  }
  .error {
    color: var(--conf-low);
  }
  .empty-note {
    position: absolute;
    left: 50%;
    top: 40%;
    transform: translate(-50%, -50%);
    background: var(--panel);
    border: 1px solid var(--border);
    color: var(--text-muted);
    padding: 8px 14px;
    border-radius: 999px;
    font-size: 0.85rem;
    pointer-events: none;
  }

  @media (max-width: 760px) {
    .brand {
      top: 8px;
      left: 8px;
      right: 56px;
      width: auto;
      max-height: 40%;
      padding: 10px 12px;
    }
    .sub {
      display: none;
    }
    .panel-wrap {
      left: 8px;
      right: 8px;
      top: auto;
      bottom: calc(var(--bar-h) + 30px);
      width: auto;
      max-height: 52%;
      z-index: 2;
    }
    .has-panel .brand {
      display: none;
    }
    .toast {
      top: auto;
      left: 8px;
      right: 8px;
      max-width: none;
      transform: none;
      animation: none;
      bottom: calc(var(--bar-h) + 104px); /* above the map attribution (two lines on phones) */
    }
    .has-panel .toast {
      display: none;
    }
    .bar {
      left: 8px;
      right: 8px;
      bottom: 22px;
      padding: 6px 10px 4px;
    }
  }
</style>
