import { type ThreeEvent, useFrame, useThree } from '@react-three/fiber';
import { type RefObject, useEffect, useMemo, useRef, useState } from 'react';
import { Euler, type Group, PerspectiveCamera, Quaternion, Vector3 } from 'three';
import { Envelope } from '../hold/shapes.tsx';
import { BOARD_SCALE, type Pose, type Room, screenToBoard } from '../room/camera.ts';
import type { DeskObject } from '../room/decor.ts';
import { cardH, cardW } from './Board.tsx';
import { heights, type Piece, pileOf, rng, scatter, slide, type Zone } from './deskWorld.ts';
import { Paper, type PaperTarget } from './Paper.tsx';
import { footprints, Room3D } from './Room3D.tsx';
import { boardPoint, deskPoint, deskToScreen, screenToDesk, syncCamera } from './space.ts';

/**
 * Прототип 3D-стола: стол целиком — комната, вещи следователя, конверт, бумаги и изъятые
 * устройства. Каждый кадр каждой вещи говорится, где ей быть (на столе, в руке, у стены, в полёте).
 *
 * Жесты — мышью по самим вещам (правки автора 23.11 после первого прогона):
 * - конверт: потянуть клапан вверх — вскрыт, содержимое на столе, пустой конверт убран;
 * - вещь: тянуть — идёт за мышью свободно, не примагничивается; кладётся ровно там, где отпустили;
 *   на другую — ложится сверху как есть (стопка — просто внахлёст);
 * - вещь не уходит со стола и не проходит сквозь вещи следователя: упёрлась — скользит вдоль;
 *   мышь ушла в пустоту — вещь остаётся у края, отпустили — лежит там;
 * - навести — чуть подсвечена (ничего не поднимается и не раскрывается);
 * - зажать и подержать — вместе со всем, что лежит на ней;
 * - щелчок — прочитать крупно;
 * - дотащить до стены (WL-A) — встаёт к доске; отпустить — висит там, где отпустили.
 */

export interface Material {
  id: string;
  title: string;
  kind: string;
  body: string;
}

/** Подъём вещи в руке, м. */
const LIFT = 0.035;
/** Сколько держать, чтобы взять вместе с тем, что лежит сверху, мс. */
const HOLD_PILE_MS = 400;
/** Порог протяжки, px. */
const DRAG_PX = 4;

/** Опечатанный конверт на столе (м). */
const ENV_AT = { x: 0.05, z: 0.45, rot: -0.06 };
const ENV_W = 0.324;

/** Изъятые устройства в прототипе — формы без экранов. */
export const DEVICE_KIND: Record<string, string> = { '48': 'mobile', '49': 'pen', '24': 'camera' };

const UP = new Euler(Math.PI / 2, 0, 0);

interface Drag {
  /** Что в руке — снизу вверх. */
  ids: string[];
  /** Где лежали в начале протяжки. */
  base: Map<string, { x: number; z: number }>;
  /** Точка стола под мышью в начале (на высоте подъёма). */
  grab0: { x: number; z: number };
  /** Сдвиг, который удалось сделать (в зоне). */
  off: { x: number; z: number };
  wall: { x: number; y: number } | null;
  vx: number;
  vz: number;
}

interface Press {
  id: string;
  x0: number;
  y0: number;
  t0: number;
  pile: boolean;
  timer: number;
}

