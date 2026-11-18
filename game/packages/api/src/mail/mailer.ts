/**
 * Почта игрока (TECH_PLAN 6.6, 7.1; ML-A). Только исходящие письма. На компьютере — ловушка
 * писем Mailpit (её HTTP API отправки); на сервере (6b) — сервис рассылки: другой
 * `transport`, остальной код тот же. В тестах — память.
 */
export interface OutLetter {
  to: string;
  /** Имя отправителя, если не бюро (письмо со ссылкой для входа — от игры). */
  fromName?: string;
  subject: string;
  text: string;
  html: string;
}

export interface Mailer {
  send(letter: OutLetter): Promise<void>;
  /** Последние письма (не в production — служебная «исходящая почта» для автотестов). */
  outbox: OutLetter[];
}

export interface MailerConfig {
  /** `mailpit` — HTTP API Mailpit; `memory` — только в памяти (автотесты). */
  transport: 'mailpit' | 'memory';
  /** Адрес Mailpit, например http://127.0.0.1:8025. */
  mailpitUrl: string;
  from: { email: string; name: string };
}

const OUTBOX_LIMIT = 50;

export function createMailer(cfg: MailerConfig): Mailer {
  const outbox: OutLetter[] = [];
  const keep = (l: OutLetter) => {
    outbox.push(l);
    if (outbox.length > OUTBOX_LIMIT) outbox.shift();
  };
  return {
    outbox,
    async send(letter) {
      if (cfg.transport === 'mailpit') {
        const res = await fetch(new URL('/api/v1/send', cfg.mailpitUrl), {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            From: { Email: cfg.from.email, Name: letter.fromName ?? cfg.from.name },
            To: [{ Email: letter.to }],
            Subject: letter.subject,
            Text: letter.text,
            HTML: letter.html,
          }),
        });
        if (!res.ok) throw new Error(`Mailpit ответил ${res.status}`);
      }
      keep(letter);
    },
  };
}

const esc = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** Письмо простым HTML: текст как есть (переносы строк сохраняются) и кнопки-ссылки. */
export function letterHtml(text: string, buttons: { label: string; href: string }[] = []): string {
  const btns = buttons
    .map(
      (b) =>
        `<p><a href="${esc(b.href)}" style="display:inline-block;padding:10px 18px;background:#2f3a44;color:#fff;text-decoration:none;border-radius:4px">${esc(b.label)}</a></p>`,
    )
    .join('');
  return `<!doctype html><html><body style="font-family:Georgia,serif;color:#222;max-width:640px"><div style="white-space:pre-wrap">${esc(text)}</div>${btns}</body></html>`;
}
