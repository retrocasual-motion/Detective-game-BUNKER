/**
 * Раздел материала, где описан вложенный обрывок (SRC-A): «## Лист (п. 1)» до следующего
 * заголовка того же уровня. Лист без раздела — всё, кроме него (обрывок лежит отдельно).
 */
export function splitSection(body: string, heading: string): { rest: string; section: string } {
  const lines = body.split('\n');
  const start = lines.findIndex((l) => l.trim() === `## ${heading}`);
  if (start < 0) return { rest: body, section: '' };
  let end = lines.findIndex((l, k) => k > start && /^#{1,2}\s/.test(l));
  if (end < 0) end = lines.length;
  return {
    rest: [...lines.slice(0, start), ...lines.slice(end)].join('\n').trimEnd(),
    section: lines
      .slice(start + 1, end)
      .join('\n')
      .trim(),
  };
}
