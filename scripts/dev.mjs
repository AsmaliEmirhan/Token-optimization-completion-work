import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

// .env içindeki TOKENAI_CLASSIFIER_AUTOSTART / TOKENAI_PYTHON ayarları burada da geçerli olsun
try {
  const envPath = path.join(process.cwd(), '.env');
  if (fs.existsSync(envPath) && typeof process.loadEnvFile === 'function') process.loadEnvFile(envPath);
} catch {
  // .env okunamazsa varsayılanlar kullanılır
}

function spawnNodeCli(modulePath, args) {
  return spawn(process.execPath, [path.join(process.cwd(), modulePath), ...args], {
    cwd: process.cwd(),
    stdio: 'inherit',
  });
}

// Zorunlu süreçler: biri kapanırsa geliştirme ortamı kapanır
const processes = [
  spawnNodeCli('node_modules/tsx/dist/cli.mjs', ['watch', 'server/index.ts']),
  spawnNodeCli('node_modules/vite/bin/vite.js', []),
];

let shuttingDown = false;
let classifier = null;

function shutdown(exitCode = 0) {
  if (shuttingDown) return;
  shuttingDown = true;
  for (const child of [...processes, classifier]) {
    if (child && !child.killed) child.kill();
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

// İsteğe bağlı süreç: yerel BERTurk sınıflandırıcı servisi.
// Çalışmazsa uygulama kapanmaz; L1 istekleri "CLASSIFIER_UNAVAILABLE" nedeniyle BYPASS olur ve sohbet normal devam eder.
function startClassifier() {
  if (process.env.TOKENAI_CLASSIFIER_AUTOSTART === 'false') return;
  const script = path.join(process.cwd(), 'classifier-service', 'server.py');
  if (!fs.existsSync(script)) return;
  const python = process.env.TOKENAI_PYTHON || (process.platform === 'win32' ? 'python' : 'python3');
  classifier = spawn(python, [script], { cwd: process.cwd(), stdio: 'inherit', env: { ...process.env, PYTHONUTF8: '1', PYTHONIOENCODING: 'utf-8' } });
  classifier.on('error', (error) => {
    console.warn(`[Sınıflandırıcı] Başlatılamadı (${error.message}). Python kurulu mu? L1 sınıflandırma devre dışı, sohbet çalışmaya devam eder.`);
  });
  classifier.on('exit', (code) => {
    if (shuttingDown) return;
    console.warn(`[Sınıflandırıcı] Servis kapandı (kod ${code}). L1 istekleri BYPASS olacak; sohbet çalışmaya devam eder.`);
    console.warn('[Sınıflandırıcı] Kurulum: pip install -r classifier-service/requirements.txt  ·  Model: ml/models/model');
  });
}
startClassifier();

process.on('SIGINT', () => shutdown(0));
process.on('SIGTERM', () => shutdown(0));
