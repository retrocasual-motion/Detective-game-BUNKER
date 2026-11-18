import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { initInput } from './input.ts';
import { Gate } from './menu/Login.tsx';
import { initMotion } from './motion.ts';
import './theme/tokens.css';
import './app.css';

initMotion();
initInput();

const root = document.getElementById('root');
if (root) {
  createRoot(root).render(
    <StrictMode>
      <Gate />
    </StrictMode>,
  );
}
