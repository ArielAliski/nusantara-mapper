<script lang="ts">
  import type { Era, Timescale } from '../lib/types';
  import { posToYear, yearToPos } from '../lib/timescale';
  import { addYears, clampYear, formatYear } from '../lib/years';

  interface Props {
    timescale: Timescale;
    eras: Era[];
    year: number;
    playing: boolean;
    speed: number;
    onYear: (y: number) => void;
    onTogglePlay: () => void;
    onSpeed: (s: number) => void;
  }
  let { timescale, eras, year, playing, speed, onYear, onTogglePlay, onSpeed }: Props = $props();

  const RES = 10000; // slider resolution (positions)
  let track: HTMLDivElement;

  const pos = $derived(yearToPos(timescale, year));
  const step = (d: number) => onYear(clampYear(addYears(year, d), timescale.min, timescale.max));

  // Segment boundaries become tick labels.
  const ticks = $derived(
    [timescale.segments[0].from, ...timescale.segments.map((s) => s.to)].map((y) => ({
      y,
      p: yearToPos(timescale, y),
    })),
  );

  function onInput(e: Event) {
    const v = +(e.currentTarget as HTMLInputElement).value;
    onYear(clampYear(posToYear(timescale, v / RES), timescale.min, timescale.max));
  }

  // Keyboard always moves by real years, not slider positions.
  function onKey(e: KeyboardEvent) {
    const big = e.shiftKey ? 10 : 1;
    let handled = true;
    switch (e.key) {
      case 'ArrowRight':
      case 'ArrowUp':
        step(big);
        break;
      case 'ArrowLeft':
      case 'ArrowDown':
        step(-big);
        break;
      case 'PageUp':
        step(100);
        break;
      case 'PageDown':
        step(-100);
        break;
      case 'Home':
        onYear(timescale.min);
        break;
      case 'End':
        onYear(timescale.max);
        break;
      default:
        handled = false;
    }
    if (handled) e.preventDefault();
  }

  const SPEEDS = [0.5, 1, 2, 4];
</script>

