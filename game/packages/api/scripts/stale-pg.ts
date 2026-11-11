import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import postgres from 'postgres';

/**
 * Зависшая база разработки (случай 09.11): главный процесс PostgreSQL умер, а его служебный
 * процесс (`postgres.exe --forkchild=…`) остался и держит порт. Порт занят, но база не
 * отвечает — сервер игры ждёт её бесконечно. Здесь — как это распознать и убрать.
 */

/** База на порту отвечает на запрос (за `timeoutS` секунд). Ошибка самой базы — тоже ответ. */
export async function pgAnswers(url: string, timeoutS = 3): Promise<boolean> {
  const u = new URL(url);
  u.pathname = '/postgres';
  const sql = postgres(u.toString(), {
    max: 1,
    connect_timeout: timeoutS,
    idle_timeout: 1,
    onnotice: () => {},
  });
  const timer = new Promise<'timeout'>((r) =>
    setTimeout(() => r('timeout'), timeoutS * 1000 + 500),
  );
  try {
    const r = await Promise.race([sql`select 1`.then(() => 'ok' as const), timer]);
    return r === 'ok';
  } catch (err) {
    // У ответа базы есть код SQLSTATE (например, неверный пароль) — значит, она жива.
    const code = (err as { code?: unknown }).code;
    return typeof code === 'string' && /^[0-9A-Z]{5}$/.test(code);
  } finally {
    void sql.end({ timeout: 0 }).catch(() => {});
  }
}

export interface Proc {
  pid: number;
  parent: number;
  /** Полный путь к исполняемому файлу (может быть пустым, если система его не отдала). */
  exe: string;
  /** Командная строка процесса: путь к программе — из неё, если `exe` пустой. */
  cmd?: string;
}

/**
 * Путь к программе процесса. Бывает, Windows не отдаёт `ExecutablePath` (случай 11.11: у
 * осиротевшего io_worker он пустой) — тогда первое слово командной строки, в кавычках или без.
 */
export function exeOf(p: Proc): string {
  if (p.exe) return p.exe;
  const cmd = (p.cmd ?? '').trim();
  const quoted = /^"([^"]+)"/.exec(cmd);
  return quoted?.[1] ?? cmd.split(/\s+/)[0] ?? '';
}

/** Файл лежит внутри папки (пути Windows и POSIX; регистр букв не важен). */
const inside = (dir: string, file: string) => {
  const n = (x: string) => x.replaceAll('\\', '/').toLowerCase();
  const d = n(dir).replace(/\/?$/, '/');
  return n(file).startsWith(d);
};

/**
 * Какие процессы убрать: `postgres.exe` из папки игры, который держит порт (`owner`), и все
 * его потомки — даже если сам `owner` уже умер. Чужие программы на порту не трогаем.
 */
export function stalePids(procs: Proc[], owners: number[], gameDir: string): number[] {
  const ours = (p: Proc) => {
    const exe = exeOf(p);
    return /postgres(\.exe)?$/i.test(exe) && inside(gameDir, exe);
  };
  const picked = new Set<number>();
  const queue = [...owners];
  while (queue.length) {
    const pid = queue.shift() as number;
    for (const p of procs) {
      if ((p.pid === pid || p.parent === pid) && ours(p) && !picked.has(p.pid)) {
        picked.add(p.pid);
        queue.push(p.pid);
      }
    }
  }
  return [...picked];
}

const run = promisify(execFile);

/** Windows: кто держит порт и какие есть процессы `postgres.exe` (через PowerShell). */
async function snapshot(port: number): Promise<{ owners: number[]; procs: Proc[] }> {
  const ps = [
    `$o = @(Get-NetTCPConnection -State Listen -LocalPort ${port} -ErrorAction SilentlyContinue | ForEach-Object { $_.OwningProcess } | Select-Object -Unique)`,
    `$p = @(Get-CimInstance Win32_Process -Filter "Name='postgres.exe'" | ForEach-Object { @{ pid = $_.ProcessId; parent = $_.ParentProcessId; exe = [string]$_.ExecutablePath; cmd = [string]$_.CommandLine } })`,
    '@{ owners = $o; procs = $p } | ConvertTo-Json -Depth 3 -Compress',
  ].join('; ');
  const { stdout } = await run('powershell', ['-NoProfile', '-NonInteractive', '-Command', ps], {
    windowsHide: true,
  });
  const j = JSON.parse(stdout || '{}') as { owners?: number[] | null; procs?: Proc[] | null };
  return { owners: (j.owners ?? []).map(Number), procs: j.procs ?? [] };
}

/**
 * Убрать зависшую базу с порта. Возвращает, сколько процессов завершено (0 — убирать было
 * нечего или не получилось: на порту чужая программа, система не Windows).
 */
export async function clearStalePg(port: number, gameDir: string): Promise<number> {
  if (process.platform !== 'win32') return 0;
  const { owners, procs } = await snapshot(port);
  const pids = stalePids(procs, owners, gameDir);
  for (const pid of pids) {
    try {
      process.kill(pid);
    } catch {
      // Уже завершился сам.
    }
  }
  return pids.length;
}
