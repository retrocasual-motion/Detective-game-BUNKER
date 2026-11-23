import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { initMotion } from '../motion.ts';
import '../theme/tokens.css';
import '../app.css';
import './proto.css';
import { ProtoDesk } from './ProtoDesk.tsx';

/**
 * Прототип 3D-стола (автор 23.11) — только в разработке: страница не входит в сборку игры
 * (`vite.config.ts`, `build.rollupOptions.input`), сервер и дело не трогает.
 */
initMotion();

const root = document.getElementById('root');
if (root)
  createRoot(root).render(
    <StrictMode>
      <ProtoDesk />
    </StrictMode>,
  );
