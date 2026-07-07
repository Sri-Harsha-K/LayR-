// Runs the Electron shell against the live Vite dev server: compiles
// electron/ once, boots Vite, waits for it to answer, then launches
// Electron with VITE_DEV_SERVER_URL set. Deliberately dependency-free
// (no concurrently/wait-on) per the project's dependency budget.
import { spawn } from 'node:child_process';
import electronPath from 'electron';

const VITE_PORT = 5173;
const DEV_SERVER_URL = `http://localhost:${VITE_PORT}`;
const isWin = process.platform === 'win32';

function run(cmd, args, opts = {}) {
  return spawn(cmd, args, { stdio: 'inherit', shell: isWin, ...opts });
}

function runToCompletion(cmd, args) {
  return new Promise((resolve, reject) => {
    const proc = run(cmd, args);
    proc.on('exit', (code) => (code === 0 ? resolve() : reject(new Error(`${cmd} exited ${code}`))));
  });
}

async function waitForServer(url, timeoutMs = 30000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      await fetch(url);
      return;
    } catch {
      await new Promise((r) => setTimeout(r, 200));
    }
  }
  throw new Error(`Vite dev server did not start within ${timeoutMs}ms`);
}

async function main() {
  await runToCompletion('node', ['scripts/build-electron.mjs']);

  const vite = run('npx', ['vite', '--port', String(VITE_PORT), '--strictPort']);
  await waitForServer(DEV_SERVER_URL);

  const electronProc = run(electronPath, ['dist-electron/main.js'], {
    env: { ...process.env, VITE_DEV_SERVER_URL: DEV_SERVER_URL },
  });

  let shuttingDown = false;
  const cleanup = () => {
    if (shuttingDown) return;
    shuttingDown = true;
    vite.kill();
    electronProc.kill();
    process.exit();
  };

  electronProc.on('exit', cleanup);
  vite.on('exit', cleanup);
  process.on('SIGINT', cleanup);
  process.on('SIGTERM', cleanup);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
