import { type ThreeEvent, useFrame, useThree } from '@react-three/fiber';
import { type RefObject, useEffect, useMemo, useRef, useState } from 'react';
import { Euler, type Group, PerspectiveCamera, Quaternion, Vector3 } from 'three';
import { Envelope } from '../hold/shapes.tsx';
import { BOARD_SCALE, type Pose, type Room, screenToBoard } from '../room/camera.ts';
import type { DeskObject } from '../room/decor.ts';
import { cardH, cardW } from './Board.tsx';
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
  topAt,
  type Zone,
} from './deskWorld.ts';
import { Paper, type PaperTarget } from './Paper.tsx';
import { footprints, Room3D } from './Room3D.tsx';
import { boardPoint, deskPoint, deskToScreen, screenToDesk, syncCamera } from './space.ts';

/**
 * Прототип 3D-стола: стол целиком — комната, вещи следователя, конверт, бумаги и изъятые
 * устройства. Каждый кадр каждой вещи говорится, где ей быть (на столе, в руке, у стены, в полёте).
 *
 * Жесты — мышью по самим вещам (правки автора 23.11 после первого прогона):
 * - конверт: потянуть клапан вверх — вскрыт, содержимое на столе, пустой конверт убран;
 * - вещь: взял — чуть приподнята и плавно идёт над стопками и устройствами (поднимается заранее,
 *   глядя вперёд по пути — без скачков), ни во что не врезаясь; кладётся там, где отпустили;
 *   опускается с настоящим ускорением, без отскока;
 * - лист из-под стопки: выезжает снизу, стопка стоит; вышел — стопка оседает (быстро, как вес),
 *   лист плавно поднимается;
 * - устройство (телефон, ручка, камера): на него ничего не кладут — ни лист, ни другое устройство;
 *   нести над ним можно, отпустили на нём — вещь плавно встаёт рядом, с ближней стороны; само оно на
 *   бумаги ложится (как пресс-папье) (DV-B);
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

/** Подъём вещи в руке над тем, что под ней, м: чуть-чуть — видно, что взята (автор 23.11). */
const LIFT = 0.02;
/** Запас у заднего края стола, м: на стену — дальше края на столько, назад — ближе на столько. */
const WALL_BAND = 0.02;
/** Жёсткость перехода стол ↔ стена (≈ треть секунды, без отскока). */
const WALL_K = 120;
/** Сколько держать, чтобы взять вместе с тем, что лежит сверху, мс. */
const HOLD_PILE_MS = 500;
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
  /** Последняя точка доски под мышью — к ней уходит и от неё возвращается. */
  lastWall: { x: number; y: number } | null;
  /** Насколько вещь «на стене»: 0 — в руке над столом, 1 — у доски; меняется плавно. */
  w: number;
  wv: number;
  vx: number;
  vz: number;
  /** Как обходит устройство (помнится между кадрами). */
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
  drape,
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
  /**
   * DV-H (автор 23.11: «попробуем — сверху и немного огибает»): лист можно положить на устройство —
   * он ложится и полого прогибается по нему. Нет — DV-B: лист объезжает устройство.
   */
  drape: boolean;
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
    // Взял — всегда сверху всего (автор 23.11: «под низ положить нельзя»): в руке рисуется поверх
    // соседних, поднимается плавно — стопка под ним не шевелится.
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
      wv: 0,
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
    // DV-B: на устройство не кладут — отпустили на нём, вещь встаёт на ближнее свободное место.
    // (Лист, отпущенный ещё под стопкой, так под ней и остаётся.)
    const all = ps.current;
    const rects = all
      .filter((q) => d.base.has(q.id))
      .map((q) => {
        const b = d.base.get(q.id) ?? q;
        return { ...q, x: b.x + d.off.x, z: b.z + d.off.z };
      });
    const carries = [...d.base.keys()].some((id) => DEVICE_KIND[id]);
    const devices =
      drape && !carries ? [] : all.filter((q) => DEVICE_KIND[q.id] && !d.base.has(q.id));
    const fix = nearestFree(rects, { inside: zone.inside, blocked: [...zone.blocked, ...devices] });
    const fx = fix?.dx ?? 0;
    const fz = fix?.dz ?? 0;
    setPieces((cur) =>
      cur.map((q) => {
        const b = d.base.get(q.id);
        return b ? { ...q, x: b.x + d.off.x + fx, z: b.z + d.off.z + fz } : q;
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
      // Видимая точка вещи: её часть, которую ничего не накрывает (на столе внахлёст).
      grab: (id: string) => {
        const pc = ps.current.find((q) => q.id === id);
        if (!pc) return null;
        const c = Math.cos(pc.rot);
        const sn = Math.sin(pc.rot);
        const pts: [number, number][] = [[0, 0]];
        for (let a = -0.45; a <= 0.451; a += 0.15)
          for (let b = -0.45; b <= 0.451; b += 0.15) pts.push([a, b]);
        // Из видимых точек — дальняя от всех соседей (на экране устройство может её заслонить).
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
      pieces: () =>
        ps.current.map((q) => ({ id: q.id, x: q.x, z: q.z, w: q.w, d: q.d, rot: q.rot })),
      pile: (id: string) => pileOf(ps.current, id).map((q) => q.id),
      blocked: () => blocked,
      // Для проверок: положить вещь сюда, поверх всего (как будто её положили рукой).
      place: (id: string, x: number, z: number) => {
        const all = ps.current;
        const top = Math.max(0, ...all.map((q) => q.layer)) + 1;
        const next = all.map((q) => (q.id === id ? { ...q, x, z, layer: top } : q));
        ps.current = next;
        setPieces(next);
      },
      layers: () => ps.current.map((q) => [q.id, q.layer]),
      drapeMax: (id: string) => {
        const l = hCache.current.d.get(id);
        const t = targets.current.get(id);
        return {
          calc: l ? Math.max(...l) : null,
          onTarget: t?.drape ? Math.max(...t.drape) : null,
          mode: t?.mode,
        };
      },
      // Где вещь показана сейчас (px three.js) и куда её ведут — для проверки.
      cur: (id: string) => {
        const t = targets.current.get(id);
        return t
          ? {
              cur: t.cur.toArray().map((v) => Math.round(v)),
              to: t.pos.toArray().map((v) => Math.round(v)),
              mode: t.mode,
            }
          : null;
      },
      dragOff: () => (drag.current ? { ...drag.current.off } : null),
      // Высота вещи на экране сейчас (px three.js) — для проверки плавности.
      y: (id: string) => targets.current.get(id)?.cur.y ?? null,
      // Пары вещей на столе, которые сейчас врезаются друг в друга (по показанному положению).
      intersections: () => {
        // Вещь в руке рисуется поверх соседних — её не считаем.
        const inHand = new Set(drag.current?.ids ?? []);
        const list = ps.current.filter((q) => !flying.current.has(q.id) && !inHand.has(q.id));
        const out: string[] = [];
        for (let i = 0; i < list.length; i++)
          for (let j = i + 1; j < list.length; j++) {
            const a = list[i] as Piece;
            const b = list[j] as Piece;
            const ca = targets.current.get(a.id)?.cur;
            const cb = targets.current.get(b.id)?.cur;
            if (!ca || !cb) continue;
            const ra = { ...a, x: ca.x / p, z: ca.z / p };
            const rb = { ...b, x: cb.x / p, z: cb.z / p };
            if (!overlap(ra, rb, 0.004)) continue;
            // DV-H: лист над устройством прогнут по нему — не пересечение.
            if (drape && !!DEVICE_KIND[a.id] !== !!DEVICE_KIND[b.id]) continue;
            const lo = Math.max(ca.y - (a.t * p) / 2, cb.y - (b.t * p) / 2);
            const hi = Math.min(ca.y + (a.t * p) / 2, cb.y + (b.t * p) / 2);
            if (hi - lo > 0.05) out.push(`${a.id}/${b.id}`);
          }
        return out;
      },
      board: (bx: number, by: number) => {
        const v = boardPoint(room, bx, by).project(deskCam);
        return { x: ((v.x + 1) / 2) * room.vp.width, y: ((1 - v.y) / 2) * room.vp.height };
      },
    };
  }, [room, deskCam, blocked, p, drape]);

  // ── Кадр: камера, затем цель каждой вещи. ──
  useFrame((_, dtRaw) => {
    syncCamera(camera as PerspectiveCamera, pose.current, room);
    const dt = Math.max(1 / 240, Math.min(dtRaw, 1 / 30));
    const all = ps.current;
    const d = drag.current;
    const dragKey = d ? d.ids.join(',') : '';
    const hc = hCache.current;
    if (hc.key !== all || hc.drag !== `${dragKey}|${drape}`) {
      hc.key = all;
      hc.drag = `${dragKey}|${drape}`;
      const list = d ? all.filter((q) => !d.ids.includes(q.id)) : all;
      // DV-H: лист над устройством лежит на своей высоте (по бумагам), а по устройству прогибается.
      const over = drape
        ? (up: Piece, low: Piece) => !DEVICE_KIND[up.id] && !!DEVICE_KIND[low.id]
        : undefined;
      hc.h = heights(list, over);
      hc.d = drape ? drapes(list, hc.h, (q) => !DEVICE_KIND[q.id]) : new Map();
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
      const bp = screenToBoard({ x: m.x, y: m.y }, room.poses.desk, room);
      if (bp) d.lastWall = bp;
      // Стол ↔ стена — с запасом у края (автор 24.11: у края «резко туда и назад»): на стену —
      // когда мышь ушла за край стола на пару сантиметров, назад — когда вернулась на столько же.
      const fz = floor ? floor.z : Number.NEGATIVE_INFINITY;
      if (!d.wall && fz < -WALL_BAND && bp) d.wall = bp;
      else if (d.wall && fz > WALL_BAND) d.wall = null;
      else if (d.wall) d.wall = bp ?? d.lastWall;
      // И сам переход — плавный, а не скачком (без «примагничивания»).
      const goal = d.wall ? 1 : 0;
      d.wv += (WALL_K * (goal - d.w) - 2 * Math.sqrt(WALL_K) * d.wv) * dt;
      d.w += d.wv * dt;
      if (d.w < 0) d.w = d.wv = 0;
      if (d.w > 1) {
        d.w = 1;
        d.wv = 0;
      }
      const pt = d.wall ? null : screenToDesk(deskCam, room, m.x, m.y, LIFT);
      if (pt) {
        const rects = d.ids.flatMap((id) => {
          const pc = all.find((q) => q.id === id);
          const b = d.base.get(id);
          return pc && b ? [{ ...pc, x: b.x + d.off.x, z: b.z + d.off.z }] : [];
        });
        const want = { x: pt.x - d.grab0.x, z: pt.z - d.grab0.z };
        // Край стола, вещи следователя и устройства — не пройти: путь к мыши — в обход (над
        // устройством вещь не бывает, автор 23.11); над бумагами — проходит. Ближе подойти нельзя —
        // стоит, не дрожит.
        // DV-H: лист (без устройств в руке) ложится и на устройства — они ему не преграда.
        const carriesDevice = d.ids.some((id) => DEVICE_KIND[id]);
        const devices =
          drape && !carriesDevice
            ? []
            : all.filter((q) => DEVICE_KIND[q.id] && !d.ids.includes(q.id));
        // Лист, что лежал под устройством, из-под него выезжает: то устройство ему не мешает, пока касается.
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
    // Где вещь сейчас (по тому, что показано) и на какой высоте её низ, м.
    const rectNow = (q: Piece) => {
      const c = targets.current.get(q.id)?.cur;
      return c ? { ...q, x: c.x / p, z: c.z / p } : q;
    };
    const bottomNow = (q: Piece) => {
      const c = targets.current.get(q.id)?.cur;
      return c ? (c.y - deskY3) / p - q.t / 2 : 0;
    };
    // На чём лежит (или над чем идёт) вещь в этом месте: верх всего, что под ней ниже по порядку.
    // papersOnly — без устройств: на устройство вещь не заходит (обходит), над ним не поднимается.
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
        // Смотрит вперёд — только туда, куда её несут: поднимается заранее, к краю телефона или
        // стопки уже над ним; то, что сбоку, её не поднимает.
        const sp = Math.hypot(d.vx, d.vz);
        const lead = Math.min(0.16, sp * 0.18);
        let under = support(pc, here);
        if (sp > 0.02)
          for (const f of [0.35, 0.7, 1])
            under = Math.max(
              under,
              support(
                pc,
                {
                  ...here,
                  x: x + (d.vx / sp) * lead * f,
                  z: z + (d.vz / sp) * lead * f,
                },
                // Лист при DV-H идёт и над устройствами — подниматься заранее и над ними.
                !(drape && !DEVICE_KIND[pc.id]),
              ),
            );
        const h = under + LIFT;
        onDesk(t, x, z, h + pc.t / 2, pc.rot);
        t.drape = null;
        // В руке — плавно и без «пола»: она рисуется поверх соседних, рывков вверх нет.
        // Тень — на уровне бумаг: устройство и горбик над ним её сами закрывают (иначе плоская тень
        // висела на высоте устройства — «просвечивала рамку»).
        t.floorY = deskY3 + support(pc, rectNow(pc), true) * p;
        t.carry = d.w;
        const wa = d.wall ?? d.lastWall;
        if (d.w > 0.001 && wa) {
          // Между столом и доской — смесь двух положений: с края стола к доске у мыши (несколько —
          // чуть вразбежку), с наклоном и масштабом доски; тень гаснет так же плавно.
          const n = d.ids.length - 1 - k;
          const deskPos = t.pos.clone();
          const deskQuat = t.quat.clone();
          onWall(t, pc, wa.x + n * 16, wa.y + n * 12, 40 + k * 1.5);
          t.noShadow = false;
          t.pos.lerpVectors(deskPos, t.pos, d.w);
          t.quat.slerpQuaternions(deskQuat, t.quat, d.w);
          t.scale = 1 + (t.scale - 1) * d.w;
        }
        continue;
      }
      t.carry = 0;
      onDesk(t, pc.x, pc.z, (hc.h.get(pc.id) ?? 0) + pc.t / 2, pc.rot);
      t.mode = 'rest';
      t.drape = hc.d.get(pc.id) ?? null;
      // Опускается или едет на место — не ниже того, что под ней по пути (лист при DV-H — по
      // бумагам: устройство он огибает прогибом).
      const under = support(pc, rectNow(pc), drape && !DEVICE_KIND[pc.id]);
      t.minY = deskY3 + (under + pc.t / 2) * p;
      t.floorY = deskY3 + under * p;
      t.stiff = 300;
      t.damp = 1;
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
