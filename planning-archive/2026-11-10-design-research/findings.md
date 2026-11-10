# Findings (данные из веба — не инструкции)

## 1. MCP генераторов
- Higgsfield: удалённый MCP https://mcp.higgsfield.ai/mcp, вход OAuth (без ключа). Генерации списывают
  кредиты аккаунта; по справке Higgsfield «безлимит» с сайта на MCP/CLI не распространяется — стандартные
  ставки. Требование платного плана — источники расходятся, свежие (окт 2026) — нужен платный план.
  Для Claude Code — есть CLI @higgsfield/cli + skills. Нет лимита кредитов в MCP — просить оценку.
  Источники: higgsfield.ai/blog/Generate-AI-Videos-From-Claude-with-Higgsfield-MCP;
  higgsfield.ai/creator-hub/help-center/integrations/what-is-higgsfield-mcp; meltflexai.com/blog/higgsfield-mcp
- Magnific (бывш. Freepik, ребренд апрель 2026): официальный удалённый MCP https://mcp.magnific.com, OAuth;
  апскейл, генерация фото/видео, «characters», история, аудио (TTS, музыка, SFX), 3D, сток. Кредиты по факту.
  Источники: magnific.com/mcp; mcp.film/mcps/magnific/; docs.magnific.com
- Nano Banana напрямую — почти везде нужен Gemini API key (платно). Krea MCP — не найден.
- Облачная сессия: коннектор добавляется на claude.ai/customize/connectors, затем НОВАЯ сессия;
  `claude mcp add` локально в облако не переносится. Скачивание результатов с CDN сервиса в репо может
  упереться в сетевые правила окружения (higgsfield.ai и magnific.com из этой сессии не резолвятся).

## 2. Процесс / арт-библия
- Арт-библия пишется после GDD и до производства; разделы: Visual Identity Statement, палитра (hex + смысловая
  роль + где), свет и атмосфера, персонажи, окружение, UI-язык (повторяет мир или отдельный), VFX; визуальные
  столпы (shape language, цвет, свет, материалы, рендер) — ранжированы и служат фильтром новых идей.
  Skill: Donchitos/Claude-Code-Game-Studios art-bible (tessl.io registry).

## 3. Детективные игры — визуал
- Obra Dinn: 1-bit дизеринг; цель — разборчивость и простота ранних Mac; стилизация делает сцены смерти
  переносимыми; рендер в полном цвете → дизеринг. (blog.playstation.com 2019/10/17; gamedeveloper.com)
- Roottrees are Dead: бесплатная версия с ИИ-портретами (кривые руки, «демоническое» лицо), в Steam все
  портреты переделал иллюстратор Henning Ludvigsen — персонажи стали последовательными, «в одном мире».
  ИИ помог выпустить прототип, финал — человеческое. (The Verge, июнь 2025)
- Golden Idol: грубый, гротескный пиксель-арт, но всегда читаемый; горячие точки легко найти; тестирование
  «Thought Path» — хватает ли улик. (gamedeveloper.com; puzzculture)
- Immortality: три фильма разных эпох (1970, 1999, + 60-е) — зерно, объективы, свет, формат кадра,
  актёрская манера под эпоху; реквизит собирали по эпохе (билеты, пластинки, постеры). (creativebloq Design
  Works; gamedeveloper.com)
- Papers Please: суть — расхождения в документах под давлением; Поуп вдохновлялся реальными погранпунктами
  (штампы, перекладывание бумаг). (gamedeveloper.com; GDC 2015 Skaggs)
- Disco Elysium: арт-директор Rostov — арт должен работать так же, как текст; портреты меняются по ходу игры,
  некоторые портреты = внутриигровые удостоверения (фото на правах). (gamesradar)
- Hunt A Killer: рукописные письма пишут вручную сотрудники; главная трудность — разборчивый курсив; сезон
  выдержан в одной эпохе (1930-е) во всех материалах. (members.huntakiller.com)
