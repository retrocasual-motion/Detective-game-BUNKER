import { type ThreeEvent, useFrame, useThree } from '@react-three/fiber';
import { type RefObject, useEffect, useMemo, useRef, useState } from 'react';
import { Euler, type Group, PerspectiveCamera, Quaternion, Vector3 } from 'three';
import { Envelope } from '../hold/shapes.tsx';
import { BOARD_SCALE, type Pose, type Room, screenToBoard } from '../room/camera.ts';
import type { DeskObject } from '../room/decor.ts';
import { cardW, slotCenter } from './Board.tsx';
import {
  allowed,
  heights,
  type Piece,
  type Rect,
  rng,
  scatter,
  stackOf,
  topAt,
  type Zone,
} from './deskWorld.ts';
import { Paper, type PaperTarget } from './Paper.tsx';
import { footprints, Room3D } from './Room3D.tsx';
import { boardPoint, deskPoint, deskToScreen, screenToDesk, syncCamera } from './space.ts';

/**
 * Прототип 3D-стола: стол целиком — комната, вещи следователя, конверт и листы. Всё движение —
 * здесь: каждый кадр каждому листу говорится, где ему быть (на столе, в руке, у стены, в полёте).
 *
 * Жесты (все — мышью по самим вещам, без кнопок):
 * - конверт: навести на клапан — приподнимается; потянуть вверх — вскрыт, содержимое на стол;
 * - лист: тянуть — поднят, тень, наклон за рукой; отпустить — лёг с отскоком; на другой лист —
 *   лёг сверху, стопка; на вещь следователя или за край — вернулся на место;
 * - стопка: навести — веер (видны заголовки нижних); зажать и подержать — вся стопка в руке;
 * - щелчок по листу — прочитать крупно;
 * - дотащить до стены (WL-A) — лист встаёт к доске; отпустить — летит в группу конверта.
 */

export interface Material {
  id: string;
  title: string;
  kind: string;
  body: string;
}

/** Подъём листа в руке, м; над запретным местом — выше. */
const LIFT = 0.05;
const LIFT_BAD = 0.09;
/** Сколько держать, чтобы взять всю стопку, мс. */
const HOLD_STACK_MS = 380;
/** Сдвиг листов стопки веером, м и рад (нижние — к стене: видна их верхняя кромка с заголовком). */
const FAN_DZ = 0.05;
const FAN_DX = 0.016;
const FAN_ROT = 0.035;
/** Порог протяжки, px. */
const DRAG_PX = 5;

/** Конверт на столе: где лежит опечатанным и куда отодвигается пустым (м). */
const ENV_AT = { x: 0.12, z: 0.47, rot: -0.06 };
const ENV_BACK = { x: -0.02, z: 0.15, rot: 0.12 };
const ENV_W = 0.324;
const ENV_D = 0.229;

const UP = new Euler(Math.PI / 2, 0, 0);

interface Drag {
  ids: string[];
  grab: string;
  whole: boolean;
  /** Сдвиг каждого листа от точки под мышью (м), от исходной раскладки. */
  rel: Map<string, { x: number; z: number }>;
  orig: Piece[];
  at: Map<string, { x: number; z: number }>;
  wall: { x: number; y: number } | null;
  forbidden: boolean;
  vx: number;
  vz: number;
  last: { x: number; z: number } | null;
}

interface Press {
  id: string;
  x0: number;
  y0: number;
  t0: number;
  whole: boolean;
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
  nextSlot,
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
  onArrive: (id: string, slot: number) => void;
  nextSlot: RefObject<number>;
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
  const [pieces, setPieces] = useState<Piece[]>([]);
  const ps = useRef<Piece[]>([]);
  ps.current = pieces;
  const targets = useRef(new Map<string, PaperTarget>());
  const starts = useRef(new Map<string, { pos: Vector3; at: number }>());
  const drag = useRef<Drag | null>(null);
  const press = useRef<Press | null>(null);
  const hoverId = useRef<string | null>(null);
  const fanStack = useRef<string | null>(null);
  const timers = useRef({ fan: 0, unfan: 0 });
  const flying = useRef(new Map<string, { slot: number; since: number }>());
  const rand = useRef(rng(11));
  const [, setTick] = useState(0);
  const env = useRef<Group>(null);
  const envPlaced = useRef(false);

