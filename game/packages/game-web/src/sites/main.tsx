import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { SiteApp } from './SiteApp.tsx';
import './sites.css';

/**
 * Настоящий сайт дела (A-272, AC-3): страница сборки игры для хостов сайтов
 * (`vaultline-program.localhost`…). Что за сайт и что на нём открыто — решает сервер игры.
 */
const root = document.getElementById('site');
if (root) {
  createRoot(root).render(
    <StrictMode>
      <SiteApp />
    </StrictMode>,
  );
}
