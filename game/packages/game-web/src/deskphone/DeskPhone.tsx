import { useEffect } from 'react';
import { useEscLayer } from '../esc.ts';
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
  useEscLayer(open, () => closePhone());
  const heard = useCall((c) => c.heard);
  const offHook = useCall((c) => c.offHook);
  const used = useCall((c) => c.used);

  // Ушли от телефона другим путём (поиск, лист, стена, вещь в руках) — отбой и камера к столу (F7).
  const away = useGame(
    (g) =>
      g.deskPhone &&
      (g.state?.view !== 'desk' ||
        g.searchOpen ||
        g.viewerId !== null ||
        g.computerOpen ||
        g.held !== null),
  );
  useEffect(() => {
    if (away) closePhone();
  }, [away]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      // Ввод в поле (поиск, записка) — не телефону; Enter на кнопке — нажать её (F7).
      if (typing(e.target)) return;
      if (e.key === 'Tab') tabbed = true;
      if (e.key === 'Enter' && tabbed && e.target instanceof HTMLButtonElement) return;
      const c = useCall.getState();
      // ↓ — отойти к столу, как стрелка «Стол» внизу (UX-1, KEY-A); Esc — слой (2b-П1).
      if (e.key === 'ArrowDown') closePhone();
      // «+» — с клавиатуры тоже (T.4, автор 21.11).
      else if (/^[0-9*#+]$/.test(e.key)) c.press(e.key);
      else if (e.key === 'Backspace') c.erase();
      else if (e.key === 'Enter') c.handset();
      else return;
      e.preventDefault();
    };
    // Мышь — снова «Enter = трубка»; до кнопки дошли клавишей Tab — Enter нажимает её (F7).
    let tabbed = false;
    const onPointer = () => {
      tabbed = false;
    };
    window.addEventListener('keydown', onKey);
    window.addEventListener('pointerdown', onPointer);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('pointerdown', onPointer);
    };
  }, [open]);

  if (!open || (!heard.length && used)) return null;
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
        // Только до первого нажатия кнопки или трубки (UX-12, LT-3): после — панели нет.
        <div className="dp-hint">
          Наберите номер на кнопках и снимите трубку — или снимите трубку и наберите.
        </div>
      )}
    </section>
  );
}

const typing = (t: EventTarget | null) =>
  t instanceof HTMLElement &&
  (t.isContentEditable ||
    t.tagName === 'INPUT' ||
    t.tagName === 'TEXTAREA' ||
    t.tagName === 'SELECT');

/** Отойти от телефона: отбой и камера — обратно к столу. */
export function closePhone() {
  useCall.getState().hangUp();
  useGame.getState().setDeskPhone(false);
}