  const blocked = useMemo(() => footprints(room, objects), [room, objects]);
  const zone: Zone = useMemo(() => {
    const left = room.deskLeft / p + 0.01;
    const right = room.deskRight / p - 0.01;
    const near = room.deskNear / p - 0.01;
    const envRect: Rect[] = opened ? [{ ...ENV_BACK, w: ENV_W + 0.02, d: ENV_D + 0.02 }] : [];
    return {
      inside: (x, z) => {
        if (x < left || x > right || z < 0.015 || z > near) return false;
        const s = deskToScreen(deskCam, room, x, z);
        // Внизу — стрелка «Стена» и подсказки: туда не кладём.
        return (
          s.front && s.x > 8 && s.x < room.vp.width - 8 && s.y > 8 && s.y < room.vp.height - 64
        );
      },
      blocked: [...blocked, ...envRect],
    };
  }, [room, p, deskCam, blocked, opened]);

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
    t.forbidden = false;
  };

  // ── Вскрыть конверт: содержимое высыпается на стол, пустой конверт отодвигается к стене. ──
  const spill = () => {
    if (opened) return;
    setOpened(true);
    onOpened();
    const items = contents.map((id) => ({ id, kind: materials.get(id)?.kind ?? 'sheet' }));
    const laid = scatter(
      items,
      { ...zone, blocked: [...blocked, { ...ENV_BACK, w: ENV_W, d: ENV_D }] },
      {
        x: ENV_AT.x,
        z: ENV_AT.z - 0.02,
      },
      7,
      0.14,
    );
    const now = performance.now();
    laid.forEach((pc, k) => {
      starts.current.set(pc.id, {
        pos: deskPoint(room, ENV_AT.x, ENV_AT.z, 0.012),
        at: now + 120 + k * 75,
      });
    });
    setPieces(laid);
  };

  // ── Нажали на лист. ──
  const onDown = (id: string, e: ThreeEvent<PointerEvent>) => {
    if (drag.current || flying.current.has(id)) return;
    const pc = ps.current.find((q) => q.id === id);
    if (!pc) return;
    const st: Press = {
      id,
      x0: e.clientX,
      y0: e.clientY,
      t0: performance.now(),
      whole: false,
      timer: 0,
    };
    if (stackOf(ps.current, pc.stack).length > 1)
      st.timer = window.setTimeout(() => {
        if (press.current === st && !drag.current) {
          st.whole = true;
          setCursor('grabbing');
        }
      }, HOLD_STACK_MS);
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
      else if (!st.whole && performance.now() - st.t0 < 600) onRead(id);
      setCursor(hoverId.current ? 'grab' : '');
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', up);
  };

  // ── Протяжка началась: в руке лист или вся стопка; он — поверх всего. ──
  const begin = (st: Press) => {
    clearTimeout(st.timer);
    const all = ps.current;
    const pc = all.find((q) => q.id === st.id);
    if (!pc) return;
    const group = st.whole ? stackOf(all, pc.stack) : [pc];
    const ids = group.map((q) => q.id);
    const at0 = screenToDesk(deskCam, room, st.x0, st.y0, LIFT) ?? { x: pc.x, z: pc.z };
    const rel = new Map(group.map((q) => [q.id, { x: q.x - at0.x, z: q.z - at0.z }]));
    let top = Math.max(0, ...all.map((q) => q.layer));
    const lifted = all.map((q) =>
      ids.includes(q.id) ? { ...q, layer: ++top, stack: st.whole ? q.stack : q.id } : q,
    );
    drag.current = {
      ids,
      grab: pc.id,
      whole: st.whole,
      rel,
      orig: all,
      at: new Map(),
      wall: null,
      forbidden: false,
      vx: 0,
      vz: 0,
      last: null,
    };
    fanStack.current = null;
    setPieces(lifted);
  };

  // ── Отпустили. ──
  const drop = () => {
    const d = drag.current;
    drag.current = null;
    if (!d) return;
    if (d.wall) {
      sendToWall(d.ids);
      return;
    }
    if (d.forbidden || !d.at.size) {
      // Сюда нельзя (вещь следователя, край) — всё на прежние места.
      setPieces(d.orig);
      return;
    }
    const all = ps.current;
    const skip = new Set(d.ids);
    let moved = all.map((q) => {
      const a = d.at.get(q.id);
      return a ? { ...q, x: a.x, z: a.z } : q;
    });
    const grabbed = moved.find((q) => q.id === d.grab);
    const under = grabbed ? topAt(moved, grabbed.x, grabbed.z, skip) : null;
    const r = rand.current;
    if (grabbed && under) {
      // Бросили на лист — ложится на него, чуть вразнобой (стопка).
      const tx = under.x + (r() - 0.5) * 0.014 - grabbed.x;
      const tz = under.z + (r() - 0.5) * 0.014 - grabbed.z;
      const dr = under.rot + (r() - 0.5) * 0.07 - grabbed.rot;
      const c = Math.cos(dr);
      const s = Math.sin(dr);
      const snapped = moved.map((q) => {
        if (!skip.has(q.id)) return q;
        const ox = q.x - grabbed.x;
        const oz = q.z - grabbed.z;
        return {
          ...q,
          x: grabbed.x + tx + ox * c + oz * s,
          z: grabbed.z + tz - ox * s + oz * c,
          rot: q.rot + dr,
          stack: under.stack,
        };
      });
      if (snapped.filter((q) => skip.has(q.id)).every((q) => allowed(q, zone))) moved = snapped;
    } else {
      // На свободное место — с маленьким поворотом, как ложится бумага.
      const jr = (r() - 0.5) * 0.05;
      moved = moved.map((q) => (skip.has(q.id) ? { ...q, rot: q.rot + jr } : q));
    }
    setPieces(moved);
  };

  // ── WL-A: на стену — каждый лист в своё место группы конверта; долетел — карточка на доске. ──
  const sendToWall = (ids: string[]) => {
    const now = performance.now();
    // Сверху вниз: первым — верхний лист.
    const order = [...ids].reverse();
    order.forEach((id, k) => {
      flying.current.set(id, { slot: nextSlot.current++, since: now + k * 70 });
    });
    setTick((t) => t + 1);
  };

  // ── Наведение: подсветка, стопка — веер. ──
  const onOver = (id: string) => {
    if (drag.current) return;
    hoverId.current = id;
    if (!press.current) setCursor('grab');
    clearTimeout(timers.current.unfan);
    const pc = ps.current.find((q) => q.id === id);
    if (!pc || fanStack.current === pc.stack) return;
    clearTimeout(timers.current.fan);
    if (stackOf(ps.current, pc.stack).length > 1)
      timers.current.fan = window.setTimeout(() => {
        if (hoverId.current === id && !drag.current) fanStack.current = pc.stack;
      }, 200);
    else fanStack.current = null;
  };
  const onOut = (id: string) => {
    if (hoverId.current === id) hoverId.current = null;
    if (!press.current && !drag.current) setCursor('');
    clearTimeout(timers.current.fan);
    clearTimeout(timers.current.unfan);
    timers.current.unfan = window.setTimeout(() => {
      const h = hoverId.current ? ps.current.find((q) => q.id === hoverId.current) : null;
      if (!h || h.stack !== fanStack.current) fanStack.current = null;
    }, 260);
  };

  useEffect(
    () => () => {
      clearTimeout(timers.current.fan);
      clearTimeout(timers.current.unfan);
    },
    [],
  );

  // Для автотестов и снимков: где на экране клапан конверта и листы (вид «Стол»).
  useEffect(() => {
    const at = (x: number, z: number, h = 0) => {
      const v = deskPoint(room, x, z, h).project(deskCam);
      return { x: ((v.x + 1) / 2) * room.vp.width, y: ((1 - v.y) / 2) * room.vp.height };
    };
    (window as unknown as { __proto?: unknown }).__proto = {
      // Клапан — чуть дальше центра конверта, к стене (там его кончик с печатью).
      flap: () => at(ENV_AT.x, ENV_AT.z - 0.04, 0.003),
      piece: (id: string) => {
        const pc = ps.current.find((q) => q.id === id);
        return pc ? at(pc.x, pc.z, (hCache.current.h.get(id) ?? 0) + pc.t) : null;
      },
      pieces: () => ps.current.map((q) => ({ id: q.id, stack: q.stack, x: q.x, z: q.z })),
      board: (bx: number, by: number) => {
        const v = boardPoint(room, bx, by).project(deskCam);
        return { x: ((v.x + 1) / 2) * room.vp.width, y: ((1 - v.y) / 2) * room.vp.height };
      },
    };
  }, [room, deskCam]);

  // ── Кадр: камера, затем цель каждого листа. ──
  const hCache = useRef<{ key: Piece[] | null; drag: string; h: Map<string, number> }>({
    key: null,
    drag: '',
    h: new Map(),
  });
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

    // Конверт: опечатан — на месте; вскрыт — отъехал к стене.
    if (env.current) {
      const at = opened ? ENV_BACK : ENV_AT;
      const s = (ENV_W * p) / 3;
      const want = deskPoint(room, at.x, at.z, 0.0155 * (s / p) + 0.0005);
      // Лицом вверх, клапан — к стене; повёрнут вокруг вертикали на rot.
      const want_q = new Quaternion().setFromEuler(new Euler(-Math.PI / 2, at.rot, 0, 'YXZ'));
      const k = envPlaced.current ? 1 - Math.exp(-dt * 6) : 1;
      envPlaced.current = true;
      env.current.position.lerp(want, k);
      env.current.quaternion.slerp(want_q, k);
      env.current.scale.setScalar(s);
    }

    // Протяжка: где мышь на столе, не над стеной ли, можно ли сюда.
    if (d) {
      const m = pointer.current;
      const floor = screenToDesk(deskCam, room, m.x, m.y, 0);
      const board =
        !floor || floor.z < 0 ? screenToBoard({ x: m.x, y: m.y }, room.poses.desk, room) : null;
      d.wall = board;
      const pt = screenToDesk(deskCam, room, m.x, m.y, d.forbidden ? LIFT_BAD : LIFT);
      if (pt && !board) {
        if (d.last) {
          const k = 1 - Math.exp(-dt * 14);
          d.vx += ((pt.x - d.last.x) / dt - d.vx) * k;
          d.vz += ((pt.z - d.last.z) / dt - d.vz) * k;
        }
        d.last = pt;
        let bad = false;
        for (const id of d.ids) {
          const pc = all.find((q) => q.id === id);
          const rel = d.rel.get(id);
          if (!pc || !rel) continue;
          const x = pt.x + rel.x;
          const z = pt.z + rel.z;
          d.at.set(id, { x, z });
          if (!allowed({ ...pc, x, z }, zone)) bad = true;
        }
        d.forbidden = bad;
      } else {
        d.vx *= 0.8;
        d.vz *= 0.8;
      }
    }

    const now = performance.now();
    const fan = fanStack.current;
    const fanList = fan ? stackOf(all, fan) : [];
    for (const pc of all) {
      const t = target(pc.id);
      t.hover = !d && hoverId.current === pc.id;
      const fly = flying.current.get(pc.id);
      if (fly) {
        if (now < fly.since) continue;
        const at = slotCenter(room.vp, fly.slot);
        onWall(t, pc, at.x, at.y, 3);
        t.stiff = 140;
        t.damp = 1;
        continue;
      }
      if (d?.ids.includes(pc.id)) {
        const k = d.ids.indexOf(pc.id);
        t.stiff = 900;
        t.damp = 0.95;
        if (d.wall) {
          // Над стеной: лист встаёт к доске у мыши (стопкой — чуть вразбежку).
          const n = d.ids.length - 1 - k;
          onWall(t, pc, d.wall.x + n * 5, d.wall.y + n * 5, 40 + k * 1.5);
          continue;
        }
        const a = d.at.get(pc.id) ?? { x: pc.x, z: pc.z };
        const lift = (d.forbidden ? LIFT_BAD : LIFT) + k * (pc.t + 0.002);
        // Наклон за рукой: тянут вправо — правый край чуть вниз.
        const tz = Math.max(-0.2, Math.min(0.2, -d.vx * 0.35));
        const tx = Math.max(-0.2, Math.min(0.2, d.vz * 0.35));
        onDesk(t, a.x, a.z, lift + pc.t / 2, pc.rot, tx, tz);
        t.forbidden = d.forbidden;
        continue;
      }
      let { x, z, rot } = pc;
      let h = hc.h.get(pc.id) ?? 0;
      const depth = fan ? fanList.length - 1 - fanList.findIndex((q) => q.id === pc.id) : 0;
      if (fan === pc.stack && fanList.length > 1 && depth > 0) {
        const c = Math.cos(pc.rot);
        const s = Math.sin(pc.rot);
        // Сдвиг — в осях самого листа: к его верхней кромке (к стене) и чуть вбок.
        const u = depth * FAN_DX;
        const v = -depth * FAN_DZ;
        x += u * c + v * s;
        z += -u * s + v * c;
        rot += depth * FAN_ROT;
      }
      if (t.hover) h += 0.004;
      if (press.current?.whole && pc.stack === all.find((q) => q.id === press.current?.id)?.stack)
        h += 0.012;
      onDesk(t, x, z, h + pc.t / 2, rot);
      t.stiff = 260;
      t.damp = 0.6;
      t.forbidden = false;
    }

    // Долетели до стены — карточки на доске, листы со стола убраны.
    const arrived: string[] = [];
    for (const [id, f] of flying.current) {
      if (now - f.since > 750) arrived.push(id);
    }
    if (arrived.length) {
      for (const id of arrived) {
        const f = flying.current.get(id);
        flying.current.delete(id);
        targets.current.delete(id);
        if (f) onArrive(id, f.slot);
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
      <group ref={env} name="envelope">
        <Envelope title={envelopeTitle} items={envItems} onOpen={spill} />
      </group>
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
