// Compiles electron/ (CommonJS) then drops a package.json into dist-electron/
// so Node doesn't interpret the .js output as ESM (root package.json has
// "type": "module" for the Vite/renderer side).
import { spawn } from 'node:child_process';
import { writeFile, mkdir } from 'node:fs/promises';

function runToCompletion(cmd, args) {
  return new Promise((resolve, reject) => {
    const proc = spawn(cmd, args, { stdio: 'inherit', shell: process.platform === 'win32' });
    proc.on('exit', (code) => (code === 0 ? resolve() : reject(new Error(`${cmd} exited ${code}`))));
  });
}

async function main() {
  await runToCompletion('npx', ['tsc', '-p', 'electron/tsconfig.json']);
  await mkdir('dist-electron', { recursive: true });
  await writeFile('dist-electron/package.json', JSON.stringify({ type: 'commonjs' }, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
