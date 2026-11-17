import { useMemo } from 'react';
import { createPortal } from 'react-dom';
import { useSelectionPetition } from '../device/deviceView.tsx';
import { useGame } from '../store.ts';
import { MENU, say, useCamera, zoomOf } from './camera.ts';
import { FRAME_COUNT, frameDetails, frameTime, parseFrames } from './frames.ts';
import './camera.css';

/** ЖК-экран камеры, логические px (4:3, как 2,7" экраны 2009 года); на модели — масштабом. */
export const CAMERA_PX: [number, number] = [400, 300];

const body = (id: string) => (g: ReturnType<typeof useGame.getState>) =>
  g.materials.find((m) => m.id === id)?.body ?? '';

/** «Кадры 8–11 (13.10): кабинет руководителя…» → «13.10, кабинет руководителя…». */
const seriesTitle = (series: string) => {
  const m = /^Кадры?\s+[\d–-]+\s*\(([^)]*)\):\s*(.*)$/.exec(series);
  return m ? `${m[1]}, ${m[2]}` : series;
};

/** Значок «просмотр» (треугольник в рамке), как на экранах камер того времени. */
const PlayIcon = () => (
  <svg viewBox="0 0 20 14" className="cm-ico" aria-hidden>
    <rect x="1" y="1" width="18" height="12" rx="2" fill="none" stroke="currentColor" />
    <path d="M8 4.2 13 7 8 9.8Z" fill="currentColor" />
  </svg>
);

/**
 * Экран камеры инженера в режиме просмотра (A-268; разметка приклеена к экрану 3D-камеры,
 * Held3D). Снимков в сборке нет (K8): на месте снимка — заглушка с номером кадра, что на нём —
 * на листе под камерой. Сверху — значок просмотра и «14/61»; подробная информация — дата и время
 * съёмки (свойства L973); увеличение — «×4» и рамка «где я на снимке»; W — таблица по 9.
 */
export function CameraScreen() {
  const c = useCamera();
  const props973 = useGame(body('L973'));
  const { onUp, button } = useSelectionPetition('camera-to-petition');
  const [w, h] = CAMERA_PX;
  const time = props973 ? frameTime(props973, c.frame) : null;
  const page = Math.floor((c.frame - 1) / 9);
  const z = zoomOf(c.zoom);
  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: выделение времени съёмки в запрос
    <div
      className="cm-lcd"
      data-testid="camera-view"
      data-frame={c.frame}
      data-mode={c.mode}
      style={{ width: w, height: h, filter: `brightness(${0.6 + c.bright * 0.13})` }}
      onMouseUp={onUp}
      onContextMenu={(e) => e.preventDefault()}
    >
      {c.mode === 'index' ? (
        <div className="cm-index" data-testid="camera-index">
          {Array.from({ length: 9 }, (_, k) => page * 9 + k + 1)
            .filter((n) => n <= FRAME_COUNT)
            .map((n) => (
              <span key={n} className={n === c.frame ? 'cm-thumb cm-thumb-on' : 'cm-thumb'}>
                {n}
              </span>
            ))}
        </div>
      ) : (
        <div
          className="cm-photo"
          style={z > 1 ? { transform: `scale(${1 + (z - 1) * 0.08})` } : undefined}
        >
          <span className="cm-photo-n">{c.frame}</span>
        </div>
      )}

      {c.mode !== 'menu' && c.disp !== 2 && (
        <>
          <div className="cm-top">
            <PlayIcon />
            {z > 1 && <span data-testid="camera-zoom">×{z}</span>}
            <span className="cm-count" data-testid="camera-count">
              {c.frame}/{FRAME_COUNT}
            </span>
          </div>
          {c.disp === 1 && c.mode === 'single' && (
            <div className="cm-bottom" data-testid="camera-info" data-material="L973">
              {time ?? ''}
            </div>
          )}
        </>
      )}
      {z > 1 && c.mode === 'single' && (
        <span className="cm-map" aria-hidden>
          <span style={{ width: `${100 / z}%`, height: `${100 / z}%` }} />
        </span>
      )}
      {c.slideshow && <span className="cm-show">{say(c.lang, 'Slideshow')}</span>}

      {c.mode === 'menu' && (
        <div className="cm-menu" data-testid="camera-menu-screen">
          {/* Мышью — как стрелками: вкладка, пункт (щелчок — выбрать и нажать SET). */}
          <div className="cm-tabs">
            <button
              type="button"
              className={c.tab === 0 ? 'cm-tab-on' : undefined}
              data-testid="camera-tab-play"
              aria-label="Просмотр"
              onClick={() => c.pickTab(0)}
            >
              <PlayIcon />
            </button>
            <button
              type="button"
              className={c.tab === 1 ? 'cm-tab-on' : undefined}
              data-testid="camera-tab-setup"
              onClick={() => c.pickTab(1)}
            >
              {say(c.lang, 'Set up')}
            </button>
          </div>
          <ul>
            {MENU[c.tab].items.map((it, k) => (
              <li key={it}>
                <button
                  type="button"
                  className={k === c.item ? 'cm-item-on' : undefined}
                  data-testid={`camera-item-${it}`}
                  onClick={() => c.pick(k)}
                >
                  <span>{say(c.lang, it)}</span>
                  <span className="cm-val">
                    {it === 'Mute'
                      ? say(c.lang, c.mute ? 'On' : 'Off')
                      : it === 'Language'
                        ? c.lang === 'en'
                          ? 'English'
                          : 'Русский'
                        : it === 'LCD Brightness'
                          ? '●'.repeat(c.bright) + '○'.repeat(5 - c.bright)
                          : ''}
                  </span>
                </button>
              </li>
            ))}
          </ul>
          <div className="cm-menu-foot">{say(c.lang, 'MENU Exit')}</div>
        </div>
      )}
      {button && createPortal(button, document.body)}
    </div>
  );
}

