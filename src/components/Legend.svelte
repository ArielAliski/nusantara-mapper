<script lang="ts">
  interface Props {
    estimated: boolean;
    onEstimated: (on: boolean) => void;
  }
  let { estimated, onEstimated }: Props = $props();
</script>

<div class="legend">
  <ul class="keys">
    <li><span class="sw documented"></span>Documented border</li>
    <li><span class="sw approximate"></span>Approximate extent</li>
    <li><span class="sw soft"></span>Uncertain extent (low confidence)</li>
    <li><span class="sw zone"></span>Zone of influence / claimed tributary</li>
    <li><span class="sw cultural"></span>Cultural zone (not a state)</li>
    <li><span class="sw occupation"></span>Military occupation</li>
  </ul>
  <p class="fine">
    Historical extents are drawn with modern administrative units as building blocks. They show
    roughly which areas were held, not exact historical borders.
  </p>
  <label class="toggle">
    <input type="checkbox" checked={estimated} onchange={(e) => onEstimated((e.currentTarget as HTMLInputElement).checked)} />
    <span>
      <strong>Estimated gradual growth</strong>
      <span class="fine">
        Animates expansion and decline area by area between documented dates. The steps in between
        are illustrative estimates, not historical record. Turn off to see only documented changes.
      </span>
    </span>
  </label>
</div>

<style>
  .legend {
    font-size: 0.82rem;
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  .keys {
    list-style: none;
    margin: 0;
    padding: 0;
    display: grid;
    gap: 4px;
  }
  .keys li {
    display: flex;
    align-items: center;
    gap: 8px;
  }
  .sw {
    --c: var(--legend-sample);
    width: 22px;
    height: 13px;
    border-radius: 3px;
    flex: none;
  }
  .sw.documented {
    background: color-mix(in srgb, var(--c) 55%, transparent);
    border: 1.5px solid var(--c);
  }
  .sw.approximate {
    background: color-mix(in srgb, var(--c) 40%, transparent);
    border: 1.5px dashed var(--c);
  }
  .sw.soft {
    background:
      repeating-linear-gradient(-45deg, color-mix(in srgb, var(--c) 60%, transparent) 0 1.4px, transparent 1.4px 6px),
      color-mix(in srgb, var(--c) 18%, transparent);
    border: 1.5px dotted var(--c);
  }
  .sw.zone {
    background: repeating-linear-gradient(-45deg, var(--c) 0 1.4px, transparent 1.4px 6px);
  }
  .sw.cultural {
    background: radial-gradient(var(--c) 1.3px, transparent 1.5px) 0 0 / 6px 6px;
  }
  .sw.occupation {
    background:
      repeating-linear-gradient(45deg, var(--c) 0 1.2px, transparent 1.2px 6px),
      repeating-linear-gradient(-45deg, var(--c) 0 1.2px, transparent 1.2px 6px),
      color-mix(in srgb, var(--c) 25%, transparent);
    border: 1.5px solid var(--c);
  }
  .fine {
    margin: 0;
    color: var(--text-muted);
    font-size: 0.76rem;
    line-height: 1.4;
    display: block;
  }
  .toggle {
    display: flex;
    gap: 8px;
    align-items: flex-start;
    padding: 8px;
    border-radius: 8px;
    background: var(--surface-2);
    cursor: pointer;
  }
  .toggle input {
    margin-top: 3px;
    accent-color: var(--accent);
  }
</style>
