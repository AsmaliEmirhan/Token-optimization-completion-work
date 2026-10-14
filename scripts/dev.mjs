import { spawn } from 'node:child_process';
import path from 'node:path';
import process from 'node:process';

function spawnNodeCli(modulePath, args) {
  return spawn(process.execPath, [path.join(process.cwd(), modulePath), ...args], {
    cwd: process.cwd(),
    stdio: 'inherit',
  });
}

const processes = [
  spawnNodeCli('node_modules/tsx/dist/cli.mjs', ['server/index.ts']),
  spawnNodeCli('node_modules/vite/bin/vite.js', []),
];

let shuttingDown = false;

function shutdown(exitCode = 0) {
  if (shuttingDown) return;
  shuttingDown = true;
  for (const child of processes) {
    if (!child.killed) child.kill();
  }
  process.exitCode = exitCode;
}

for (const child of processes) {
  child.on('error', (error) => {
    console.error('Geliştirme süreci başlatılamadı:', error.message);
    shutdown(1);
  });
  child.on('exit', (code, signal) => {
    if (shuttingDown) return;
    if (signal === null && code === 0) shutdown(0);
    else shutdown(code ?? 1);
  });
}

process.on('SIGINT', () => shutdown(0));
process.on('SIGTERM', () => shutdown(0));
