import type { View } from '@bunker/shared';
import { Canvas } from '@react-three/fiber';
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import starting from '../../../content/dist/starting.json';
import {
  boardOps,
  easeCamera,
  lerpPose,
  type Pose,
  poseOps,
  roomFor,
  screenToBoard,
  TRANSITION_MS,
  toCss,
} from '../room/camera.ts';
import { NavArrows } from '../room/NavArrows.tsx';
import { useViewport } from '../room/useViewport.ts';
import { Board, GROUP_LABEL, type WallCard } from './Board.tsx';
import { DEVICE_KIND, Desk, type Material } from './Desk.tsx';
import { fixedObjects } from './Room3D.tsx';

/**
 * Прототип 3D-стола (автор 23.11: «стол и комната будут 3D, стена — как у нас»; WL-A). Отдельная
 * страница, без сервера и сохранения: перезагрузка — всё сначала.
 *
 * Слои — как в игре (`RoomScene`): DOM-стена в CSS 3D, поверх — прозрачный холст three.js с той
 * же камерой; в задней стене холста — дыра под доску. В покое у стены доска плоская, холст скрыт.
 */

/** Содержимое конверта «Осмотр места происшествия и изъятое» (без изъятых устройств). */
const CONTENTS = ['22', '23', '25', '26', '27', '51', '18', '19', '20', '21'];
/** Сколько всего вещей выйдет из конверта: бумаги и три устройства. */
const TOTAL = CONTENTS.length + 3;

const MATERIALS = new Map<string, Material>(
  (starting as { id: string; title: string; kind: string; body: string }[]).map((m) => [
    m.id,
    { id: m.id, title: m.title, kind: m.kind, body: m.body },
  ]),
);
const START_WALL = ['01', '02', '03', '04', '05', '06', '07'].map((id) => ({
  id,
  title: MATERIALS.get(id)?.title ?? id,
}));

