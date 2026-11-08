import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

const apiPort = Number(process.env.API_PORT ?? 8787);

export default defineConfig({
  plugins: [react()],
  server: {
    port: Number(process.env.WEB_PORT ?? 5173),
    strictPort: true,
    // Правила и закрытые материалы (server.json) и пакет игрока — не для браузера даже в разработке.
    fs: {
      deny: ['.env', '.env.*', '*.{crt,pem}', '**/content/dist/server.json', '**/playtest/**'],
    },
    proxy: { '/api': `http://localhost:${apiPort}` },
  },
});
