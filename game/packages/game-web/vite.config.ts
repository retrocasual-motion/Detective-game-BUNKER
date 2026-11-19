import react from '@vitejs/plugin-react';
import { defineConfig, type Plugin } from 'vite';

const apiPort = Number(process.env.API_PORT ?? 8787);

/**
 * Сайты дела (A-272, ST-A): хосты `vaultline-program.localhost` и т. п. в разработке отдаёт тот же
 * Vite — страницу `sites.html` вместо игры (сервер игры в Docker делает так же). Какой это сайт и
 * что на нём открыто, решает сервер игры по имени хоста.
 */
function sitesByHost(): Plugin {
  const isSite = (host = '') => /\.localhost(:\d+)?$/i.test(host);
  // Страница — путь без расширения файла (пропуск `?enter=…` с точками — не расширение).
  const isPage = (url = '') => {
    const path = url.split('?')[0] ?? '';
    return !/^\/(@|src\/|node_modules\/|api\/|__)/.test(path) && !/\.[a-z0-9]+$/i.test(path);
  };
  return {
    name: 'bunker-sites-by-host',
    configureServer(server) {
      server.middlewares.use((req, _res, next) => {
        if (isSite(req.headers.host) && isPage(req.url)) {
          const q = req.url?.indexOf('?') ?? -1;
          req.url = `/sites.html${q >= 0 ? (req.url ?? '').slice(q) : ''}`;
        }
        next();
      });
    },
  };
}

export default defineConfig({
  plugins: [react(), sitesByHost()],
  build: {
    rollupOptions: { input: { main: 'index.html', sites: 'sites.html' } },
  },
  server: {
    port: Number(process.env.WEB_PORT ?? 5173),
    strictPort: true,
    // Правила и закрытые материалы (server.json) и пакет игрока — не для браузера даже в разработке.
    fs: {
      deny: ['.env', '.env.*', '*.{crt,pem}', '**/content/dist/server.json', '**/playtest/**'],
    },
    // Имя хоста — как у браузера (без changeOrigin): по нему сервер узнаёт сайт дела (A-272).
    proxy: { '/api': { target: `http://localhost:${apiPort}`, changeOrigin: false } },
  },
});
