import type { DeskItem } from '@bunker/shared';
import { type ThreeEvent, useFrame, useThree } from '@react-three/fiber';
import { type RefObject, useEffect, useMemo, useRef, useState } from 'react';
import { Euler, PerspectiveCamera, Quaternion, Vector3 } from 'three';
import { BOARD_SCALE, type Pose, type Room } from '../room/camera.ts';
import type { DeskObject } from '../room/decor.ts';
import { footprints } from './Occluders.tsx';
import { Paper, type PaperTarget } from './Paper.tsx';
import {
  boardPoint,
  deskPoint,
  deskToScreen,
  screenToDesk,
  screenToWall,
  syncCamera,
} from './space.ts';
import {
  allowed,
  drapes,
  heights,
  nearestFree,
  overlap,
  type Piece,
  pileOf,
  plan,
  type Rect,
  scatter,
  sizeOf,
  topAt,
  type Zone,
} from './world.ts';

/**
 * 3D-стол игры (прототип автора 23.11, в игре с 24.11): листы и изъятые устройства, что лежат на
 * столе свободно (`PlayerState.desk`). Каждый кадр каждой вещи говорится, где ей быть (на столе, в
 * руке, у стены, в полёте). Комната и вещи следователя нарисованы игрой (`room/decor.ts`); здесь
 * они — невидимые преграды и заслонки (`Occluders`).
 *
 * Жесты — мышью по самим вещам (решения автора 23–24.11, `game/docs/DECISIONS.md`, DK-…):
 * - вещь: взял — чуть приподнята и плавно идёт над стопками, ни во что не врезаясь; кладётся там,
 *   где отпустили; на устройство лист ложится и полого прогибается по нему (DV-H);
 * - вещь не уходит со стола и не проходит сквозь вещи следователя: упёрлась — скользит вдоль;
 * - навести — чуть подсвечена; зажать и подержать — вместе со всем, что лежит на ней;
 * - щелчок — прочитать (лист) или взять в руки (устройство);
 * - дотащить за задний край стола (WL-A) — встаёт карточкой к доске; отпустить — висит там.
 */

export interface DeskMaterial {
  title: string;
  kind: string;
  body: string;
}

/** Подъём вещи в руке над тем, что под ней, м: чуть-чуть — видно, что взята (автор 23.11). */
const LIFT = 0.02;
/** Нижняя доля промежутка «задний край стола — низ доски», которая ещё считается столом. */
const DESK_SAFE = 0.2;
/** Запас на обратный путь у той же черты, px экрана: чтобы у черты не дёргалось. */
const WALL_HYST = 6;
/** Скорость перехода стол ↔ стена, 1/с (≈ 0,2 с, сразу с места). */
const WALL_RATE = 15;
/** Сколько держать, чтобы взять вместе с тем, что лежит сверху, мс. */
const HOLD_PILE_MS = 500;
/** Порог протяжки, px. */
const DRAG_PX = 4;
/** Полёт со стола на доску, мс: потом карточка — на стене игры. */
const FLY_MS = 750;
/** DV-H (автор 24.11 — в игру): лист ложится на устройство и полого прогибается по нему. */
const DRAPE = true;

/** Изъятые устройства на столе — формы без экранов (DESK_DEVICES). */
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
  /** Последняя точка доски под мышью — к ней уходит и от неё возвращается. */
  lastWall: { x: number; y: number } | null;
  /** Насколько вещь «на стене»: 0 — в руке над столом, 1 — у доски; меняется плавно. */
  w: number;
  vx: number;
  vz: number;
  /** Устройства, которых взятая вещь касалась в начале (лист под телефоном): не мешают, пока касается. */
  pass: Set<string>;
  /** Можно ли стоять со сдвигом — запомнено на эту протяжку (поиск пути проверяет много мест). */
  cache: Map<string, boolean>;
  cacheKey: string;
}

interface Press {
  id: string;
  x0: number;
  y0: number;
  t0: number;
  pile: boolean;
  timer: number;
}

