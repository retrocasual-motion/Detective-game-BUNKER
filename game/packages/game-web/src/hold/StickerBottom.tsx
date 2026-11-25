import { mediaUrl } from '@bunker/shared';
import { invalidate, useFrame, useThree } from '@react-three/fiber';
import { useEffect, useRef, useState } from 'react';
import { type Mesh, Quaternion, SRGBColorSpace, type Texture, TextureLoader, Vector3 } from 'three';
import { postAction } from '../api.ts';
import { useFreeArea } from '../device/deviceView.tsx';
import { useGame } from '../store.ts';
import { useSpot } from './Held3D.tsx';
import { STICKER_AT, STICKER_SIZE, STICKER_TARGET, stickerSeen } from './sticker.ts';

/**
 * Текстуры медиа (T-…): одна загрузка на имя за сессию. null — файла нет (CI, чужая машина):
 * вместо текстуры — заглушка, механика та же.
 */
const loaded = new Map<string, Promise<Texture | null>>();
function loadMedia(name: 'sticker-47'): Promise<Texture | null> {
  let p = loaded.get(name);
  if (!p) {
    p = new Promise((resolve) => {
      new TextureLoader().load(
        mediaUrl(name),
        (t) => {
          t.colorSpace = SRGBColorSpace;
          t.anisotropy = 8;
          resolve(t);
        },
        undefined,
        () => resolve(null),
      );
    });
    loaded.set(name, p);
  }
  return p;
}

/** Текстура медиа: undefined — грузится, null — нет файла. */
function useMediaTexture(name: 'sticker-47') {
  const [tex, setTex] = useState<Texture | null | undefined>(undefined);
  useEffect(() => {
    let live = true;
    void loadMedia(name).then((t) => {
      if (!live) return;
      setTex(t);
      invalidate();
    });
    return () => {
      live = false;
    };
  }, [name]);
  return tex;
}

const corner = new Vector3();
const normal = new Vector3();
const toCam = new Vector3();
const q = new Quaternion();

/**
 * Наклейка на дне 3D-ноутбука (A-283): плоскость лицом вниз, чуть ниже дна корпуса; грязь по краю
 * текстуры полупрозрачна — сквозь неё виден пластик. Рассмотрели (лицом к камере и крупно,
 * `stickerSeen`) — один раз ОСМОТР «увеличить»: крупный план L947 — в деле. С клавиатуры (KEY-A:
 * клавиатура — ускоритель) — невидимая кнопка у наклейки, только когда она лицом к камере.
 */
export function StickerBottom() {
  const tex = useMediaTexture('sticker-47');
  const mesh = useRef<Mesh>(null);
  const { camera, size } = useThree();
  const free = useFreeArea();
  const freeWidth = useRef(free.width);
  freeWidth.current = free.width;
  const done = useRef(false);

  const reveal = () => {
    if (done.current) return;
    done.current = true;
    if (useGame.getState().materials.some((m) => m.id === 'L947')) return;
    void postAction('ОСМОТР', STICKER_TARGET, 'увеличить')
      .then((r) => {
        if (r.released.length) useGame.getState().addFound(r.released, '47', []);
      })
      .catch(() => {
        // Сервер не ответил — попробовать снова при следующем взгляде.
        done.current = false;
      });
  };

  useSpot(mesh, {
    id: 'sticker-47',
    label: 'Наклейка на дне ноутбука',
    testId: 'laptop-sticker',
    onClick: reveal,
    passive: true,
  });

  useFrame(() => {
    const m = mesh.current;
    if (!m || done.current) return;
    // Лицо плоскости — её +z; на дне она смотрит вниз от корпуса.
    m.getWorldQuaternion(q);
    normal.set(0, 0, 1).applyQuaternion(q);
    m.getWorldPosition(toCam);
    toCam.subVectors(camera.position, toCam).normalize();
    const facing = normal.dot(toCam);
    const [w, h] = STICKER_SIZE;
    const pts = [
      [-w / 2, -h / 2],
      [w / 2, -h / 2],
      [w / 2, h / 2],
      [-w / 2, h / 2],
    ].map(([x = 0, y = 0]) => {
      corner.set(x, y, 0);
      m.localToWorld(corner).project(camera);
      return { x: ((corner.x + 1) / 2) * size.width, y: ((1 - corner.y) / 2) * size.height };
    });
    if (stickerSeen(pts, facing, freeWidth.current)) reveal();
  });

  const [w, h] = STICKER_SIZE;
  return (
    <mesh ref={mesh} position={STICKER_AT} rotation={[Math.PI / 2, 0, 0]}>
      <planeGeometry args={[w, h]} />
      {tex ? (
        // Lambert, а не Standard: с картой Standard давал чёрную плоскость (25.11); свет в текстуре
        // мягкий сверху, блеск клея — этап M2.
        <meshLambertMaterial
          map={tex}
          transparent
          alphaTest={0.02}
          polygonOffset
          polygonOffsetFactor={-2}
        />
      ) : (
        // Нет файла (CI) или ещё грузится — светлая плоскость того же размера.
        <meshStandardMaterial
          color="#e6e1d4"
          roughness={0.9}
          polygonOffset
          polygonOffsetFactor={-2}
        />
      )}
    </mesh>
  );
}
