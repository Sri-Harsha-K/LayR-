# Local DAW — Progress

## Phase status

- Phase 0 — Scaffold: done.
- Phase 1 — Engine core + drums: done.
- Phase 2 — Piano roll + synths: done.
- Phase 3 — Mixer + effects: done.
- Phase 4 — Recording: done.
- Phase 5 — Arrangement + persistence + export: done.
- Phase 6 — Layr-style theme + Sound tab + Capture view: done.
- Phase 7 — Session view + scenes engine: done.
- Phase 8 — Library tab: done.
- **Phase 9 — Export dialog + Start screen: done.**

The Layr-style redesign (Phases 6-9) is now complete. See
`C:\Users\leo\.claude\plans\enchanted-squishing-island.md` for the plan
this was built from.

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

## Phase 2 summary

- `engine/instruments/synthFactory.ts`: `createSynthInstrument(config)` builds
  one of 5 engines (`poly`/`fm`/`mono`/`pluck`/`duo`) from Tone's own synth
  classes behind a uniform `SynthInstrument` interface
  (`triggerNote`/`releaseAll`/`setParams`/`dispose`), each routed through a
  shared external lowpass filter so `filterCutoff`/`filterQ` are always the
  same two param keys regardless of engine — except `mono`, which has its
  own built-in filter and filter envelope (that's the whole point of an
  acid-bass-style engine) and leaves the shared filter wide open instead.
  `setParams` calls Tone's `.set()` on the live node rather than rebuilding,
  which is what makes a param slider drag ramp instead of retrigger.
- `engine/instruments/synthPresets.ts`: 10 presets spanning all 5 engines
  (Warm Pad, Strings-ish, Lead Saw, Bell Keys, EP Keys, Glass Keys, Sub,
  Acid Bass, Pluck, Duo Lead), each tuned as a distinct character rather
  than a single-parameter variation.
- `engine/projectDiff.ts` (unit-tested, `projectDiff.test.ts`): classifies a
  project transition as `none`/`bpm`/`instrument-params`/`rebuild` by
  reference-equality walk. This generalizes Phase 1's `isOnlyBpmDifferent`
  check into something `AudioEngine.applyProject` can reuse for the new
  "drag a synth param knob" case: an `instrument-params` diff calls
  `SynthInstrument.setParams` on the already-live node instead of tearing
  down and rebuilding `graph.ts`'s whole audio graph. Anything touching more
  than one track, or any field of a track other than `instrument.params`,
  still falls back to `rebuild` — deliberately conservative rather than a
  full per-node differ.
- `engine/graph.ts` / `AudioEngine.ts`: synth tracks now build a live
  `SynthInstrument` per track (`synthInstrumentsByTrack`, mirroring the
  existing `drumVoicesByTrack` map) and schedule each `midi` clip's notes as
  a `Tone.Part` (`buildMidiPart`) bounded to the clip's start/length, same
  pattern as the Phase 1 drum pattern part. `AudioEngine.previewSynthNote`
  triggers a one-off eighth-note preview on a track's live instrument —
  used by the piano roll's keyboard sidebar and note-drag/create gestures
  so editing sounds like playing, not just drawing rectangles.
- `state/projectStore.ts`: `addDefaultMidiClip` seeds an empty 16-step-long
  (1 bar) MIDI clip, matching `addDefaultPatternClip`'s default length so a
  fresh synth track's clip is the same width as a fresh drum track's and
  fits the default 1-bar loop range. `defaultSynthConfig` now
  pulls from the real preset table (`getDefaultPresetForEngine('poly')`)
  instead of a hand-rolled literal, so a brand-new synth track already
  sounds like something instead of a bare unconfigured `PolySynth`.
- Also added `pauseHistory`/`resumeHistory` (wrap `zundo`'s temporal
  `pause`/`resume`) so a multi-event pointer gesture — velocity drag, note
  move/resize — collapses into one undo step instead of one per
  `pointermove`. `Pad.tsx` was retrofitted to use it (previously every
  velocity-drag tick was its own undo entry); the piano roll uses it from
  day one.
- `components/pianoroll/`: `geometry.ts` (pure, unit-free of React/Tone —
  pitch↔row and tick↔x math, snap table, the `PITCHES`/`GRID_HEIGHT`
  constants) plus `PianoRoll.tsx`. One pointer-event model on the grid
  container handles all three gestures (`draw` a new note by
  click-dragging its length, `move` an existing note by dragging its body,
  `resize` by dragging its right edge) by setting pointer capture on the
  *container* regardless of which child (background vs. a note vs. its
  resize handle) received the initial `pointerdown` — so move/up handlers
  live in exactly one place instead of being duplicated per note. Notes
  have no `id` in the data model (`state/types.ts`'s `Note` is just
  `{ pitch, startTicks, durationTicks, velocity }`), so an in-progress
  gesture identifies its note by array index captured at gesture start;
  safe because the index space for a given clip is stable for the duration
  of a single-pointer drag (nothing else can insert/remove notes
  mid-gesture). Deleting a note is a right-click (`onContextMenu`,
  default menu suppressed) since click is already spoken for by
  create-on-background and move-on-note. A fourth gesture, `velocity`, drags
  from a thin handle along a note's bottom edge — same delta-over-100px
  math as `Pad.tsx`'s velocity drag (floor 0.05, no ceiling past 1), kept as
  a separate handle rather than overloading the note body's move-drag.
- The piano roll's keyboard sidebar (`isBlackKey`/`isC`/`midiToNoteName` in
  the new `utils/pitch.ts`) doubles as a note previewer — clicking a key
  calls `previewSynthNote` directly, same as clicking a row in the grid.
