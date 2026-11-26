import type { WebGLRenderer } from 'three';
import { create } from 'zustand';

/**
 * Потеря изображения 3D (RV-11): браузер отобрал у страницы видеокарту (сон, смена драйвера, много
 * вкладок) — листы на столе и вещь в руках пропадают, а щелчки по ним по-прежнему что-то делают.
 * Игра говорит об этом и предлагает обновить страницу; вернул браузер сам — плашка уходит.
 */
const useGl = create<{ lost: number }>(() => ({ lost: 0 }));

/** Для `onCreated` холста: следить за потерей и возвратом. */
export function watchGl({ gl }: { gl: WebGLRenderer }): void {
  const el = gl.domElement;
  // Для автотестов (только разработка): потерять и вернуть изображение по-настоящему.
  if (import.meta.env.DEV) {
    const w = window as unknown as { __gl?: WebGLRenderer[] };
    w.__gl = [...(w.__gl ?? []).filter((r) => r.domElement.isConnected), gl];
  }
  el.addEventListener('webglcontextlost', (e) => {
    // Разрешить браузеру вернуть изображение.
    e.preventDefault();
    useGl.setState((s) => ({ lost: s.lost + 1 }));
  });
  el.addEventListener('webglcontextrestored', () =>
    useGl.setState((s) => ({ lost: Math.max(0, s.lost - 1) })),
  );
}

export function GlLost() {
  const lost = useGl((s) => s.lost > 0);
  if (!lost) return null;
  return (
    <div className="save-error gl-lost" role="alert" data-testid="gl-lost">
      Изображение стола пропало (браузер отключил видеокарту).{' '}
      <button type="button" onClick={() => window.location.reload()}>
        Обновить страницу
      </button>{' '}
      — дело сохранено.
    </div>
  );
}