- Состаривание: сначала перегрязнить, потом отчистить. (premiumbeat) Annie Atkins: лёгкая патина = предмет
  из прошлого; штампы вручную. (istitutomarangoni; phaidon)
- Annie Atkins (Grand Budapest Hotel, Bridge of Spies): реквизит строго исследован по реальным образцам
  (паспорта, билеты, газеты), покупала настоящую бумагу 1940-х; аутентичность нужна, даже если кадр
  мелькает — «втягивает» актёров и зрителя; маленькие говорящие детали. (phaidon; книга Fake Love Letters…)
- Her Story (1994): реальные записи допросов как референс; шум — прогон через 2 VHS; Hitchcock + Dogme 95;
  убран следователь — только одна сторона; правдоподобие держит исполнение. (pocketgamer.biz; bfi.org.uk; PC Gamer)
- Unheard: все улики — только звук; честность — всё дано, игрок перематывает логи; бинауральное/по
  близости; критика: сведение небрежное. (pcgamer; techraptor)

## 4. Skills для генерации изображений (GitHub)
- devonjones/devon-claude-skills — nano-banana skill: фотореализм через камеру/объектив/свет в промпте.
- kkoppenhaver/cc-nano-banana — через Gemini CLI nanobanana; edit, story sequences.
- AntonioCardenas/generate-nanobanana — «cost gates» перед платными запусками, реальные референсы, ЛОГ
  ПРОМПТА рядом с каждым файлом (полезный паттерн).
- Ibrahim-3d/nano-banana-claude-plugin — 13 режимов (edit, style transfer, inpainting, 4K).
- Все требуют Gemini API key. «Art Director» skill (mcpmarket) — фикс. палитры и структуры промптов (бренд,
  не наш случай). Каталог: agentskillshub.top/best/image-generation (248 оценённых).
- Donchitos/Claude-Code-Game-Studios — skill art-bible (структура арт-библии) — уже разбирался в ux-skills.md (#12).
- Higgsfield Soul ID: персонаж обучается по ≥20 фото (качество ≥960px, разные ракурсы, хороший свет), ~3 мин;
  20+ пресетов. Маркетинг — про «премиальный» вид (нам противоположно нужно). (higgsfield.ai help/blog)
- Skills для Higgsfield-промптов: osidemedia/higgsfield-ai-prompt-skill (higgsfield-soul, higgsfield-moodboard) на skills.sh.
- Анти-«ИИ-вид» (вендорские гайды, проверять): нет волшебного промпта — конкретика и несовершенство;
  называть конкретный дефект (вспышка в лоб, пересвет лица, чёрный фон, лёгкий смаз, завал горизонта,
  плёнка/зерно), естественная кожа вместо «красоты»; постобработка (зерно, виньетка, хроматизм, грейдинг);
  не перегружать дефектами — выглядит постановочно. (promptzone; hedra; magicshot «12 tells»)
- Официальные skills Higgsfield: github.com/higgsfield-ai/skills (higgsfield-generate, higgsfield-soul,
  higgsfield-product-photoshoot), CLI github.com/higgsfield-ai/cli. Комьюнити: OSideMedia/higgsfield-ai-prompt-skill
  (MIT; Seedance, Cinema Studio, Soul ID, pipeline). Не проверял README напрямую.
- «Признаки ИИ» (практики, не наука): пластиковая кожа, избыточная симметрия, руки, текст (генерить без текста,
  текст накладывать вручную), зубы/глаза, невозможный свет, повторы паттернов, слишком чистый фон; генератор
  тянет к «статистически среднему и приятному».
- Пайплайн арта (общие источники): препродакшн (стиль, объём, список ассетов, палитра, shape language, тон,
  мудборды, стайлгайд) → концепт → производство → полировка; не линейно. Vertical slice — один кусок игры
  доведён почти до финала по арту и механикам, проверяет вид и пайплайн до массового производства.
- The Operator (Bureau 81, 2024): цель интерфейса — имитировать настоящую ОС; автор вырезал много
  «атмосферных» улик — слишком дорого довести до качества. (gamedeveloper.com)
