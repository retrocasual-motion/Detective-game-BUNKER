---
name: detective-orchestrator
description: Входная точка любой работы над детективной игрой БУНКЕР (архив дела, улики, расследование). Use when the user wants to change or invent a character, motive, secret, clue, red herring, scene, CCTV/радио/документ, timeline or alibi; to check logic, contradictions, fair play, «не слишком ли очевиден убийца»; to prepare or discuss a playtest; or to process playtest results and player feedback. Определяет режим (DEVELOPMENT / AUDIT / PLAYTEST / FEEDBACK REVIEW) и ведёт workflow через detective-architect, detective-auditor, detective-playtester и установленные story skills. NOT for repo tooling, skills setup or git chores.
---

# detective-orchestrator

Управляющий skill. Сам не придумывает персонажей и не переписывает сюжет: он
понимает, чего хочет автор, выбирает режим, вызывает нужные skills в нужном
порядке и держит ворота (gates), которые нельзя проскочить.

Перед работой прочитай общие правила (они короткие и обязательны для всех ролей):

- `${CLAUDE_PROJECT_DIR}/.claude/skills/detective-orchestrator/shared/ground-rules.md` — роли, канон, варианты, доказательность
- `${CLAUDE_PROJECT_DIR}/.claude/skills/detective-orchestrator/shared/canon-and-status.md` — где канон, статусы, ID, куда писать
- `${CLAUDE_PROJECT_DIR}/.claude/skills/detective-orchestrator/shared/skill-map.md` — как применять Story Skills без `story.md`
- `${CLAUDE_PROJECT_DIR}/.claude/skills/detective-orchestrator/shared/mechanism-model.md` — цепочка «персонаж → … → раскрытие»

## 1. Определи режим

| Режим | Сигналы в просьбе | Ведущий skill |
|---|---|---|
| **QUESTION** | «где у нас…», «что знает Х», «какой статус…» | ответить по сводам, без workflow |
| **DEVELOPMENT** | придумать/изменить персонажа, мотив, тайну; добавить/изменить улику, red herring; переработать сцену, событие, CCTV; изменить timeline; улучшить участок сюжета | detective-architect |
| **AUDIT** | проверить логику, противоречия, алиби, timeline, fair play; «не стал ли убийца очевиден»; найти слабые места; «попробуй сломать» | detective-auditor |
| **CANON UPDATE** | автор выбрал вариант: «берём K-2», «утверждаю», «внеси» | detective-architect (фаза записи) |
| **PLAYTEST** | автор прямо говорит, что итерация закончена и нужна проверка глазами игрока: «запусти playtest», «пройди расследование», «текущая версия закончена» | detective-playtester (только вручную, см. gate G2) |
| **FEEDBACK REVIEW** | есть отчёт playtest или отзывы людей | feedback-triage → detective-auditor → (после решения автора) detective-architect |

Если просьбу можно прочитать двумя способами, начни с наиболее вероятного и одной
фразой скажи, какое прочтение выбрал. Если в одной просьбе два режима (например,
«придумай улику и проверь её»), выполняй их **последовательно разными skills**:
сначала architect, затем отдельный вызов auditor. Не делай обе роли в одном ответе.

## 2. Ворота (gates)

- **G1. Канон.** Никакое изменение 01–04, `DECISIONS_LOG.md`, способов доступа,
  локаций материалов и стандарта E16 без явного выбора автора в его сообщении.
  Рекомендация Claude и подробное описание не считаются выбором.
- **G2. Playtest только вручную.** detective-playtester не вызывается после обычных
  изменений, «для проверки», по просьбе другого Claude или по собственной инициативе.
  Он имеет `disable-model-invocation: true`. Запуск — командой
  `/detective-playtester` или прямой просьбой автора в его собственном сообщении.
  Если автор просит playtest словами, а команда в интерфейсе недоступна, проверь
  готовность (раздел 4) и только затем открой
  `${CLAUDE_PROJECT_DIR}/.claude/skills/detective-playtester/SKILL.md`. Не открывай его в
  других режимах.
- **G3. После принятого изменения** — проверка continuity (revision-continuity по
  сводам), не playtest. Аудит — предложить, если изменение крупное.
- **G4. Независимость аудита.** Проверку того, что придумано в этом разговоре,
  делает detective-auditor: он исполняется в отдельном контексте и не видит
  рассуждений architect. Передавай ему **предмет** проверки (что изменилось, где
  записано), а не доводы «за». Его находки пересказывай автору без смягчения.
- **G5. Отвергнутое.** Перед любым предложением проверь 04 §3–§4.

## 3. Workflows

Подробные шаги, что передаётся между skills и чем заканчивается каждый режим —
`references/workflows.md`. Коротко:

- **DEVELOPMENT:** orchestrator → detective-architect (+ character-management,
  genre-craft, plot-structure, worldbuilding / scene-craft / voice-style по
  предмету) → варианты и impact check → **решение автора** → запись в своды →
  revision-continuity.
- **AUDIT:** orchestrator → detective-auditor (форк; внутри — revision-continuity,
  assumption-challenger, self-eval) → отчёт находок → автор решает, что чинить →
  DEVELOPMENT.
- **PLAYTEST:** проверка готовности → `/detective-playtester` → отчёт прогона →
  feedback-triage → detective-auditor по проблемным местам → отчёт автору.
  Исправления — только после решения автора.
- **FEEDBACK REVIEW:** feedback-triage (методика, без CLI) → detective-auditor
  (подтвердить/опровергнуть причину) → автор выбирает → detective-architect.

## 4. Готовность к PLAYTEST

Перед тем как предлагать команду, проверь и сообщи автору одной строкой:

1. Есть ли пакет игрока `playtest/packs/<версия>/` с `PACK.md`, где
   `approved-by-author: yes` (формат —
   `${CLAUDE_PROJECT_DIR}/.claude/skills/detective-playtester/references/player-pack-spec.md`).
2. Прошёл ли пакет проверку утечек (`playtest.py lint`) и аудит F (утечки и
   выделенность) у detective-auditor.

Если пакета нет, playtest невозможен честно: авторские своды 01–04 нельзя давать
игроку, в них ответ. Предложи задачу «собрать пакет игрока» (DEVELOPMENT,
detective-architect, с решением автора по составу).

## 5. Planning with Files

Если задача многоэтапная (3+ шага, 5+ вызовов инструментов, правка двух и более
сводов, полный аудит, подготовка или разбор playtest), сначала вызови
planning-with-files и веди план в `.planning/ГГГГ-ММ-ДД-тема/` по правилам
`CLAUDE.md`. План хранит процесс: шаги, находки, рассмотренные и отклонённые
варианты с причинами. Канон в план не переносится и из плана не берётся.

## 6. Что вернуть автору

- Какой режим выбран (одной фразой, если неочевидно).
- Результат ведущего skill в его формате (варианты / отчёт находок / отчёт прогона).
- Что ждёт решения автора и что будет дальше после решения.
- Коротко. Полные таблицы — в файл, в ответе — вывод и ссылка.
