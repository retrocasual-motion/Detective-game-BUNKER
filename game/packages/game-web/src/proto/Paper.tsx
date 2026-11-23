import { type ThreeEvent, useFrame } from '@react-three/fiber';
import { useEffect, useMemo, useRef } from 'react';
import {
  CanvasTexture,
  type Group,
  type Mesh,
  type MeshBasicMaterial,
  type MeshStandardMaterial,
  type Quaternion,
  Vector3,
} from 'three';
import { paintTexture } from '../hold/texture.ts';
import type { Piece } from './deskWorld.ts';

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
}

const PAPER = '#efe9dc';
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
  return paintTexture(
    piece.w * PX,
    piece.d * PX,
    disc ? '#e4ddcc' : photo ? '#f6f4ef' : PAPER,
    ({ ctx, w, h, text }) => {
      const m = w * 0.08;
      ctx.fillStyle = '#1d1d1d';
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
  const placed = useRef(false);
  const W = piece.w * p;
  const D = piece.d * p;
  const T = Math.max(1.2, piece.t * p);

  useFrame((_, dtRaw) => {
    const g = group.current;
    if (!g) return;
    const dt = Math.min(dtRaw, 1 / 30);
    if (!placed.current) {
      placed.current = true;
      g.position.copy(start?.pos ?? target.pos);
      g.quaternion.copy(target.quat);
      g.scale.setScalar(target.scale);
    }
    if (start && performance.now() < start.at) return;
    // Пружина: a = k·(цель − x) − c·v; c — чуть меньше критического (лёгкий отскок).
    const k = target.stiff;
    const c = 2 * Math.sqrt(k) * target.damp;
    v.copy(target.pos).sub(g.position).multiplyScalar(k).addScaledVector(vel.current, -c);
    vel.current.addScaledVector(v, dt);
    g.position.addScaledVector(vel.current, dt);
    g.quaternion.slerp(target.quat, 1 - Math.exp(-dt * (k > 600 ? 22 : 12)));
    g.scale.setScalar(g.scale.x + (target.scale - g.scale.x) * (1 - Math.exp(-dt * 10)));
    // Над запретным местом (вещь следователя, край) — лист краснеет: тень там не видна.
    const fm = faceMat.current;
    if (fm) {
      fm.emissive.set(target.forbidden ? '#c0281e' : '#fff3d6');
      fm.emissiveIntensity = target.forbidden ? 0.35 : target.hover ? 0.09 : 0;
    }
    const s = shadow.current;
    if (s) {
      const lift = Math.max(0, g.position.y - target.deskY);
      const show = !target.noShadow && lift > 1.5;
      s.visible = show;
      if (show) {
        s.position.set(g.position.x, target.deskY + 0.4, g.position.z);
        const grow = 1 + lift / (0.12 * p);
        s.scale.set(W * 1.15 * grow, D * 1.15 * grow, 1);
        s.rotation.set(-Math.PI / 2, 0, 0);
        const mat = s.material as MeshBasicMaterial;
        mat.opacity = Math.max(0.12, 0.55 - lift / (0.25 * p));
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
        <mesh {...handlers}>
          <boxGeometry args={[W, T, D]} />
          <meshStandardMaterial
            color={piece.kind === 'disc' ? '#d9d2c0' : '#e2dccd'}
            roughness={0.9}
          />
        </mesh>
        <mesh position={[0, T / 2 + 0.15, 0]} rotation={[-Math.PI / 2, 0, 0]} {...handlers}>
          <planeGeometry args={[W, D]} />
          <meshStandardMaterial ref={faceMat} map={face} roughness={0.92} emissive="#fff3d6" />
        </mesh>
      </group>
      <mesh ref={shadow} visible={false} renderOrder={-1}>
        <planeGeometry args={[1, 1]} />
        <meshBasicMaterial map={shadowTexture()} transparent depthWrite={false} opacity={0.4} />
      </mesh>
    </>
  );
}
