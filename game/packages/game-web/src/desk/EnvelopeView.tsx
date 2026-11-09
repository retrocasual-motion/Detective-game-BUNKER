import {
  CONTAINERS,
  type ContainerId,
  containerContents,
  containerLabelId,
  focusCamera,
} from '@bunker/shared';
import { type PointerEvent, useEffect, useRef, useState } from 'react';
import { useGame } from '../store.ts';

/**
 * Конверт архива в руках (A-260, правка автора 09.11): щелчок по конверту на столе не вскрывает
 * его сразу. Конверт встаёт крупно; его можно повернуть (протянуть мышью или «Перевернуть»):
 * спереди — дело, раздел, печать; на обороте — что внутри, по описи. «Вскрыть» — документы
 * выходят из конверта карточками и вешаются на стену группой под названием; дальше —
 * «Перейти к стене» или «Остаться у стола». До вскрытия конверт можно положить обратно.
 * Коробка «Личные вещи» — так же.
 */
export function EnvelopeView() {
  const id = useGame((g) => g.inspecting);
  // Новый конверт — новое состояние (поворот, вскрыт ли).
  return id ? <Envelope key={id} id={id} /> : null;
}

function Envelope({ id }: { id: ContainerId }) {
  const c = CONTAINERS.find((x) => x.id === id);
  const materials = useGame((g) => g.materials);
  const viewerOpen = useGame((g) => g.viewerId !== null);
  const [angle, setAngle] = useState(0);
  const [opened, setOpened] = useState(false);
  const drag = useRef<{ x: number; from: number } | null>(null);
  const box = id === 'personal';

  const close = () => useGame.getState().setInspecting(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !useGame.getState().viewerId)
        useGame.getState().setInspecting(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  if (!c) return null;
  const titles = new Map(materials.map((m) => [m.id, m.title]));
  const inside = containerContents(c).filter((m) => titles.has(m));
  const back = Math.abs((((angle % 360) + 360) % 360) - 180) < 90;

  const open = () => {
    useGame.getState().openContainer(id);
    setOpened(true);
  };

  const onDown = (e: PointerEvent) => {
    if (opened) return;
    drag.current = { x: e.clientX, from: angle };
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  };
  const onMove = (e: PointerEvent) => {
    if (drag.current) setAngle(drag.current.from + (e.clientX - drag.current.x) * 0.6);
  };
  // Отпустили — конверт ложится лицом или оборотом, как ближе.
  const onUp = () => {
    if (!drag.current) return;
    drag.current = null;
    setAngle((a) => Math.round(a / 180) * 180);
  };

  return (
    <div
      className="envelope-view"
      data-testid="envelope-view"
      inert={viewerOpen}
      onPointerDown={(e) => {
        if (e.target === e.currentTarget && !opened) close();
      }}
    >
      {!opened ? (
        <>
          <div className="envelope-stage">
            <div
              className={`envelope3d${box ? ' envelope3d-box' : ''}`}
              data-testid="envelope-3d"
              data-side={back ? 'back' : 'front'}
              style={{ transform: `rotateY(${angle}deg)` }}
              onPointerDown={onDown}
              onPointerMove={onMove}
              onPointerUp={onUp}
              onPointerCancel={onUp}
            >
              <div className="envelope-face envelope-front">
                <span className="envelope-case">Дело № 09-1128</span>
                <span className="envelope-title">{c.label}</span>
                <span className="envelope-note">
                  {box ? 'Изъято с объекта · 7 пакетов' : 'Материалы дела · передано специалисту'}
                </span>
                <span className="envelope-seal" aria-hidden>
                  опечатано
                </span>
                <span className="envelope-date">16.11.2009 · подпись следователя</span>
              </div>
              <div className="envelope-face envelope-back">
                <span className="envelope-flap" aria-hidden />
                <span className="envelope-list-head">Внутри (по описи):</span>
                <ul className="envelope-list" data-testid="envelope-list">
                  {inside.map((m) => (
                    <li key={m}>
                      <b>{m}</b> {short(titles.get(m) ?? '')}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </div>
          <p className="envelope-hint">Протяните мышью, чтобы повернуть</p>
          <div className="envelope-actions">
            <button type="button" className="tool" onClick={() => setAngle((a) => a + 180)}>
              Перевернуть
            </button>
            <button
              type="button"
              className="tool envelope-open"
              data-testid="envelope-open"
              onClick={open}
            >
              {box ? 'Вскрыть коробку' : 'Вскрыть конверт'}
            </button>
            <button type="button" className="tool" data-testid="envelope-back" onClick={close}>
              Положить обратно
            </button>
          </div>
        </>
      ) : (
        <section className="envelope-opened" data-testid="envelope-opened">
          <h2>{c.label}</h2>
          <ul className="envelope-sheets">
            {inside.map((m, k) => (
              <li key={m} className="envelope-sheet" style={{ animationDelay: `${k * 60}ms` }}>
                <span className="envelope-sheet-id">{m}</span>
                {titles.get(m)}
              </li>
            ))}
          </ul>
          <p className="envelope-done" data-testid="envelope-done">
            Всё повешено на стену — группой под ярлыком «{c.label}».
            {c.devices ? ' Изъятые устройства — на столе.' : ''}
          </p>
          <div className="envelope-actions">
            <button
              type="button"
              className="tool envelope-open"
              data-testid="envelope-to-wall"
              onClick={() => {
                close();
                // Стена — сразу у новой группы (ярлык с названием конверта).
                const g = useGame.getState();
                const label = g.state?.wall.items.find((i) => i.id === containerLabelId(id));
                if (label)
                  g.updateState((s) => ({
                    ...s,
                    wall: { ...s.wall, camera: focusCamera(label.x, label.y) },
                  }));
                g.setView('wall');
              }}
            >
              Перейти к стене
            </button>
            <button type="button" className="tool" data-testid="envelope-stay" onClick={close}>
              Остаться у стола
            </button>
          </div>
        </section>
      )}
    </div>
  );
}

/** На конверте пишут кратко: до скобки или «;», не длиннее 40 знаков (по целым словам). */
export const short = (title: string) => {
  const t = title.split(/[(;]/)[0]?.trim() ?? title;
  if (t.length <= 40) return t;
  return `${t.slice(0, 40).replace(/\s+\S*$/, '')}…`;
};
