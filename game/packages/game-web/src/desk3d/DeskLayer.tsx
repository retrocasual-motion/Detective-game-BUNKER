import {
  CARD_H,
  CARD_W,
  CONTAINERS,
  containerContents,
  type DeskItem,
  NEWSPAPER_ID,
  onWall,
} from '@bunker/shared';
import { Canvas, events } from '@react-three/fiber';
import { type RefObject, useEffect, useMemo, useRef } from 'react';
import { screenToWorld } from '../canvas/math.ts';
import type { Pose, Room } from '../room/camera.ts';
import { type DeskObject, envelopeSpot } from '../room/decor.ts';
import { shownCamera, useGame } from '../store.ts';
import { DEVICE_KIND, Desk, type DeskMaterial, type WallFit } from './Desk.tsx';
import { Occluders } from './Occluders.tsx';

const NONE: readonly DeskItem[] = [];

/**
 * Цель щелчка — кнопка или поле страницы (стрелка, доска, меню): 3D-стол её не берёт. Кнопки вещей
 * следователя (`.desk-spot`) — не в счёт: лист перед вещью ближе к глазу, решает луч (took.ts).
 */
const isControl = (t: EventTarget | null) => {
  if (!(t instanceof Element)) return false;
  const c = t.closest('button, a, input, textarea, select, [role="button"]');
  return !!c && !c.classList.contains('desk-spot');
};

/**
 * 3D-стол в комнате игры (MG-A, автор 24.11): прозрачный холст three.js поверх нарисованного стола,
 * в той же камере (`live` — поза RoomScene). Холст мышь не ловит — события идут через сцену
 * (`eventSource`), и кнопки страницы (предметы стола, стрелки, доска) остаются кнопками.
 */
export function DeskLayer({
  room,
  live,
  scene,
  objects,
  active,
  visible,
}: {
  room: Room;
  live: RefObject<Pose>;
  scene: RefObject<HTMLDivElement | null>;
  /** Вещи следователя на столе — как их рисует игра. */
  objects: DeskObject[];
  /** Стол в покое, ничего не открыто: вещи можно брать. */
  active: boolean;
  /** Стену смотрят плоско — холст скрыт. */
  visible: boolean;
}) {
  const items = useGame((g) => g.state?.desk ?? NONE);
  const list = useGame((g) => g.materials);
  const materials = useMemo(
    () =>
      new Map<string, DeskMaterial>(
        list.map((m) => [
          m.id,
          {
            title: m.title,
            kind: m.id === NEWSPAPER_ID ? 'newspaper' : (DEVICE_KIND[m.id] ?? m.kind),
            body: m.body,
          },
        ]),
      ),
    [list],
  );
  const pointer = useRef({ x: 0, y: 0 });
  const activeRef = useRef(active);
  activeRef.current = active;

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

  // Карточка на доске (вид «Стол»: вся доска — boardCamera): размер и место — как у стены игры.
  const wallFit = useRef<WallFit>({ cardW: CARD_W, fit: (x, y) => ({ x, y }) });
  wallFit.current = {
    get cardW() {
      const st = useGame.getState().state;
      return CARD_W * (st ? shownCamera(st).zoom : 1);
    },
    fit: (x, y) => {
      const st = useGame.getState().state;
      if (!st) return { x, y };
      const cam = shownCamera(st);
      const w = screenToWorld({ x, y }, cam);
      const c = onWall(w.x - CARD_W / 2, w.y - CARD_H / 2);
      return { x: cam.x + (c.x + CARD_W / 2) * cam.zoom, y: cam.y + (c.y + CARD_H / 2) * cam.zoom };
    },
  };

  const spillFrom = (id: string) => {
    const c = CONTAINERS.find((cc) => containerContents(cc).includes(id));
    if (!c) return null;
    const [x, z] = envelopeSpot(c.id);
    return { x, z };
  };

  return (
    <div className="desk3d" style={{ visibility: visible ? 'visible' : 'hidden' }}>
      <Canvas
        flat
        dpr={[1, 2]}
        gl={{ alpha: true, antialias: true }}
        style={{ pointerEvents: 'none' }}
        eventSource={scene as RefObject<HTMLElement>}
        eventPrefix="client"
        events={(store) => {
          const base = events(store);
          return {
            ...base,
            // Кнопки страницы — их, не стола; стол не в покое — вещи не берут.
            compute: (ev, state) => {
              state.pointer.set(
                (ev.clientX / state.size.width) * 2 - 1,
                -(ev.clientY / state.size.height) * 2 + 1,
              );
              state.raycaster.setFromCamera(state.pointer, state.camera);
              state.raycaster.far =
                activeRef.current && !isControl(ev.target) ? Number.POSITIVE_INFINITY : 0;
            },
          };
        }}
      >
        <Occluders room={room} objects={objects} />
        <Desk
          room={room}
          pose={live}
          objects={objects}
          materials={materials}
          items={items}
          spillFrom={spillFrom}
          wallFit={wallFit}
          onRead={(id) => useGame.getState().readDesk(id)}
          onSave={(next) => useGame.getState().setDesk(next)}
          onHang={(id, at) => {
            const st = useGame.getState().state;
            if (!st) return;
            const w = screenToWorld(at, shownCamera(st));
            useGame.getState().hangFromDesk(id, w.x - CARD_W / 2, w.y - CARD_H / 2);
          }}
          pointer={pointer}
          enabled={activeRef}
          cursorEl={scene}
        />
      </Canvas>
    </div>
  );
}
