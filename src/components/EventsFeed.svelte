<script lang="ts">
  import { tick } from 'svelte';
  import { lastIndexAtOrBefore, type FeedEvent } from '../lib/events';
  import { formatYear } from '../lib/years';

  interface Props {
    feed: FeedEvent[];
    year: number;
    onJump: (year: number) => void;
    onSelect: (polity: string) => void;
  }
  let { feed, year, onJump, onSelect }: Props = $props();

  let list: HTMLOListElement | undefined = $state();
  const current = $derived(lastIndexAtOrBefore(feed, year));

  // Keep the most recent event (at or before the selected year) in view.
  $effect(() => {
    const i = current;
    tick().then(() => {
      if (!list) return;
      const el = list.children[Math.max(0, i)] as HTMLElement | undefined;
      if (!el) return;
      const top = el.offsetTop - 8; // the list is the offset parent (position: relative)
      list.scrollTo({ top: Math.max(0, top - list.clientHeight / 3), behavior: 'smooth' });
    });
  });
</script>

<div class="feed">
  <ol bind:this={list} aria-label="Timeline of events">
    {#each feed as e (e.id)}
      <li class:future={e.year > year} class:now={current >= 0 && e.year === feed[current].year}>
        <button class="year" onclick={() => onJump(e.year)} title="Jump to this year">
          {formatYear(e.year, { approx: e.approx })}
        </button>
        <div class="body">
          <span>{e.text}</span>
          {#if e.polity}
            <button class="chip" style:--c={e.color} onclick={() => onSelect(e.polity!)}>
              <span class="dot" aria-hidden="true"></span>{e.polityName}
            </button>
          {/if}
        </div>
      </li>
    {/each}
  </ol>
</div>

<style>
  .feed {
    font-size: 0.8rem;
  }
  ol {
    list-style: none;
    margin: 0;
    padding: 0 4px 0 0;
    max-height: min(42vh, 340px);
    overflow-y: auto;
    display: flex;
    flex-direction: column;
    gap: 2px;
    position: relative;
  }
  li {
    display: grid;
    grid-template-columns: 4.6rem 1fr;
    gap: 6px;
    padding: 4px 6px;
    border-radius: 6px;
    border-left: 2px solid transparent;
    transition: opacity 0.2s;
  }
  li.future {
    opacity: 0.45;
  }
  li.now {
    background: var(--surface-2);
    border-left-color: var(--accent);
  }
  .year {
    font: inherit;
    font-variant-numeric: tabular-nums;
    font-weight: 600;
    background: none;
    border: none;
    padding: 0;
    color: var(--link);
    cursor: pointer;
    text-align: left;
    align-self: start;
  }
  .year:hover {
    text-decoration: underline;
  }
  .body {
    line-height: 1.35;
  }
  .chip {
    font: inherit;
    font-size: 0.72rem;
    display: inline-flex;
    align-items: center;
    gap: 4px;
    margin-left: 4px;
    padding: 0 6px;
    border-radius: 999px;
    border: 1px solid var(--border);
    background: var(--surface);
    color: var(--text-muted);
    cursor: pointer;
    vertical-align: 1px;
  }
  .chip:hover {
    border-color: var(--c);
    color: var(--text);
  }
  .dot {
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: var(--c);
  }
</style>
