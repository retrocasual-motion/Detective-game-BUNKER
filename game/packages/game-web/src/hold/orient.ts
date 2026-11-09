import { Quaternion, Vector3 } from 'three';

/**
 * Поворот вещи в руках без крена (правка автора 09.11): два независимых угла, как в играх с
 * осмотром предмета. Влево-вправо — вокруг вертикали (без предела), вверх-вниз — наклон к
 * игроку, не больше PITCH_MAX. Верх вещи всегда смотрит вверх по экрану — она не заваливается
 * набок, и вернуть её к понятному виду легко.
 */
export const PITCH_MAX = 1.4; // ≈ 80°

export const clampPitch = (p: number) => Math.max(-PITCH_MAX, Math.min(PITCH_MAX, p));

const Y = new Vector3(0, 1, 0);
const X = new Vector3(1, 0, 0);

/** Сначала повернуть вокруг своей вертикали, потом наклонить к игроку. */
export const orient = (yaw: number, pitch: number) =>
  new Quaternion()
    .setFromAxisAngle(X, clampPitch(pitch))
    .multiply(new Quaternion().setFromAxisAngle(Y, yaw));
