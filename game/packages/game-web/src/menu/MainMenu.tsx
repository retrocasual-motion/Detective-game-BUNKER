import { useState } from 'react';
import { newCase } from '../api.ts';
import { reducedMotion, setReducedMotion } from '../motion.ts';
import { useGame } from '../store.ts';
import { useVerdict } from '../verdict/verdict-store.ts';
import { useAccount, useEmail } from './account.ts';
import { useMenu } from './menu-store.ts';

/**
 * Главное меню (MM-A, автор 17.11): при входе в игру и после титров. «Продолжить дело» — к
 * столу; «Новое дело» — всё с начала (после подтверждения); «Настройки» — «уменьшить
 * движение» (RM-A); «Титры». Оформление — на этапе дизайна.
 */
export function MainMenu() {
  const screen = useMenu((m) => m.screen);
  const go = useMenu((m) => m.go);
  const sent = useVerdict((v) => v.status.sent);
  const [panel, setPanel] = useState<'none' | 'settings' | 'confirm'>('none');
  const [calm, setCalm] = useState(reducedMotion);
  const [busy, setBusy] = useState(false);
  const email = useEmail();
  const channel = useAccount((a) => (a.me?.auth === 'link' && a.me.email ? a.me.channel : null));
  if (screen !== 'menu') return null;

  const startOver = async () => {
    setBusy(true);
    try {
      // Сначала дослать сохранённое: иначе страница при уходе пришлёт старое дело обратно.
      await useGame.getState().flushSave();
      await newCase();
      // Всё дело — с начала: проще всего загрузить игру заново (сразу в дело).
      const url = new URL(window.location.href);
      url.searchParams.set('play', '');
      window.location.replace(url.toString());
    } catch {
      setBusy(false);
    }
  };

  return (
    <div className="main-menu" data-testid="main-menu">
      <div className="main-menu-card">
        <h1 className="main-menu-title">БУНКЕР</h1>
        <p className="main-menu-sub">Дело № 09-1128</p>
        {panel === 'none' && (
          <nav className="main-menu-list" aria-label="Главное меню">
            <button
              type="button"
              className="main-menu-main"
              data-testid="menu-continue"
              onClick={() => go('game')}
            >
              {sent ? 'Вернуться к делу' : 'Продолжить дело'}
            </button>
            <button type="button" data-testid="menu-new" onClick={() => setPanel('confirm')}>
              Новое дело
            </button>
            <button type="button" data-testid="menu-settings" onClick={() => setPanel('settings')}>
              Настройки
            </button>
            <button type="button" data-testid="menu-credits" onClick={() => go('credits')}>
              Титры
            </button>
            {email && (
              <button
                type="button"
                data-testid="menu-logout"
                onClick={() => void useAccount.getState().logout()}
              >
                Выйти
              </button>
            )}
          </nav>
        )}
        {email && panel === 'none' && <p className="main-menu-email">{email}</p>}
        {panel === 'confirm' && (
          <div className="main-menu-panel" role="alertdialog" aria-label="Новое дело">
            <p>Начать дело заново? Всё, что найдено и разложено, пропадёт.</p>
            <div className="main-menu-row">
              <button type="button" onClick={() => setPanel('none')}>
                Отмена
              </button>
              <button
                type="button"
                className="main-menu-main"
                data-testid="menu-new-confirm"
                disabled={busy}
                onClick={() => void startOver()}
              >
                Начать заново
              </button>
            </div>
          </div>
        )}
        {panel === 'settings' && (
          <div className="main-menu-panel" data-testid="menu-settings-panel">
            <label className="main-menu-check">
              <input
                type="checkbox"
                data-testid="menu-reduce-motion"
                checked={calm}
                onChange={(e) => {
                  setReducedMotion(e.target.checked);
                  setCalm(e.target.checked);
                }}
              />
              Уменьшить движение (без полёта камеры и наклона листов)
            </label>
            {channel && (
              <fieldset className="main-menu-group" data-testid="menu-mail">
                Ответы на запросы приходят:
                <label className="main-menu-check">
                  <input
                    type="radio"
                    name="mail-channel"
                    data-testid="menu-mail-real"
                    checked={channel === 'real'}
                    onChange={() => void useAccount.getState().setChannel('real')}
                  />
                  на почту ({email}) — «Добавить в дело» в письме кладёт их на стол
                </label>
                <label className="main-menu-check">
                  <input
                    type="radio"
                    name="mail-channel"
                    data-testid="menu-mail-internal"
                    checked={channel === 'internal'}
                    onChange={() => void useAccount.getState().setChannel('internal')}
                  />
                  сразу во «Входящие» на столе (если письма не приходят)
                </label>
              </fieldset>
            )}
            <div className="main-menu-row">
              <button type="button" data-testid="menu-back" onClick={() => setPanel('none')}>
                Назад
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

/** «Меню» в игре — язычок сверху слева: вернуться в главное меню. */
export function MenuTab() {
  const screen = useMenu((m) => m.screen);
  const go = useMenu((m) => m.go);
  if (screen !== 'game') return null;
  return (
    <button type="button" className="menu-tab" data-testid="menu-tab" onClick={() => go('menu')}>
      Меню
    </button>
  );
}

/**
 * Титры (MM-A): после «Завершить дело» и из меню. Пока заглушка — оформление и имена — на этапе
 * дизайна. «В главное меню» — назад.
 */
export function Credits() {
  const screen = useMenu((m) => m.screen);
  const go = useMenu((m) => m.go);
  const sent = useVerdict((v) => v.status.sent);
  if (screen !== 'credits') return null;
  return (
    <div className="main-menu credits" data-testid="credits">
      <div className="main-menu-card">
        <h1 className="main-menu-title">БУНКЕР</h1>
        {sent && <p className="main-menu-sub">Дело № 09-1128 закрыто.</p>}
        <p className="credits-text">Титры появятся на этапе дизайна.</p>
        <p className="credits-text">Спасибо, что играли.</p>
        <div className="main-menu-row">
          <button
            type="button"
            className="main-menu-main"
            data-testid="credits-menu"
            onClick={() => go('menu')}
          >
            В главное меню
          </button>
        </div>
      </div>
    </div>
  );
}
