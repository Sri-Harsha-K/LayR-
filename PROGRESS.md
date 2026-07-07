# Local DAW — Progress

## Phase status

- Phase 0 — Scaffold: done.
- **Phase 1 — Engine core + drums: done.**
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

## Phase 1 summary

Verified the Tone.js v15 API against the installed package's own `.d.ts`
files before writing any engine code (accessor functions, `Transport`,
`Part`, instrument/effect constructor option shapes) rather than trusting
memory of v14.

- `engine/time.ts`: pure tick math (960 PPQ, 4/4 only) — seconds<->ticks,
  bars:beats:sixteenths formatting, swing offset, pattern length, snap.
  24 vitest cases covering round-trips, bar/beat boundaries, max-swing
  non-overlap, and the BPM/swing clamp ranges.
- **Key design decision:** `Tone.getTransport().PPQ` is set to 960 once at
  init (`engine/transport.ts:initTransport`) to match our data model exactly.
  Every scheduled time is handed to Tone as tick notation (`` `${ticks}i` ``,
  via `ticksToToneTime`) instead of precomputed seconds. Tone resolves "i"
  time relative to its own tempo-linked clock, so BPM changes never require
  rescheduling — this is what makes the "BPM changes during playback are
  glitch-free" AC hold structurally rather than by careful timing.
- `engine/graph.ts`: `buildGraph(project)` builds the full per-track chain
  (source -> insert effects -> gain -> pan -> master -> limiter ->
  destination) and returns a single `dispose()`. It relies on Tone's
  "current context" convention (real global context for live playback, or
  whatever's active inside a `Tone.Offline` callback for render) rather than
  threading a context object through every node constructor — this is the
  idiomatic way to make one builder serve both live and offline, and it's
  why `render.ts` (Phase 5) should be a thin wrapper, not a second engine.
- `engine/instruments/drumKit.ts`: synthesized kit (kick/snare/clap/hats/
  toms/rim), each a small tuned Tone node graph exposing a uniform
  `trigger(time, velocity)`. `createSampleDrumVoice` swaps in a 4-voice
  round-robin `Tone.Player` pool when a lane has a user sample, so fast
  retriggers don't cut each other off.
- `engine/sampleRegistry.ts`: in-memory decoded-buffer cache keyed by a
  `mem://` ref stored in `DrumLaneConfig.sampleRef`. Real on-disk
  persistence of the sample bytes is Phase 5's job; today the sample only
  survives the current session (documented as a known issue below).
- `engine/effects.ts`: factory for all 8 effect types from the data model
  (used today only for the master limiter; Phase 3 wires the UI). Built now
  rather than deferred, since `graph.ts` needed *some* effect chain
  implementation to be schema-complete from Phase 1 per the brief.
- **Rebuild-on-change strategy:** `AudioEngine.applyProject` diffs by
  reference — if only `project.bpm` changed (everything else
  reference-equal, which holds because every store action does an immutable
  update that only touches what it means to touch), it ramps
  `transport.bpm` in place; any other change disposes and rebuilds the whole
  graph. This is deliberately simple (no per-node diffing) and works because
  `Tone.Part.start(absoluteTick)` correctly resumes mid-loop when created
  against an already-running transport — rebuilding a Part doesn't restart
  its phase or double-trigger. Verified by ear via the swing/loop math
  tests and by reasoning through Tone's `TransportRepeatEvent`/`Part`
  scheduling source, not by an automated audio-domain test (out of scope
  for vitest).
- Step sequencer (`components/stepsequencer/`): pad grid, click-to-toggle,
  vertical-drag-when-active sets velocity (`Pad.tsx`), swing slider,
  per-lane mute + "load sample" (round-trips through
  `platform.pickSampleFile` -> `registerSample`). The currently-playing
  step gets a `.pad-playing` CSS pulse applied via direct `ref`/DOM
  manipulation in a rAF loop — never React state — per the performance
  rule; the pulse itself is neutralized by the existing global
  `prefers-reduced-motion` rule in `index.css`.
- "Add a drum track" now seeds one default 16-step pattern clip
  (`addDefaultPatternClip`) and selects it, landing the user straight in
  the step sequencer — this is the "idea to loop in under a minute" path.
- **Loop defaults to ON**, spanning exactly 1 bar (matching the default
  pattern clip's length). A step sequencer's entire purpose is looping
  playback; requiring an extra click before the beat repeats would fight
  the product goal. `uiStore.setLoopRange`/`setLoopEnabled` remain there for
  Phase 5's loop-brace dragging to override.
- Metronome anchors its `scheduleRepeat` at absolute tick 0 rather than
  Tone's default "now" — see Known issues for why this mattered.
- Added a `console-message`/`render-process-gone` relay from the Electron
  renderer to main-process stdout (dev only). There's no visual browser
  tool available in this environment, so this was the only way to catch
  runtime errors in the Electron shell; it caught a real bug (below).

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
- User drum samples only live for the current session
  (`engine/sampleRegistry.ts` is an in-memory `Map`). Reloading the page or
  relaunching Electron loses the sample and the lane silently falls back to
  nothing playing for that lane's steps (the `sampleRef` string survives in
  the project, but nothing resolves it). Phase 5 needs to persist the bytes
  and re-decode on load.
- **Bug caught and fixed this phase, flagging because it was non-obvious:**
  with `webPreferences.sandbox: true`, Electron's preload script cannot
  `require()` arbitrary local project files — only Electron/Node builtins.
  `preload.ts` originally imported the `IPC_CHANNELS` object from
  `ipcContract.ts` at runtime, which failed silently-ish (renderer console
  showed "module not found: ./ipcContract", `window.daw` never got
  attached). Fixed by inlining the channel-name strings directly in
  `preload.ts` (type-only imports from `ipcContract.ts` still work fine,
  since those are erased at compile time). The two copies of the channel
  names are cross-referenced with a comment in both files — genuinely
  brittle if a channel is ever renamed in only one place.
- No visual browser verification was possible in this session — the
  Claude-in-Chrome extension wasn't connected either phase. Verified
  instead via: clean `npm run typecheck` / `npm run lint` / `npm run build`
  / `npm run test`, every module resolving 200 through the Vite dev server,
  and real `npm run dev:desktop` runs with a renderer-console-to-stdout
  relay added specifically to catch runtime errors without DevTools (see
  above — it did catch a real bug). Interactive behavior (clicking pads,
  hearing the kit, dragging velocity) has NOT been audibly verified by a
  human or a visual agent yet — worth a manual pass before Phase 2.
- Electron shows a dev-only "Insecure Content-Security-Policy" warning
  (expected: Vite's dev server needs `unsafe-eval` for HMR). Electron's own
  message confirms this disappears once the app is packaged; no CSP header
  has been set up yet for the packaged build either way — flag for Phase 6.
- `scripts/dev-desktop.mjs` and `scripts/build-electron.mjs` spawn `npx`/
  `electron` with `shell: true` on Windows (required for `npx.cmd`
  resolution) — Node prints a `DEP0190` deprecation warning about
  unescaped args. All args are static strings we control, not user input,
  so this is not a real vulnerability, but flagging since it's noisy in the
  logs.
