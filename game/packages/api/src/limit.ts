/**
 * Счётчик «не больше N за окно» в памяти процесса (R1-02, разбор 18.11): письма входа — не
 * чаще стольких-то с одного адреса подключения и всего за час, чтобы через игру нельзя было
 * рассылать письма на чужие ящики. Один процесс сервера (как сейчас); при нескольких — счётчик
 * в базе или в обратном прокси.
 */
export function windowLimit(max: number, windowMs: number, now: () => number) {
  const hits = new Map<string, number[]>();
  return {
    /** true — можно (и отметка поставлена); false — предел исчерпан. */
    take(key: string): boolean {
      const t = now();
      const recent = (hits.get(key) ?? []).filter((at) => t - at < windowMs);
      if (recent.length >= max) {
        hits.set(key, recent);
        return false;
      }
      recent.push(t);
      hits.set(key, recent);
      // Старые ключи не копятся: изредка чистим пустые окна.
      if (hits.size > 10_000)
        for (const [k, v] of hits) if (!v.some((at) => t - at < windowMs)) hits.delete(k);
      return true;
    },
  };
}
