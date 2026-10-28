# Task Plan: пакет игрока v2 и волна плейтеста на Fable

## Goal
Собрать пакет v2-2026-10-28 (ячейка 845 по A-239…A-241, Кейт по A-242), проверить lint/walk,
запустить волну 3–5 профилей на claude-fable-5-1, написать отчёт (база, Кейт, Лея, три ключевых
источника: архив Ричарда, почта Эммы, ячейка Адама) и предложения, как направлять игроков.

## Next Step
Ждём решений Артёма по вопросам отчёта волны на Opus (Н-Ж, пункты 6–8, почта, правки пакета AUD-167/168/172/174); мёрж PR #14 по слову «мёржим».

## Current Phase
Phase 8 (complete)

## Phases
### Phase 1: Discovery — complete
- просьба Артёма 28.10 14:52 (cmsg_0118yH5XdsPeWTc44dP1JAtWW8UnhnirjE8uFjvB2LqRCJ)
- probe с --model claude-fable-5-1: ok, канарейка не утекла
### Phase 2: Пакет v2 — complete
- player: 08 (6.4), 25 (ключ в куртке), 45/L945 (квитанция), L560 (источник средств), L618 (контакт Дэна)
- locked: L214 (08:45:05), L985/L957 (листы 19–24, шесть справок), L737 (только распоряжение), новые L460–L462 (ячейка)
- build_access.py: письмо 6 и уточнения; walkthrough; sources/values/PACK
### Phase 3: lint + walk + аудит F — complete (AUD-133…145)
### Phase 4: утверждение — complete (карточка 28.10 15:21, «Да, 5 профилей»)
### Phase 5: волна на Fable — complete (5 профилей, REPORT.md, AUD-146…156)
### Phase 6: отчёт + предложения, PR — complete
- Claude Doc «БУНКЕР · плейтест на Fable 28.10» https://claude.ai/artifact/VhxUrKb8SuVUuMXZ7GXQvf
- карточка решения по финалу; PR #14; после — перенести папку в planning-archive/
### Phase 7: решения Артёма 28.10 16:50 → канон A-243…A-246 и пакет v2.1 — complete (аудит AUD-157…165, правки, PR #14)
- A-243 Ф-1 (предупреждение, без возврата, пункты 6–8), A-244 (Я-0, Я-1, правило адресов), A-245 (А-1), A-246 (П-0)
- пакет v2.1: тексты 00/01/25/L945/L999, 125 правил, lint 0, walk 166/0
- аудит v2.1 → правки → PR; прогон на Opus по слову Артёма

### Phase 8: прогон на Opus (пакет v2.1, 28.10 18:07) — complete
- профили experienced, completionist, casual; 43,3 USD; все трое — Н. Харт; архив 0/3, почта 0/3, ячейка 1/3
- REPORT.md `playtest/runs/2026-10-28-v2.1-2026-10-28-wave-opus/`, аудит `claude/AUDIT_2026-10-28_wave_opus.md` (AUD-166…175)
- Claude Doc https://claude.ai/artifact/3G8DpVmTKoYtNHCsnh3ggt; канон и пакет не менялись