- Piano roll zoom (px/beat) and snap resolution are local component state,
  not `uiStore` — there's no global arrangement-zoom control yet either
  (that's a Phase 5 concern per the Phase 0 notes), so there was nothing
  to stay in sync with.
- `TrackRail`'s "+ Synth" button now seeds a default MIDI clip and jumps to
  the piano roll tab, exactly mirroring "+ Drum"'s
  seed-pattern-clip-and-jump-to-step-sequencer behavior from Phase 1 — same
  "idea to sound in under a minute" goal, now for melodic tracks too.

## Phase 3 summary

The store (`updateTrackMixer`, `add/remove/reorder/updateTrackEffect`,
matching `*MasterEffect` actions, `setMasterGainDb`) and the engine
(`engine/effects.ts`'s 8-type factory, `graph.ts`'s per-track
gain->pan->master chain with mute/solo-aware gain and a safety-net implicit
limiter) were already fully built — Phase 0/1 scaffolded the whole data
model and audio graph up front and left "Phase 3 wires the UI" comments in
both files. So this phase was UI plus one missing engine piece (metering),
not a new subsystem.

- **Metering, the one real engine gap:** `transient.ts` had
  `setMeterLevel`/`setMasterMeterLevel` defined since Phase 0 but nothing
  ever called them. `graph.ts`'s `buildTrackChannel` now taps a
  `Tone.Meter` off each track's post-gain/pan signal (a fan-out `connect`,
  not an insert — it doesn't join the audio path to master) and returns it
  alongside `trackInput`; a `masterOutput` gain node was added ahead of
  `Tone.getDestination()` so the master chain has something to tap *after*
  all master effects (including the limiter) instead of before. Both feed
  `BuiltGraph.metersByTrack`/`masterMeter`. `AudioEngine`'s existing rAF
  tick (previously playhead-only) now also polls every meter each frame and
  writes through `transient.ts` — same "never React state for high-frequency
  data" rule the playhead already followed. `Mixer`'s `ChannelStrip` reads
  it back the same way `PianoRoll`'s playhead does: a ref, a rAF loop, and
  direct `style.height`/`style.backgroundColor` writes, no re-render per
  frame.
- **Meter color deliberately never uses `meter-red`.** `index.css`'s own
  comment on that token says "red reserved for record/arm only" — so a hot
  signal (>90% of the -60..0dBFS range) goes amber, not red, keeping red a
  single unambiguous meaning across the whole UI (recording/arming), not
  reused for clipping.
- `components/mixer/`: `Mixer.tsx` (one `ChannelStrip` per track plus a
  `Master` strip, horizontally scrollable), `ChannelStrip.tsx` (name,
  mute/solo via the newly-shared `MiniToggle`, pan, a vertical fader, the
  meter, and an embedded `EffectsRack`), `EffectsRack.tsx` (add/bypass/
  remove/reorder-via-up-down-buttons/edit-params, reused as-is for both a
  track's chain and the master chain since the store's `*TrackEffect` and
  `*MasterEffect` actions already share the exact same shape), and
  `effectFields.ts` (pure UI metadata — label/min/max/step/unit or a
  select's options — for each of the 8 effect types' `params`; kept out of
  `engine/effects.ts` since sane *UI* ranges aren't an audio-engine
  concern).
- **`MiniToggle` extracted from `TrackRail.tsx` to `components/MiniToggle.tsx`**
  so `ChannelStrip` could reuse the exact same mute/solo button instead of
  duplicating a non-trivial styled component. `TrackRail.tsx` now imports it
  too; behavior unchanged.
- **The vertical fader is a native `<input type="range">` with
  `writingMode: 'vertical-lr'` + `direction: 'rtl'`**, not a custom
  drag-to-set-value control (contrast the piano roll's velocity handle,
  which needed custom pointer math because a note has no native form
  element to be). Modern Chromium (i.e. Electron, and dev-mode Chrome)
  renders this natively with correct fill direction, so this was the
  cheaper and more accessible choice over reinventing pointer-drag math a
  second time.
- Reordering an effect is two buttons (▲/▼) rather than drag-and-drop —
  `reorderTrackEffects`/`reorderMasterEffects` already take arbitrary
  `(fromIndex, toIndex)`, but a real drag interaction is meaningfully more
  code (drag-over targets, drop-index math, touch support) for a chain
  that's rarely longer than 3-4 effects. Worth revisiting only if a chain
  turns out to routinely need reordering across more than a couple of
  positions.
- **Caught on a re-read, not on the first pass:** `TransportBar.tsx` had a
  master meter (16 static bars) since Phase 0 that nothing ever updated —
  it was a layout placeholder, not wired to anything. It's now a real
  `MasterMeter` component using the same ref-array-plus-rAF technique as
  everywhere else (16 segments, lit count = `round(level * 16)`, top 2
  segments amber not red for the same reason as `ChannelStrip`'s bar).
  Flagging the miss itself: metering work should have swept every place a
  meter placeholder existed, not just the new `Mixer` panel — worth
  double-checking `TrackRail.tsx` and anywhere else for the same pattern
  before calling a "wire the UI" phase complete.

## Phase 4 summary

Recording is one new engine module plus a thin bridge into the project
store, wired into the two controls (Record button, `R` key) that already
existed as disabled/no-op placeholders.

- `engine/recorder.ts`: `AudioRecorder` wraps `Tone.UserMedia` (mic input)
  and `Tone.Recorder` (built on the browser's `MediaRecorder`). Tone's own
  docs are explicit that `MediaRecorder` has no sample-accurate start/stop —
  a take lands wherever the transport happened to be when capture actually
  finished opening. Documented as "close enough for punch-in," not
  tick-accurate like the rest of the engine.
- `engine/recordingController.ts` is the **one** module allowed to touch
  both `AudioEngine` and `projectStore` — `AudioEngine` itself still never
  imports the store (see its own header comment), so this file is the
  deliberate seam rather than letting that boundary blur. `toggleRecording()`
  is a single idempotent start/stop entry point shared by `TransportBar`'s
  Record button and the `R` keyboard shortcut, so the two can't drift out of
  sync with each other's session state.
- On stop, the take is decoded and handed to `sampleRegistry.registerSample`
  — which now returns `{ ref, durationSeconds }` instead of just `ref`, since
  the controller needs the real decoded duration to size the new clip
  (`secondsToTicks(durationSeconds, bpm)`). Drum sample loading (`StepSequencer`)
  was updated to destructure `.ref` from the new return shape. The registry
  itself is now documented as shared between drum-lane `sampleRef`s and
  recorded-take `fileRef`s — same "decode once, look up by ref" need either
  way — rather than being drum-specific.
- `AudioEngine.startRecording()` calls `Tone.start()`, starts the transport
  (punching in rather than requiring playback already running), opens the
  mic, and returns the tick position at that moment so the controller can
  place the resulting clip; `stopRecording()` returns the take as a `Blob`.
  `isRecording` is tracked independently of play/pause/stop in
  `transient.ts`'s transport flags.
- `engine/graph.ts`: new `buildAudioTrack` schedules every `audio`-kind clip
  as a `Tone.Player`, using `.sync().start(tick, offset, duration)` — the
  same "bind to the Transport's own tick clock" approach the pattern/MIDI
  parts already use, rather than a one-off real-time offset computed at
  graph-build time. This is what makes recorded playback survive a BPM
  change structurally, same reasoning as Phase 1's part scheduling.
- `TrackRail`: a red "Arm" `MiniToggle` now appears only on audio tracks,
  driving `Track.armed` (already in the Phase 0 data model, previously
  unused). `TransportBar`'s Record button — a disabled placeholder since
  Phase 0 — is now live: disabled unless powered on and (already recording,
  or some audio track is armed), label names the armed track, and
  `isRecording` is polled off `transient.ts` every rAF frame exactly like
  the meters (React no-ops the re-render when the polled value hasn't
  changed, so this doesn't cost a frame in practice despite looking like a
  60fps `setState`).
- **`ArrangementView` needed zero changes.** Its clip block renderer was
  already kind-agnostic (`clipLabel` has had an `'Audio'` branch since it was
  first written), so a recorded clip just shows up once `addClip` fires —
  nothing about "Phase 5 does real clip rendering" (per the Phase 0 note)
  blocked this; that note is about arrangement-level clip *editing*
  (trim/move/split), not the read-only block display recording relies on.
- **Caught by `npm run typecheck`, not on the first pass:** after arming was
  moved into `TrackHeaderRow`, `TrackRail`'s top-level component still
  destructured `setTrackArmed`/`selectTrack` from the stores and never used
  them — leftover from mid-refactor, would have shipped as dead code (and
  did fail `tsc`'s unused-variable check). Removed. Same lesson as Phase 3's
  `MasterMeter` miss: re-sweep a component after moving logic out of it, on
  top of just relying on typecheck to catch it.

## Known issues / flags for review (Phase 4)

- Recorded audio bytes only live in-memory (`sampleRegistry`'s `Map`), same
  gap already flagged for user drum samples — reload/relaunch loses the
  take, only the `fileRef` string survives in the project. Phase 5 must
  persist actual sample bytes for both cases together.
- Mic-permission and no-input-device failures are caught and logged, not
  surfaced in the UI (`recordingController.ts`'s `catch`) — the Record
  button just silently stays in its non-recording state. Worth a visible
  toast/error state before this is genuinely user-facing.
- Not interactively verified — no browser tool available in this
  environment, and recording additionally requires live mic permission that
  can't be granted headlessly either. Verified via clean `typecheck`/`lint`/
  `test`/`build` only. A real pass (arm a track, record a few seconds,
  confirm the clip appears and plays back in time) is the most important
  outstanding check before Phase 4 is user-facing "done."

## Phase 5 summary

Built in the order planned (persistence, then export, then arrangement
editing) since persistence was highest-value/lowest-risk and export reuses
persistence's WAV encoder; arrangement editing — the largest interaction-
design surface — went last.

**Persistence**

- **`engine/wavEncoder.ts`** (unit-tested): hand-rolled 16-bit PCM WAV writer.
  Confirmed against the installed Tone.js `.d.ts` that Tone ships no encoder
  (`ToneAudioBuffer` has `toMono`/`getChannelData`/etc., nothing WAV-shaped) —
  this was the one piece with no library to lean on.
- **`sampleRegistry.ts`** gained `registerSampleAtRef` (decode at a
  caller-supplied ref, for re-hydration on load — the existing
  `registerSample` mints a fresh ref, wrong for loading back a project's own
  saved refs) and a reversible `refToRelPath`/`relPathToRef` pair
  (`mem://<id>/<name>` <-> `audio/<id>__<name>`) so `project.json`'s stored
  refs never need rewriting — only the on-disk filename is derived from them.
- **`engine/projectIO.ts`** (new): the one bridge between `projectStore`,
  `sampleRegistry`, and `platform` for file I/O, mirroring the role
  `recordingController.ts` plays for `AudioEngine`+store. Walks the project's
  actually-referenced sample refs (`collectAudioFiles`), encodes each via
  `encodeWav`, and re-hydrates them on open/autosave-recovery. Dirty state is
  tracked by reference-comparing against a `lastSavedProject` snapshot — same
  reference-equality-as-diff-signal idiom `projectDiff.ts` already uses.
- **`platform/browser.ts`**: `openProject`/`saveProject` now use the File
  System Access API (`showDirectoryPicker`) so browser mode reads/writes the
  *exact same* `.dawproj` folder format (`project.json` + `audio/`) as
  Electron — one persistence format, no new dependency. TypeScript's bundled
  DOM lib has the older `FileSystemDirectoryHandle`/`FileSystemFileHandle`/
  `FileSystemWritableFileStream` interfaces but not `showDirectoryPicker`
  itself or the permission methods, so those are declared locally as a
  narrow ambient augmentation, feature-detected at runtime
  (`'showDirectoryPicker' in window` via `typeof window.showDirectoryPicker
  === 'function'`) — Firefox/Safari fall back to today's no-op, autosave to
  IndexedDB remains their only safety net. `PlatformAdapter`'s interface
  needed **no changes**: a directory handle isn't a `string` like Electron's
  real path, so `browser.ts` stays stateful internally (a
  `Map<string, FileSystemDirectoryHandle>` keyed by a generated id) and hands
  that id back as the `projectDirPath` string — callers stay
  platform-agnostic either way.
- **`uiStore.ts`** gained `openProjectRef`/`isProjectDirty`. **New
  `hooks/useProjectPersistence.ts`** (mirrors `useAudioEngine.ts`'s
  thin-hook-over-module shape): recovers an autosave snapshot once on mount
  *without* marking it saved (so a recovered crash draft immediately shows
  dirty, prompting a real save rather than silently trusting an
  unsaved-to-disk recovery), subscribes to `projectStore` to keep
  `isProjectDirty` current, and autosaves on a 15s interval when dirty.
- `TransportBar.tsx` gained a small File cluster (Open/Save/Save As + a `•`
  dirty indicator next to the project name); Ctrl/Cmd+S / Shift+S / O wired
  in `useKeyboardShortcuts.ts`.

**Export**

- **`engine/render.ts`**: `renderProjectToWav` — thin wrapper around
  `graph.ts`'s `buildGraph`, per that file's own Phase-1 comment. Verified
  against the installed `tone` package (not memory) that `Tone.Offline`
  swaps Tone's "current context" for the callback's duration so `buildGraph`
  works inside it unchanged, but does **not** auto-start playback — the
  callback must call `Tone.getTransport().start(0)` itself — and that
  `transport.ts`'s `initTransport()` is guarded by a module-level flag and so
  is **not** idempotent across contexts, meaning render code sets `PPQ`
  directly on the offline transport rather than calling it.
  - **Caught before it shipped, not after:** the callback must only *set up*
    scheduling and return/resolve immediately — it must NOT await anything
    driven by the offline clock itself (e.g. a `Transport.scheduleOnce` at
    the render's end time), because Tone doesn't advance that clock until
    *after* the callback resolves and `Offline` internally calls
    `context.render()`. An earlier draft tried to `await` a `scheduleOnce`
    callback for graph-disposal timing and would have deadlocked (the
    promise waiting on an event that only fires during a render pass that
    hadn't started yet). Fixed by building+starting synchronously in the
    callback and disposing the graph after `Tone.Offline(...)` resolves
    instead.
  - Render duration = furthest clip end across all tracks, converted via
    `ticksToSeconds`, plus a flat +1s tail for effect release trails
    (reverb/delay) — a documented approximation, not an exact per-effect
    computation.
  - `bounceProject` wraps render + `platform.exportWav` behind a
    module-level in-flight guard (not per-caller state) so the Bounce button
    and its Ctrl/Cmd+E shortcut can't kick off two overlapping offline
    renders.
- `TransportBar.tsx`'s long-disabled "Bounce to WAV" button is now live, with
  a busy label while rendering.

**Arrangement editing**

- `projectStore.ts` gained two actions: `moveClipToTrack` (cross-track drag —
  one atomic `set()` removing from the source track and inserting into the
  target, so it's a single undo step, not a remove-then-add pair; falls back
  to an in-place patch if from/to are the same track) and `splitClip`
  (**MIDI and audio clips only** — a pattern clip's steps are fixed positions
  within one full loop, so "splitting a drum loop" has no clean meaning; the
  UI simply never shows split for a `kind: 'pattern'` clip, and the action
  itself no-ops defensively if ever called on one anyway).
- `ArrangementView.tsx` fully reworked, following the exact interaction
  pattern `PianoRoll.tsx` already established: one pointer-event model on a
  single container (`tracksAreaRef`) capturing the pointer regardless of
  which child (a clip body or its resize handle) received `pointerdown`, and
  `pauseHistory()`/`resumeHistory()` around the whole drag so it collapses to
  one undo step.
  - **Move**: horizontal delta -> new `startTicks` (snapped via the reused
    `SNAP_OPTIONS`/`snapNearest`/`tickToX`/`xToTick` pure helpers from
    `pianoroll/geometry.ts` — genuinely generic tick<->pixel math, not
    piano-roll-specific, so imported rather than duplicated). Vertical delta
    -> retarget to whichever track row the pointer is over, **only if same
    `kind`** as the clip's current track (pattern->drum, midi->synth,
    audio->audio, matching the type coupling already in `graph.ts`); an
    incompatible hover just keeps the clip on its current track.
  - **Resize**: right-edge handle only, mirroring the piano roll note's own
    right-edge-only resize choice — no left-edge trim in v1, same
    deliberately-conservative scoping `projectDiff.ts` already uses
    elsewhere in this codebase.
  - **Duplicate/Delete/Split**: keyboard-only (Ctrl/Cmd+D, Delete/Backspace,
    `X`), consistent with this app's existing keyboard-first convention
    (mute/solo/loop are all keys, never context menus) — `X` splits the
    selected clip at the current playhead tick, only when the playhead
    actually falls inside it and it's midi/audio.
  - **Ruler + loop brace + playhead + zoom**: a new `Ruler` sub-component
    shows bar numbers and turns a drag into `uiStore.setLoopRange` (that
    action has existed since Phase 0/2 for exactly this and was never wired
    to any UI until now); `PlayheadLine` uses the same
    ref+rAF+`getTransientState()` technique the piano roll's own playhead
    already uses; zoom reuses `uiStore.pxPerBeat`/`setPxPerBeat` (already
    existed, clamped 4..400) with the same +/- button pattern as the piano
    roll's local zoom.
- No changes needed to `graph.ts`'s playback scheduling — it already
  schedules clips generically by kind regardless of how they got there.

## Known issues / flags for review (Phase 5)

- Browser save/open is Chromium/Edge-only (File System Access API) — accepted
  per the decided design, since the app is Electron-first and browser mode is
  the dev/testing surface, not the primary distribution channel. Firefox/
  Safari keep only the IndexedDB autosave safety net, no real save/open.
- `ensureReadWritePermission` in `browser.ts` best-effort re-requests
  `readwrite` permission on a cached directory handle; browsers may still
  re-prompt or silently deny across a page reload depending on their own
  permission-persistence policy — not something this app controls.
- Mic-permission-denial-style silent-catch pattern aside, there's still no
  visible error surfaced to the user if `showDirectoryPicker`/`saveProject`/
  `openProject` fails for a reason other than "user cancelled" (e.g. a
  permission re-prompt is denied) — the operation just quietly no-ops. Worth
  a toast/error UI before this is genuinely user-facing, same gap already
  flagged for recording in Phase 4.
- The +1s WAV export tail is a flat approximation, not computed per the
  master/track effect chain's actual release times — a long reverb tail
  longer than 1s will be truncated. Revisit if that turns out to matter in
  practice.
- Cross-track clip dragging retargets by track *kind* only, not by checking
  whether the specific target track can otherwise accept the clip (there's
  no such additional constraint today, but flagging the assumption in case a
  future track-level restriction is added).
- Not interactively verified — no browser-automation tool available in this
  environment. Verified via clean `typecheck`/`lint`/`test`/`build` each
  sub-phase, plus a `npm run dev` boot serving 200 with no console errors.
  Actually dragging/resizing/splitting a clip, granting a real directory
  picker permission, opening a saved `.dawproj` folder back up, and listening
  to a bounced WAV have NOT been checked by a human or a visual agent yet —
  the most important manual pass before calling Phase 5 user-facing "done."

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
- No visual browser verification was possible this phase either (same
  Claude-in-Chrome-not-connected situation as Phase 0/1) — verified via
  clean `npm run typecheck` / `npm run lint` / `npm run test`, plus a
  `npm run dev` boot with no console/module-resolution errors. The piano
  roll's actual click/drag feel (draw/move/resize/delete, keyboard preview,
  playhead tracking) has NOT been interactively verified by a human or a
  visual agent — this is the most important thing to manually check before
  relying on Phase 2 or 3 as user-facing "done."
- Same gap for Phase 3: the mixer's vertical fader (`writingMode:
  'vertical-lr'` + `direction: 'rtl'`), the meter bars' fill direction and
  amber threshold, and the effects rack have only been verified via
  `typecheck`/`lint`/`test`/`build`, never actually seen or dragged. The
  fader in particular is worth a real look first — CSS vertical-range
  rendering has historically had rough edges across browser versions.

## Phase 6 summary

Restyled the app to match a UI mock set (`Layr DAW.pdf`): near-black
surfaces, a lime UI accent distinct from the 8 track colors, uppercase mono
section labels. Also added the one interaction change the user asked for
mid-design: **effects/instrument editing now lives behind a right-click**,
not an always-open panel.

- **Theme (`index.css`, `state/types.ts`)**: re-hexed `--color-surface-*`/
  `-ink-*` to near-black, added `--color-accent` (lime) as a token
  *separate* from `TRACK_COLORS` — every existing consumer that was using
  `track-4` as a de-facto UI accent (focus ring, play-button active state,
  loop-range tint, selected-clip ring, sliders, hover borders) was swapped
  to the new `accent` token so a track literally colored blue is no longer
  visually identical to "selected/active" state. `TRACK_COLORS` itself was
  re-hexed to a mutier palette; the array shape didn't change, so no
  consumer needed code changes beyond the color swap. Added a `.label-mono`
  utility (mono, uppercase, tracked) applied to a representative set of
  section labels (BottomDock tabs, BPM, Pan, Snap/Zoom, Swing) — not swept
  into every label in the app; deeper pixel-level polish is left for a
  follow-up pass.
- **Clip naming**: `ClipBase` gained `name?: string`. New clips are
  auto-named "`<Label> N`" counting same-kind clips already on the track
  (`nextClipName` in `projectStore.ts`, reused by `recordingController.ts`
  for takes) — this exists because the mock's Timeline/Session views show
  real clip names ("Verse Beat", "Bassline"), and the data model had no
  such field before. Renaming happens from the new Sound tab, not inline on
  the bar, since the bar's double-click already means "add a volume
  keyframe."
- **The right-click mechanism (`components/sound/SoundPanel.tsx`)**: a 4th
  `BottomPanelTab` (`'sound'`). Right-clicking a clip in `ArrangementView`,
  right-clicking a track header in `TrackRail`, or clicking `ChannelStrip`'s
  new compact "insert pill" (which replaced its previously-always-expanded
  inline `EffectsRack`) all funnel into the same tab — one effects/
  instrument UI, three entry points, instead of three separate ones. The
  panel reuses `EffectsRack` completely unchanged (same store actions
  `Mixer.tsx` already called) and adds a new kind-specific instrument
  editor: a `Knob` component (`components/sound/Knob.tsx`, same
  vertical-drag-delta convention as `Pad.tsx`'s velocity drag) for synth
  params via the already-existing `setTrackInstrument` action and a new
  `synthParamFields.ts` (mirrors `mixer/effectFields.ts`'s pattern: the
  engine only knows param *keys*, UI ranges are a presentation concern
  kept separate) — for drum tracks, a compact per-lane mute/sample list
  reusing `StepSequencer`'s existing actions. The master bus strip is the
  one exception: it has no track to select, so it keeps its inline
  `EffectsRack` as before.
- **Capture view (`components/capture/CaptureView.tsx`)**: recording
  previously had no dedicated screen, just the Record button + Arm toggle.
  Now, while `isRecording` (a new shared `useIsRecording` hook —
  `TransportBar` was refactored to use it too instead of its own inline
  poll, removing a duplicated rAF-poll block), a full overlay shows a live
  input waveform and level meter. New engine bit: `recorder.ts` taps a
  `Tone.Waveform` off the mic (fan-out, doesn't join the recorder's signal
  path — same convention `graph.ts`'s meter taps use), surfaced through a
  new `transient.ts` field (`recordingWaveform`) and drawn straight to
  canvas in a rAF loop — same "never React state for per-frame data" rule
  every meter/playhead in this app already follows. **Deliberately not
  built**: the mock's Monitor/Loop-record toggles have no real mechanism
  behind them in this engine (no hardware-monitoring or loop-record
  concept exists) — left out rather than shipping non-functional switches.
  Also **not built**: multi-take comping (mock shows stacked Take 1/Take 2
  lanes) — the data model has one clip per recording, not a take list;
  flagged as a possible future feature.

### Known issues / flags for review (Phase 6)

- Not interactively verified — no browser-automation tool connected this
  session (`tabs_context_mcp` returned "not connected"). Verified via clean
  `typecheck`/`lint`/`test` and a real `npm run dev` boot (200, no console
  errors surfaced in the server log). The right-click-to-Sound-tab flow,
  the Knob's drag-to-rotate feel, and the Capture view's live waveform
  drawing have NOT been seen or exercised by a human or visual agent yet —
  most important manual check before calling Phase 6 done.
- Restyle pass covers the *representative* set of section labels/accent
  usages, not an exhaustive sweep of every string in the app — some labels
  (e.g. per-lane text in `StepSequencer`, `PianoRoll`'s own UI chrome)
  still use the old plain style. Fine as an iterative look, not a gap in
  functionality.
- `Knob`'s rotation angle math (`transform: rotate()` on the button itself,
  child indicator positioned near the top edge so it sweeps with the
  parent) was chosen specifically to avoid combining `translate`+`rotate`
  transform-order ambiguity — but like the fader before it, hasn't been
  visually confirmed in a real browser.

## Phase 7 summary

Added the mock's "Direction B" main view — a Session/clip-launcher grid —
as a real alternate main view (`uiStore.mainView: 'timeline' | 'session'`,
switched from a new segmented control in `TransportBar`), plus the engine
capability it actually needs: launching a clip independent of its position
in the linear Timeline.

- **Data model**: `Project.scenes: Scene[]` (`{id, name}`); `ClipBase`
  gained `sceneId?: string`. A clip with a `sceneId` appears in the Session
  grid at that scene's row, in its track's column; no `sceneId` = Timeline-
  only, invisible in Session — this matches the mock's grid exactly (empty
  cells are just tracks with no clip tagged to that scene). Store gained
  `addScene`/`renameScene`/`removeScene` (also clears `sceneId` off any
  clip that referenced a removed scene, so nothing dangles)/`reorderScenes`/
  `setClipScene`. `loadProject` defaults `scenes: project.scenes ?? []` at
  the load boundary for projects saved before this phase (the `Project`
  type claims the field always exists, but old JSON on disk won't have it).
  No persistence-layer changes needed beyond that — `platform/electron.ts`
  round-trips the whole `Project` as one `JSON.stringify`/`parse` blob, so
  a new field just rides along.
- **The core engineering piece — `engine/sessionPlayer.ts`**: Session and
  Timeline are **mutually exclusive schedulers sharing one Transport**, not
  two independent audio engines. `graph.ts`'s `buildGraph` gained a
  `BuildGraphOptions.scheduleArrangement` flag (default true) — when false,
  `buildDrumTrack`/`buildSynthTrack`/`buildAudioTrack` still build the live
  instrument/voices/trackInput (sessionPlayer needs them) but skip creating
  the Timeline's absolute-tick Parts/Players, so a session-launched loop on
  a track can never double-trigger against an arrangement Part on the same
  track. `AudioEngine.setSessionMode(enabled)` pauses the transport and
  rebuilds the graph with that flag; `SessionView`'s mount/unmount
  (`useEffect`) is what actually flips it, via `sessionPlayer.setSessionMode`
  (a thin wrapper that also calls `stopAll()` on the way out).
  - Launching a clip builds an **ad-hoc looping** `Tone.Part` (pattern/midi)
    or looping `Tone.Player` (audio), started at the next bar boundary
    (`Math.ceil(currentTick / TICKS_PER_BAR) * TICKS_PER_BAR`) — reusing the
    track's already-live instrument/drum-voices/trackInput via three new
    `AudioEngine` accessors (`getDrumVoices`/`getSynthInstrument`/
    `getTrackInput`) rather than sessionPlayer owning a second copy of
    anything. `graph.ts`'s pattern/MIDI event-flattening (swing offsets,
    volume-keyframe-scaled velocity) was extracted into exported
    `buildPatternEvents`/`buildMidiEvents` specifically so the Timeline's
    Part and Session's ad-hoc Part use the *exact same* math — two
    schedulers, one source of truth for "what does this clip's content
    actually sound like."
  - **Per-track exclusivity**: launching a new clip on a track schedules
    the previous one's stop at the same quantized boundary before starting
    the new one. **Scene launch** = launch every track's clip tagged with
    that scene, best-effort simultaneous (each computes the same boundary
    independently). `stopAll()` (mode-exit only) tears down immediately, no
    quantizing, since the transport itself is already pausing.
  - "Now playing" highlight: `transient.ts` gained
    `sessionActiveClipByTrack` (mutated **in place**, not replaced, since
    `sessionPlayer.ts` only ever sets one key at a time) and a matching
    `useSessionActiveClip(trackId)` hook that polls one primitive value per
    rAF frame — deliberately per-trackId rather than one hook returning the
    whole map, because polling a mutated-in-place object would never see a
    changed reference and React would never re-render. The flip itself is
    scheduled via `Tone.getTransport().scheduleOnce(...)` at the real
    quantized tick, not applied optimistically at click time, so the
    highlight reflects when playback actually changes, not when the button
    was pressed.
- **`components/session/SessionView.tsx`**: grid UI, columns = tracks
  (shares `TrackRail`'s track order and colors), rows = scenes. Right-click
  on a clip cell reuses the exact same "select track/clip, open Sound tab"
  wiring `ArrangementView`'s clip bars use. Empty cells only offer a "+"
  quick-add for drum/synth tracks (creates a default pattern/MIDI clip and
  tags it with that scene) — audio tracks show a plain empty dash, since
  authoring an empty audio clip has no meaning (audio content only exists
  once recorded/imported).

### Known issues / flags for review (Phase 7)

- Not interactively verified — no browser tool connected this session.
  This phase in particular has real audio-timing behavior (quantized
  launch, per-track exclusivity, scene launch, the Timeline/Session mode
  switch) that only a live audible pass can actually confirm; typecheck/
  lint/test/dev-boot catch structural mistakes, not "does it sound right."
  Most important manual check before calling Phase 7 done.
- Launch quantize is fixed at 1 bar, not user-configurable (mock shows it
  as a dropdown) — deliberate v1 scope call.
- Switching Timeline↔Session mid-playback pauses the transport rather than
  crossfading or otherwise handing off gracefully — acceptable but audibly
  abrupt; revisit if that turns out to matter in practice.
- Session-launched audio clips loop at their own fixed real-time duration
  regardless of project BPM (same as Timeline audio clips already do in
  `graph.ts` — audio content isn't time-stretched anywhere in this engine),
  so an audio loop's length won't tempo-sync the way a pattern/MIDI loop
  does. Consistent with existing behavior, but worth knowing going in.
- No UI yet for reordering scenes (`reorderScenes` exists in the store,
  unused) — scenes only reorder via removal/recreation today.

## Phase 8 summary

Added the mock's sample-browser screen, scoped to what this offline-first
app actually has: the user's own recorded takes and imported samples, plus
the built-in synthesized drum kit as always-available one-shots — not a
bundled sound-pack (this app ships no copyrighted audio content), per the
earlier decision.

- **`engine/sampleRegistry.ts`** gained a small metadata sidecar
  (`SampleMeta`: ref/name/durationSeconds/source) alongside the existing
  decoded-buffer map, plus a subscribe/notify pair
  (`subscribeSampleLibrary`/`getSampleLibrary`) — samples can arrive at any
  time (recording finishes, a drum lane loads a sample, a project opens),
  not just on mount, so the Library tab needs to react to pushes, not just
  read once. `registerSample` gained an optional `source: 'recorded' |
  'imported'` param (default `'imported'`, so existing call sites in
  `StepSequencer`/`SoundPanel`'s drum-lane loader needed no changes);
  `recordingController.ts` passes `'recorded'` explicitly.
  `registerSampleAtRef` (project-load rehydration) also now records
  metadata, inferring source from the ref's embedded name via a
  `name.startsWith('Recording')` heuristic — the real source isn't
  preserved through the ref itself, so this is a best-effort label, not a
  ground truth.
- **`AudioEngine.previewBuiltInDrumSound(laneId)`**: a throwaway
  `createDrumVoice` straight to `Tone.getDestination()`, disposed after
  1.5s — lets the Library tab audition a kit piece without needing any
  track to exist, unlike every other preview method in this engine which
  is always track-scoped.
- **`components/library/LibraryPanel.tsx`** (new 5th `BottomPanelTab`):
  category sidebar (All/Recorded/Imported/Kit one-shots) with live counts,
  a text search, and a flat list. Each real sample row is `draggable`
  (HTML5 DnD, payload shape in the new `utils/dragTypes.ts` so both this
  file and `ArrangementView` share one type instead of each guessing the
  other's JSON shape) and has an "Add" button as a non-drag fallback —
  both paths create a new audio clip sized from the sample's real decoded
  duration (`secondsToTicks`), targeting the selected audio track if one
  exists or creating a fresh audio track otherwise. Built-in kit pieces
  only get a preview button, no drag/add — they're synthesized, not a
  decoded buffer, so "add to project" has no meaning for them (loading one
  onto a drum lane already goes through the existing per-lane picker,
  unchanged).
- **`ArrangementView.tsx`** gained the drop side: `onDragOver`/`onDrop` on
  each track row, but the drop only does anything when `track.kind ===
  'audio'` — dropping a sample onto a drum/synth track is a no-op, since
  those tracks' clips are pattern/MIDI content, not decoded audio (the
  Library tab's per-lane sample-load path already covers drum lanes, and
  there's no equivalent "load a sample into a synth" concept in this
  engine).

### Known issues / flags for review (Phase 8)

- Not interactively verified — no browser tool connected this session.
  Drag-and-drop in particular is worth a real check: HTML5 DnD has
  historically had cross-browser rough edges this environment can't catch
  via typecheck/lint/test.
- No BPM/key auto-match copy (the mock shows "Auto-matched to 124 BPM") —
  deliberately dropped since it would be dishonest for raw recordings/
  one-shots that aren't tempo-synced loops.
- No on-disk folder browsing (the "same, plus a local folder picker"
  option from the earlier decision point was not chosen) — Library only
  ever shows samples already registered this session via recording or the
  existing per-lane sample picker.

## Phase 9 summary

The last phase of the redesign: a real Export dialog (the mock's WAV/MP3/
FLAC/Stems format picker, sample rate, bit depth) replacing the plain
"Bounce to WAV" button, and a Start screen replacing the bare empty-state
message.

- **`engine/wavEncoder.ts`** now takes a `WavBitDepth` (16, unchanged
  default, or 24 — hand-written 24-bit little-endian PCM since `DataView`
  has no `setInt24`).
- **`engine/zipWriter.ts`** (new, unit-tested via its own minimal reader in
  `zipWriter.test.ts` — no zip library was available to cross-check
  against, so the test round-trips through the format itself, verifying
  CRC32/offsets/names): a hand-rolled STORE-only (uncompressed) ZIP writer,
  same "small enough to own, no new dependency" precedent as
  `wavEncoder.ts` — audio bytes barely compress anyway, so skipping
  deflate costs nothing real for Stems export.
- **`engine/mp3Encoder.ts`** (new): wraps `@breezystack/lamejs` (added as a
  real dependency — pure JS, no WASM, actively-maintained fork of the
  original `lamejs`), encoding in 1152-sample blocks per its API.
- **FLAC was evaluated and deliberately not integrated.** The only
  reasonably-complete option (`libflacjs`) is WASM+Emscripten, last
  published in 2020, and typically used via a Web Worker — real
  integration risk (asset bundling under Vite/Electron, whether it
  actually instantiates) that this session had no way to verify without a
  connected browser tool. Per the plan's own stated fallback, `render.ts`'s
  `exportProject` throws a clear `'FLAC export is not available in this
  build yet.'` for that one format instead of shipping an unverified
  integration; the Export dialog shows FLAC as a selectable-but-disabled
  option with that message inline, matching the mock's layout without
  faking functionality. Revisit if a maintained pure-JS/WASM FLAC encoder
  with real usage evidence turns up.
- **`engine/render.ts` reshaped around one shared `renderToBuffer`** (the
  old `renderProjectToWav`'s `Tone.Offline` call, now parameterized by
  sample rate) that every format builds on: `renderProjectToWav` (encode),
  `renderProjectToMp3` (encode), and `renderStemsToZip` — which renders the
  project once per track via a new `projectSoloingOnlyTrack` (forces
  exactly one track's `mixer.solo`/`mute` regardless of the project's real
  state, an in-memory clone only) and zips the per-track WAVs. **Stems
  still pass through the master effects chain** (limiter etc.) — a
  deliberate simplification, not a raw pre-master mix; flagged below.
  `bounceProject` (old one-click WAV-only path) is now a thin wrapper
  around the new `exportProject(project, options)`.
- **`PlatformAdapter.exportWav` → `exportFile`**, since it was already
  format-agnostic (just bytes + a filename) — `browser.ts`'s implementation
  now derives the download's MIME type from the filename's real extension
  (a small `wav/mp3/flac/zip` lookup) instead of hardcoding `audio/wav`.
  **The Electron IPC channel itself was deliberately left named
  `exportWav`/`export:wav`** (only the renderer-facing `PlatformAdapter`
  method needed the more accurate name) — renaming the wire channel too
  would mean keeping `preload.ts`'s manually-duplicated channel-name
  strings in sync (the brittleness `CLAUDE.md`/`electron/preload.ts`'s own
  comment already flags) for no functional benefit. `electron/main.ts`'s
  save-dialog now derives its filter/title from the actual extension on
  `suggestedName` instead of hardcoding "WAV Audio".
- **`components/ExportDialog.tsx`** (new): format grid, sample rate
  (44.1/48/96 kHz — verified against the installed Tone `.d.ts` that
  `Tone.Offline`'s 4th param genuinely accepts this), bit depth (hidden for
  MP3, which doesn't have one), a live length/estimated-size readout, and
  the FLAC-disabled state described above. Opened by `TransportBar`'s
  renamed "Export" button and by Ctrl/Cmd+E (previously an instant no-
  dialog WAV bounce — now opens the dialog, since format is no longer a
  foregone conclusion).
- **`components/StartScreen.tsx`** (new) replaces both `ArrangementView`'s
  and `SessionView`'s bare "Nothing here yet" empty states (same trigger —
  `tracks.length === 0` — so no new state needed to decide when to show
  it). Three options:
  - **New empty project** — same "add a drum track, jump to step
    sequencer" flow the old empty state already had, restyled. Also bound
    to Ctrl/Cmd+N — which only fires in Electron, since browsers intercept
    that combination for "new window" before page JS ever sees it; the
    button itself still works everywhere regardless.
  - **Open recent** — a new `utils/recentProjects.ts` keeps a small
    `localStorage`-backed list (name + last-opened time), updated whenever
    `projectIO.ts`'s `markSaved` fires (save, save-as, or open). **This is
    informational, not a direct-reopen mechanism** — clicking it still
    opens the normal `platform.openProject()` picker. Genuinely bypassing
    the picker would need a new no-dialog Electron IPC method plus, in the
    browser, persisting a `FileSystemDirectoryHandle` across sessions
    (technically possible — browsers do allow `requestPermission()` on a
    stored handle from a user-gesture-triggered click — but real added
    surface this pass didn't build); scoped down deliberately rather than
    promising a seamless reopen that wasn't verified.
  - **Start from a template** — `utils/projectTemplates.ts`'s
    `applyProjectTemplate` seeds Beat/Podcast/Band Session by calling the
    *same* store actions (`addTrack`/`addDefaultPatternClip`/
    `addDefaultMidiClip`) a user clicking through the UI would, rather than
    hand-building raw `Project` objects — a template track is
    indistinguishable from one a user just created, and can't drift from
    those factories over time.

### Known issues / flags for review (Phase 9)

- Not interactively verified — no browser tool connected this session.
  This phase especially: MP3 encoding correctness (does it actually sound
  right, not just "doesn't throw"), the Stems zip actually opening in a
  real archive tool, and the Export dialog's format-switching UI all need
  a real pass. `zipWriter.ts` has a unit test verifying its own format
  round-trips correctly, which is the most confidence available without a
  live environment.
- FLAC is a visible-but-disabled option, not a missing one — see the
  summary above for why, and revisit if a real, verifiable pure-JS/WASM
  encoder becomes available.
- Stems export includes the master effects chain (limiter etc.) on every
  track's render, not a raw pre-master mix — some workflows expect stems
  without master processing. Revisit if that turns out to matter.
- "Open recent" doesn't bypass the file/directory picker (see summary) —
  it's a reminder list, not one-click reopen.
- New dependency: `@breezystack/lamejs` (MP3 encoding). No new dependency
  for zip (hand-rolled) or the Start screen/recents (browser/localStorage
  APIs only).

## Volume keyframe automation (post-Phase 5)

Clip-level volume automation, editable directly on a clip's "bar" in
`ArrangementView`, following the same one-container-pointer-capture model
the rest of that file already uses for move/resize.

- `state/types.ts`: `ClipBase` gained `volumeKeyframes?: VolumeKeyframe[]` —
  `{ ticks, value }` pairs, `ticks` **clip-relative** (0..lengthTicks) so a
  clip's curve doesn't need rewriting every time the clip itself moves,
  `value` a plain 0..1 linear gain multiplier (not dB) chosen specifically so
  it maps directly to a keyframe dot's vertical position in the UI with no
  conversion.
- `engine/automation.ts` (unit-tested, no Tone/React — same split as
  `time.ts`): `sampleVolumeAtTick` linearly interpolates the curve at a
  clip-relative tick, holding the nearest edge value outside the keyframe
  range and returning `1` with no keyframes at all.
- **Deliberately two different application strategies in `graph.ts`,
  depending on clip kind, not one uniform mechanism:**
  - **Audio clips** get a real continuous automation node: a per-clip
    `Tone.Gain` inserted between the `Tone.Player` and the track input, with
    the curve scheduled onto its `.gain` param via
    `setValueAtTime`/`linearRampToValueAtTime` at absolute ticks
    (`clipStartTicks + kf.ticks`, using the same `` `${ticks}i` `` tick
    notation as every other scheduled time in this file, so it stays
    glitch-free across BPM changes same as Parts/Players already do). This
    works because an audio clip already has exactly one dedicated node
    sitting in the signal path for its whole duration.
  - **Pattern/MIDI clips have no such per-clip node** (drum lanes and the
    synth instrument are shared across every clip on the track), so instead
    each discrete trigger's velocity is scaled by `sampleVolumeAtTick` at
    that event's own tick before scheduling — the curve still shapes the
    track's output over time, just sampled per-hit/per-note rather than as a
    continuous ramp. Chosen over adding a per-clip gain node upstream of a
    shared instrument (which doesn't exist today and would be a bigger
    structural change) since triggered instruments have no continuous output
    to ramp in between hits anyway.
- `projectStore.ts`: `splitClip` redistributes keyframes across the split
  boundary the same way it already does for MIDI notes (filter by
  `relativeSplit`, shift the second half's `ticks` back to 0);
  `duplicateClip` deep-copies the keyframe array alongside pattern/notes so
  editing a duplicate's curve can't mutate the original's.
- `ArrangementView.tsx`: keyframe dots are drawn and **indexed in the clip's
  own storage order**, not ticks order — a drag gesture captures an index
  once at pointerdown and reuses it for the whole gesture (same "no id,
  index is stable for one gesture" convention `PianoRoll`'s notes already
  use), so re-sorting for display can never point a drag at the wrong dot.
  The drawn curve (an SVG `<polyline>`) is computed from a separately-sorted
  copy instead. Double-click on a clip body adds a point at the click
  position (reuses the same tick-snap as move/resize); dragging a dot moves
  it in both time and value; right-click deletes it, mirroring the piano
  roll's own right-click-to-delete-a-note convention.
- No new `projectDiff.ts` classification needed — a keyframe edit changes
  the clip, which already falls through to `rebuild` the same way dragging
  a clip to move/resize it already does today; not a new perf concern, just
  matching existing behavior.
- Not interactively verified — no browser-automation tool available in this
  environment. Verified via clean `typecheck`/`lint`/`test`/`build` only;
  actually hearing an audio clip's continuous fade and a drum/synth clip's
  per-hit ducking, and dragging a keyframe dot by hand, has not been checked
  by a human or visual agent yet.
