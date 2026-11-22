# Промпты для генерации текстур в Higgsfield (22.11.2026)

**Зачем отдельно:** безлимит пробного периода Higgsfield из Claude Code не работает (ответ сервиса
22.11: «unlimited generations are not available in Claude Code; available in Claude chat, Claude
Cowork, ChatGPT»). Генерировать — в чате Claude (claude.ai) с подключённым Higgsfield или на сайте
Higgsfield; из Claude Code — только за кредиты.

**Как (K-A, автор 22.11):** автор вставляет в чат claude.ai (Higgsfield подключён) сообщение
ниже и промпты W1–W13; чат генерирует по безлимиту; затем Claude Code забирает результаты из
истории генераций Higgsfield в `E:\Projects\bunker-media\references\traces\generated\` с именами
`W<номер>_<что>_v<номер>.png` и разбирает по ART-37 (`CATALOG.md`).

**Референсы уже загружены в аккаунт Higgsfield (22.11)** — чат передаёт их номера в поле
референсов (`medias`, роль `image_references`):

| Метка | media_id | Что | Для каких строк |
|---|---|---|---|
| PAPER | `212d26e8-8916-4742-9c63-8f47903bce61` | офисная бумага (TL-316, Texturelabs) | W2, W3, W4, W11, W13 |
| FOLD | `b1863ee8-4051-4c57-a445-e22f07c71bc0` | сетка сгибов гармошкой (TL-181) | W6 |
| TAG | `0b887cc2-fa61-4de9-81af-fbb970a3bc17` | верх манильской бирки с люверсом (реф. автора 18, без надписей) | W8 |

**Сообщение для чата (скопировать целиком, затем — промпты W1–W13 ниже):**
```
Сгенерируй через Higgsfield текстуры по списку ниже. Настройки для всех: модель nano_banana_pro,
максимальное разрешение, доступное по безлимиту, соотношение сторон 3:2, use_unlim: true,
по 2 варианта на каждую строку (W4 — по одному на каждый цвет). Используй generate_image_batch
пачками до 12. Референсы — уже загруженные медиа моего аккаунта, передавай их в medias
с ролью image_references:
- W2, W3, W4, W11, W13 → 212d26e8-8916-4742-9c63-8f47903bce61 (это образец бумаги:
  повтори её волокно и свет скана, но не копируй картинку)