<div class="slider">
  <div class="controls">
    <button class="icon play" onclick={onTogglePlay} aria-label={playing ? 'Pause' : 'Play through time'} title={playing ? 'Pause (Space)' : 'Play (Space)'}>
      {#if playing}
        <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="6" y="5" width="4" height="14" rx="1" /><rect x="14" y="5" width="4" height="14" rx="1" /></svg>
      {:else}
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5.5v13a1 1 0 0 0 1.5.86l10.5-6.5a1 1 0 0 0 0-1.72L9.5 4.64A1 1 0 0 0 8 5.5z" /></svg>
      {/if}
    </button>
    <button class="icon" onclick={() => step(-1)} aria-label="Previous year" title="Previous year (←)">
      <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 6l-6 6 6 6" /></svg>
    </button>
    <output class="year" aria-live="polite">{formatYear(year)}</output>
    <button class="icon" onclick={() => step(1)} aria-label="Next year" title="Next year (→)">
      <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 6l6 6-6 6" /></svg>
    </button>
    <label class="era-select">
      <span class="sr-only">Jump to era</span>
      <select
        value=""
        onchange={(e) => {
          const v = (e.currentTarget as HTMLSelectElement).value;
          if (v) onYear(+v);
          (e.currentTarget as HTMLSelectElement).value = '';
        }}
      >
        <option value="" disabled>Jump to era…</option>
        {#each eras as era (era.id)}<option value={era.year}>{era.label} ({formatYear(era.year)})</option>{/each}
      </select>
    </label>
    <label class="speed">
      <span class="sr-only">Playback speed</span>
      <select value={speed} onchange={(e) => onSpeed(+(e.currentTarget as HTMLSelectElement).value)}>
        {#each SPEEDS as s}<option value={s}>{s}×</option>{/each}
      </select>
    </label>
  </div>

  <div class="track-wrap">
    <div class="eras" role="group" aria-label="Jump to era">
      {#each eras as era, i (era.id)}
        <button
          class="era"
          class:upper={i % 2 === 1}
          class:current={Math.abs(yearToPos(timescale, era.year) - pos) < 0.004}
          style:left={`${yearToPos(timescale, era.year) * 100}%`}
          onclick={() => onYear(era.year)}
          title={`${era.label} – ${formatYear(era.year)}${era.description ? `: ${era.description}` : ''}`}
        >
          <span>{era.label}</span>
        </button>
      {/each}
    </div>

    <div class="track" bind:this={track}>
      {#each timescale.segments as s, i}
        <div
          class="seg"
          class:alt={i % 2 === 1}
          style:left={`${yearToPos(timescale, s.from) * 100}%`}
          style:width={`${s.share * 100}%`}
        ></div>
      {/each}
      <div class="fill" style:width={`${pos * 100}%`}></div>
      <input
        type="range"
        min="0"
        max={RES}
        step="1"
        value={Math.round(pos * RES)}
        oninput={onInput}
        onkeydown={onKey}
        aria-label="Year"
        aria-valuetext={formatYear(year)}
      />
    </div>

    <div class="ticks" aria-hidden="true">
      {#each ticks as t}
        <span style:left={`${t.p * 100}%`}>{formatYear(t.y)}</span>
      {/each}
    </div>
  </div>
</div>

<style>
  .slider {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }
  .controls {
    display: flex;
    align-items: center;
    gap: 6px;
  }
  .year {
    font-variant-numeric: tabular-nums;
    font-size: 1.6rem;
    font-weight: 650;
    min-width: 7.5ch;
    text-align: center;
    letter-spacing: -0.01em;
  }
  .icon {
    width: 36px;
    height: 36px;
    border-radius: 50%;
    display: grid;
    place-items: center;
    border: 1px solid var(--border);
    background: var(--surface);
    color: var(--text);
    cursor: pointer;
    flex: none;
  }
  .icon svg {
    width: 18px;
    height: 18px;
    fill: none;
    stroke: currentColor;
    stroke-width: 2.2;
    stroke-linecap: round;
    stroke-linejoin: round;
  }
  .icon.play {
    width: 42px;
    height: 42px;
    background: var(--accent);
    border-color: var(--accent);
    color: var(--on-accent);
  }
  .icon.play svg {
    fill: currentColor;
    stroke: none;
    width: 20px;
    height: 20px;
  }
  .icon:hover {
    border-color: var(--text-muted);
  }
  .speed {
    margin-left: 4px;
  }

  .track-wrap {
    position: relative;
    padding: 0 10px;
  }
  .eras {
    position: relative;
    height: 48px;
  }
  .era {
    position: absolute;
    bottom: 2px;
    transform: translateX(-50%);
    font: inherit;
    font-size: 0.72rem;
    padding: 2px 6px;
    border-radius: 999px;
    border: 1px solid var(--border);
    background: var(--surface);
    color: var(--text-muted);
    white-space: nowrap;
    cursor: pointer;
  }
  .era::after {
    content: '';
    position: absolute;
    left: 50%;
    bottom: -7px;
    width: 1px;
    height: 6px;
    background: var(--border);
  }
  .era.upper {
    bottom: 24px;
  }
  .era.upper::after {
    bottom: -29px;
    height: 28px;
  }
  .era-select {
    display: none;
  }
  .era-select select,
  .speed select {
    font: inherit;
    font-size: 0.85rem;
    padding: 4px 6px;
    border-radius: 8px;
    border: 1px solid var(--border);
    background: var(--surface);
    color: var(--text);
  }
  .era:hover,
  .era.current {
    color: var(--text);
    border-color: var(--accent);
  }
  .track {
    position: relative;
    height: 28px;
  }
  .seg {
    position: absolute;
    top: 11px;
    height: 6px;
    background: var(--track);
  }
  .seg.alt {
    background: var(--track-alt);
  }
  .fill {
    position: absolute;
    left: 0;
    top: 11px;
    height: 6px;
    background: var(--accent);
    opacity: 0.55;
    border-radius: 3px 0 0 3px;
    pointer-events: none;
  }
  input[type='range'] {
    position: absolute;
    inset: 0;
    width: 100%;
    margin: 0;
    background: transparent;
    appearance: none;
    -webkit-appearance: none;
    cursor: pointer;
  }
  input[type='range']::-webkit-slider-runnable-track {
    height: 28px;
    background: transparent;
  }
  input[type='range']::-moz-range-track {
    height: 28px;
    background: transparent;
  }
  input[type='range']::-webkit-slider-thumb {
    -webkit-appearance: none;
    width: 20px;
    height: 20px;
    margin-top: 4px;
    border-radius: 50%;
    background: var(--surface);
    border: 3px solid var(--accent);
    box-shadow: 0 1px 4px rgb(0 0 0 / 0.3);
  }
  input[type='range']::-moz-range-thumb {
    width: 16px;
    height: 16px;
    border-radius: 50%;
    background: var(--surface);
    border: 3px solid var(--accent);
    box-shadow: 0 1px 4px rgb(0 0 0 / 0.3);
  }
  input[type='range']:focus-visible {
    outline: 2px solid var(--accent);
    outline-offset: 2px;
    border-radius: 6px;
  }
  .ticks {
    position: relative;
    height: 14px;
    font-size: 0.68rem;
    color: var(--text-muted);
  }
  .ticks span {
    position: absolute;
    transform: translateX(-50%);
    white-space: nowrap;
  }
  .ticks span:first-child {
    transform: none;
  }
  .ticks span:last-child {
    transform: translateX(-100%);
  }

  @media (max-width: 400px) {
    .speed {
      display: none;
    }
  }
  @media (max-width: 640px) {
    .year {
      font-size: 1.3rem;
    }
    .eras {
      display: none;
    }
    .ticks span:nth-child(2) {
      display: none; /* "AD 1" collides with "1500 BC" on narrow screens */
    }
    .controls {
      gap: 4px;
    }
    .era-select {
      display: block;
      margin-left: auto;
      min-width: 0;
      flex: 1 1 auto;
    }
    .era-select select {
      width: 100%;
      max-width: 9.5rem;
      float: right;
    }
    .speed {
      margin-left: 0;
    }
    .year {
      min-width: 6ch;
    }
    .icon {
      width: 34px;
      height: 34px;
    }
  }
</style>
