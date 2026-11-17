import { spawn, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { connect } from 'node:net';
import { join } from 'node:path';
import { env, GAME_ROOT } from '../src/env.ts';

/**
 * Ловушка писем Mailpit для разработки (ML-A): принимает все письма игры и показывает их в
 * браузере — http://localhost:8025. Скачивается один раз в `game/.tools/` (не в git), без
 * Docker. Если почта выключена (`MAIL_TRANSPORT` не `mailpit`) — ничего не делает.
 */
const VERSION = 'v1.33.0';
const dir = join(GAME_ROOT, '.tools', `mailpit-${VERSION}`);
const win = process.platform === 'win32';
const exe = join(dir, win ? 'mailpit.exe' : 'mailpit');
const ui = new URL(env.mailpitUrl);
const uiPort = Number(ui.port || 8025);

const asset = (): string | null => {
  const arch = process.arch === 'arm64' ? 'arm64' : process.arch === 'x64' ? 'amd64' : null;
  if (!arch) return null;
  if (win) return `mailpit-windows-${arch}.zip`;
  if (process.platform === 'darwin') return `mailpit-darwin-${arch}.tar.gz`;
  if (process.platform === 'linux') return `mailpit-linux-${arch}.tar.gz`;
  return null;
};

const portBusy = (port: number) =>
  new Promise<boolean>((resolve) => {
    const s = connect({ port, host: '127.0.0.1' });
    s.once('connect', () => {
      s.destroy();
      resolve(true);
    });
    s.once('error', () => resolve(false));
  });

const idle = () => setInterval(() => {}, 1 << 30);

if (env.mailTransport !== 'mailpit') {
  console.log(`mail: почта — ${env.mailTransport}, Mailpit не нужен`);
} else if (await portBusy(uiPort)) {
  console.log(`mail: Mailpit уже запущен — письма: ${ui.origin}`);
  idle();
} else {
  if (!existsSync(exe)) await download();
  const p = spawn(exe, ['--listen', `127.0.0.1:${uiPort}`, '--smtp', '127.0.0.1:1025'], {
    stdio: ['ignore', 'ignore', 'inherit'],
  });
  p.once('spawn', () => console.log(`mail: Mailpit запущен — письма игры: ${ui.origin}`));
  p.once('exit', (code) => {
    console.error(`mail: Mailpit остановился (код ${code})`);
    process.exit(code ?? 1);
  });
  for (const sig of ['SIGINT', 'SIGTERM'] as const) process.on(sig, () => p.kill());
}

async function download() {
  const name = asset();
  if (!name) {
    console.error(
      'mail: Mailpit для этой системы не найден — установите его вручную (mailpit.axllent.org)',
    );
    process.exit(1);
  }
  const url = `https://github.com/axllent/mailpit/releases/download/${VERSION}/${name}`;
  console.log(`mail: скачиваю Mailpit ${VERSION} (один раз)…`);
  const res = await fetch(url);
  if (!res.ok) {
    console.error(
      `mail: не скачался Mailpit (${res.status}). Проверьте интернет и запустите снова.`,
    );
    process.exit(1);
  }
  mkdirSync(dir, { recursive: true });
  const archive = join(dir, name);
  writeFileSync(archive, Buffer.from(await res.arrayBuffer()));
  // tar есть и в Windows 10+ (умеет zip), и в Linux/macOS. В Windows — системный: tar из Git
  // Bash принимает «E:» за адрес сервера.
  const tar = win ? join(process.env.SystemRoot ?? 'C:\\Windows', 'System32', 'tar.exe') : 'tar';
  const r = spawnSync(tar, ['-xf', archive, '-C', dir], { stdio: 'inherit' });
  rmSync(archive, { force: true });
  if (r.status !== 0 || !existsSync(exe)) {
    console.error('mail: не распаковался архив Mailpit');
    process.exit(1);
  }
}
