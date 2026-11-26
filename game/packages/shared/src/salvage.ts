import { z } from 'zod';

/**
 * Разбор по частям (RV-49, RV-50, волна 1): значение не проходит схему целиком — сохраняем всё, что
 * проходит. Неверный элемент списка выпадает один, лишние сверх предела — с конца, длинная строка
 * обрезается, неверное необязательное поле выпадает одно. Раньше одно неизвестное значение (откат
 * версии, ужесточённый предел) превращало всё дело игрока в пустое.
 *
 * `dropped` — пути того, что выпало или обрезано (для копии сохранения и для тестов).
 */
export type Salvaged<T> = { ok: true; value: T } | { ok: false };

const isPlain = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

/** Самая длинная голова списка или строки, которую принимает схема (предел длины). */
function longestPrefix<T extends string | unknown[]>(
  schema: z.ZodType,
  value: T,
): { ok: true; value: unknown; n: number } | null {
  let lo = 0;
  let hi = value.length;
  let best: { value: unknown; n: number } | null = null;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    const r = schema.safeParse(value.slice(0, mid));
    if (r.success) {
      best = { value: r.data, n: mid };
      lo = mid + 1;
    } else hi = mid - 1;
  }
  return best ? { ok: true, ...best } : null;
}

export function salvage(
  schema: z.ZodType,
  value: unknown,
  path = '',
  dropped: string[] = [],
): Salvaged<unknown> {
  const whole = schema.safeParse(value);
  if (whole.success) return { ok: true, value: whole.data };

  if (schema instanceof z.ZodOptional) {
    if (value === undefined) return { ok: true, value: undefined };
    return salvage(schema.unwrap() as z.ZodType, value, path, dropped);
  }
  if (schema instanceof z.ZodNullable) {
    if (value === null) return { ok: true, value: null };
    return salvage(schema.unwrap() as z.ZodType, value, path, dropped);
  }

  if (schema instanceof z.ZodObject && isPlain(value)) {
    const out: Record<string, unknown> = {};
    for (const [key, field] of Object.entries(schema.shape as Record<string, z.ZodType>)) {
      const r = salvage(field, value[key], `${path}.${key}`, dropped);
      if (r.ok) {
        if (r.value !== undefined) out[key] = r.value;
        continue;
      }
      // Неверное необязательное поле выпадает одно; обязательное — объект не собрать.
      if (field.safeParse(undefined).success) {
        dropped.push(`${path}.${key}`);
        continue;
      }
      return { ok: false };
    }
    const r = schema.safeParse(out);
    return r.success ? { ok: true, value: r.data } : { ok: false };
  }

  if (schema instanceof z.ZodArray && Array.isArray(value)) {
    const element = schema.element as z.ZodType;
    const kept: unknown[] = [];
    value.forEach((v, i) => {
      const r = salvage(element, v, `${path}[${i}]`, dropped);
      if (r.ok) kept.push(r.value);
      else dropped.push(`${path}[${i}]`);
    });
    const r = schema.safeParse(kept);
    if (r.success) return { ok: true, value: r.data };
    const head = longestPrefix(schema, kept);
    if (!head) return { ok: false };
    dropped.push(`${path}[${head.n}..]`);
    return { ok: true, value: head.value };
  }

  if (schema instanceof z.ZodRecord && isPlain(value)) {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) {
      if (schema.safeParse({ [k]: v }).success) out[k] = v;
      else dropped.push(`${path}.${k}`);
    }
    const r = schema.safeParse(out);
    return r.success ? { ok: true, value: r.data } : { ok: false };
  }

  // Строка обрезается, только если она лишь длиннее предела: обрезанный номер (`x:…`) стал бы чужим.
  if (typeof value === 'string' && whole.error.issues.every((i) => i.code === 'too_big')) {
    const head = longestPrefix(schema, value);
    if (head && head.n > 0) {
      dropped.push(`${path}~${head.n}`);
      return { ok: true, value: head.value };
    }
  }
  return { ok: false };
}