export function Desk({
  room,
  pose,
  objects,
  materials,
  contents,
  envelopeTitle,
  onRead,
  onArrive,
  pointer,
  onOpened,
}: {
  room: Room;
  pose: RefObject<Pose>;
  objects: DeskObject[];
  materials: Map<string, Material>;
  contents: string[];
  envelopeTitle: string;
  onRead: (id: string) => void;
  /** Вещь долетела до стены: карточка — в этой точке доски (px доски). */
  onArrive: (id: string, at: { x: number; y: number }) => void;
  /** Мышь в координатах экрана — её ведёт страница (протяжка идёт и за край холста). */
  pointer: RefObject<{ x: number; y: number }>;
  onOpened: () => void;
}) {
  const { camera, gl } = useThree();
  const { p } = room;
  // Камера стола — для зоны и протяжки (в покое у стола камера в этой позе).
  const deskCam = useMemo(() => {
    const c = new PerspectiveCamera();
    syncCamera(c, room.poses.desk, room);
    return c;
  }, [room]);

  const [opened, setOpened] = useState(false);
  const [envGone, setEnvGone] = useState(false);
  const [pieces, setPieces] = useState<Piece[]>([]);
  const ps = useRef<Piece[]>([]);
  ps.current = pieces;
  const targets = useRef(new Map<string, PaperTarget>());
  const starts = useRef(new Map<string, { pos: Vector3; at: number }>());
  const drag = useRef<Drag | null>(null);
  const press = useRef<Press | null>(null);
  const hoverId = useRef<string | null>(null);
  const flying = useRef(new Map<string, { x: number; y: number; since: number }>());
  const rand = useRef(rng(11));
  const [, setTick] = useState(0);
  const env = useRef<Group>(null);
  const envPlaced = useRef(false);
  const envAway = useRef(0);

  const blocked = useMemo(() => footprints(room, objects), [room, objects]);
  const zone: Zone = useMemo(() => {
    const left = room.deskLeft / p + 0.01;
    const right = room.deskRight / p - 0.01;
    const near = room.deskNear / p - 0.01;
    return {
      inside: (x, z) => {
        if (x < left || x > right || z < 0.015 || z > near) return false;
        const s = deskToScreen(deskCam, room, x, z);
        return s.front && s.x > 6 && s.x < room.vp.width - 6 && s.y > 6 && s.y < room.vp.height - 6;
      },
      blocked,
    };
  }, [room, p, deskCam, blocked]);

  const setCursor = (c: string) => {
    gl.domElement.style.cursor = c;
  };

  const target = (id: string): PaperTarget => {
    let t = targets.current.get(id);
    if (!t) {
      t = {
        pos: new Vector3(),
        quat: new Quaternion(),
        scale: 1,
        stiff: 260,
        damp: 0.6,
        deskY: -room.deskY,
        forbidden: false,
        noShadow: false,
        hover: false,
      };
      targets.current.set(id, t);
    }
    return t;
  };

  const onDesk = (t: PaperTarget, x: number, z: number, h: number, rot: number, tx = 0, tz = 0) => {
    t.pos.copy(deskPoint(room, x, z, h));
    t.quat.setFromEuler(new Euler(tx, rot, tz, 'YXZ'));
    t.scale = 1;
    t.noShadow = false;
  };

  const onWall = (t: PaperTarget, piece: Piece, bx: number, by: number, dz: number) => {
    t.pos.copy(boardPoint(room, bx, by, dz));
    t.quat.setFromEuler(UP);
    t.scale = (cardW(room.vp) * BOARD_SCALE) / (piece.w * p);
    t.noShadow = true;
  };

  // ── Вскрыть конверт: содержимое высыпается на стол, пустой конверт убирается. ──
  const spill = () => {
    if (opened) return;
    setOpened(true);
    onOpened();
    envAway.current = performance.now();
    window.setTimeout(() => setEnvGone(true), 700);
    const items = [...contents, ...Object.keys(DEVICE_KIND)].map((id) => ({
      id,
      kind: DEVICE_KIND[id] ?? materials.get(id)?.kind ?? 'sheet',
    }));
    const laid = scatter(items, zone, { x: ENV_AT.x, z: ENV_AT.z - 0.05 }, 7, 0.16);
    const now = performance.now();
    laid.forEach((pc, k) => {
      starts.current.set(pc.id, {
        pos: deskPoint(room, ENV_AT.x, ENV_AT.z, 0.012),
        at: now + 120 + k * 60,
      });
    });
    setPieces(laid);
  };

  // ── Нажали на вещь. ──
  const onDown = (id: string, e: ThreeEvent<PointerEvent>) => {
    if (drag.current || flying.current.has(id)) return;
    const st: Press = {
      id,
      x0: e.clientX,
      y0: e.clientY,
      t0: performance.now(),
      pile: false,
      timer: 0,
    };
    if (pileOf(ps.current, id).length > 1)
      st.timer = window.setTimeout(() => {
        if (press.current === st && !drag.current) st.pile = true;
      }, HOLD_PILE_MS);
    press.current = st;
    setCursor('grabbing');
    const move = (ev: PointerEvent) => {
      if (ev.buttons === 0) return up();
      if (!drag.current && Math.hypot(ev.clientX - st.x0, ev.clientY - st.y0) > DRAG_PX) begin(st);
    };
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', up);
      clearTimeout(st.timer);
      press.current = null;
      if (drag.current) drop();
      else if (!st.pile && performance.now() - st.t0 < 600) onRead(id);
      setCursor(hoverId.current ? 'grab' : '');
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', up);
  };

  // ── Протяжка началась: в руке вещь (или с тем, что на ней); она — поверх всего. ──
  const begin = (st: Press) => {
    clearTimeout(st.timer);
    const all = ps.current;
    const group = st.pile ? pileOf(all, st.id) : all.filter((q) => q.id === st.id);
    if (!group.length) return;
    const ids = group.map((q) => q.id);
    const grab0 = screenToDesk(deskCam, room, st.x0, st.y0, LIFT) ?? {
      x: group[0]?.x ?? 0,
      z: group[0]?.z ?? 0,
    };
    let top = Math.max(0, ...all.map((q) => q.layer));
    const layer = new Map(ids.map((id) => [id, ++top]));
    drag.current = {
      ids,
      base: new Map(group.map((q) => [q.id, { x: q.x, z: q.z }])),
      grab0,
      off: { x: 0, z: 0 },
      wall: null,
      vx: 0,
      vz: 0,
    };
    setPieces(all.map((q) => ({ ...q, layer: layer.get(q.id) ?? q.layer })));
  };

  // ── Отпустили: лежит там, где отпустили (или висит на стене там, где отпустили). ──
  const drop = () => {
    const d = drag.current;
    drag.current = null;
    if (!d) return;
    if (d.wall) {
      sendToWall(d.ids, d.wall);
      return;
    }
    const jr = (rand.current() - 0.5) * 0.03;
    setPieces((all) =>
      all.map((q) => {
        const b = d.base.get(q.id);
        return b ? { ...q, x: b.x + d.off.x, z: b.z + d.off.z, rot: q.rot + jr } : q;
      }),
    );
  };

  // ── WL-A: на стену — туда, где отпустили; несколько — чуть вразбежку. ──
  const sendToWall = (ids: string[], at: { x: number; y: number }) => {
    const now = performance.now();
    const { vp } = room;
    const w = cardW(vp);
    // Сверху вниз: первым — верхний.
    [...ids].reverse().forEach((id, k) => {
      const pc = ps.current.find((q) => q.id === id);
      const h = cardH(vp, pc?.kind ?? 'sheet');
      const x = Math.min(
        vp.width * 0.98 - 12 - w / 2,
        Math.max(vp.width * 0.02 + 12 + w / 2, at.x + k * 16),
      );
      const y = Math.min(
        vp.height * 0.975 - 12 - h / 2,
        Math.max(vp.height * 0.025 + 12 + h / 2, at.y + k * 12),
      );
      flying.current.set(id, { x, y, since: now + k * 60 });
    });
    setTick((t) => t + 1);
  };

  // ── Наведение: чуть подсвечена, и только. ──
  const onOver = (id: string) => {
    if (drag.current) return;
    hoverId.current = id;
    if (!press.current) setCursor('grab');
  };
  const onOut = (id: string) => {
    if (hoverId.current === id) hoverId.current = null;
    if (!press.current && !drag.current) setCursor('');
  };

  // Для автотестов и снимков: где на экране клапан конверта и вещи (вид «Стол»).
  const hCache = useRef<{ key: Piece[] | null; drag: string; h: Map<string, number> }>({
    key: null,
    drag: '',
    h: new Map(),
  });
  useEffect(() => {
    const at = (x: number, z: number, h = 0) => {
      const v = deskPoint(room, x, z, h).project(deskCam);
      return { x: ((v.x + 1) / 2) * room.vp.width, y: ((1 - v.y) / 2) * room.vp.height };
    };
    (window as unknown as { __proto?: unknown }).__proto = {
      flap: () => at(ENV_AT.x, ENV_AT.z - 0.04, 0.003),
      piece: (id: string) => {
        const pc = ps.current.find((q) => q.id === id);
        return pc ? at(pc.x, pc.z, (hCache.current.h.get(id) ?? 0) + pc.t) : null;
      },
      desk: (x: number, z: number) => at(x, z),
      pieces: () =>
        ps.current.map((q) => ({ id: q.id, x: q.x, z: q.z, w: q.w, d: q.d, rot: q.rot })),
      pile: (id: string) => pileOf(ps.current, id).map((q) => q.id),
      blocked: () => blocked,
      board: (bx: number, by: number) => {
        const v = boardPoint(room, bx, by).project(deskCam);
        return { x: ((v.x + 1) / 2) * room.vp.width, y: ((1 - v.y) / 2) * room.vp.height };
      },
    };
  }, [room, deskCam, blocked]);

  // ── Кадр: камера, затем цель каждой вещи. ──
  useFrame((_, dtRaw) => {
    syncCamera(camera as PerspectiveCamera, pose.current, room);
    const dt = Math.max(1 / 240, Math.min(dtRaw, 1 / 30));
    const all = ps.current;
    const d = drag.current;
    const dragKey = d ? d.ids.join(',') : '';
    const hc = hCache.current;
    if (hc.key !== all || hc.drag !== dragKey) {
      hc.key = all;
      hc.drag = dragKey;
      hc.h = heights(d ? all.filter((q) => !d.ids.includes(q.id)) : all);
    }

    // Конверт: опечатан — лежит; вскрыт — уходит (сжимается и пропадает).
    if (env.current) {
      const s = (ENV_W * p) / 3;
      const want = deskPoint(room, ENV_AT.x, ENV_AT.z, 0.0155 * (s / p) + 0.0005);
      const q = new Quaternion().setFromEuler(new Euler(-Math.PI / 2, ENV_AT.rot, 0, 'YXZ'));
      if (!envPlaced.current) {
        envPlaced.current = true;
        env.current.position.copy(want);
        env.current.quaternion.copy(q);
      }
      const k = envAway.current ? Math.min(1, (performance.now() - envAway.current) / 600) : 0;
      env.current.scale.setScalar(s * (1 - k * k));
      env.current.position.y = want.y + k * 0.06 * p;
    }

    // Протяжка: вещь идёт за мышью, но только по зоне — упёрлась, скользит вдоль.
    if (d) {
      const m = pointer.current;
      const floor = screenToDesk(deskCam, room, m.x, m.y, 0);
      d.wall =
        !floor || floor.z < 0 ? screenToBoard({ x: m.x, y: m.y }, room.poses.desk, room) : null;
      const pt = d.wall ? null : screenToDesk(deskCam, room, m.x, m.y, LIFT);
      if (pt) {
        const rects = d.ids.flatMap((id) => {
          const pc = all.find((q) => q.id === id);
          const b = d.base.get(id);
          return pc && b ? [{ ...pc, x: b.x + d.off.x, z: b.z + d.off.z }] : [];
        });
        const want = { x: pt.x - d.grab0.x, z: pt.z - d.grab0.z };
        const mv = slide(rects, want.x - d.off.x, want.z - d.off.z, zone);
        d.off = { x: d.off.x + mv.dx, z: d.off.z + mv.dz };
        const k = 1 - Math.exp(-dt * 14);
        d.vx += (mv.dx / dt - d.vx) * k;
        d.vz += (mv.dz / dt - d.vz) * k;
      } else {
        d.vx *= 0.8;
        d.vz *= 0.8;
      }
    }

    const now = performance.now();
    const pile = press.current?.pile ? pileOf(all, press.current.id).map((q) => q.id) : [];
    for (const pc of all) {
      const t = target(pc.id);
      t.forbidden = false;
      t.hover = !d && (hoverId.current === pc.id || pile.includes(pc.id));
      const fly = flying.current.get(pc.id);
      if (fly) {
        if (now < fly.since) continue;
        onWall(t, pc, fly.x, fly.y, 3);
        t.stiff = 140;
        t.damp = 1;
        continue;
      }
      if (d?.ids.includes(pc.id)) {
        const k = d.ids.indexOf(pc.id);
        t.stiff = 900;
        t.damp = 0.95;
        if (d.wall) {
          // Над стеной: вещь встаёт к доске у мыши (несколько — чуть вразбежку).
          const n = d.ids.length - 1 - k;
          onWall(t, pc, d.wall.x + n * 16, d.wall.y + n * 12, 40 + k * 1.5);
          continue;
        }
        const b = d.base.get(pc.id) ?? { x: pc.x, z: pc.z };
        // Стопка в руке — как лежала: каждая чуть выше предыдущей.
        const lift = LIFT + k * (pc.t + 0.001);
        // Наклон за рукой — едва заметный.
        const tz = Math.max(-0.12, Math.min(0.12, -d.vx * 0.2));
        const tx = Math.max(-0.12, Math.min(0.12, d.vz * 0.2));
        onDesk(t, b.x + d.off.x, b.z + d.off.z, lift + pc.t / 2, pc.rot, tx, tz);
        continue;
      }
      onDesk(t, pc.x, pc.z, (hc.h.get(pc.id) ?? 0) + pc.t / 2, pc.rot);
      t.stiff = 300;
      t.damp = 0.7;
    }

    // Долетели до стены — карточки на доске, вещи со стола убраны.
    const arrived: string[] = [];
    for (const [id, f] of flying.current) if (now - f.since > 750) arrived.push(id);
    if (arrived.length) {
      for (const id of arrived) {
        const f = flying.current.get(id);
        flying.current.delete(id);
        targets.current.delete(id);
        if (f) onArrive(id, { x: f.x, y: f.y });
      }
      setPieces((cur) => cur.filter((q) => !arrived.includes(q.id)));
    }
  });

  const envItems = useMemo(
    () => contents.map((id) => ({ id, title: materials.get(id)?.title ?? id })),
    [contents, materials],
  );

  return (
    <>
      <Room3D room={room} objects={objects} />
      {!envGone && (
        <group ref={env} name="envelope">
          <Envelope title={envelopeTitle} items={envItems} onOpen={spill} />
        </group>
      )}
      {pieces.map((pc) => {
        const m = materials.get(pc.id);
        return (
          <Paper
            key={pc.id}
            piece={pc}
            title={m?.title ?? pc.id}
            body={m?.body ?? ''}
            p={p}
            target={target(pc.id)}
            start={starts.current.get(pc.id)}
            onDown={onDown}
            onOver={onOver}
            onOut={onOut}
          />
        );
      })}
    </>
  );
}
