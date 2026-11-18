import { useEffect, useState } from 'react';
import { useGame } from './store.ts';

export { formatWait } from './clock.ts';

/**
 * Общее для замков (ноутбук, телефон, пароли и архив ПК, адрес в браузере): отсчёт паузы LK-A и
 * сбой связи. Прежде формат был скопирован трижды и ошибался на границе минуты (119,6 с → «1:00»),
 * а сбой сети показывался как «неверно» (R2-01, R2-10, разбор 18.11).
 */

/** Пауза поля (LK-A) в мс; таймер обновления гаснет, когда пауза кончилась. */
export function useFieldWait(field: string): number {
  const until = useGame((g) => g.fieldBlockedUntil[field] ?? 0);
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    setNow(Date.now());
    if (until <= Date.now()) return;
    const t = setInterval(() => {
      const n = Date.now();
      setNow(n);
      if (n >= until) clearInterval(t);
    }, 500);
    return () => clearInterval(t);
  }, [until]);
  return Math.max(0, until - now);
}

/**
 * Сервер игры не ответил: ввод не проверен, попытка не засчитана. Это сообщение игры, не устройства —
 * поэтому по-русски и на телефоне: игрок не должен отбросить верную догадку из-за сбоя.
 */
export const OFFLINE = 'Нет связи с сервером игры — попытка не засчитана';
