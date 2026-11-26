/**
 * Проверка настроек при запуске (RV-62, A-288): сервер на внешнем адресе не стартует с настройками,
 * опасными для чужих игроков. Локально и в домашней сети (игра автора «для всех устройств в сети») —
 * как раньше, без отказа.
 */
export interface StartupEnv {
  production: boolean;
  auth: 'off' | 'link';
  mailTransport: 'mailpit' | 'memory' | 'none';
  publicUrl: string;
}

/** Адрес — этот компьютер или домашняя сеть (не интернет). */
export function isLocalUrl(url: string): boolean {
  let host: string;
  try {
    host = new URL(url).hostname.toLowerCase().replace(/^\[|\]$/g, '');
  } catch {
    return false;
  }
  if (host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local')) return true;
  // Имя компьютера в сети без точки (`my-pc`).
  if (/^[a-z0-9-]+$/.test(host)) return true;
  if (host === '::1') return true;
  const ip = host.split('.').map(Number);
  if (ip.length !== 4 || ip.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) return false;
  const [a = 0, b = 0] = ip;
  // Tailscale и другие частные сети провайдера — 100.64.0.0/10.
  return (
    a === 127 ||
    a === 10 ||
    (a === 192 && b === 168) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 100 && b >= 64 && b <= 127)
  );
}

/**
 * Предупреждения (запуску не мешают): разработка на внешнем адресе (туннель для проверки с
 * телефона) — служебные маршруты открыты всем, кто знает адрес.
 */
export function startupWarnings(e: StartupEnv): string[] {
  return !e.production && !isLocalUrl(e.publicUrl)
    ? [
        `PUBLIC_URL=${e.publicUrl} — внешний адрес, а NODE_ENV не production: служебные маршруты (вход под любой почтой, «Подготовка») открыты всем, кто знает адрес.`,
      ]
    : [];
}

/** Что мешает запуску (production на внешнем адресе); пусто — запускать. */
export function startupProblems(e: StartupEnv): string[] {
  const out: string[] = [];
  const external = !isLocalUrl(e.publicUrl);
  if (external && e.production && e.auth === 'off')
    out.push(`AUTH=off на внешнем адресе ${e.publicUrl}: все игроки делили бы одно дело.`);
  if (external && e.production && e.auth === 'link' && e.mailTransport === 'none')
    out.push('AUTH=link без почты (MAIL_TRANSPORT=none): ссылку входа некуда отправить.');
  if (e.production && e.mailTransport === 'memory')
    out.push('MAIL_TRANSPORT=memory в production: письма входа никуда не уйдут.');
  return out;
}
