/**
 * Склейка строк внутри абзаца (UX-C1). В пакете игрока абзацы перенесены вручную по ~85 знаков;
 * в узкой колонке такие переносы рвут каждую строку надвое. Строка приклеивается к предыдущей,
 * только если та длинная (перенос по ширине, ≥ WRAP_MIN) и эта начинается с маленькой буквы, но
 * не пунктом рукописи («п.1.»). Переносы перед заглавной, цифрой, разметкой и после коротких строк
 * (подписи, поля бланка, записи в блокноте) остаются как в файле.
 * Текст пакета не меняется — меняется только вёрстка.
 */
const CONTINUES = /^\s*\p{Ll}/u;
const STRUCTURAL = /^\s*(#|\||>|```)/;
/** Пункт рукописи: «п.1.», «д.12.» — начало строки, а не продолжение. */
const ITEM = /^\s*\p{Ll}{1,3}\.\s?\d/u;
/**
 * Короче этого строка — не перенос по ширине (в пакете ~85 знаков), а сама по себе строка:
 * «С уважением,», поле бланка «**Решение руководителя:**», строка записки.
 */
const WRAP_MIN = 50;

export function unwrapLines(body: string): string {
  const out: string[] = [];
  let fence = false;
  let prevRaw = '';
  for (const line of body.split('\n')) {
    if (line.trimStart().startsWith('```')) fence = !fence;
    const prev = out.at(-1);
    if (
      !fence &&
      prev !== undefined &&
      prev.trim() !== '' &&
      !STRUCTURAL.test(prev) &&
      !prev.endsWith('  ') &&
      prevRaw.trim().length >= WRAP_MIN &&
      CONTINUES.test(line) &&
      !ITEM.test(line)
    ) {
      out[out.length - 1] = `${prev} ${line.trim()}`;
    } else {
      out.push(line);
    }
    prevRaw = line;
  }
  return out.join('\n');
}