/** Карточка на доске: размер и место — в px доски (как у DOM-стены на виде «Стол»). */
export interface WallFit {
  /** Ширина карточки на доске, px. */
  cardW: number;
  /** Точка под мышью → середина карточки, целиком на пробке. */
  fit: (x: number, y: number) => { x: number; y: number };
}

export function Desk({
  room,
  pose,
  objects,
  materials,
  items,
  spillFrom,
  wallFit,
  onRead,
  onSave,
  onHang,
  pointer,
  cursorEl,
}: {
  room: Room;
  pose: RefObject<Pose>;
  /** Вещи следователя (нарисованы игрой): преграды. */
  objects: DeskObject[];
  materials: Map<string, DeskMaterial>;
  /** Что лежит на столе (сохранение игрока); без места — только что высыпано. */
  items: readonly DeskItem[];
  /** Откуда высыпается то, у чего ещё нет места (конверт на столе), м. */
  spillFrom: (id: string) => { x: number; z: number } | null;
  wallFit: RefObject<WallFit>;
  onRead: (id: string) => void;
  /** Раскладка стола изменилась (положили, высыпали): сохранить. */
  onSave: (items: DeskItem[]) => void;
  /** Вещь долетела до доски: повесить на стену игры в эту точку (px доски, середина карточки). */
  onHang: (id: string, at: { x: number; y: number }) => void;
  /** Мышь в координатах экрана — её ведёт страница (протяжка идёт и за край холста). */
  pointer: RefObject<{ x: number; y: number }>;
  /** На чём показывать курсор «взять» (холст мышь не ловит — события идут через сцену). */
  cursorEl: RefObject<HTMLElement | null>;
}) {
  const { camera } = useThree();
  const { p } = room;
  // Камера стола — для зоны и протяжки (в покое у стола камера в этой позе).
  const deskCam = useMemo(() => {
    const c = new PerspectiveCamera();
    syncCamera(c, room.poses.desk, room);
    return c;
  }, [room]);

  const [pieces, setPieces] = useState<Piece[]>([]);
  const ps = useRef<Piece[]>([]);
  ps.current = pieces;
  const targets = useRef(new Map<string, PaperTarget>());
  const starts = useRef(new Map<string, { pos: Vector3; at: number }>());
  const drag = useRef<Drag | null>(null);
  const press = useRef<Press | null>(null);
  const hoverId = useRef<string | null>(null);
  const flying = useRef(new Map<string, { x: number; y: number; since: number }>());
  const [, setTick] = useState(0);

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

  const kindOf = (id: string) => DEVICE_KIND[id] ?? materials.get(id)?.kind ?? 'sheet';
  const save = (list: readonly Piece[]) =>
    onSave(list.map((q) => ({ id: q.id, x: q.x, z: q.z, rot: q.rot, layer: q.layer })));

  // ── Сохранение → стол: что лежит, где; без места — высыпать у конверта. ──
  // biome-ignore lint/correctness/useExhaustiveDependencies: пересчёт — только когда сменился стол игрока
  useEffect(() => {
    const d = drag.current;
    const mine = new Map(ps.current.map((q) => [q.id, q]));
    const busy = (id: string) => !!d?.ids.includes(id) || flying.current.has(id);
    const placed: Piece[] = [];
    const fresh: DeskItem[] = [];
    for (const it of items) {
      const own = mine.get(it.id);
      if (own && busy(it.id)) placed.push(own);
      else if (it.x === undefined || it.z === undefined) fresh.push(it);
      else {
        const kind = kindOf(it.id);
        const [w, dd, t] = sizeOf(kind);
        placed.push({
          id: it.id,
          kind,
          w,
          d: dd,
          t,
          x: it.x,
          z: it.z,
          rot: it.rot ?? 0,
          layer: it.layer,
          stack: own?.stack ?? it.id,
        });
      }
    }
    // Летящие на стену — до прилёта на столе (в сохранении их уже может не быть).
    for (const id of flying.current.keys()) {
      const own = mine.get(id);
      if (own && !placed.some((q) => q.id === id)) placed.push(own);
    }
    let next = placed;
    if (fresh.length) {
      const now = performance.now();
      const from = spillFrom(fresh[0]?.id ?? '') ?? { x: 0, z: 0.45 };
      const laid = scatter(
        fresh.map((it) => ({ id: it.id, kind: kindOf(it.id) })),
        zone,
        { x: from.x, z: from.z - 0.05 },
        7,
        0.12,
        placed,
      ).map((q, k) => ({ ...q, layer: fresh[k]?.layer ?? q.layer }));
      laid.forEach((q, k) => {
        starts.current.set(q.id, { pos: deskPoint(room, from.x, from.z, 0.012), at: now + k * 60 });
      });
      next = [...placed, ...laid];
      save(next);
    }
    ps.current = next;
    setPieces(next);
  }, [items]);

  const setCursor = (c: string) => {
    if (cursorEl.current) cursorEl.current.style.cursor = c;
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
        minY: Number.NEGATIVE_INFINITY,
        cur: new Vector3(),
        onDesk: true,
        drape: null,
        floorY: -room.deskY,
        mode: 'rest',
        carry: 0,
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
    t.scale = (wallFit.current.cardW * BOARD_SCALE) / (piece.w * p);
    t.noShadow = true;
  };

  /**
   * Новый порядок укладки — сразу и в кадре: иначе один кадр «что под чем» считается по старому
   * порядку, и взятая вещь на миг врезается в соседнюю.
   */
  const relayer = (all: Piece[], layer: Map<string, number>) => {
    const next = all.map((q) => ({ ...q, layer: layer.get(q.id) ?? q.layer }));
    ps.current = next;
    setPieces(next);
  };

  // ── Нажали на вещь. ──
  const onDown = (id: string, e: ThreeEvent<PointerEvent>) => {
    if (e.button !== 0 || drag.current || flying.current.has(id)) return;
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
    // Взял — всегда сверху всего (автор 23.11: «под низ положить нельзя»).
    let top = Math.max(0, ...all.map((q) => q.layer));
    const layer = new Map(ids.map((id) => [id, ++top]));
    drag.current = {
      ids,
      base: new Map(group.map((q) => [q.id, { x: q.x, z: q.z }])),
      grab0,
      off: { x: 0, z: 0 },
      wall: null,
      lastWall: null,
      w: 0,
      vx: 0,
      vz: 0,
      cache: new Map(),
      cacheKey: '',
      pass: new Set(
        all
          .filter((q) => DEVICE_KIND[q.id] && !ids.includes(q.id))
          .filter((q) => group.some((g) => overlap(g, q)))
          .map((q) => q.id),
      ),
    };
    relayer(all, layer);
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
    // На устройство не кладут устройство — отпустили на нём, встаёт на ближнее свободное место.
    const all = ps.current;
    const rects = all
      .filter((q) => d.base.has(q.id))
      .map((q) => {
        const b = d.base.get(q.id) ?? q;
        return { ...q, x: b.x + d.off.x, z: b.z + d.off.z };
      });
    const carries = [...d.base.keys()].some((id) => DEVICE_KIND[id]);
    const devices =
      DRAPE && !carries ? [] : all.filter((q) => DEVICE_KIND[q.id] && !d.base.has(q.id));
    const fix = nearestFree(rects, { inside: zone.inside, blocked: [...zone.blocked, ...devices] });
    const fx = fix?.dx ?? 0;
    const fz = fix?.dz ?? 0;
    const next = all.map((q) => {
      const b = d.base.get(q.id);
      return b ? { ...q, x: b.x + d.off.x + fx, z: b.z + d.off.z + fz } : q;
    });
    ps.current = next;
    setPieces(next);
    save(next);
  };

  // ── WL-A: на стену — туда, где отпустили; несколько — чуть вразбежку. ──
  const sendToWall = (ids: string[], at: { x: number; y: number }) => {
    const now = performance.now();
    // Сверху вниз: первым — верхний.
    [...ids].reverse().forEach((id, k) => {
      const { x, y } = wallFit.current.fit(at.x + k * 16, at.y + k * 12);
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

  const hCache = useRef<{
    key: Piece[] | null;
    drag: string;
    h: Map<string, number>;
    d: Map<string, Float32Array>;
  }>({
    key: null,
    drag: '',
    h: new Map(),
    d: new Map(),
  });

  // Для автотестов: где на экране вещи стола (вид «Стол»).
  useEffect(() => {
    const at = (x: number, z: number, h = 0) => {
      const v = deskPoint(room, x, z, h).project(deskCam);
      return { x: ((v.x + 1) / 2) * room.vp.width, y: ((1 - v.y) / 2) * room.vp.height };
    };
    const w = window as unknown as { __desk?: unknown };
    w.__desk = {
      // Видимая точка вещи: её часть, которую ничего не накрывает (на столе внахлёст).
      grab: (id: string) => {
        const pc = ps.current.find((q) => q.id === id);
        if (!pc) return null;
        const c = Math.cos(pc.rot);
        const sn = Math.sin(pc.rot);
        const pts: [number, number][] = [[0, 0]];
        for (let a = -0.45; a <= 0.451; a += 0.15)
          for (let b = -0.45; b <= 0.451; b += 0.15) pts.push([a, b]);
        let best: { x: number; z: number; far: number } | null = null;
        for (const [u, v] of pts) {
          const x = pc.x + u * pc.w * c + v * pc.d * sn;
          const z = pc.z - u * pc.w * sn + v * pc.d * c;
          if (topAt(ps.current, x, z)?.id !== id) continue;
          const far = Math.min(
            1,
            ...ps.current.filter((q) => q.id !== id).map((q) => Math.hypot(q.x - x, q.z - z)),
          );
          if (!best || far > best.far) best = { x, z, far };
        }
        return best ? at(best.x, best.z, (hCache.current.h.get(id) ?? 0) + pc.t) : null;
      },
      desk: (x: number, z: number) => at(x, z),
      pieces: () =>
        ps.current.map((q) => ({ id: q.id, x: q.x, z: q.z, w: q.w, d: q.d, rot: q.rot })),
      blocked: () => blocked,
      board: (bx: number, by: number) => {
        const v = boardPoint(room, bx, by).project(deskCam);
        return { x: ((v.x + 1) / 2) * room.vp.width, y: ((1 - v.y) / 2) * room.vp.height };
      },
    };
    return () => {
      w.__desk = undefined;
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
      const list = d ? all.filter((q) => !d.ids.includes(q.id)) : all;
      // DV-H: лист над устройством лежит на своей высоте (по бумагам), а по устройству прогибается.
      const over = DRAPE
        ? (up: Piece, low: Piece) => !DEVICE_KIND[up.id] && !!DEVICE_KIND[low.id]
        : undefined;
      hc.h = heights(list, over);
      hc.d = DRAPE ? drapes(list, hc.h, (q) => !DEVICE_KIND[q.id]) : new Map();
    }

    // Протяжка: вещь идёт за мышью, но только по зоне — упёрлась, скользит вдоль.
    if (d) {
      const m = pointer.current;
      const floor = screenToDesk(deskCam, room, m.x, m.y, 0);
      // Точка стены под мышью — и в промежутке между столом и доской (к доске её прижмёт fit).
      const bp = screenToWall(deskCam, room, m.x, m.y);
      if (bp) d.lastWall = bp;
      // Стол ↔ стена (автор 24.11): на стену — как только мышь ушла за задний край стола выше
      // нижней доли DESK_SAFE промежутка «край стола — низ доски»; эта доля — ещё стол. Назад —
      // ниже той же черты на WALL_HYST px, чтобы у черты не дёргалось.
      let line = Number.POSITIVE_INFINITY; // стол не под мышью — уже стена
      if (floor) {
        const edge = deskToScreen(deskCam, room, floor.x, 0).y;
        const bottom = bp ? boardPoint(room, bp.x, room.vp.height).project(deskCam) : null;
        const bottomY = bottom ? ((1 - bottom.y) / 2) * room.vp.height : edge;
        line = edge - DESK_SAFE * Math.max(0, edge - bottomY);
      }
      if (!d.wall && m.y < line && bp) d.wall = bp;
      else if (d.wall && m.y > line + WALL_HYST) d.wall = null;
      else if (d.wall) d.wall = bp ?? d.lastWall;
      // Переход плавный и лёгкий: сразу с места и мягко в конце (автор 24.11).
      const goal = d.wall ? 1 : 0;
      d.w += (goal - d.w) * (1 - Math.exp(-dt * WALL_RATE));
      if (Math.abs(goal - d.w) < 0.002) d.w = goal;
      const pt = d.wall ? null : screenToDesk(deskCam, room, m.x, m.y, LIFT);
      if (pt) {
        const rects = d.ids.flatMap((id) => {
          const pc = all.find((q) => q.id === id);
          const b = d.base.get(id);
          return pc && b ? [{ ...pc, x: b.x + d.off.x, z: b.z + d.off.z }] : [];
        });
        const want = { x: pt.x - d.grab0.x, z: pt.z - d.grab0.z };
        // Край стола, вещи следователя и устройства — не пройти: путь к мыши — в обход; над
        // бумагами — проходит. DV-H: лист (без устройств в руке) ложится и на устройства.
        const carriesDevice = d.ids.some((id) => DEVICE_KIND[id]);
        const devices =
          DRAPE && !carriesDevice
            ? []
            : all.filter((q) => DEVICE_KIND[q.id] && !d.ids.includes(q.id));
        for (const id of d.pass)
          if (!devices.some((q) => q.id === id && rects.some((r) => overlap(r, q))))
            d.pass.delete(id);
        const obstacles = devices.filter((q) => !d.pass.has(q.id));
        const ck = obstacles.map((q) => q.id).join(',');
        if (d.cacheKey !== ck) {
          d.cache = new Map();
          d.cacheKey = ck;
        }
        const full: Zone = { inside: zone.inside, blocked: [...zone.blocked, ...obstacles] };
        const base = rects.map((r) => ({ ...r, x: r.x - d.off.x, z: r.z - d.off.z }));
        const cache = d.cache;
        const ok = (ox: number, oz: number) => {
          const key = `${Math.round(ox * 2000)},${Math.round(oz * 2000)}`;
          let v = cache.get(key);
          if (v === undefined) {
            v = base.every((r) => allowed({ ...r, x: r.x + ox, z: r.z + oz }, full));
            cache.set(key, v);
          }
          return v;
        };
        const next = plan(ok, d.off, want, {
          // В обход — не быстрее мыши плюс 2 см за кадр (угол — за несколько кадров).
          maxPath: Math.hypot(want.x - d.off.x, want.z - d.off.z) + 0.02,
        });
        const mv = { dx: next.x - d.off.x, dz: next.z - d.off.z };
        d.off = next;
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
    const deskY3 = -room.deskY;
    const onDeskNow = all.filter(
      (q) => !flying.current.has(q.id) && !(d?.wall && d.ids.includes(q.id)),
    );
    const rectNow = (q: Piece) => {
      const c = targets.current.get(q.id)?.cur;
      return c ? { ...q, x: c.x / p, z: c.z / p } : q;
    };
    const bottomNow = (q: Piece) => {
      const c = targets.current.get(q.id)?.cur;
      return c ? (c.y - deskY3) / p - q.t / 2 : 0;
    };
    // На чём лежит (или над чем идёт) вещь в этом месте: верх всего, что под ней ниже по порядку.
    const support = (q: Piece, r: Rect, papersOnly = false) => {
      let top = 0;
      for (const o of onDeskNow)
        if (
          o !== q &&
          o.layer < q.layer &&
          !(papersOnly && DEVICE_KIND[o.id]) &&
          overlap(r, rectNow(o))
        )
          top = Math.max(top, bottomNow(o) + o.t);
      return top;
    };
    for (const pc of all) {
      const t = target(pc.id);
      t.forbidden = false;
      t.minY = Number.NEGATIVE_INFINITY;
      t.hover = !d && (hoverId.current === pc.id || pile.includes(pc.id));
      const fly = flying.current.get(pc.id);
      if (fly) {
        if (now < fly.since) continue;
        onWall(t, pc, fly.x, fly.y, 3);
        t.mode = 'air';
        t.stiff = 140;
        t.damp = 1;
        continue;
      }
      if (d?.ids.includes(pc.id)) {
        const k = d.ids.indexOf(pc.id);
        t.stiff = 900;
        t.damp = 1;
        const b = d.base.get(pc.id) ?? { x: pc.x, z: pc.z };
        const x = b.x + d.off.x;
        const z = b.z + d.off.z;
        t.mode = 'hand';
        const here = { ...pc, x, z };
        // Смотрит вперёд — только туда, куда её несут: поднимается заранее.
        const sp = Math.hypot(d.vx, d.vz);
        const lead = Math.min(0.16, sp * 0.18);
        let under = support(pc, here);
        if (sp > 0.02)
          for (const f of [0.35, 0.7, 1])
            under = Math.max(
              under,
              support(
                pc,
                { ...here, x: x + (d.vx / sp) * lead * f, z: z + (d.vz / sp) * lead * f },
                !(DRAPE && !DEVICE_KIND[pc.id]),
              ),
            );
        const h = under + LIFT;
        onDesk(t, x, z, h + pc.t / 2, pc.rot);
        t.drape = null;
        t.floorY = deskY3 + support(pc, rectNow(pc), true) * p;
        t.carry = d.w;
        const wa = d.wall ?? d.lastWall;
        if (d.w > 0.001 && wa) {
          // Между столом и доской — смесь двух положений; лицом к себе, вертикально, как карточка
          // доски (автор 24.11: «видеть, куда кладу»); тень гаснет так же плавно.
          const n = d.ids.length - 1 - k;
          const deskPos = t.pos.clone();
          const deskQuat = t.quat.clone();
          const at = wallFit.current.fit(wa.x + n * 16, wa.y + n * 12);
          onWall(t, pc, at.x, at.y, 40 + k * 1.5);
          t.noShadow = false;
          t.pos.lerpVectors(deskPos, t.pos, d.w);
          t.quat.copy(deskQuat.slerp(t.quat, d.w));
          t.scale = 1 + (t.scale - 1) * d.w;
        }
        continue;
      }
      t.carry = 0;
      onDesk(t, pc.x, pc.z, (hc.h.get(pc.id) ?? 0) + pc.t / 2, pc.rot);
      t.mode = 'rest';
      t.drape = hc.d.get(pc.id) ?? null;
      const under = support(pc, rectNow(pc), DRAPE && !DEVICE_KIND[pc.id]);
      t.minY = deskY3 + (under + pc.t / 2) * p;
      t.floorY = deskY3 + under * p;
      t.stiff = 300;
      t.damp = 1;
    }

    // Долетели до стены — карточки на стене игры, вещи со стола убраны.
    const arrived: string[] = [];
    for (const [id, f] of flying.current) if (now - f.since > FLY_MS) arrived.push(id);
    if (arrived.length) {
      for (const id of arrived) {
        const f = flying.current.get(id);
        flying.current.delete(id);
        targets.current.delete(id);
        if (f) onHang(id, { x: f.x, y: f.y });
      }
      const next = ps.current.filter((q) => !arrived.includes(q.id));
      ps.current = next;
      setPieces(next);
    }
  });

  return (
    <>
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
