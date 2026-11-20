/**
 * Перейти на сайт дела (A-272, AC-3): сервер игры спрашивает движок (АДРЕС) и отдаёт адрес
 * сайта с пропуском — сайт открывается во вкладке настоящего браузера. Вкладку открываем
 * сразу, в щелчке (иначе браузер посчитает её всплывающим окном и закроет), адрес — когда
 * ответит сервер. Не открылось — в той же вкладке ответ: «Страница не найдена (404)…».
 *
 * Один сайт — одна вкладка (UX-7): окно с именем по домену, повторный щелчок по адресу того же
 * сайта ведёт в уже открытую вкладку, а не плодит новые. Браузер не дал открыть вкладку (UX-18) —
 * вкладка игры остаётся на месте, сверху — короткое сообщение.
 */
export function openSite(address: string, from: Window = window, hash = ''): void {
  const tab = from.open('', windowName(address));
  if (!tab) {
    blocked(from);
    return;
  }
  tab.focus();
  const show = (text: string) => {
    // Вкладка того же сайта уже открыта (другой адрес) — её страницу отсюда не переписать.
    try {
      tab.document.title = address;
      tab.document.body.style.cssText =
        'font: 16px/1.5 Georgia, serif; margin: 48px; color: #222; white-space: pre-wrap';
      tab.document.body.textContent = text;
    } catch {
      tab.location.href = 'about:blank';
    }
  };
  void fetch('/api/site/open', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ address }),
  })
    .then((r) => r.json() as Promise<{ url?: string; reply?: string; error?: string }>)
    .then((r) => {
      // `#x=…` — выписка: сайт откроется на этом месте (A-272, DB-B).
      if (r.url) tab.location.href = r.url + hash;
      else show(`${address}\n\n${r.reply ?? r.error ?? 'Страница не найдена (404).'}`);
    })
    .catch(() => show('Нет связи с сервером игры.'));
}

/** Имя окна сайта: по домену (без протокола, www и пути). */
export const windowName = (address: string) =>
  `bunker-${address
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, '')
    .replace(/^www\./, '')
    .split(/[/?#]/)[0]
    ?.replace(/[^a-z0-9.-]/g, '')}`;

/** Всплывающие окна запрещены: сообщение во вкладке игры, на 6 секунд. */
function blocked(from: Window) {
  const doc = from.document;
  doc.querySelector('.site-blocked')?.remove();
  const note = doc.createElement('div');
  note.className = 'site-blocked';
  note.setAttribute('role', 'status');
  note.dataset.testid = 'site-blocked';
  note.textContent =
    'Браузер не дал открыть вкладку сайта. Разрешите всплывающие окна для игры и щёлкните по адресу ещё раз.';
  note.style.cssText =
    'position:fixed;left:50%;top:56px;translate:-50% 0;z-index:100;max-width:min(560px,90vw);' +
    'padding:10px 14px;border-radius:6px;background:#222;color:#fff;font:14px/1.4 system-ui,sans-serif';
  doc.body.append(note);
  setTimeout(() => note.remove(), 6000);
}
