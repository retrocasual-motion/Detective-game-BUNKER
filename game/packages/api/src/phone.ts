import { type Content, type Progress, pyRegex, resolve } from '@bunker/engine';

/**
 * Телефон на столе (6a-3, PH-B): что слышно на линии. Сценарии линий — правила ЗВОНОК пакета
 * (TECH_PLAN 4.14): номер — цель правила, цифры в разговоре — значение. Тот же движок, что у
 * остальных действий; тексты линий отдаёт только сервер (P-10). Звонок ничего не открывает
 * (release пуст) и попыток не тратит (PH-1).
 */
export interface PhoneReply {
  /** Линия ответила (меню, автоответчик, справочная); нет — «номер не обслуживается». */
  connected: boolean;
  /** Что слышно (пока — текстом, записей голосов нет). */
  text: string;
  /** Линия ждёт цифры с клавиатуры (меню: номер партии, номер заказа). */
  menu: boolean;
}

/** Слишком короткий набор — ещё не номер (линия не ищется). */
const MIN_DIGITS = 7;

/** Ждёт ли правило цифры: его значения не принимают набранную цифру. */
const expectsDigits = (accept: readonly string[] = []) =>
  accept.length > 0 && accept.every((a) => pyRegex(a).exec('1') === null);

export function phoneLine(c: Content, p: Progress, number: string, keys = ''): PhoneReply {
  const digits = number.replace(/\D/g, '');
  const silent = c.rules.default_reply?.ЗВОНОК ?? 'Номер не обслуживается.';
  if (digits.length < MIN_DIGITS) return { connected: false, text: silent, menu: false };
  const r = resolve(c, p, 'ЗВОНОК', digits, keys);
  if (r.hit) {
    // Меню линии: и приветствие, и ответ на цифры — ждём следующий номер (можно спросить ещё).
    const lineRules = c.rules.rules.filter((x) => x.action === 'ЗВОНОК' && x.id !== r.hit.id);
    const menu =
      expectsDigits(r.hit.accept) ||
      (keys !== '' && lineRules.some((x) => x.target === r.hit.target));
    return { connected: true, text: r.hit.ok ?? '', menu };
  }
  if (r.result === 'нет правила') return { connected: false, text: r.reply, menu: false };
  // Линия есть, цифры не подошли — её ответ «не найдено», меню ждёт снова.
  return { connected: true, text: r.reply, menu: true };
}
