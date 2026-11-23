import { type ThreeEvent, useFrame, useThree } from '@react-three/fiber';
import { useEffect, useMemo, useRef } from 'react';
import {
  CanvasTexture,
  DoubleSide,
  type Group,
  type Mesh,
  type MeshBasicMaterial,
  type MeshStandardMaterial,
  PlaneGeometry,
  type Quaternion,
  Vector3,
} from 'three';
import { paintTexture } from '../hold/texture.ts';
import { DRAPE_NX, DRAPE_NY, type Piece } from './deskWorld.ts';

/**
 * Прототип 3D-стола: лист (вещь из конверта) на столе. Куда ему встать, говорит `target`
 * (меняется каждый кадр без перерисовки React); лист догоняет пружиной — в руке туго, при
 * опускании — с маленьким отскоком. Тень на столе растёт и бледнеет с высотой.
 */

export interface PaperTarget {
  pos: Vector3;
  quat: Quaternion;
  scale: number;
  /** Жёсткость пружины: в руке — туго, сам — мягче (отскок). */
  stiff: number;
  /** Высота столешницы (y three.js) — для тени. */
  deskY: number;
  /** Тень красная: сюда класть нельзя. */
  forbidden: boolean;
  /** Тень не нужна (лист на стене). */
  noShadow: boolean;
  /** Подсветка края — наведение. */
  hover: boolean;
  /** Затухание пружины (доля критического): меньше 1 — отскок. */
  damp: number;
  /**
   * Ниже этого вещь не опускается (центр, y three.js): лежит не ниже того, что под ней сейчас, —
   * не врезается в листы и устройства, когда её несут, опускают или вытаскивают (автор 23.11).
   */
  minY: number;
  /** Где вещь сейчас (пишет сам лист каждый кадр) — по нему считают, что под чем. */
  cur: Vector3;
  /** Вещь показана на столе (не на стене и не в полёте к ней). */
  onDesk: boolean;
  /** Верх того, что под вещью (y three.js): на нём лежит её тень. */
  floorY: number;
  /** Прогиб листа (DV-H): подъём вершин сетки, м; null — ровный. */
  drape: Float32Array | null;
  /**
   * Как движется (автор 23.11: «резко прыгает», «стекают», «не кидаю — кладу»): `hand` — в руке,
   * пружиной и плавно по высоте; `rest` — на столе: к месту одним мягким движением с замедлением в
   * конце (кладут, а не роняют); `air` — к стене и на стене, одной пружиной.
   */
  mode: 'hand' | 'rest' | 'air';
}

/**
 * Положить: к месту одним движением с сильным замедлением в конце («быстро начать, мягко закончить»
 * — Fluent, web.dev: ease-out 200–500 мс). Длительность — по пути: короткое — 0,22 с, далёкое (из
 * конверта на стол) — до 0,45 с.
 */
const PLACE_MIN = 220;
const PLACE_MAX = 450;
const easePlace = (t: number) => 1 - (1 - t) ** 4;
/** Пружина высоты в руке: подъём на сантиметр — около десятой доли секунды, без рывка. */
const LIFT_K = 500;
/** Самая быстрая смена высоты в руке, м/с. */
const RISE = 0.12;
/** На сколько вещь в руке придвинута к камере (доля расстояния): поверх соседних, на экране — та же. */
const PULL = 0.04;

const PAPER = '#efe9dc';
/** Изъятые устройства в прототипе: цвет корпуса и верха. */
const DEVICE_LOOK: Record<string, { body: string; top: string }> = {
  mobile: { body: '#26282b', top: '#2c2f33' },
  pen: { body: '#7d8186', top: '#8c9095' },
  camera: { body: '#33363a', top: '#3a3d41' },
};
const PX = 5; // м → единицы paintTexture (680 px на единицу)

