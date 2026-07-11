# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

Local DAW ("Layr") — a fully offline, local-first Digital Audio Workstation. No cloud services, no accounts, no telemetry, no network calls at runtime. Synthesis, sequencing, recording, mixing, and export all run on-machine. Ships as both a browser app (Vite dev server) and an Electron desktop app.

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

**High-frequency data (playhead position, meter levels, live waveform) must never go through React state.** It's written by the engine into `src/state/transient.ts` (a plain module, no Zustand) on every scheduler tick/analyser frame, and read by components inside a `requestAnimationFrame` loop that writes directly to DOM style or a canvas (`ref.current.style.height = ...`), never via re-render. Every place that shows a meter, playhead, or waveform (`ChannelStrip`, `TransportBar`'s `MasterMeter`, `PianoRoll`'s playhead, the step sequencer's playing-step pulse, `CaptureView`'s input waveform) follows this pattern — copy it exactly for any new meter/playhead-like UI rather than introducing a new mechanism. `transient.ts`'s `sessionActiveClipByTrack` (Session view's "now playing" highlight) is mutated **in place**, not replaced — components must poll one `trackId`'s value (`useSessionActiveClip`), not the whole map, because polling a mutated-in-place object into `useState` would never see a changed reference and never re-render (see the hook's own comment).

### State (`src/state/`)

Three separate stores, each with a different persistence/undo contract:

- `projectStore.ts` — the serializable `Project` (tracks, clips, effects, mixer, scenes), wrapped in `zundo`'s `temporal` middleware so *only* this slice is undoable. This is what gets saved/loaded/exported. Multi-event pointer gestures (velocity drag, note move/resize) call `pauseHistory()`/`resumeHistory()` around the gesture so it collapses into one undo step instead of one per `pointermove` — do this for any new drag-based edit. `sanitizeProject()` (in `state/sanitizeProject.ts`, called from `loadProject`) is the full trust boundary for a loaded project — an opened `.dawproj`/`.layrproj` file or an autosave snapshot is fully external input and gets rebuilt field-by-field (unknown track/effect/synth-engine/clip-kind enum values dropped, numeric fields clamped/defaulted, arrays length-capped) rather than cast straight to `Project`, since a corrupt or hostile file would otherwise reach an exhaustive `switch`'s `default: throw` in `engine/effects.ts`/`synthFactory.ts` or hand Tone.js `NaN`/`Infinity`. Never throws — a malformed field degrades to a safe default instead of failing the whole load. Extend it, not `Project`'s type, when adding a new field that should survive a hand-edited or older project file.
- `uiStore.ts` — selection, active bottom-panel tab, `mainView` (`'timeline' | 'session'`), zoom, loop range, metronome toggle, export-dialog-open flag, toast message. Explicitly NOT undoable.
- `transient.ts` — see above; not Zustand at all.

`state/types.ts` is the canonical v1 data model (zero React imports, safe from both `/engine` and `/components`). All musical time is integer ticks at 960 PPQ (`PPQ` constant; sixteenth note = 240 ticks). `Project` → `Track` (`drum`/`synth`/`audio`) → `Clip` (discriminated union: `pattern`/`midi`/`audio`, each with an optional user-facing `name` and an optional `sceneId` linking it into the Session grid) → `DrumPattern`/`Note`. `Project.scenes: Scene[]` is the ordered list of Session-view rows. Single tempo, 4/4 only in v1.

### Engine (`src/engine/`)

- `time.ts` — pure tick math (seconds↔ticks, bar:beat:sixteenth formatting, swing, snap, BPM clamping). No Tone.js dependency.
- `transport.ts` — wraps `Tone.getTransport()`. `initTransport()` sets `PPQ = 960` once, matching the data model exactly.
- `graph.ts` — `buildGraph(project, options?)` builds the full per-track audio chain (source → insert effects → gain → pan → master → limiter → destination) and returns one `dispose()`, plus per-track live resources (`drumVoicesByTrack`, `synthInstrumentsByTrack`, `trackInputsByTrack`) that other modules tap into. Relies on Tone's "current context" convention rather than threading a context object through nodes, so the same builder serves live playback, offline render, *and* Session-mode graphs. `BuildGraphOptions.scheduleArrangement` (default `true`) is what makes Timeline and Session mutually exclusive: when `false` (Session view active), per-track instruments/voices are still built but the Timeline's absolute-tick Parts/Players are skipped, so a Session-launched loop can never double-trigger against a Timeline Part on the same track. `buildPatternEvents`/`buildMidiEvents` are exported specifically so `sessionPlayer.ts`'s ad-hoc loops and the Timeline's own Parts share the exact same swing/volume-keyframe math — two schedulers, one source of truth for what a clip actually sounds like.
- `sessionPlayer.ts` — the Session view's clip launcher. A *second* scheduler sharing one Transport with the Timeline (never both scheduling the same track at once — see above). Launches a clip as an ad-hoc looping `Tone.Part`/`Tone.Player` quantized to the next bar boundary, reusing the track's already-live instrument/voices via `AudioEngine`'s `getDrumVoices`/`getSynthInstrument`/`getTrackInput` accessors rather than owning a second copy of anything. One clip active per track at a time (launching a new one schedules the old one's stop at the same boundary); `launchScene` launches every track's clip tagged with that scene. `setSessionMode(enabled)` wraps `AudioEngine.setSessionMode` with its own `stopAll()` cleanup — call this (not `AudioEngine.setSessionMode` directly) when switching main views.
- `AudioEngine.ts` — the public facade (`audioEngine` singleton). `applyProject(project)` diffs the incoming project against the last one via `projectDiff.ts` and picks the cheapest update: `none` (skip), `bpm` (ramp transport tempo in place), `instrument-params` (call `.setParams()` on the already-live synth node), or `rebuild` (dispose + `buildGraph` from scratch, respecting the current session-mode flag). When adding a new kind of in-place-patchable change, extend `projectDiff.ts`'s classification rather than special-casing inside `AudioEngine`.
- `instruments/synthFactory.ts` — `createSynthInstrument(config)` builds one of 5 engines (`poly`/`fm`/`mono`/`pluck`/`duo`) behind a uniform `SynthInstrument` interface (`triggerNote`/`releaseAll`/`setParams`/`dispose`). All engines share one external lowpass filter for `filterCutoff`/`filterQ` except `mono`, which has its own built-in filter/filter envelope. `sound/synthParamFields.ts` (components layer) maps each engine's param keys to UI knob ranges — the engine itself only knows param keys and fallbacks, not sane UI ranges.
- `sampleRegistry.ts` — in-memory decoded-buffer cache keyed by a `mem://` ref, plus a small metadata sidecar (`SampleMeta`: name/duration/source) with a subscribe/notify pair that the Library tab uses to react to newly-registered samples. Buffers do not persist across reload/relaunch on their own — `projectIO.ts` handles that by encoding/re-hydrating referenced samples on save/load.
- `render.ts` — offline rendering/export, all built on one shared `renderToBuffer` (parameterized `Tone.Offline` call). `exportProject(project, options)` dispatches by format: `wav` (`wavEncoder.ts`, 16 or 24-bit), `mp3` (`mp3Encoder.ts`, wraps `@breezystack/lamejs`), `stems` (renders once per track via `projectSoloingOnlyTrack` — an in-memory-only clone that never touches the real store/undo history — zipped via `zipWriter.ts`), `flac` (deliberately throws: no verified pure-JS/WASM FLAC encoder was integrated — see PROGRESS.md's Phase 9 notes before attempting one). `bounceProject` is a thin one-click-WAV convenience wrapper around `exportProject`.
- `zipWriter.ts`/`zipReader.ts` — hand-rolled STORE-only (uncompressed) zip read/write, no dependency. Used for Stems export and for `platform/browser.ts`'s Firefox/Safari save/open fallback (a `.layrproj` bundle is just this zip format: `project.json` + `audio/*`).
- `recorder.ts`/`recordingController.ts` — `AudioRecorder` (`recorder.ts`) wraps `Tone.UserMedia`/`Tone.Recorder` for mic capture (no sample-accurate start/stop — `MediaRecorder` lands wherever the transport happened to be, documented as "close enough for punch-in"). `AudioEngine` never imports the project store; `recordingController.ts` is the one deliberate seam allowed to touch both, exposing a single idempotent `toggleRecording()` shared by the Record button and the `R` key so the two can't drift out of sync. On stop, the take is decoded via `sampleRegistry.registerSample` and turned into a new audio clip sized from the real decoded duration.
- `automation.ts` — `sampleVolumeAtTick(keyframes, tick, curve)` is the single source of truth for a clip's volume curve (linear or Catmull-Rom `'spline'`, `ClipBase.volumeCurve`), consumed three different ways rather than reimplemented three times: `graph.ts` schedules it as continuous `Gain`-node automation for audio clips (one dedicated node already sits in that clip's signal path) but as per-event velocity scaling for pattern/MIDI clips (no per-clip node exists there — the drum lanes/synth instrument are shared across a track's clips); `ArrangementView.tsx`'s drawn clip-bar curve samples the same function so the visual always matches what's actually scheduled.
- Scheduling uses Tone tick notation (`` `${ticks}i` ``) rather than precomputed seconds, so BPM changes never require rescheduling.

### Platform abstraction (`src/platform/`)

`PlatformAdapter` interface (`types.ts`) — open/save project, `exportFile` (format-agnostic: bytes + a filename that already carries its real extension), pick sample file, autosave — implemented twice: `electron.ts` (calls the typed `window.daw` bridge over IPC) and `browser.ts` (IndexedDB for autosave; `openProject`/`saveProject` branch on `showDirectoryPicker` support). `platform/index.ts` picks the implementation at runtime based on whether `window.daw` exists. Nothing above this interface should know or care which backend is active.

**`browser.ts` has two genuinely different save/open mechanisms depending on browser support**, not one: Chromium/Edge use the real File System Access API (an in-place `.dawproj` folder, same format Electron writes); Firefox/Safari (no directory-access API at all) fall back to a single `.layrproj` zip bundle — downloaded on Save, picked via `<input type=file>` on Open, built on `engine/zipWriter.ts`/`zipReader.ts`. There's no persistent handle in the fallback, so "Save" behaves like "Save As" every time there. Every `openProject`/`saveProject` failure that isn't a plain user-cancel (`DOMException('AbortError')`) throws and is caught by `engine/projectIO.ts`, which surfaces it via `uiStore.toastMessage`/`components/Toast.tsx` — don't swallow errors in a new picker path the same silent way the old code used to.

### Electron (`electron/`)

`main.ts` + `preload.ts`: `contextIsolation: true`, `nodeIntegration: false`, sandboxed renderer. `ipcContract.ts` defines the shared IPC channel names/payload shapes and has no dependency on `/src` (self-contained TS project — see `electron/tsconfig.json`, checked separately by `npm run typecheck`).

**Gotcha:** with `sandbox: true`, `preload.ts` cannot `require()` local project files at runtime (only Electron/Node builtins) — only type-only imports from `ipcContract.ts` work there. The channel-name string values are inlined/duplicated directly in `preload.ts` and cross-referenced with a comment in both files; keep them in sync manually if a channel is ever renamed. Note the IPC channel for exporting is still literally named `exportWav`/`export:wav` even though it now handles every export format (WAV/MP3/Stems) — only the renderer-facing `PlatformAdapter.exportFile` method was renamed to the accurate name, specifically to avoid touching this fragile manually-synced channel-name pair for no functional reason.

### Build quirk: dual module systems

Root `package.json` has `"type": "module"` (Vite/renderer side). `scripts/build-electron.mjs` writes a `dist-electron/package.json` with `"type": "commonjs"` after compiling `electron/`, so Node treats the compiled output as CJS instead of throwing `exports is not defined`. If you touch the electron build script, preserve this.

## Conventions

- Track colors are a fixed 8-color palette (`TRACK_COLORS` in `state/types.ts`) — don't introduce arbitrary per-track colors. **`--color-accent` (lime) is a separate UI-accent token, not one of the 8** — used for the play button, focus rings, selected/active states, and the Session view's playing-clip highlight; never assign it as a track's own color, and never reuse a track's color to mean "active/selected."
- Meter color never uses the red token — red is reserved exclusively for record/arm state across the whole UI. A hot signal (>90% of range) renders amber, not red.
- Reordering in effect racks is done via ▲/▼ buttons, not drag-and-drop (chains are short; not worth the added interaction code).
- **Instrument/effects editing lives behind one shared "Sound" tab, reached by right-clicking** a clip bar in the Timeline, a clip cell in Session, a track header in the track rail, or clicking a mixer channel strip's compact insert pill — not four separate UIs. `ChannelStrip`'s embedded always-open effects rack was deliberately removed in favor of this (the master bus strip is the one exception, since there's no track to select for it).
- No CDN-loaded fonts (offline-first requirement) — typography is system font stacks (`--font-ui`/`--font-display` in `src/index.css`).
- Dependency budget is deliberately small; `@breezystack/lamejs` (pure JS MP3 encoding, no WASM) is the one addition beyond the original stack, added for real Export-dialog MP3 support. Prefer a small hand-rolled module (see `wavEncoder.ts`, `zipWriter.ts`) over a new dependency when the format/algorithm is simple enough to own.
