/**
 * Перейти на сайт дела (A-272, AC-3): сервер игры спрашивает движок (АДРЕС) и отдаёт адрес
 * сайта с пропуском — сайт открывается в новой вкладке настоящего браузера. Вкладку открываем
 * сразу, в щелчке (иначе браузер посчитает её всплывающим окном и закроет), адрес — когда
 * ответит сервер. Не открылось — в той же вкладке ответ: «Страница не найдена (404)…».
 */
export function openSite(address: string, from: Window = window, hash = ''): void {
  const tab = from.open('', '_blank');
  const show = (text: string) => {
    if (!tab) return;
    tab.document.title = address;
    tab.document.body.style.cssText =
      'font: 16px/1.5 Georgia, serif; margin: 48px; color: #222; white-space: pre-wrap';
    tab.document.body.textContent = text;
  };
  void fetch('/api/site/open', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ address }),
  })
    .then((r) => r.json() as Promise<{ url?: string; reply?: string; error?: string }>)
    .then((r) => {
      if (r.url) {
        // `#x=…` — выписка: сайт откроется на этом месте (A-272, DB-B).
        if (tab) tab.location.href = r.url + hash;
        else from.location.assign(r.url + hash);
      } else show(`${address}\n\n${r.reply ?? r.error ?? 'Страница не найдена (404).'}`);
    })
    .catch(() => show('Нет связи с сервером игры.'));
}
