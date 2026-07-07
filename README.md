# Local DAW

A fully offline, local-first Digital Audio Workstation. No cloud services, no
accounts, no telemetry, no network calls at runtime — synthesis, sequencing,
recording, mixing, and export all run on your machine.

See `PROGRESS.md` for build-phase status and decisions.

## Scripts

- `npm run dev` — Vite dev server, browser only (everything except native
  file dialogs works here).
- `npm run dev:desktop` — same app running inside Electron.
- `npm run build` — production renderer build.
- `npm run build:electron` — compile the Electron main/preload processes.
- `npm run dist` — build + package installers via electron-builder.
- `npm run typecheck` / `npm run lint` / `npm run test` — verification.

## Stack

Electron + Vite + React 18 + TypeScript (strict) + Tailwind CSS + Zustand
(+ zundo for undo/redo) + Tone.js + vitest.