- W6 → b1863ee8-4051-4c57-a445-e22f07c71bc0 (образец сетки сгибов)
- W8 → 0b887cc2-fa61-4de9-81af-fbb970a3bc17 (образец картона бирки и люверса)
- остальные — без референсов.
В промптах ничего не меняй. Если на картинке появились буквы, цифры, логотипы, руки или
предметы — повтори эту строку один раз. В конце дай список: строка → id генераций.
```

**Общее для всех:** без текста, букв, цифр, логотипов, рук, людей, предметов; ровный свет сканера;
бумага занимает весь кадр. Если генератор добавил надпись или предмет — вариант в брак.

Номера — как в списке `WANTED.md`.

---

**W1 — мягкая пыль по краю** (запас; для акта 11 больше не нужна — A-278)
```
Flat top-down scan of a sheet of white office paper. Along one long edge only, a soft band of grey-brown dust and light grime, fading out toward the centre over about 3 cm, uneven and blotchy like paper that lay on a dusty workshop shelf. No black spots, no ink, no stains elsewhere. Even scanner lighting, no shadows, no text, no objects. Photorealistic scan texture, high detail.
```

**W2 — кольцо от кружки** (П-01, П-06)
```
Flat top-down scan of a plain sheet of white office copy paper with a single faint coffee mug ring stain: a thin uneven light-brown ring about 8 cm across, darker at the rim, partly broken, dried, with a faint lighter tint inside. Subtle paper fibre visible. Even scanner lighting, no shadows, no text, no objects. Photorealistic scan texture.
```
Вариант: `...a tea ring, paler and more yellow, with a small drip mark beside it...`

**W3 — след стакана воды** (таблица выдачи 37)
```
Flat top-down scan of white office paper with a dried water glass ring: an almost colourless circle about 7 cm across, visible only as a slightly darker, wavy cockled outline where the paper swelled and dried. No colour stain. Even scanner lighting, no text, no objects. Photorealistic scan texture.
```

**W4 — бледно-цветная офисная бумага** (листы доски 09, П-08; бланки HEXON)
```
Flat top-down scan of a blank sheet of pale pastel yellow office copy paper, 80 gsm, fine uniform fibre, very slight colour variation, clean, no marks. Even scanner lighting, no text, no objects, fills the frame. Photorealistic paper texture.
```
Цвета по очереди: `pale pastel yellow`, `pale mint green`, `pale sky blue`, `pale pink`, `very light blue-grey`.

**W5 — копия самокопирующегося бланка** (такси 19)
```
Flat top-down scan of a blank carbonless copy paper sheet (NCR copy), thin, pale yellowish cream colour, slightly glossy coating, faint uneven blue pressure marks scattered lightly over the surface as from handling, no writing. Even scanner lighting, no text, no objects. Photorealistic paper texture.
```

**W6 — тонкая чертёжная бумага, сложенная** (план 07)
```
Flat top-down scan of thin white drafting bond paper that was folded many times accordion-style and opened again: crisp straight fold lines in a grid, slight wear and greyish rubbing along the folds, thin translucent paper. Even scanner lighting, no drawing, no text, no objects. Photorealistic paper texture.
```

**W7 — отрывной край блокнота** (форма офиса 18)
```
Close top-down scan of the top edge of a sheet torn off a glued notepad: an irregular torn edge with small bits of dried rubbery glue residue and a few uneven paper fibres, white office paper below. Even scanner lighting, no text, no lines, no objects. Photorealistic macro scan texture.
```

**W8 — манильский картон бирки** (бирки вещдоков)
```
Flat top-down scan of a blank manila shipping tag card, buff yellowish-tan cardstock, fine fibre, slightly worn corners, a reinforced round eyelet hole near one end, no string, no printing, no writing. Even scanner lighting on a plain white background. Photorealistic texture.
```

**W9 — обугленный край** (половина листа 42)
```
Flat top-down scan of white typing paper with one edge genuinely burned: charred black crumbling edge, a band of brown scorching fading into the paper, irregular burn line, small bits of ash, paper otherwise clean. Even scanner lighting on a plain white background, no text, no objects. Photorealistic scan texture.
```

**W10 — краска резинового штампа** (штампы бюро — только фактура)
```
Top-down scan of a solid rectangular rubber stamp impression in faded violet ink on white paper, no letters or symbols, just an even filled rectangle with realistic uneven ink coverage: speckles, lighter patches, slightly blurred edges, one corner pressed harder. Even scanner lighting, no text. Photorealistic texture.
```
Варианты цвета: `faded violet`, `blue`, `red`.

**W11 — жирный мазок пальца** (протокол 35, акт 10)
```
Flat top-down scan of white office paper with a faint greasy fingertip smudge: a soft translucent grey-beige oval mark about 2 cm, no visible ridge pattern, slightly shiny, edges blurred. Even scanner lighting, no text, no objects. Photorealistic scan texture.
```

**W12 — вмятины скрепки и скобы** (02, протоколы, 22)
```
Close top-down photo of white office paper under low raking side light showing only embossed impressions left by a removed paper clip and two tiny staple holes with small creases around them; no metal, no ink, no text, no objects. Photorealistic macro texture.
```

**Вторая попытка (22.11, после разбора):** W7 и W12 вышли «ИИ-слопом» (драматичный боковой свет,
перспектива, утрированные вмятины, янтарный клей), голубая W4 — слишком насыщенной. Новые промпты
W7b, W12b, W12c, W4b — в `CHAT_PASTE_2.txt`: плоский скан сверху, ровный рассеянный свет, «very
subtle, low contrast», явный список брака; плюс проверка, доступна ли по безлимиту Nano Banana Pro
(первый прогон чат сделал на Nano Banana 2).

**Третья попытка скрепки (22.11):** W12b дал контур «карандашом». Новый ход — `CHAT_PASTE_3.txt`:
референс — наш собственный рендер следа скрепки под лампой (`proc_traces.clip`, media
`eb58096d-…`), задача модели — сделать его фотореалистичным; три модели (Nano Banana Pro, Seedream
5.0 Pro, GPT Image 2.6) по 3 варианта, выбираем лучший.

**W13 — второй экземпляр офисной бумаги**
```
Flat top-down scan of a blank sheet of plain white office copy paper, 80 gsm, very fine fibre, subtle natural unevenness, no marks. Even scanner lighting, no text, no objects, fills the frame. Photorealistic paper texture, high detail.
```
