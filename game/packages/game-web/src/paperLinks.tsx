import type { Components } from 'react-markdown';

/**
 * Адрес почты или сайта в материале — напечатанный текст, а не ссылка (R5-02, 18.11): Markdown с GFM
 * сам делает `<zapros@…>` и `www.…` ссылками, и щелчок уводил игрока в почтовую программу или на
 * сайт — из игры. Текст остаётся текстом: его можно выделить и взять в запрос.
 */
export const NO_LINKS: Components = {
  a: ({ children }) => <span>{children}</span>,
};