export function ProtoDesk() {
  const vp = useViewport();
  const room = useMemo(() => roomFor(vp), [vp]);
  const objects = useMemo(() => fixedObjects(room), [room]);
  const [view, setView] = useState<View>('desk');
  const [moving, setMoving] = useState(false);
  const pose = useRef<Pose>(room.poses.desk);
  const world = useRef<HTMLDivElement>(null);
  const [cards, setCards] = useState<WallCard[]>([]);
  const [reading, setReading] = useState<string | null>(null);
  const [opened, setOpened] = useState(false);
  const pointer = useRef({ x: 0, y: 0 });
  const [run, setRun] = useState(0);
  // DV-H — лист ложится на устройство и прогибается; DV-B — объезжает (переключатель для сравнения).
  const [drape, setDrape] = useState(true);

  useEffect(() => {
    const move = (e: PointerEvent) => {
      pointer.current = { x: e.clientX, y: e.clientY };
    };
    window.addEventListener('pointermove', move, { capture: true });
    window.addEventListener('pointerdown', move, { capture: true });
    return () => {
      window.removeEventListener('pointermove', move, { capture: true });
      window.removeEventListener('pointerdown', move, { capture: true });
    };
  }, []);

  const flat = !moving && view === 'wall';
  const apply = (p: Pose | null) => {
    if (p) pose.current = p;
    if (world.current) world.current.style.transform = p ? toCss(poseOps(p, room.p)) : 'none';
  };

  // Покой: стол — поза «Стол»; стена — плоская доска.
  useLayoutEffect(() => {
    if (!moving) apply(flat ? null : room.poses[view]);
  });

  const go = (to: View) => {
    if (to === view) return;
    const from = pose.current;
    setView(to);
    setMoving(true);
    const b = room.poses[to];
    const start = performance.now();
    const frame = (now: number) => {
      const t = Math.min(1, (now - start) / TRANSITION_MS);
      apply(lerpPose(from, b, easeCamera(t)));
      if (t < 1) requestAnimationFrame(frame);
      else setMoving(false);
    };
    apply(from);
    requestAnimationFrame(frame);
  };

  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setReading(null);
      if (reading) return;
      if (e.key === 'ArrowUp') go('wall');
      if (e.key === 'ArrowDown') go('desk');
    };
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  });

  // Свежие карточки светятся и гаснут.
  useEffect(() => {
    if (!cards.some((c) => c.fresh)) return;
    const t = setTimeout(() => setCards((cs) => cs.map((c) => ({ ...c, fresh: false }))), 2200);
    return () => clearTimeout(t);
  }, [cards]);

  const reset = () => {
    setCards([]);
    setOpened(false);
    setReading(null);
    setRun((r) => r + 1);
    if (view !== 'desk') go('desk');
  };

  const m = reading ? MATERIALS.get(reading) : null;

  return (
    <div
      className="scene proto"
      data-testid="proto"
      data-view={view}
      data-moving={moving}
      style={{ perspective: `${room.p}px` }}
    >
      <div ref={world} className="world">
        <div
          className={`plane face face-wall${flat ? ' face-active' : ''}`}
          style={{
            width: vp.width,
            height: vp.height,
            left: -vp.width / 2,
            top: -vp.height / 2,
            transform: flat ? 'none' : toCss(boardOps()),
          }}
        >
          <div className="face-content">
            <Board vp={vp} starting={START_WALL} cards={cards} />
          </div>
        </div>
      </div>
      <div className="proto-gl" style={{ visibility: flat ? 'hidden' : 'visible' }}>
        <Canvas
          key={run}
          flat
          dpr={[1, 2]}
          gl={{ alpha: true, antialias: true }}
          style={{ pointerEvents: view === 'desk' && !moving && !reading ? 'auto' : 'none' }}
          onPointerMissed={(e) => {
            // Щелчок мимо вещей — по стене за столом: подойти к стене (как в игре).
            if (
              e.type === 'click' &&
              screenToBoard({ x: e.clientX, y: e.clientY }, room.poses.desk, room)
            )
              go('wall');
          }}
        >
          <Desk
            room={room}
            pose={pose}
            objects={objects}
            materials={MATERIALS}
            contents={CONTENTS}
            envelopeTitle={GROUP_LABEL}
            onRead={setReading}
            onArrive={(id, at) => {
              const mm = MATERIALS.get(id);
              setCards((cs) => [
                ...cs,
                {
                  id,
                  ...at,
                  title: mm?.title ?? id,
                  kind: DEVICE_KIND[id] ?? mm?.kind ?? 'sheet',
                  fresh: true,
                },
              ]);
            }}
            pointer={pointer}
            onOpened={() => setOpened(true)}
            drape={drape}
          />
        </Canvas>
      </div>
      {!reading && <NavArrows view={view} onGo={go} />}
      <aside className="proto-help" data-testid="proto-help" hidden={view !== 'desk'}>
        <b>Прототип 3D-стола</b>
        <span>
          {opened ? 'Вещь — тащить, класть куда угодно на столе' : 'Конверт: потяните клапан вверх'}
        </span>
        <span>Зажать и подержать — вместе с тем, что лежит сверху</span>
        <span>Щелчок — читать · дотащить до стены — повесить там</span>
        <span>
          На стене: {cards.length} из {TOTAL}
        </span>
        <button type="button" onClick={reset}>
          Сначала
        </button>
        <button type="button" data-testid="proto-drape" onClick={() => setDrape((v) => !v)}>
          Лист и устройства: {drape ? 'ложится сверху (DV-H)' : 'объезжает (DV-B)'}
        </button>
      </aside>
      {m && (
        // biome-ignore lint/a11y/useKeyWithClickEvents: Esc закрывает (обработчик выше)
        <div
          className="proto-viewer"
          role="dialog"
          aria-label={m.title}
          data-testid="proto-viewer"
          onClick={() => setReading(null)}
        >
          {/* biome-ignore lint/a11y/useKeyWithClickEvents: щелчок по листу его не закрывает */}
          <article className="proto-sheet" onClick={(e) => e.stopPropagation()}>
            <header>
              {m.id} · {m.title}
            </header>
            {(m.body || 'Изъятое устройство — в игре берут в руки.')
              .split(/\n\s*\n/)
              .map((l) => l.replace(/\s*\n\s*/g, ' ').trim())
              .filter(Boolean)
              .map((l, k) => {
                const h = /^#+\s*/.test(l);
                const text = l.replace(/^#+\s*/, '').replace(/[*_`]/g, '');
                // biome-ignore lint/suspicious/noArrayIndexKey: строки листа неизменны
                return h ? <h3 key={k}>{text}</h3> : <p key={k}>{text}</p>;
              })}
          </article>
          <span className="proto-viewer-hint">Esc или щелчок мимо — положить на стол</span>
        </div>
      )}
    </div>
  );
}
