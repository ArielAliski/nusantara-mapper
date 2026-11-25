import { defineConfig } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';

// `base` is relative so the built site works from any sub-path (e.g. GitHub Pages project sites).
export default defineConfig({
  base: './',
  plugins: [svelte()],
  // MapLibre alone is ~1 MB minified; splitting it would not reduce what the first view needs.
  build: { chunkSizeWarningLimit: 1500 },
});
