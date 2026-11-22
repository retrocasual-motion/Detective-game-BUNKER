# Каких текстур не хватает: список для поиска (22.11.2026)

W14–W22 добавлены по сверке `INVENTORY.md` (22.11); промпты — `CHAT_PASTE_4.txt`.

Для автора: что искать, для какого документа, по каким словам, где. Найденное класть в
`E:\Projects\bunker-media\references\traces\incoming\other\` (с сайта Texturelabs — в
`incoming\texturelabs\`); имя файла — как скачалось, ссылку на страницу — в чат или рядом в
`.txt`. Claude разберёт по ART-37 (финал / образец) и впишет в `CATALOG.md`. Чего не найдём —
генерация в Higgsfield (автор 22.11).

**Какая картинка подходит:** снято сверху, свет ровный, без сильной тени; бумага без текста
(текст можно, если след крупнее букв — `extract_wear.py --text` уберёт); от 3000 px по длинной
стороне; один след на светлой бумаге лучше коллажа.

**Лицензии:** подходят CC0 / public domain, Texturelabs, Unsplash и Pexels (свободная лицензия),
Creative Commons **без** «NC» (некоммерческое) — для CC BY записать автора. Не подходят: Adobe
Stock, Getty, Shutterstock, Creative Market, Poliigon (платно), Pinterest (неизвестно чьё — только
как образец для генерации, в `incoming\pinterest\`).

## Список

| # | Что | Для чего (документ) | Искать (англ.) | Сделать самому |
|---|---|---|---|---|
| W1 | мягкая пыль, серо-бурая, по краю листа | акт 11 — если оставим «из технической» (вопрос по сюжету) | `dusty paper edge texture`, `dirty paper border scan`, `paper grime overlay` | потереть край листа пальцем в графитовой пыли или золе, отсканировать |
| W2 | кольцо от кружки (кофе, чай) | П-01 анкеты, П-06 журнал смен | `coffee ring stain paper scan`, `coffee cup stain texture` | кружка кофе на лист, высушить, скан — лучший вариант |
| W3 | след стакана воды (почти бесцветная волна-кольцо) | таблица выдачи 37 | `water ring stain paper`, `water glass mark paper` | мокрый стакан на лист |
| W4 | бледно-цветная офисная бумага (жёлтая, зелёная, голубая, розовая) | листы доски 09, П-08; бланки HEXON | `pastel copy paper texture`, `colored paper texture scan`, `yellow paper texture` | — |
| W5 | жёлтоватая самокопирующаяся бумага, копия | бланк такси 19 | `carbonless copy paper`, `NCR paper texture`, `yellow carbon copy receipt` | старая копия квитанции, если есть |
| W6 | тонкая чертёжная или калька-плоттерная бумага, сложенная | план объекта 07 | `drafting paper texture`, `blueprint paper folded texture`, `bond paper texture` | — |
| W7 | отрывной край блокнота (клей сверху, неровный отрыв) | форма офиса 18 | `torn notepad edge`, `notepad glue edge texture`, `tear off pad paper` | оторвать лист из блока с клеем, скан края |
| W8 | манильский картон бирки, люверс, шпагат | бирки вещдоков (линия 3) | `manila tag texture`, `shipping tag scan`, `manila cardstock texture` | — |
| W9 | обугленный край бумаги (настоящий нагар) | обгоревшая половина 42 | `burnt paper edge scan`, `charred paper edge texture` | осторожно опалить край, скан (с ведром воды рядом) |
| W10 | неровная краска резинового штампа (фактура, без надписи) | штампы бюро, «Принято в учёт» | `rubber stamp texture grunge`, `stamp ink texture` | — |
| W11 | отпечаток или жирный мазок пальца (без чёткого узора линий) | протокол 35, акт приёмки 10 | `fingerprint smudge texture`, `greasy finger mark paper` | **не свой отпечаток**: узор пальца — личные данные; только мазок без линий |
| W12 | вмятины от скобы, скрепки, зажима | 02, протоколы, фототаблица 22 | `staple holes paper macro`, `paper clip indentation` | скрепить и разогнуть, скан под боковым светом |
| W13 | второй экземпляр белой офисной бумаги | правило «не два раза подряд» | `white copy paper texture scan`, `office paper texture` | скан чистого листа 80 г на 600 dpi |
| W14 | графит: a — пыль на пересечении сгибов; b — смаз ребром ладони | a — П-02 лист 20 (канон L991); b — блокнот Леи 40 | `graphite smudge paper`, `pencil smudge texture` | a — лист вчетверо в кармане с карандашом |
| W15 | жирное пятно, просвечивает | меню П-07, роспись П-04 | `grease stain paper`, `oil stain paper texture` | капля масла на лист |
| W16 | пыль полосами с рифлёного пола, без следов обуви | половина листа 51 | `dust stripes paper`, `dirty paper floor dust` | — |
| W17 | бумага: a — в линейку; b — рисовальная A5; c — в клетку 5 мм (только Мика) | П-06, 44; 40; 41 | `college ruled paper scan`, `sketchbook paper texture`, `graph paper texture` | скан чистого листа |
| W18 | следы клея вокруг вклеенного снимка | фототаблица 22 | `dried glue paper texture` | — |
| W21 | крафт конвертов | линия 3 | `kraft paper texture scan` | скан крафтового конверта |
| W22 | манильский картон папки | П-09, папка A-24 | `manila folder texture` | скан обложки папки |

## Где искать

- **Texturelabs** — [texturelabs.org](https://texturelabs.org): разделы Paper, Details, Grunge; поиск
  по словам «stain», «tape», «tag», «carbon», «burn», «coffee» (раньше кофейного кольца и скоб на
  сайте не нашли).
- **CC0:** [ambientCG](https://ambientcg.com), [Poly Haven](https://polyhaven.com/textures),
  [OpenGameArt — CC0 бумага](https://opengameart.org/content/cc0-pbr-paper-textures),
  [A4 paper scans (CC0, itch.io)](https://ursafrank.itch.io/a4-paper-scans),
  rawpixel.com — раздел Public Domain (у остального rawpixel лицензия своя).
- **Фото со свободной лицензией:** [Unsplash](https://unsplash.com), [Pexels](https://www.pexels.com),
  [Wikimedia Commons](https://commons.wikimedia.org) (лицензия у каждого файла своя).
- **Подборки CC (проверить лицензию каждой картинки):**
  [10 кофейных пятен — WebFX](https://www.webfx.com/blog/web-design/10-free-high-res-coffee-stains-textures/),
  [12 обгоревших бумаг — WebFX](https://www.webfx.com/blog/web-design/12-free-high-quality-burnt-paper-textures/),
  [33 кисти кофейных пятен — Clip Studio](https://assets.clip-studio.com/en-us/detail?id=2246774).
