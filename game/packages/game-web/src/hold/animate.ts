import { useFrame, useThree } from '@react-three/fiber';
import { useEffect } from 'react';

/**
 * Сцена рисуется по требованию (frameloop="demand", T-…): кадр — только когда что-то изменилось.
 * После простоя первый кадр приходит с большим dt — без ограничения плавное движение
 * перескочило бы к цели за один кадр.
 */
export const MAX_DT = 1 / 30;

/** Разница, ниже которой движение считаем законченным (радианы, единицы сцены). */
export const SETTLED = 1e-4;

/**
 * Плавное движение части вещи. `step` двигает и возвращает true, пока цель не достигнута, —
 * тогда сцена просит следующий кадр. После каждой отрисовки компонента (сменились наведение,
 * «вплотную», включение) — один кадр, чтобы движение началось.
 */
export function useAnimate(step: (dt: number) => boolean) {
  const invalidate = useThree((s) => s.invalidate);
  useEffect(() => {
    invalidate();
  });
  useFrame((_, dt) => {
    if (step(Math.min(dt, MAX_DT))) invalidate();
  });
}