/**
 * Лист под камерой вплотную: что на кадре (серый прототип, K8 — снимков нет) и, при увеличении,
 * крупные детали этого кадра (L905). Выделить строку — в запрос.
 */
export function CameraSheet() {
  const frame = useCamera((c) => c.frame);
  const mode = useCamera((c) => c.mode);
  const zoom = useCamera((c) => c.zoom);
  const b24 = useGame(body('24'));
  const b905 = useGame(body('L905'));
  const frames = useMemo(() => parseFrames(b24), [b24]);
  const f = frames[frame - 1];
  const details = zoom && b905 ? frameDetails(b905, frame) : [];
  const { onUp, button } = useSelectionPetition('camera-sheet-to-petition');
  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: выделение описания кадра в запрос
    <div
      className="cm-sheet"
      data-testid="camera-sheet"
      onPointerDown={(e) => e.stopPropagation()}
      onMouseUp={onUp}
    >
      <div className="cm-sheet-note">
        {mode === 'menu'
          ? 'Меню камеры.'
          : 'Снимка в сборке пока нет — описание того, что на кадре.'}
      </div>
      {mode !== 'menu' && f && (
        <p data-material="24" data-testid="camera-caption">
          <b>
            Кадр {f.n} из {FRAME_COUNT}
            {seriesTitle(f.series) ? ` · ${seriesTitle(f.series)}` : ''}.
          </b>{' '}
          {f.text || 'Описания кадра нет.'}
        </p>
      )}
      {zoom > 0 && mode === 'single' && (
        <div className="cm-detail" data-material="L905" data-testid="camera-detail">
          <div className="cm-sheet-note">Крупно (×{zoomOf(zoom)}):</div>
          {details.length ? (
            <ul>
              {details.map((d) => (
                <li key={d}>{d}</li>
              ))}
            </ul>
          ) : (
            <p>—</p>
          )}
        </div>
      )}
      {button && createPortal(button, document.body)}
    </div>
  );
}
