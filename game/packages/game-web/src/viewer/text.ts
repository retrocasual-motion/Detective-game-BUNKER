/**
 * Склейка строк внутри абзаца (UX-C1). В пакете игрока абзацы перенесены вручную по ~85 знаков;
 * в узкой колонке такие переносы рвут каждую строку надвое. Строка, которая продолжает
 * предыдущую (начинается с маленькой буквы), приклеивается к ней через пробел; переносы перед
 * заглавной буквой, цифрой, разметкой (шапки писем, списки, таблицы) остаются как в файле.
 * Текст пакета не меняется — меняется только вёрстка.
 */
const CONTINUES = /^\s*\p{Ll}/u;
const STRUCTURAL = /^\s*(#|\||>|```)/;

export function unwrapLines(body: string): string {
  const out: string[] = [];
  let fence = false;
  for (const line of body.split('\n')) {
    if (line.trimStart().startsWith('```')) fence = !fence;
    const prev = out.at(-1);
    if (
      !fence &&
      prev !== undefined &&
      prev.trim() !== '' &&
      !STRUCTURAL.test(prev) &&
      !prev.endsWith('  ') &&
      CONTINUES.test(line)
    ) {
      out[out.length - 1] = `${prev} ${line.trim()}`;
    } else {
      out.push(line);
    }
  }
  return out.join('\n');
}
