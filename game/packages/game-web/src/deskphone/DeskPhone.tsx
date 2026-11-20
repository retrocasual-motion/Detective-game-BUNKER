import { useEffect } from 'react';
import { useGame } from '../store.ts';
import { useCall } from './call.ts';
import './deskphone.css';

/**
 * Телефон следователя крупно (6a-3, DP-A; автор 20.11: «камера подлетает к телефону, который
 * лежит на столе, и нажимаешь кнопки прямо на нём»). Сам телефон — в 3D-сцене комнаты
 * (`PhoneFace` в `RoomScene`, поза камеры `phone`); здесь — что слышно в трубке (пока текстом:
 * записей голосов нет — «восприятие не проверено», решение 29.10), подсказка и клавиатура: цифры,
 * *, #; Backspace — стереть; Enter — трубка; Esc — отойти (и отбой).
 */
export function DeskPhone() {
  const open = useGame((g) => g.deskPhone);
  const heard = useCall((c) => c.heard);
  const offHook = useCall((c) => c.offHook);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      const c = useCall.getState();
      if (e.key === 'Escape') closePhone();
      else if (/^[0-9*#]$/.test(e.key)) c.press(e.key);
      else if (e.key === 'Backspace') c.erase();
      else if (e.key === 'Enter') c.handset();
      else return;
      e.preventDefault();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  if (!open) return null;
  return (
    <section className="dp-heard" data-testid="dp-heard" aria-label="Что слышно в трубке">
      {heard.length ? (
        <>
          <div className="dp-heard-title">{offHook ? 'В трубке' : 'Было слышно'}</div>
          {heard.map((t, i) => (
            // biome-ignore lint/suspicious/noArrayIndexKey: реплики линии по порядку
            <p key={i} className={t.startsWith('Набрано:') ? 'dp-heard-keys' : undefined}>
              {t}
            </p>
          ))}
          <div className="dp-heard-note">
            Записей голосов пока нет — слышно текстом (восприятие не проверено).
          </div>
        </>
      ) : (
        <div className="dp-hint">
          Наберите номер на кнопках и снимите трубку — или снимите трубку и наберите.
        </div>
      )}
    </section>
  );
}

/** Отойти от телефона: отбой и камера — обратно к столу. */
export function closePhone() {
  useCall.getState().hangUp();
  useGame.getState().setDeskPhone(false);
}
