import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import Markdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { describe, expect, it } from 'vitest';
import { NO_LINKS, remarkSites, SITE_RE } from './paperLinks.tsx';

const html = (s: string) =>
  renderToStaticMarkup(
    createElement(Markdown, { remarkPlugins: [remarkGfm, remarkSites], components: NO_LINKS }, s),
  );

describe('адреса сайтов в материалах — ссылки (A-272, Q1)', () => {
  it('домен и путь — ссылка; адрес почты, слово с точкой — нет', () => {
    const found = (s: string) => [...s.matchAll(SITE_RE)].map((m) => m[1]);
    expect(found('сайт (vaultline-program.com), см. docs.hexon-bio.com/vl-31.')).toEqual([
      'vaultline-program.com',
      'docs.hexon-bio.com/vl-31',
    ]);
    expect(found('e.pierce.uk@mailbridge.net')).toEqual([]);
    expect(found('файл mailbox.mbx и т.д.')).toEqual([]);
  });

  it('в разметке — ссылка сайта; почта и прочие ссылки — текст', () => {
    const out = html(
      'Адрес: vaultline-program.com. Почта <zapros@okrug-bureau.org>, www.example.com',
    );
    expect(out).toContain('data-site="vaultline-program.com"');
    expect(out).not.toContain('mailto:');
    expect(out).not.toContain('href="http://www.example.com"');
  });
});
