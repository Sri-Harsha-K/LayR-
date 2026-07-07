# Local DAW — Progress

## Phase status

- **Phase 0 — Scaffold: done.**
- Phase 1 — Engine core + drums: not started.
- Phase 2 — Piano roll + synths: not started.
- Phase 3 — Mixer + effects: not started.
- Phase 4 — Recording: not started.
- Phase 5 — Arrangement + persistence + export: not started.

## Phase 0 summary

Scaffolded with `npm create vite@latest . -- --template react-ts`, then pinned
React to 18.x (vite's template defaults to 19) and added Tailwind v4, Zustand
+ zundo, Tone.js, Electron, electron-builder, and vitest/jsdom.

- Directory structure matches the architecture in the brief: `/electron`,
  `/src/engine` (empty, reserved — zero React imports allowed in here),
  `/src/state`, `/src/components`, `/src/platform`, `/src/utils`.
- `src/state/types.ts` holds the full v1 data model (`Project`, `Track`,
  `Clip`, `DrumPattern`, `Note`, `SynthConfig`, `EffectInstance`) exactly as
  specified, plus the fixed 8-color track palette.
- `src/state/projectStore.ts`: Zustand store wrapping the serializable
  `Project`, wrapped in `zundo`'s `temporal` middleware so only the project
  slice is undoable. Action set covers tracks/clips/effects/mixer already
  (used incrementally from Phase 1 on).
- `src/state/uiStore.ts`: selection, bottom-panel tab, zoom, loop range,
  metronome toggle, power-on flag. Explicitly NOT undoable.
- `src/state/transient.ts`: plain module (no Zustand, no React) for
  playhead ticks and meter levels. Engine will write here directly; UI reads
  it inside rAF loops. This is the hard performance rule from the brief —
  wiring the module in now so Phase 1+ never has an excuse to put a meter or
  playhead value in React state.
- `src/platform/`: `PlatformAdapter` interface + `browser.ts` (IndexedDB-
  backed, `openProject`/`saveProject` are real stubs returning `null` until
  Phase 5) + `electron.ts` (calls the typed `window.daw` bridge) + `index.ts`
  picks the implementation based on whether `window.daw` exists.
- `electron/main.ts` + `electron/preload.ts`: contextIsolation on,
  nodeIntegration off, sandboxed renderer. IPC handlers for open/save
  project and export WAV are already fully implemented against a real
  `.dawproj` folder on disk (not stubbed) because the dialog + fs plumbing
  was cheap to write once and unblocks Phase 5 later. `pickSample` IPC also
  implemented.
- App shell: `TransportBar` (play/stop/record/loop/metronome buttons wired
  to UI state where sensible, BPM field writes to the real project store,
  time display is a static placeholder until `engine/time.ts` exists),
  `TrackRail` (add drum/synth/audio track, mute/solo/arm, selection),
  `ArrangementView` (empty-state "Add a drum track" CTA per spec, otherwise
  one row per track — real clip rendering lands in Phase 5), `BottomDock`
  (Step Sequencer / Piano Roll / Mixer tabs, keyboard 1/2/3), and
  `PowerOnOverlay` (calls `Tone.start()` on click, shows once per session).
- Tailwind v4 via `@tailwindcss/vite`, theme tokens in `src/index.css`:
  charcoal surface scale, warm off-white ink, the 8 track colors, and
  amber/green/red meter colors (red reserved for record/arm).
- `npm run dev:desktop` is a small dependency-free launcher
  (`scripts/dev-desktop.mjs`): compiles `electron/`, boots Vite on a fixed
  port, polls it, then launches Electron with `VITE_DEV_SERVER_URL` set.
  No `concurrently`/`wait-on` added, per the dependency budget.

## Decisions / deviations

- **React 18, not whatever `create-vite` defaults to.** The scaffold tool
  currently defaults to React 19; downgraded to `^18.3.1` per the brief.
- **Tailwind v4** (`@tailwindcss/vite`) instead of the v3 PostCSS pipeline —
  it's the current standard way to wire Tailwind into Vite and needs no
  extra config files. Treated as part of "Tailwind CSS," not a new
  dependency category.
- **`dist-electron/package.json` with `"type": "commonjs"`** is written by
  `scripts/build-electron.mjs` after `tsc` compiles `electron/`. Root
  `package.json` has `"type": "module"` for the Vite side, which made Node
  treat the compiled electron `.js` output as ESM and throw
  `ReferenceError: exports is not defined`. The nearest-`package.json`
  override is the standard fix and keeps both sides on their natural module
  system without renaming files to `.cjs`.
- Electron's IPC file-operation handlers were implemented for real in
  Phase 0 (not left as `TODO` stubs) since the dialog + `fs` code is small
  and it means Phase 5 only has to wire the renderer side up to
  `src/platform/electron.ts`, which already exists.
- No fonts are loaded from a CDN (offline-first requirement) — the
  "utility face" and "quietly characterful" type distinction from the brief
  is done with system font stacks (`--font-ui` vs `--font-display` in
  `src/index.css`) rather than a bundled webfont.

## Known issues / flags for review

- Browser-mode `openProject`/`saveProject` are real no-ops (return `null`)
  until Phase 5 builds the IndexedDB-backed flow described in the brief.
  `exportWav` and `pickSampleFile` already work in the browser today
  (download-a-blob and `<input type=file>` respectively).
- No visual browser verification was possible in this session — the
  Claude-in-Chrome extension wasn't connected. Verified instead via: clean
  `npm run typecheck` / `npm run lint` / `npm run build` / `npm run test`,
  every module resolving 200 through the Vite dev server, and a real
  `npm run dev:desktop` run (Electron opened, no console/load errors, clean
  process exit on close).
- `scripts/dev-desktop.mjs` and `scripts/build-electron.mjs` spawn `npx`/
  `electron` with `shell: true` on Windows (required for `npx.cmd`
  resolution) — Node prints a `DEP0190` deprecation warning about
  unescaped args. All args are static strings we control, not user input,
  so this is not a real vulnerability, but flagging since it's noisy in the
  logs.
