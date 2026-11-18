import { lazy, Suspense } from 'react';
import { useGame } from '../store.ts';

// Сцена 3D (three.js) — отдельным куском: стол открывается быстро. Кусок подгружается заранее,
// когда браузер свободен, — первая вещь в руках без ожидания ~1 МБ кода (R3-09).
const loadScene = () => import('./HeldScene.tsx');
const HeldScene = lazy(loadScene);
if (typeof window !== 'undefined') {
  const idle = window.requestIdleCallback ?? ((fn: () => void) => setTimeout(fn, 2000));
  idle(() => void loadScene());
}

/**
 * Вещь в руках (этап 4a): конверт и коробка архива (A-260), изъятые устройства. Вещь вертят и
 * приближают мышью; щелчок по печати вскрывает конверт (документы выходят карточками и
 * вешаются на стену), щелчок по экрану включает устройство (в 4a — лист материала; экраны
 * устройств — этап 4c).
 */
export function HeldView() {
  const held = useGame((g) => g.held);
  if (!held) return null;
  return (
    <Suspense fallback={<div className="held held-loading" />}>
      <HeldScene key={`${held.type}:${held.id}`} held={held} />
    </Suspense>
  );
}