/** Текст листа без разметки — первые строки (на столе он мелкий: читают крупно, щелчком). */
function plain(body: string): string[] {
  return body
    .split('\n')
    .map((l) =>
      l
        .replace(/^#+\s*/, '')
        .replace(/[*_`>|]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim(),
    )
    .filter((l) => l && !/^-+$/.test(l));
}

function paintFace(piece: Piece, title: string, body: string): CanvasTexture {
  const disc = piece.kind === 'disc';
  const photo = piece.kind === 'photos';
  const device = DEVICE_LOOK[piece.kind];
  return paintTexture(
    piece.w * PX,
    piece.d * PX,
    device ? device.top : disc ? '#e4ddcc' : photo ? '#f6f4ef' : PAPER,
    ({ ctx, w, h, text }) => {
      const m = w * 0.08;
      ctx.fillStyle = '#1d1d1d';
      if (device) {
        if (piece.kind === 'mobile') {
          // Экран — тёмное стекло с рамкой.
          ctx.fillStyle = '#101214';
          ctx.fillRect(w * 0.08, h * 0.1, w * 0.84, h * 0.78);
        }
        if (piece.kind === 'camera') {
          // Объектив сверху.
          ctx.fillStyle = '#16181a';
          ctx.beginPath();
          ctx.arc(w * 0.62, h * 0.5, h * 0.32, 0, Math.PI * 2);
          ctx.fill();
          ctx.fillStyle = '#3a4a5a';
          ctx.beginPath();
          ctx.arc(w * 0.62, h * 0.5, h * 0.18, 0, Math.PI * 2);
          ctx.fill();
        }
        return;
      }
      if (disc) {
        // Бумажный конверт с окошком: диск виден.
        ctx.fillStyle = '#9da3a8';
        ctx.beginPath();
        ctx.arc(w / 2, h * 0.56, w * 0.3, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#e4ddcc';
        ctx.beginPath();
        ctx.arc(w / 2, h * 0.56, w * 0.05, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#1d1d1d';
        text(
          `${piece.id} · ${title}`,
          m,
          h * 0.06,
          w - 2 * m,
          '600 34px system-ui, sans-serif',
          40,
        );
        return;
      }
      if (photo) {
        ctx.fillStyle = '#3d3f42';
        ctx.fillRect(m * 0.6, m * 0.6, w - m * 1.2, h - m * 2.4);
        ctx.fillStyle = '#1d1d1d';
        text(piece.id, m, h - m * 1.5, w, '600 40px system-ui, sans-serif', 44);
        return;
      }
      // Заголовок — у верхнего края (он у дальнего края листа: виден и в стопке веером).
      let y = text(piece.id, m, m * 0.7, w, '700 44px Georgia, serif', 52);
      y = text(title, m, y, w - 2 * m, '700 46px Georgia, serif', 54) + 14;
      ctx.fillStyle = '#4a4740';
      for (const line of plain(body).slice(1)) {
        if (y > h - m) break;
        y = text(line, m, y, w - 2 * m, '26px Georgia, serif', 33);
      }
      if (piece.kind === 'stapled') {
        // Скоба в левом верхнем углу.
        ctx.save();
        ctx.translate(m * 0.55, m * 0.55);
        ctx.rotate(-0.7);
        ctx.fillStyle = '#8a8d90';
        ctx.fillRect(-18, -3, 36, 6);
        ctx.restore();
      }
      if (piece.kind === 'half') {
        // Неровный край снизу — оторвано.
        ctx.strokeStyle = 'rgb(0 0 0 / 25%)';
        ctx.lineWidth = 4;
        ctx.beginPath();
        for (let x = 0; x <= w; x += 18) ctx.lineTo(x, h - 6 - ((x * 7) % 11));
        ctx.stroke();
      }
    },
    0.8,
  );
}

let shadowTex: CanvasTexture | null = null;
function shadowTexture() {
  if (shadowTex) return shadowTex;
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d');
  if (g) {
    const grad = g.createRadialGradient(64, 64, 10, 64, 64, 64);
    grad.addColorStop(0, 'rgba(0,0,0,0.85)');
    grad.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = grad;
    g.fillRect(0, 0, 128, 128);
  }
  shadowTex = new CanvasTexture(c);
  return shadowTex;
}

const v = new Vector3();

export function Paper({
  piece,
  title,
  body,
  p,
  target,
  start,
  onDown,
  onOver,
  onOut,
}: {
  piece: Piece;
  title: string;
  body: string;
  /** Метр в пикселях. */
  p: number;
  target: PaperTarget;
  /** Откуда появляется (из конверта) и когда начать двигаться, мс от performance.now(). */
  start?: { pos: Vector3; at: number };
  onDown: (id: string, e: ThreeEvent<PointerEvent>) => void;
  onOver: (id: string) => void;
  onOut: (id: string) => void;
}) {
  // Лист перекладывают — объект `piece` новый, а краска та же: перерисовывать не нужно.
  // biome-ignore lint/correctness/useExhaustiveDependencies: зависит только от вида и размера
  const face = useMemo(() => paintFace(piece, title, body), [piece.id, piece.kind, title, body]);
  useEffect(() => () => face.dispose(), [face]);
  const group = useRef<Group>(null);
  const shadow = useRef<Mesh>(null);
  const faceMat = useRef<MeshStandardMaterial>(null);
  const vel = useRef(new Vector3());
  const tween = useRef<{
    from: Vector3;
    to: Vector3;
    q0: Quaternion;
    t0: number;
    dur: number;
  } | null>(null);
  const placed = useRef(false);
  const W = piece.w * p;
  const D = piece.d * p;
  const T = piece.t * p;

  // Логическое положение и масштаб (где вещь «на самом деле»); показ — с приближением к камере в руке.
  const lp = useRef(new Vector3());
  // Лист — гнущаяся плоскость (DV-H): прогиб по устройству появляется плавно, когда лист кладут.
  const isDevice = !!DEVICE_LOOK[piece.kind];
  const sheetGeo = useMemo(() => new PlaneGeometry(W, D, DRAPE_NX, DRAPE_NY), [W, D]);
  useEffect(() => () => sheetGeo.dispose(), [sheetGeo]);
  const bend = useRef({ k: 0, shown: -1, drape: null as Float32Array | null });
  const sc = useRef(1);
  const hold = useRef(0);
  const camera = useThree((st) => st.camera);

  useFrame((_, dtRaw) => {
    const g = group.current;
    if (!g) return;
    const dt = Math.min(dtRaw, 1 / 30);
    const pos = lp.current;
    if (!placed.current) {
      placed.current = true;
      pos.copy(start?.pos ?? target.pos);
      g.quaternion.copy(target.quat);
      sc.current = target.scale;
      target.cur.copy(pos);
    }
    const waiting = !!start && performance.now() < start.at;
    // Пружина: a = k·(цель − x) − c·v.
    const k = target.stiff;
    const c = 2 * Math.sqrt(k) * target.damp;
    const vl = vel.current;
    const now = performance.now();
    if (target.mode !== 'rest') tween.current = null;
    if (waiting) {
      // Ещё в конверте — ждёт своей очереди.
    } else if (target.mode === 'rest') {
      // Положить: новое место — новое мягкое движение из того, где вещь сейчас.
      const tw = tween.current;
      if (!tw || tw.to.distanceTo(target.pos) > 0.3) {
        const dist = pos.distanceTo(target.pos);
        tween.current =
          dist > 0.3
            ? {
                from: pos.clone(),
                to: target.pos.clone(),
                q0: g.quaternion.clone(),
                t0: now,
                dur: Math.min(PLACE_MAX, PLACE_MIN + dist * 0.9),
              }
            : null;
      }
      const t = tween.current;
      if (t) {
        const u = Math.min(1, (now - t.t0) / t.dur);
        const e = easePlace(u);
        pos.lerpVectors(t.from, t.to, e);
        g.quaternion.slerpQuaternions(t.q0, target.quat, e);
        if (u >= 1) tween.current = null;
      } else {
        pos.copy(target.pos);
        g.quaternion.copy(target.quat);
      }
      vl.set(0, 0, 0);
    } else if (target.mode === 'air') {
      v.copy(target.pos).sub(pos).multiplyScalar(k).addScaledVector(vl, -c);
      vl.addScaledVector(v, dt);
      pos.addScaledVector(vl, dt);
    } else {
      // За мышью — плавным сглаживанием: устойчиво при любой частоте кадров (пружина при длинном
      // кадре «выстреливала» — вещь улетала).
      const follow = 1 - Math.exp(-dt * 28);
      pos.x += (target.pos.x - pos.x) * follow;
      pos.z += (target.pos.z - pos.z) * follow;
      const ty = target.pos.y;
      // В руке — плавно (критическое затухание), без рывков вверх; не быстрее RISE.
      vl.y += (LIFT_K * (ty - pos.y) - 2 * Math.sqrt(LIFT_K) * vl.y) * dt;
      vl.y = Math.max(-RISE * p, Math.min(RISE * p, vl.y));
      pos.y += vl.y * dt;
    }
    // Ни во что не врезается: не ниже того, что под ней.
    if (pos.y < target.minY) {
      pos.y = target.minY;
      if (vl.y < 0) vl.y = 0;
    }
    target.cur.copy(pos);
    if (target.mode !== 'rest' && !waiting)
      g.quaternion.slerp(target.quat, 1 - Math.exp(-dt * (k > 600 ? 22 : 12)));
    sc.current += (target.scale - sc.current) * (1 - Math.exp(-dt * 10));
    // В руке вещь рисуется поверх соседних бумаг и устройств: её показ придвинут к камере вдоль
    // луча взгляда (на экране она там же и того же размера) — поднимаясь из-под стопки, она не
    // проходит сквозь неё на глазах (автор 23.11: «взял — всегда сверху»). Положили — плавно назад.
    const want = target.mode === 'hand' ? 1 : 0;
    hold.current += (want - hold.current) * (1 - Math.exp(-dt * (want ? 30 : 7)));
    const kd = 1 - PULL * hold.current;
    g.position.copy(camera.position).addScaledVector(v.copy(pos).sub(camera.position), kd);
    // Прогиб: появляется, пока лист кладут (~0,25 с), уходит, когда его берут.
    if (!isDevice) {
      const bd = bend.current;
      if (target.drape) bd.drape = target.drape;
      const wantB = target.mode === 'rest' && target.drape ? 1 : 0;
      bd.k += (wantB - bd.k) * (1 - Math.exp(-dt * (wantB ? 9 : 16)));
      if (bd.k < 0.001 && !wantB) bd.k = 0;
      const drapeNow = bd.drape;
      if (drapeNow && Math.abs(bd.k - bd.shown) > 0.0005) {
        const pa = sheetGeo.attributes.position;
        if (pa) {
          for (let i = 0; i < pa.count; i++) pa.setZ(i, (drapeNow[i] ?? 0) * p * bd.k);
          pa.needsUpdate = true;
          sheetGeo.computeVertexNormals();
          sheetGeo.computeBoundingSphere();
        }
        bd.shown = bd.k;
      }
    }
    g.scale.setScalar(sc.current * kd);
    // Над запретным местом (вещь следователя, край) — лист краснеет: тень там не видна.
    const fm = faceMat.current;
    if (fm) {
      fm.emissive.set(target.forbidden ? '#c0281e' : '#fff3d6');
      // Наведение — чуть светлее, и только (автор 23.11: не поднимать, не раскрывать).
      fm.emissiveIntensity = target.forbidden ? 0.35 : target.hover ? 0.06 : 0;
    }
    const sh = shadow.current;
    if (sh) {
      // Тень — на том, что под вещью (стол, стопка), темнее у самой поверхности.
      const floor = Math.max(target.deskY, target.floorY);
      const lift = Math.max(0, pos.y - (T / 2) * sc.current - floor);
      const show = !target.noShadow && lift > 0.8;
      sh.visible = show;
      if (show) {
        sh.position.set(pos.x, floor + 0.4, pos.z);
        const grow = 1 + lift / (0.1 * p);
        sh.scale.set(W * 1.12 * grow, D * 1.12 * grow, 1);
        sh.rotation.set(-Math.PI / 2, 0, 0);
        const mat = sh.material as MeshBasicMaterial;
        mat.opacity = Math.max(0.25, 0.78 - lift / (0.12 * p));
        mat.color.set(target.forbidden ? '#b0221a' : '#000000');
      }
    }
  });

  const handlers = {
    onPointerDown: (e: ThreeEvent<PointerEvent>) => {
      if (e.button !== 0) return;
      e.stopPropagation();
      onDown(piece.id, e);
    },
    onPointerOver: (e: ThreeEvent<PointerEvent>) => {
      e.stopPropagation();
      onOver(piece.id);
    },
    onPointerOut: () => onOut(piece.id),
  };

  return (
    <>
      <group ref={group} name={`paper-${piece.id}`}>
        {isDevice ? (
          <>
            <mesh {...handlers}>
              <boxGeometry args={[W, T, D]} />
              <meshStandardMaterial
                color={DEVICE_LOOK[piece.kind]?.body ?? '#26282b'}
                roughness={0.5}
              />
            </mesh>
            <mesh position={[0, T / 2 + 0.02, 0]} rotation={[-Math.PI / 2, 0, 0]} {...handlers}>
              <planeGeometry args={[W, D]} />
              <meshStandardMaterial ref={faceMat} map={face} roughness={0.92} emissive="#fff3d6" />
            </mesh>
          </>
        ) : (
          // Лист — одна гнущаяся плоскость (бумага тонкая: торец не нужен).
          <mesh
            geometry={sheetGeo}
            position={[0, T / 2, 0]}
            rotation={[-Math.PI / 2, 0, 0]}
            {...handlers}
          >
            <meshStandardMaterial
              ref={faceMat}
              map={face}
              roughness={0.92}
              emissive="#fff3d6"
              side={DoubleSide}
            />
          </mesh>
        )}
      </group>
      <mesh ref={shadow} visible={false} renderOrder={-1}>
        <planeGeometry args={[1, 1]} />
        <meshBasicMaterial map={shadowTexture()} transparent depthWrite={false} opacity={0.4} />
      </mesh>
    </>
  );
}
