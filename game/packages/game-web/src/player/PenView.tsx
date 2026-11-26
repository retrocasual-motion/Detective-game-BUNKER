import { useEffect } from 'react';
import { useFreeArea } from '../device/deviceView.tsx';
import { useEscLayer } from '../esc.ts';
import { useGame } from '../store.ts';
import { MediaPlayer } from './MediaPlayer.tsx';
import './player.css';

/**
 * Ручка-диктофон (49) лицом к игроку (этап 4d-2; автор 12.11: базово — назад, play, вперёд;
 * дисплей — потом). По канону дисплея у ручки нет: имени файла на ней не видно; файлы скопированы
 * следствием (имена — в расшифровке). Esc или щелчок мимо — снова вещь в руках.
 */
export function PenView() {
  const open = useGame((g) => g.pen);
  const body = useGame((g) => g.materials.find((m) => m.id === '49')?.body ?? '');
  const area = useFreeArea();
  useEscLayer(open, () => useGame.getState().closePen());
  if (!open) return null;
  return (
    <div className="pen-view" data-testid="pen-view">
      <button
        type="button"
        className="laptop-backdrop"
        aria-label="Отложить ручку"
        data-testid="pen-away"
        onClick={() => useGame.getState().closePen()}
      />
      <div className="pen-frame" style={{ left: area.center || undefined }}>
        <div className="pen-body" aria-hidden />
        <MediaPlayer materialId="49" body={body} pen />
      </div>
      {/* Видимый ✕, как у вещи в руках (R5-09, R5-10; CORNER/PC-A: «закрыть — ✕, щелчок мимо, Esc»). */}
      <button
        type="button"
        className="tool tool-close held-close"
        data-testid="pen-x"
        aria-label="Отойти"
        title="Отойти (Esc)"
        onClick={() => useGame.getState().closePen()}
      >
        ✕
      </button>
    </div>
  );
}
