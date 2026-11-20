import type { MouseEvent, PointerEvent } from 'react';
import type { Components } from 'react-markdown';
import { openSite } from './site.ts';

/**
 * Ссылки в материалах дела. Адрес почты и чужие ссылки — напечатанный текст (R5-02, 18.11): GFM
 * сам делает `<zapros@…>` и `www.…` ссылками, щелчок уводил игрока из игры. Адрес сайта
 * (`vaultline-program.com`) — ссылка (A-272, Q1 автора 19.11): щелчок открывает настоящий сайт в
 * новой вкладке через сервер игры (движок АДРЕС); неизвестный адрес — «Страница не найдена».
 */

// Схема ссылки — якорь: react-markdown вычищает незнакомые схемы (urlTransform).
const SITE = '#site:';

/** Адрес сайта в тексте: домен .com/.net/.org с путём; не часть адреса почты и не слово. */
export const SITE_RE =
  /(?<![\p{L}\p{N}@._/-])((?:[a-z0-9-]+\.)+(?:com|net|org)(?:\/[\w./-]*[\w/])?)(?![\p{L}\p{N}@-])/giu;

type MdNode = { type: string; value?: string; url?: string; children?: MdNode[] };

/** Плагин remark: адреса сайтов в тексте → ссылки `#site:…` (в коде и ссылках — нет). */
export function remarkSites() {
  const walk = (node: MdNode) => {
    if (!node.children) return;
    const out: MdNode[] = [];
    for (const ch of node.children) {
      if (ch.type === 'text' && ch.value) {
        let last = 0;
        for (const m of ch.value.matchAll(SITE_RE)) {
          const at = m.index ?? 0;
          if (at > last) out.push({ type: 'text', value: ch.value.slice(last, at) });
          out.push({
            type: 'link',
            url: `${SITE}${m[1]}`,
            children: [{ type: 'text', value: m[1] }],
          });
          last = at + m[0].length;
        }
        if (last === 0) out.push(ch);
        else if (last < ch.value.length) out.push({ type: 'text', value: ch.value.slice(last) });
        continue;
      }
      if (ch.type !== 'link' && ch.type !== 'inlineCode' && ch.type !== 'code') walk(ch);
      out.push(ch);
    }
    node.children = out;
  };
  return (tree: MdNode) => walk(tree);
}

const stop = (e: MouseEvent | PointerEvent) => e.stopPropagation();

/** Ссылка на сайт дела: новая вкладка; лист под ней не выделяется и не тянется. */
export function SiteLink({ address, children }: { address: string; children: React.ReactNode }) {
  return (
    <a
      href={`#${address}`}
      className="site-link"
      data-site={address}
      onPointerDown={stop}
      onPointerUp={stop}
      onMouseDown={stop}
      onMouseUp={stop}
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        openSite(address);
      }}
    >
      {children}
    </a>
  );
}

export const NO_LINKS: Components = {
  a: ({ href, children }) =>
    href?.startsWith(SITE) ? (
      <SiteLink address={href.slice(SITE.length)}>{children}</SiteLink>
    ) : (
      <span>{children}</span>
    ),
};
