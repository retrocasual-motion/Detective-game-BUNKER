/**
 * Содержимое телефона Габриэля (этап 4c-2) — из канона, без новых фактов: экран блокировки — 48,
 * всё после разблокировки — L540 (контакты, переписка с Аной, голосовое, голосовая почта).
 * Интерфейс — на английском (канон 48), содержимое — как есть (испанский).
 */

export interface Contact {
  name: string;
  number: string;
}
export interface Message {
  /** «13.10, 21:58». */
  when: string;
  from: string;
  text: string;
  /** Голосовое: длительность и расшифровка. */
  voice?: { duration: string; transcript: string };
}
export interface Voicemail {
  when: string;
  duration: string;
  text: string;
}
export interface PhoneContent {
  contacts: Contact[];
  /** Экстренный контакт: «Ana, «hermana»». */
  ice: string;
  /** Пропущенные от Аны по дням: «09.10» → 3. */
  missed: { day: string; count: number }[];
  /** Последний пропущенный: «13.10, 22:10». */
  lastMissed: string;
  /** Переписка с Аной — в порядке канона (последние сверху). */
  thread: Message[];
  voicemail: Voicemail[];
}

export interface LockContent {
  /** Уведомление: текст (как на экране, по-английски) и время, если указано. */
  notifications: { title: string; when: string }[];
}

const cells = (line: string) =>
  line
    .split('|')
    .slice(1, -1)
    .map((c) => c.trim());

function section(body: string, heading: RegExp): string {
  const lines = body.split('\n');
  const h = lines.findIndex((l) => heading.test(l));
  if (h < 0) return '';
  let end = lines.findIndex((l, k) => k > h && /^#{2,3}\s/.test(l));
  if (end < 0) end = lines.length;
  return lines
    .slice(h + 1, end)
    .join('\n')
    .trim();
}

/** Пункты списка «- …» с продолжением на следующих строках. */
function bullets(text: string): string[] {
  const out: string[] = [];
  for (const line of text.split('\n')) {
    if (line.startsWith('- ')) out.push(line.slice(2).trim());
    else if (out.length && line.trim() && !line.startsWith('#') && !line.startsWith('**'))
      out[out.length - 1] += ` ${line.trim()}`;
  }
  return out;
}

const unbold = (s: string) => s.replace(/\*\*/g, '').trim();

/** Экран блокировки (48): уведомления. */
export function lockContent(body48: string): LockContent {
  return {
    // «**Ana — 41 missed calls.** Последний — 13.10.2009, 22:10.»: на экране — выделенное и время.
    notifications: bullets(section(body48, /^## Экран блокировки/)).map((b) => ({
      title: (/\*\*([^*]+)\*\*/.exec(b)?.[1] ?? unbold(b)).replace(/\.$/, ''),
      when: /(\d{2}\.\d{2}\.\d{4}, \d{1,2}:\d{2})/.exec(b)?.[1] ?? '',
    })),
  };
}

export function phoneContent(body: string): PhoneContent {
  const contacts = section(body, /^## Контакты/)
    .split('\n')
    .filter((l) => l.trimStart().startsWith('|'))
    .slice(2)
    .map(cells)
    .map((c) => ({ name: c[0] ?? '', number: c[1] ?? '' }));
  const ice = /Экстренный контакт \(ICE\):\s*([^\n]+?)\.?\s*$/m.exec(body)?.[1]?.trim() ?? '';

  const chat = section(body, /^## Переписка/);
  const missedLine =
    /Пропущенные вызовы от Ana — \d+:\*\*\s*([\s\S]+?)\)\.?\s*\n/.exec(chat)?.[1] ?? '';
  const missed = [...missedLine.matchAll(/(\d{2}\.\d{2}) — (\d+)/g)].map((m) => ({
    day: m[1] ?? '',
    count: Number(m[2]),
  }));
  const lastMissed = /последний — (\d{1,2}:\d{2})/.exec(missedLine)?.[1] ?? '';
  const lastDay = missed[missed.length - 1]?.day ?? '';

  const transcript = /> ([\s\S]+?)(?=\n\n|\n## |$)/.exec(section(body, /^### Голосовое сообщение/));
  const voiceText = (transcript?.[0] ?? '')
    .split('\n')
    .map((l) => l.replace(/^>\s?/, ''))
    .join(' ')
    .trim();

  const thread: Message[] = bullets(chat)
    .filter((b) => !b.startsWith('**Пропущенные'))
    .map((b) => {
      const m = /^\*\*(\d{2}\.\d{2}, \d{1,2}:\d{2}) · ([^:*]+):\*\*\s*([\s\S]*)$/.exec(b);
      const when = m?.[1] ?? '';
      const from = (m?.[2] ?? '').trim();
      const text = (m?.[3] ?? b).trim();
      const voice = /^голосовое сообщение, (\d+:\d{2})/.exec(text);
      return voice
        ? { when, from, text: '', voice: { duration: voice[1] ?? '', transcript: voiceText } }
        : { when, from, text };
    });

  const voicemail = bullets(section(body, /^## Голосовая почта/)).map((b) => {
    const m = /^\*\*(\d{2}\.\d{2}, \d{1,2}:\d{2}), (\d+:\d{2})\.\*\*\s*([\s\S]*)$/.exec(b);
    return { when: m?.[1] ?? '', duration: m?.[2] ?? '', text: (m?.[3] ?? b).trim() };
  });

  return {
    contacts,
    ice,
    missed,
    lastMissed: lastDay && lastMissed ? `${lastDay}, ${lastMissed}` : '',
    thread,
    voicemail,
  };
}
