# Автоподключение skills из репозитория: что добавить в setup script

Зачем: сейчас новые skills из `.claude/skills/` репозитория подключаются, только когда
среда собирается заново. Если среда поднимается из кэша, setup script не выполняется,
и новый skill не виден, пока вы не пересохраните скрипт.

Блок ниже делает две вещи:

1. Создаёт маленький скрипт `~/.claude/link-repo-skills.sh`, который привязывает
   **все** папки из `.claude/skills/` репозитория и убирает ссылки на удалённые папки.
2. Прописывает его как SessionStart-хук в `~/.claude/settings.json`. Хук запускается
   при старте **каждой** сессии, в том числе из кэша, уже после того, как репозиторий
   скачан свежим.

Настройки плагина planning-with-files в `settings.json` не затрагиваются: блок только
дописывает хук. Повторный запуск безопасен, хук не задвоится. Блок проверен на копии
настроек: все 18 skills привязались, плагин остался включён. Сам способ (хук + ссылка)
проверен на тестовом skill: он появился в списке skills той же сессии.

## Шаг за шагом

1. Откройте [Project settings](#project-settings/environment).
2. Откройте меню **Cloud environment** и нажмите шестерёнку рядом с выбранной средой.
3. Найдите поле **Setup script**.
4. **Ничего из того, что там уже есть, не удаляйте и не меняйте.** Строки с
   `claude plugin marketplace add`, `claude plugin install` и строки после
   `# refresh` остаются как есть.
5. Поставьте курсор **в самый конец** скрипта, после последней строки, и нажмите
   Enter, чтобы начать новую строку.
6. Скопируйте блок ниже целиком, от первой строки до последней, и вставьте.
7. Сохраните настройки среды.
8. Откройте новый тред. Я (или координатор) проверю, что хук появился и skills на месте.

## Блок для вставки

```bash
# --- автоподключение skills из репозитория при каждом старте сессии ---
cat > ~/.claude/link-repo-skills.sh <<'EOF'
#!/bin/bash
R=/home/user/detective-game-bunker/.claude/skills
mkdir -p ~/.claude/skills
for d in "$R"/*/; do
  [ -f "$d/SKILL.md" ] && ln -sfn "${d%/}" ~/.claude/skills/"$(basename "$d")"
done
find ~/.claude/skills -maxdepth 1 -xtype l -delete
exit 0
EOF
chmod +x ~/.claude/link-repo-skills.sh
python3 - <<'EOF'
import json, os
p = os.path.expanduser("~/.claude/settings.json")
s = json.load(open(p)) if os.path.exists(p) else {}
cmd = os.path.expanduser("~/.claude/link-repo-skills.sh")
hs = s.setdefault("hooks", {}).setdefault("SessionStart", [])
if not any(h.get("command") == cmd for g in hs for h in g.get("hooks", [])):
    hs.append({"hooks": [{"type": "command", "command": cmd}]})
json.dump(s, open(p, "w"), indent=2)
EOF
~/.claude/link-repo-skills.sh
```

## Важно

- Блок должен стоять **после** строк `claude plugin ...`: установка плагина
  записывает `settings.json`, и хук дописывается уже в готовый файл.
- Сохранение этого блока само пересоберёт среду, так что в следующем треде он
  выполнится. Дальше пересохранять скрипт ради новых skills не нужно.
- Последняя строка блока сразу привязывает skills и при сборке среды, так что
  отдельные строки со ссылками после `# refresh` становятся лишними. Удалять их
  не обязательно: они ничему не мешают.
- Хук не трогает служебные папки `session-start-hook` и `synced` в `~/.claude/skills`.
