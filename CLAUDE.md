# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

Local DAW — a fully offline, local-first Digital Audio Workstation. No cloud services, no accounts, no telemetry, no network calls at runtime. Synthesis, sequencing, recording, mixing, and export all run on-machine. Ships as both a browser app (Vite dev server) and an Electron desktop app.

See `PROGRESS.md` for phase-by-phase build history, key design decisions, and known issues — read it before starting new work, and append to it (don't rewrite) when you finish a phase or make a non-obvious decision.

## Commands

- `npm run dev` — Vite dev server, browser only (everything works except native file dialogs).
- `npm run dev:desktop` — same app inside Electron (`scripts/dev-desktop.mjs`: compiles `electron/`, boots Vite on a fixed port, polls it, launches Electron with `VITE_DEV_SERVER_URL` set).
- `npm run build` — `tsc -b && vite build` (renderer production build).
- `npm run build:electron` — compiles `electron/` main/preload to `dist-electron/`.
- `npm run dist` — build + build:electron + `electron-builder` (installers).
- `npm run typecheck` — `tsc -b` (renderer, project-referenced) plus a separate `tsc -p electron/tsconfig.json --noEmit` (electron/ is a self-contained TS project, not part of the renderer's build graph).
- `npm run lint` — `oxlint`.
- `npm run test` / `npm run test:watch` — vitest (jsdom environment). Single file: `npx vitest run src/engine/time.test.ts`.

Always run typecheck + lint + test before calling a change done — there is no browser-based visual verification available in this environment by default, so these are the primary safety net (see PROGRESS.md's "Known issues" entries on this).

## Architecture

### Layering and the one hard rule

`src/engine/` has **zero React imports** — it's a plain TS layer that wraps Tone.js and is safe to import from both components and tests. `src/components/` never touches Tone.js or the audio graph directly; it calls `audioEngine` (the facade in `src/engine/AudioEngine.ts`) and reads Zustand state.

**High-frequency data (playhead position, meter levels) must never go through React state.** It's written by the engine into `src/state/transient.ts` (a plain module, no Zustand) on every scheduler tick/analyser frame, and read by components inside a `requestAnimationFrame` loop that writes directly to DOM style (`ref.current.style.height = ...`), never via re-render. Every place that shows a meter or playhead (`ChannelStrip`, `TransportBar`'s `MasterMeter`, `PianoRoll`'s playhead, the step sequencer's playing-step pulse) follows this pattern — copy it exactly for any new meter/playhead-like UI rather than introducing a new mechanism.

### State (`src/state/`)

Three separate stores, each with a different persistence/undo contract:

- `projectStore.ts` — the serializable `Project` (tracks, clips, effects, mixer), wrapped in `zundo`'s `temporal` middleware so *only* this slice is undoable. This is what gets saved/loaded/exported. Multi-event pointer gestures (velocity drag, note move/resize) call `pauseHistory()`/`resumeHistory()` around the gesture so it collapses into one undo step instead of one per `pointermove` — do this for any new drag-based edit.
- `uiStore.ts` — selection, active bottom-panel tab, zoom, loop range, metronome toggle. Explicitly NOT undoable.
- `transient.ts` — see above; not Zustand at all.

`state/types.ts` is the canonical v1 data model (zero React imports, safe from both `/engine` and `/components`). All musical time is integer ticks at 960 PPQ (`PPQ` constant; sixteenth note = 240 ticks). `Project` → `Track` (`drum`/`synth`/`audio`) → `Clip` (discriminated union: `pattern`/`midi`/`audio`) → `DrumPattern`/`Note`. Single tempo, 4/4 only in v1.

### Engine (`src/engine/`)

- `time.ts` — pure tick math (seconds↔ticks, bar:beat:sixteenth formatting, swing, snap). No Tone.js dependency.
- `transport.ts` — wraps `Tone.getTransport()`. `initTransport()` sets `PPQ = 960` once, matching the data model exactly.
- `graph.ts` — `buildGraph(project)` builds the full per-track audio chain (source → insert effects → gain → pan → master → limiter → destination) and returns one `dispose()`. Relies on Tone's "current context" convention rather than threading a context object through nodes, so the same builder serves both live playback and offline render (`Tone.Offline`) — any future render/export code should be a thin wrapper around this, not a second engine.
- `AudioEngine.ts` — the public facade (`audioEngine` singleton). `applyProject(project)` diffs the incoming project against the last one via `projectDiff.ts` and picks the cheapest update: `none` (skip), `bpm` (ramp transport tempo in place), `instrument-params` (call `.setParams()` on the already-live synth node), or `rebuild` (dispose + `buildGraph` from scratch). When adding a new kind of in-place-patchable change, extend `projectDiff.ts`'s classification rather than special-casing inside `AudioEngine`.
- `instruments/synthFactory.ts` — `createSynthInstrument(config)` builds one of 5 engines (`poly`/`fm`/`mono`/`pluck`/`duo`) behind a uniform `SynthInstrument` interface (`triggerNote`/`releaseAll`/`setParams`/`dispose`). All engines share one external lowpass filter for `filterCutoff`/`filterQ` except `mono`, which has its own built-in filter/filter-envelope.
- `sampleRegistry.ts` — in-memory decoded-buffer cache keyed by a `mem://` ref. Does not persist across reload/relaunch yet (tracked as a known Phase 5 gap in PROGRESS.md).
- Scheduling uses Tone tick notation (`` `${ticks}i` ``) rather than precomputed seconds, so BPM changes never require rescheduling.

### Platform abstraction (`src/platform/`)

`PlatformAdapter` interface (`types.ts`) — open/save project, export WAV, pick sample file, autosave — implemented twice: `electron.ts` (calls the typed `window.daw` bridge over IPC) and `browser.ts` (IndexedDB-backed; `openProject`/`saveProject` are still real no-ops pending Phase 5). `platform/index.ts` picks the implementation at runtime based on whether `window.daw` exists. Nothing above this interface should know or care which backend is active.

### Electron (`electron/`)

`main.ts` + `preload.ts`: `contextIsolation: true`, `nodeIntegration: false`, sandboxed renderer. `ipcContract.ts` defines the shared IPC channel names/payload shapes and has no dependency on `/src` (self-contained TS project — see `electron/tsconfig.json`, checked separately by `npm run typecheck`).

**Gotcha:** with `sandbox: true`, `preload.ts` cannot `require()` local project files at runtime (only Electron/Node builtins) — only type-only imports from `ipcContract.ts` work there. The channel-name string values are inlined/duplicated directly in `preload.ts` and cross-referenced with a comment in both files; keep them in sync manually if a channel is ever renamed.

### Build quirk: dual module systems

Root `package.json` has `"type": "module"` (Vite/renderer side). `scripts/build-electron.mjs` writes a `dist-electron/package.json` with `"type": "commonjs"` after compiling `electron/`, so Node treats the compiled output as CJS instead of throwing `exports is not defined`. If you touch the electron build script, preserve this.

## Conventions

- Track colors are a fixed 8-color palette (`TRACK_COLORS` in `state/types.ts`) — don't introduce arbitrary per-track colors.
- Meter color never uses the red token — red is reserved exclusively for record/arm state across the whole UI. A hot signal (>90% of range) renders amber, not red.
- Reordering in effect racks is done via ▲/▼ buttons, not drag-and-drop (chains are short; not worth the added interaction code).
- No CDN-loaded fonts (offline-first requirement) — typography is system font stacks (`--font-ui`/`--font-display` in `src/index.css`).
