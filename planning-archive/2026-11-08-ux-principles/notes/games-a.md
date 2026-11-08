# Детективные игры: UX-разбор для «БУНКЕРА» (часть A)

Дата: 2026-11-08. Статус: исследовательские заметки, **не канон и не решение автора**.
Метод: поиск по обзорам, Wikipedia (с указанием, на какой первоисточник она ссылается), гайдам,
девлогам. Всё, что не удалось подтвердить источником, помечено **«не проверено»**. Гайды, форумы
Steam и агрегаторы отзывов (vaporlens) — слабые источники, они помечены отдельно.
Тексты TIGSource-девлога Obra Dinn и видео GMTK напрямую прочитать не удалось: девлог —
не открыт, по GMTK есть только сторонний автоконспект (помечено).

Модули «БУНКЕРА», к которым привязаны выводы: **комната и виды / стол / просмотрщик / доска /
папка ходатайства / компьютер и устройства / замки / почта / форма решения**.

---

## Сквозные выводы: что повторяется у лучших

1. **Проверка группой, а не по одному ответу.** Obra Dinn подтверждает судьбы только тройками
   ([Wikipedia → Kotaku](https://en.wikipedia.org/wiki/Return_of_the_Obra_Dinn)); Roottrees
   фиксирует записи, когда три верны ([Checkpoint Gaming](https://checkpointgaming.net/reviews/2025/01/the-roottrees-are-dead-review-tracing-family-roots/));
   Chants of Sennaar подтверждает разворот журнала, только если верно всё на нём
   ([The Language Closet](https://thelanguagecloset.com/2024/12/07/playing-chants-of-sennaar/)).
   Игрок узнаёт «эта группа верна», но не узнаёт, какой из его ответов спас группу, и перебор
   становится дорогим. Механизм признан стандартом жанра против подбора
   ([Wikipedia, Legacy](https://en.wikipedia.org/wiki/Return_of_the_Obra_Dinn)).
2. **Счётчик близости («≤2 ошибки») — компромисс с ценой.** Golden Idol сообщает, что в сегменте
   две ошибки или меньше ([Wikipedia](https://en.wikipedia.org/wiki/The_Case_of_the_Golden_Idol));
   критики прямо пишут, что из-за этого последние имена подбирают перебором (там же, реф. 31).
   Для «БУНКЕРА» это противоречит P-1.
3. **Запрос как гипотеза.** В Her Story игрок продвигается, только придумав слово, которое
   произнесла героиня, а выдача ограничена пятью клипами в хронологическом порядке
   ([Vice](https://www.vice.com/en/article/watching-as-detectives-the-truth-behind-her-story)).
   Сам запрос и есть вывод игрока. Прямой аналог — папка ходатайства (адресат + просьба +
   основание = гипотеза).
4. **Противоречие = указать два факта.** В Papers, Please игрок в режиме осмотра щёлкает две
   конкретные строки, и игра проверяет, конфликтуют ли они
   ([StrategyWiki](https://strategywiki.org/wiki/Papers,_Please/Day_2),
   [Papers Please Wiki](https://papersplease.fandom.com/wiki/Discrepancies)). Это точнее, чем
   «предъявить документ целиком». Поле «На основании» в «БУНКЕРЕ» работает так же.
5. **Автозапись снижает нагрузку, но отбирает действие.** Logbook Obra Dinn заполняется сам
   ([Wikipedia](https://en.wikipedia.org/wiki/Return_of_the_Obra_Dinn)), Lorelei сохраняет каждый
   прочитанный документ ([Destructoid](https://vip-develop.destructoid.com/?p=495649)). Когда
   Rise of the Golden Idol стала сама заносить слова в банк при осмотре, RPGFan назвал это
   потерей «важного слоя вовлечения» ([RPGFan](https://www.rpgfan.com/review/the-rise-of-the-golden-idol/)).
   Для «БУНКЕРА» вывод такой: автоматически собранный список — это неявная подсветка важного.
   Пусть игрок выделяет сам.
6. **Подсказки в индустрии обычно отключаемые, а не отсутствующие.** Подсветку слов в Golden Idol
   можно выключить ([Softpedia](https://www.softpedia.com/reviews/games/pc/the-case-of-the-golden-idol-review-536240.shtml)),
   звуковой сигнал улики в L.A. Noire тоже ([Prima](https://primagames.com/eguides/la-noire-2017-remaster/basics/detective-work)),
   красный контур в Unpacking тоже ([Checkpoint](https://checkpointgaming.net/reviews/2021/11/unpacking-review-home-sweet-home/)).
   P-1 строже индустрии, и это надо учитывать при плейтесте: без страховки риск застрять выше,
   поэтому сами материалы должны вести лучше.
7. **Когда находку определяет «клик по всему», это ломает ощущение следствия.** В L.A. Noire
   игрок ведёт героя «как бульдозер» на всё, что звякнет
   ([Giant Bomb, отзыв игрока](https://www.giantbomb.com/la-noire/3030-21500/user-reviews/2200-23543/));
   в первой Golden Idol жалуются на пиксельхантинг
   ([Gamereactor, превью Rise](https://www.gamereactor.eu/the-rise-of-the-golden-idol-preview-superior-sleuthing-1398293/)).
   Улика должна быть видимой, а трудность — в её интерпретации.
8. **Окна должны быть «движимым имуществом», но в меру.** Rise вынесла вопросы в перемещаемые
   окна, и это хвалят за поток работы ([Thinky Games](https://thinkygames.com/reviews/the-rise-of-the-golden-idol-review),
   [RPGFan](https://www.rpgfan.com/review/the-rise-of-the-golden-idol/)), но ругают за «панели на
   панелях» ([Backloggd](https://backloggd.com/u/phiber/likes/), источник слабый). В Shadows of
   Doubt «много окон» и громоздкая доска ([Xboxera](https://xboxera.com/2024/09/23/shadows-of-doubt-review)).
   Для «БУНКЕРА»: один лист по центру хорошо держит фокус, но для сравнения двух документов
   (п. 4) нужен способ держать два листа рядом.
9. **Физическая бумага приятна сама по себе.** Первый прототип Papers, Please — пустые листы,
   которые двигают по столу, и Поуп счёл, что это уже весело
   ([Denfaminico Gamer](https://news.denfaminicogamer.jp/interview/240424b/2)). В Unpacking около
   14 000 фоли-звуков, причём звук зависит от поверхности: «побеждает более мягкий материал»
   ([Game Developer](https://www.gamedeveloper.com/marketing/auditory-tales-from-the-making-of-zen-puzzler-unpacking),
   [Audiokinetic](https://www.audiokinetic.com/en/blog/unpacking-the-fun-behind-the-foley)).
   Для стола «БУНКЕРА» звук бумаги, фото и папки по разным поверхностям — дешёвая и сильная обратная связь без подсказок.
10. **Нарочитое трение работает, когда оно часть фикции, и раздражает, когда отнимает время без
    мысли.** «Неуклюжий» интерфейс Papers, Please сделан намеренно
    ([Wikipedia](https://en.wikipedia.org/wiki/Papers,_Please)); медленная перемотка назад в
    Telling Lies тоже, но обозреватель считает, что половина игры — смотреть на молчащих людей
    ([Engadget](https://www.engadget.com/2019/08/21/telling-lies-sam-barlow-fmv-game-her-story-sequel/)).
11. **Конец назначает игрок.** В Her Story чат спрашивает «закончил?», и игрок сам решает, что
    понял достаточно ([Wikipedia](https://en.wikipedia.org/wiki/Her_Story_(video_game))); в
    Paradise Killer суд можно начать в любой момент
    ([Wikipedia](https://en.wikipedia.org/wiki/Paradise_Killer)). Без подтверждения появляется
    тревога «а хватит ли?», и часть критиков называет такой суд «пришитым»
    ([Select Button](https://selectbutton.com/reviews/paradise-killer-review)).
12. **Связи на доске, нарисованные игрой, — это подсказка.** Shadows of Doubt сама проводит
    очевидные нити и окрашивает их по «инкриминации»
    ([девблог #4](https://colepowered.com/?p=33958),
    [Steam](https://steamcommunity.com/app/986130/discussions/0/3829792817307221406)). В
    «БУНКЕРЕ» нить только игрока, без цвета и толщины, которые что-то значат для игры.
13. **Сравнение двух половин — сильная операция.** Telling Lies показывает только одну сторону
    видеозвонка, а вторую игрок ищет сам ([Wikipedia](https://en.wikipedia.org/wiki/Telling_Lies_(video_game))).
    Это нетекстовая операция «собрать пару». В «БУНКЕРЕ» так можно сделать запись и журнал,
    кадр и план, звонок и биллинг.
14. **Ручные заметки игрока — признак хорошей игры, а не дыра в UI.** Obra Dinn заставила
    обозревателя Polygon взять «блокнот и ручку» ([Wikipedia → Polygon](https://en.wikipedia.org/wiki/Return_of_the_Obra_Dinn));
    Lorelei без бумаги не пройти ([GameSpot](https://www.GameSpot.com/reviews/lorelei-and-the-laser-eyes-review-a-mastery-of-illusions/1900-6418228/)).
    Доска «БУНКЕРА» должна быть удобнее бумаги, но не думать за игрока.
15. **Ранние подсказки вредят меньше, чем короткие пути.** Color Gray убирали лишние улики,
    которые позволяли перескочить шаги, а нелинейные пути оставляли как допустимые, но не
    обязательные ([Game Developer](https://www.gamedeveloper.com/road-to-igf-2023/-the-case-of-the-golden-idol-i-used-frequent-testing-to-improve-its-mystery-solving)).
    Главная метрика в тестах — темп: плохо, если игрок понял тайну, а потом полчаса застревает на технической мелочи (там же).

---

## 1. Her Story (Sam Barlow, 2015)

**1. Руками.** Набирает слова в поисковую строку старого полицейского компьютера и смотрит короткие
клипы допросов; помечает клипы своими тегами; в конце отвечает в чате.

**2. Интерфейс.**
- Рабочий стол «части Apple II, Windows 3.1 и Windows 98» (Барлоу); база L.O.G.I.C. открыта сразу,
  механику объясняют текстовые файлы на столе ([Wikipedia](https://en.wikipedia.org/wiki/Her_Story_(video_game))).
- 271 клип из семи допросов; поиск по словам транскрипта ([Wikipedia](https://en.wikipedia.org/wiki/Her_Story_(video_game))).
- Выдача — первые 5 клипов в хронологическом порядке; к поздним клипам ведут только более
  точные слова ([Vice](https://www.vice.com/en/article/watching-as-detectives-the-truth-behind-her-story),
  [PocketGamer.biz](https://www.pocketgamer.biz/making-of-her-story/)). Почему именно пять,
  Барлоу в найденных источниках не объясняет (**не проверено**).
- Пользовательские теги клипов становятся искомыми словами ([Wikipedia](https://en.wikipedia.org/wiki/Her_Story_(video_game))).
- «Database checker» показывает просмотренные клипы (красный → зелёный) (там же). По сути это счётчик прогресса.
- Конец наступает, когда игрок решит: чат спрашивает, закончил ли он (там же).

**3. Почему работает.** Поиск — это одновременно действие и формулировка гипотезы: чтобы найти клип,
надо понять, о чём героиня могла сказать. Лимит выдачи заставляет уточнять запрос, а не листать:
перебор ограничен, ответ не раскрывается. Барлоу: игрок «по сути гуглит», а сам компьютер —
реквизит ([Wikipedia](https://en.wikipedia.org/wiki/Her_Story_(video_game))).

**4. Критика.** Последние клипы искать «до скрипа зубов» ([RPGFan](https://www.rpgfan.com/review/her-story/));
отсутствие направления раздражает часть игроков ([Destructoid через Mechanics of Magic](https://mechanicsofmagic.com/2022/05/12/critical-play-her-story-4/));
агрегатор пользовательских отзывов описывает поиск как утомительный и зависящий от удачи
([vaporlens](https://vaporlens.app/app/368370/her_story), слабый источник); важные повороты некоторые
узнают слишком рано ([Wikipedia → Good Game](https://en.wikipedia.org/wiki/Her_Story_(video_game))).

**5. Взять.**
- *Компьютер и устройства:* поиск по базе (например, по журналу звонков или архиву почты) с
  ограниченной выдачей. Запрос — это мысль игрока.
- *Папка ходатайства:* тот же принцип: точность запроса определяет ответ, широкий запрос
  возвращает «слишком общо» (вариант, решение автора).
- *Форма решения:* игрок сам решает, когда подать заключение.

**6. Не брать.** Database checker с красными и зелёными клетками — это счётчик «найдено N из M»,
он противоречит P-1.

Ссылки: [Wikipedia](https://en.wikipedia.org/wiki/Her_Story_(video_game)) ·
[Vice](https://www.vice.com/en/article/watching-as-detectives-the-truth-behind-her-story) ·
[PocketGamer.biz](https://www.pocketgamer.biz/making-of-her-story/) ·
[RPGFan](https://www.rpgfan.com/review/her-story/) ·
[Mechanics of Magic](https://mechanicsofmagic.com/2022/05/12/critical-play-her-story-4/)

---

## 2. Telling Lies (Sam Barlow, 2019)

**1. Руками.** Ищет по словам в архиве видеозвонков, перематывает видео пальцем или мышью, ищет вторую
половину разговора, пишет заметки.

**2. Интерфейс.**
- Виртуальный рабочий стол; в мониторе отражается героиня-оператор ([Wikipedia](https://en.wikipedia.org/wiki/Telling_Lies_(video_game))).
- Пять клипов на запрос ([Engadget](https://www.engadget.com/2019/08/21/telling-lies-sam-barlow-fmv-game-her-story-sequel/)).
- Любое слово в субтитрах можно щёлкнуть и сразу искать ([Nintendo Life](https://www.nintendolife.com/reviews/switch-eshop/telling_lies),
  [Wikipedia](https://en.wikipedia.org/wiki/Telling_Lies_(video_game))).
- Перемотка — «прыжок Марио» игры (Барлоу); перемотка назад намеренно медленная
  ([Engadget](https://www.engadget.com/2019/08/21/telling-lies-sam-barlow-fmv-game-her-story-sequel/)).
- Записан только один собеседник в каждом звонке, вторую сторону надо найти
  ([Wikipedia](https://en.wikipedia.org/wiki/Telling_Lies_(video_game))).
- Блокнот-мемо внутри игры; ограничено время сессии (там же).

**3. Почему работает.** Поиск по субтитрам убирает работу «переписать слово» (меньше нагрузки), но
оставляет решение «какое слово важно». Поиск недостающей половины — пространственно-временная
операция сопоставления, а не чтение.

**4. Критика.** Интерфейс «бюрократичный и неуклюжий», непонятно, зачем перематывать цифровое
видео ([Cog Connected](https://cogconnected.com/?p=225802)); IGN — «несколько неинтуитивен»
([Wikipedia](https://en.wikipedia.org/wiki/Telling_Lies_(video_game))); около половины времени уходит на
людей, молча смотрящих в камеру ([Engadget](https://www.engadget.com/2019/08/21/telling-lies-sam-barlow-fmv-game-her-story-sequel/));
GameSpot — мало структуры (Wikipedia).

**5. Взять.**
- *Просмотрщик (аудио/видео):* скраб по шкале, тактильный и быстрый; щелчок по слову
  расшифровки = выделение строки для ходатайства (аналог «щёлкнуть слово → искать»).
- *Компьютер:* «одна сторона разговора» — например, запись разговора одного абонента, вторую
  сторону восстанавливают по другому носителю.

**6. Не брать.** Искусственно медленную перемотку назад и долгие пустые паузы в записях:
трение без мысли.

Ссылки: [Wikipedia](https://en.wikipedia.org/wiki/Telling_Lies_(video_game)) ·
[Engadget](https://www.engadget.com/2019/08/21/telling-lies-sam-barlow-fmv-game-her-story-sequel/) ·
[Nintendo Life](https://www.nintendolife.com/reviews/switch-eshop/telling_lies) ·
[Cog Connected](https://cogconnected.com/?p=225802)

---

## 3. Immortality (Sam Barlow, 2022)

**1. Руками.** Ставит клип на паузу, наводит курсор на человека или предмет в кадре, щёлкает и попадает в
другой клип с похожим образом; манипулирует видео, чтобы открыть скрытые кадры.

**2. Интерфейс.**
- Пауза → щелчок по человеку/предмету → связанные клипы ([Wikipedia](https://en.wikipedia.org/wiki/Immortality_(video_game))).
- Скрытые сцены открываются манипуляцией с видео (там же); конкретный жест (перемотка) — **не проверено**
  по источнику.
- Курсор помечает «активные» образы, но не говорит, что распознано ([Slant](https://slantmagazine.com/games/immortality-review-sam-barlow), по выдержке поиска).
- Сетка найденных клипов, к которой игрок возвращается ([Prima](https://primagames.com/gaming/immortality-review-pc)).

**3. Почему работает.** Навигация через образ (монтажная склейка) — нетекстовое действие:
игрок «читает» кадр, а не подпись.

**4. Критика.** Система склеек «рыхлая», стимулы не совпадают с целью ([OpenCritic](https://opencritic.com/game/13590/-/reviews?page=3));
склейки бывают натянутыми ([Gameluster](https://gameluster.com/review-immortality-the-match-cut/));
игрок вынужден доверять механике, которую не понимает (Slant); тупики и повторяющиеся сцены
([PC Invasion](https://pcinvasion.com/?p=330682)); Eurogamer — тайна «менее глубока из-за приглашения её решить»
([Wikipedia](https://en.wikipedia.org/wiki/Immortality_(video_game))).

**5. Взять.**
- *Просмотрщик фото/видео:* остановить кадр и рассмотреть деталь, но связь деталь → другой
  материал строит игрок (на доске), а не игра.

**6. Не брать.** Автоматическую навигацию «щёлкни что угодно → игра сама найдёт связанное»: игра
думает за игрока и неявно подсвечивает связи (P-1). Курсор, меняющийся над «активным»
объектом, — тоже подсветка.

Ссылки: [Wikipedia](https://en.wikipedia.org/wiki/Immortality_(video_game)) ·
[Slant](https://slantmagazine.com/games/immortality-review-sam-barlow) ·
[Gameluster](https://gameluster.com/review-immortality-the-match-cut/) ·
[Prima](https://primagames.com/gaming/immortality-review-pc) ·
[PC Invasion](https://pcinvasion.com/?p=330682)

---

## 4. Return of the Obra Dinn (Lucas Pope, 2018)

**1. Руками.** Ходит по кораблю, применяет часы к останкам, смотрит застывшую сцену смерти, листает
бортовой журнал, вписывает имя, способ смерти и убийцу.

**2. Интерфейс.**
- Часы Memento Mortem: последние секунды перед смертью, звук и застывшая 3D-сцена ([Wikipedia → Eurogamer](https://en.wikipedia.org/wiki/Return_of_the_Obra_Dinn)).
- Журнал заполняется базовыми данными сам; содержит рисунки команды, список экипажа, план корабля;
  выступает таймлайном по главам (Wikipedia → RPS).
- Причины смерти выбираются из каталога; часть смертей допускает несколько верных ответов; ответы можно
  править (Wikipedia → Kotaku).
- **Проверка тройками:** верные судьбы подтверждаются только группами по три, «чтобы отбить догадки»
  (Wikipedia → Kotaku). По Wikipedia, к концу размер группы уменьшается; точное правило
  **не проверено**.
- Лица в журнале размыты, пока в открытых воспоминаниях не хватает данных для опознания; когда лицо
  стало чётким, данных уже достаточно ([gameplay.tips](https://gameplay.tips/guides/3292-return-of-the-obra-dinn.html), гайд, источник средний).
- Поуп описывает ядро как «заполнение матрицы признаков для списка личностей»
  ([Game Developer](https://gamedeveloper.com/design/for-lucas-pope-i-return-of-the-obra-dinn-i-was-a-bunch-of-appealing-design-problems)).

**3. Почему работает.** Тройка — проверка без раскрытия ответа: перебор растёт комбинаторно, а
подтверждение всё равно даёт маленькую победу. Журнал держит структуру (кто, где, когда), а
вывод остаётся игроку.

**4. Критика.** Развязка не дотягивает до игрового процесса ([Wikipedia → Game Informer](https://en.wikipedia.org/wiki/Return_of_the_Obra_Dinn));
трудно понять, какое воспоминание «проявило» лицо ([gameplay.tips](https://gameplay.tips/guides/3292-return-of-the-obra-dinn.html));
низкая реиграбельность (Wikipedia → Black Gate).

**5. Взять.**
- *Форма решения:* групповая проверка как **вариант для автора** (например, пункты заключения
  оцениваются блоками), если канон вообще допускает обратную связь до финала. Это решение автора.
- *Доска:* структура «матрица признаков» — список людей × признаки как форма, которую игрок
  заполняет сам.
- *Стол/просмотрщик:* «застывшая сцена» соответствует фото места: рассмотреть, кто где стоит.

**6. Не брать.** Размытие лиц как индикатор «уже можно опознать» — это подсказка о достаточности
сведений, прямое противоречие P-1. Автозаполнение журнала тоже не брать.

Ссылки: [Wikipedia](https://en.wikipedia.org/wiki/Return_of_the_Obra_Dinn) ·
[Game Developer](https://gamedeveloper.com/design/for-lucas-pope-i-return-of-the-obra-dinn-i-was-a-bunch-of-appealing-design-problems) ·
[gameplay.tips](https://gameplay.tips/guides/3292-return-of-the-obra-dinn.html) ·
TIGSource-девлог (**не открыт, не проверено**)

---

## 5. The Case of the Golden Idol (Color Gray Games, 2022)

**1. Руками.** Щёлкает людей, предметы и тексты в застывшей сцене, собирает слова; на экране «мышления»
перетаскивает слова в пропуски предложений и таблиц.

**2. Интерфейс.**
- Режим исследования: слова (имена, места, глаголы, предметы) собираются внизу экрана; можно открывать
  ёмкости, смотреть карманы и реплики ([Wikipedia](https://en.wikipedia.org/wiki/The_Case_of_the_Golden_Idol)).
- Режим мышления: пропуски в описании событий, задания разные по главам (там же).
- Сегмент фиксируется, когда все слова верны; при двух ошибках или меньше игра сообщает об этом
  (там же; [Gamereactor](https://www.gamereactor.eu/the-rise-of-the-golden-idol-preview-superior-sleuthing-1398293/)).
- Подсветка собираемых слов включена по умолчанию и отключается в настройках
  ([Softpedia](https://www.softpedia.com/reviews/games/pc/the-case-of-the-golden-idol-review-536240.shtml)).
- Подсказки появились в обновлении Redux ([Wikipedia](https://en.wikipedia.org/wiki/The_Case_of_the_Golden_Idol)).
- Вдохновение: Obra Dinn, Her Story, Outer Wilds ([Game Developer](https://www.gamedeveloper.com/road-to-igf-2023/-the-case-of-the-golden-idol-i-used-frequent-testing-to-improve-its-mystery-solving)).

**3. Почему работает.** Банк слов ограничивает пространство ответов (меньше нагрузки, чем свободный
текст), но заставляет связать слово с местом. Разбиение на сегменты — шаг за шагом маленькие
победы. Тестирование было ориентировано на темп и узнаваемость: перерисовали яблоко, которое
тестеры не узнали; убрали улики, дающие короткий путь (Game Developer).

**4. Критика.** Последние имена приходится подбирать перебором ([Wikipedia, реф. 31](https://en.wikipedia.org/wiki/The_Case_of_the_Golden_Idol));
логика иногда «на шаг дальше» и требует догадки (реф. 37); Adventure Gamers — улики «крайне
неочевидны», нет разделения на главные и второстепенные (там же); перебор отмечают и обзоры
([geekchamp](https://geekchamp.com/?p=629524)).

**5. Взять.**
- *Форма решения:* пункты заключения как предложения с пропусками, куда перетаскиваются
  **цитаты-опоры** (у «БУНКЕРА» уже есть выбор + опоры; Golden Idol подтверждает, что это
  понятная форма).
- *Папка ходатайства:* карточки, перетаскиваемые в поля, соответствуют банку слов. Ограниченный
  набор карточек = то, что игрок сам выделил.

**6. Не брать.** Индикатор «≤2 ошибки» (поощряет перебор и противоречит P-1); подсветку собираемых
слов; автоматический банк всех найденных слов (в «БУНКЕРЕ» карточку создаёт игрок выделением).

Ссылки: [Wikipedia](https://en.wikipedia.org/wiki/The_Case_of_the_Golden_Idol) ·
[Game Developer](https://www.gamedeveloper.com/road-to-igf-2023/-the-case-of-the-golden-idol-i-used-frequent-testing-to-improve-its-mystery-solving) ·
[Softpedia](https://www.softpedia.com/reviews/games/pc/the-case-of-the-golden-idol-review-536240.shtml) ·
[Gamereactor](https://www.gamereactor.eu/the-rise-of-the-golden-idol-preview-superior-sleuthing-1398293/) ·
[Shacknews, интервью](https://shacknews.com/article/135265/case-of-the-golden-idol-on-camera-interview) (не прочитано полностью)

---

## 6. The Rise of the Golden Idol (Color Gray Games, 2024)

**1. Руками.** То же, что в первой части, но вопросы-предложения открываются отдельными окнами поверх сцены.

**2. Интерфейс.**
- Фиксированный экран «мышления» заменён перемещаемыми всплывающими окнами; банк слов и
  предложения можно разложить по экрану и одновременно смотреть сцену ([RPGFan](https://www.rpgfan.com/review/the-rise-of-the-golden-idol/),
  [Thinky Games](https://thinkygames.com/reviews/the-rise-of-the-golden-idol-review)). Окна не масштабируются (RPGFan).
- Сохранён сигнал «≤2 ошибки»; подсветку самих ошибок, по словам RPGFan, убрали (RPGFan).
- Осмотр предмета сам добавляет слова в банк (RPGFan).
- Подсказки: выбор категории, затем три уровня конкретности (RPGFan); до трёх подсказок на сценарий
  ([Digital Chumps](https://digitalchumps.com/the-rise-of-the-golden-idol-pc-review)) — источники
  расходятся в деталях.

**3. Почему работает.** Окна рядом со сценой убирают переключение «смотрю ↔ вписываю» (рабочая
память не держит всё). Уровневые подсказки ведут к ответу, а не выдают его (RPGFan).

**4. Критика.** Автозаполнение банка убирает вовлечение; маленькие уровни облегчают задачу (RPGFan);
интерфейс так и не стал привычным ([Adventure Game Hotspot](https://adventuregamehotspot.com/review/3621/the-rise-of-the-golden-idol));
навигация по меню ([Finger Guns](https://fingerguns.net/reviews/2024/11/28/the-rise-of-the-golden-idol-review-ps5-the-holy-grail/));
неточный выбор улик ([Xbox Hub](https://www.thexboxhub.com/the-rise-of-the-golden-idol-review/));
окна открываются сами, слова оказываются под другим окном (RPGFan); один из рецензентов не принял новые подсказки ([Gameluster](https://gameluster.com/the-rise-of-the-golden-idol-review-the-rise-and-fall-of-the-golden-idol/)).

**5. Взять.**
- *Просмотрщик / папка ходатайства:* черновик ходатайства открывается рядом с документом, чтобы
  выделять строку, не закрывая ни то ни другое. Это прямо следует из «единственного листа по центру»: нужен второй слот.

**6. Не брать.** Подсказки любых уровней (P-1), автозаполнение банка, неограниченное число
перекрывающих друг друга окон.

Ссылки: [RPGFan](https://www.rpgfan.com/review/the-rise-of-the-golden-idol/) ·
[Thinky Games](https://thinkygames.com/reviews/the-rise-of-the-golden-idol-review) ·
[Adventure Game Hotspot](https://adventuregamehotspot.com/review/3621/the-rise-of-the-golden-idol) ·
[Digital Chumps](https://digitalchumps.com/the-rise-of-the-golden-idol-pc-review) ·
[Gamereactor](https://www.gamereactor.eu/the-rise-of-the-golden-idol-preview-superior-sleuthing-1398293/)

---

## 7. Papers, Please (Lucas Pope, 2013)

**1. Руками.** Тянет документы со стойки на стол, раскладывает их, сверяет с книгой правил, в режиме
осмотра щёлкает два поля, допрашивает, ставит штамп.

**2. Интерфейс.**
- Стол — рабочая поверхность, документы физически перекладываются (описано в [Denfaminico](https://news.denfaminicogamer.jp/interview/240424b/2)).
- Режим осмотра: щёлкнуть два конкретных фрагмента, и игра их сравнит; если конфликт, появляются
  действия (допрос и т. п.) ([StrategyWiki](https://strategywiki.org/wiki/Papers,_Please/Day_2),
  [Papers Please Wiki](https://papersplease.fandom.com/wiki/Discrepancies)).
- Щёлкать надо по точному фрагменту, а не по документу ([gameplay.tips](https://gameplay.tips/guides/4714-papers-please.html)).
- Отсутствующий документ: щелчок по правилу в книге + щелчок по пустому столу ([Steam](https://steamcommunity.com/app/239030/discussions/0/846960628518466497)).
- «Неуклюжий» интерфейс — намеренный выбор, позволяет дозировать, что видно о персонаже ([Wikipedia](https://en.wikipedia.org/wiki/Papers,_Please)).

**3. Почему работает.** Сравнение двух фактов — это явное действие-утверждение «вот здесь
противоречие», без меню вариантов. Игра проверяет только заявленную пару и не раскрывает остальные.
Прототип показал, что перекладывание бумаги само по себе приятно ([Denfaminico](https://news.denfaminicogamer.jp/interview/240424b/2)).

**4. Критика.** Обзорной критики UI найти не удалось (**не проверено**). На форумах есть много вопросов
«как указать, что документа нет», потому что неочевиден жест «правило + пустой стол»
([Steam](https://steamcommunity.com/app/239030/discussions/0/846960628518466497)).

**5. Взять.**
- *Стол:* перетаскивание листов, раскладка рядом, разные зоны стола.
- *Папка ходатайства:* «На основании» = указать точные строки (как два щелчка в осмотре). Можно
  предусмотреть основание «отсутствие» (в документе нет того, что должно быть) — вариант для автора.
- *Звук и анимация* штампа и подписи для отправки ходатайства.

**6. Не брать.** Таймер и давление времени (другая цель игры). Неочевидные жесты, которых нет в
фикции (щелчок по пустому столу как «документа нет»).

Ссылки: [Wikipedia](https://en.wikipedia.org/wiki/Papers,_Please) ·
[Denfaminico Gamer (яп.)](https://news.denfaminicogamer.jp/interview/240424b/2) ·
[StrategyWiki](https://strategywiki.org/wiki/Papers,_Please/Day_2) ·
[Papers Please Wiki](https://papersplease.fandom.com/wiki/Discrepancies) ·
[Game Developer](https://www.gamedeveloper.com/design/designing-the-bleak-genius-of-i-papers-please-i-) (не прочитано)

---

## 8. Strange Horticulture (Bad Viking, 2022)

**1. Руками.** Рассматривает растения на полках, листает справочник, сопоставляет признаки, вешает
ярлык с названием, ходит по карте-сетке по подсказкам из писем, рассматривает письма лупой.

**2. Интерфейс.**
- Справочник растений + карта, по которой ищут новые растения и события ([PC Gamer](https://pcgamer.com/strange-horticulture-review)).
- Карта — сетка, большая, по ней ведут контекстные подсказки ([Hardcore Gamer](https://hardcoregamer.com/reviews/review-strange-horticulture/417833/),
  [Family Gaming Database](https://www.familygamingdatabase.com/game/Strange+Horticulture)).
- Лупа открывает скрытые детали в письмах ([Keengamer](https://www.keengamer.com/articles/reviews/pc-reviews/strange-horticulture-review-when-a-green-thumb-is-not-enough/)).
- Сортировку игрок организует сам: цветные ярлыки, полки ([Family Gaming Database](https://www.familygamingdatabase.com/game/Strange+Horticulture));
  есть опция авто-ярлыков ([Metaphors and Moonlight](https://metaphorsandmoonlight.com/game-review-strange-horticulture-by-bad-viking/)).
- Наказание за неверный ярлык или неверную выдачу растения — **не проверено**.

**3. Почему работает.** Опознание по описанию — работа «признак ↔ предмет» с физическим объектом,
а не с текстом. Свои ярлыки дают игроку собственную систему знаний.

**4. Критика.** Подсказки бывают слишком расплывчатыми, экран «грязный» ([Xbox Hub](https://www.thexboxhub.com/strange-horticulture-review/));
цикл быстро становится монотонным ([Way Too Many Games](https://waytoomany.games/2022/08/03/review-strange-horticulture/)).

**5. Взять.**
- *Стол:* лупа и рассматривание детали на фото и документе (продавленный карандаш, след сгиба) — по
  вкусу автора.
- *Доска:* пометки игрока на копиях улик (свой «ярлык»), которые игра не оценивает.

**6. Не брать.** Авто-ярлыки (игра сама называет предмет).

Ссылки: [PC Gamer](https://pcgamer.com/strange-horticulture-review) ·
[Xbox Hub](https://www.thexboxhub.com/strange-horticulture-review/) ·
[Way Too Many Games](https://waytoomany.games/2022/08/03/review-strange-horticulture/) ·
[Hardcore Gamer](https://hardcoregamer.com/reviews/review-strange-horticulture/417833/)

---

## 9. Shadows of Doubt (ColePowered Games, 2023)

**1. Руками.** Ходит по процедурному городу, обыскивает квартиры, снимает отпечатки, прикалывает
улики на доску, тянет нити, в конце заполняет форму дела и сдаёт её.

**2. Интерфейс.**
- Окна-«дела»: перемещаются, меняют размер, сворачиваются, прикалываются на пробковую доску; знакомый
  крестик закрытия — нарочно ([девблог #4](https://colepowered.com/?p=33958)).
- Нити: по девблогу цвет от белого к красному показывает силу инкриминации, толщина — надёжность,
  анимация показывает направление (девблог ранний, финальная версия может отличаться — **не проверено**).
- Очевидные связи (жертва ↔ адрес) игра рисует сама; на нити можно написать подпись
  ([Steam, отзыв](https://steamcommunity.com/app/986130/discussions/0/3829792817307221406)).
- Сдача дела: меню Resolve, выбор ответа на каждую цель, потом сдача ([гайд](https://gamerjournalist.com/how-to-submit-evidence-in-shadows-of-doubt),
  [Steam](https://steamcommunity.com/app/986130/discussions/0/591761524439174222)); игрок может сдать неверно.

**3. Почему работает.** Доска как рабочий стол окон экономит память: всё под рукой. Форма из
нескольких вопросов делает обвинение явным действием.

**4. Критика.** Много окон, доска громоздкая ([Xboxera](https://xboxera.com/2024/09/23/shadows-of-doubt-review));
глюки меню ([God is a Geek](https://godisageek.com/reviews/shadows-of-doubt-review/)); на контроллере
неудобно ([Quarter to Three](https://forum.quartertothree.com/t/detective-games/120211?page=15)).
GMTK (по стороннему автоконспекту) — открытые игры вынуждены подталкивать к нужным людям и местам
([videohighlight](https://videohighlight.com/v/I7q363Ic26o), слабый источник).

**5. Взять.**
- *Доска:* подпись на нити (игрок пишет «почему»), прикалывание копии одним жестом.
- *Форма решения:* разбивка на отдельные вопросы-цели (у «БУНКЕРА» 8 пунктов, это совпадает).

**6. Не брать.** Автонити, цвет и толщина, отражающие внутреннюю оценку игры, — это прямая подсветка
важного (P-1).

Ссылки: [девблог #4](https://colepowered.com/?p=33958) ·
[Xboxera](https://xboxera.com/2024/09/23/shadows-of-doubt-review) ·
[Steam](https://steamcommunity.com/app/986130/discussions/0/3829792817307221406) ·
[gamerjournalist](https://gamerjournalist.com/how-to-submit-evidence-in-shadows-of-doubt)

---

## 10. Hypnospace Outlaw (Tendershoot, 2019)

**1. Руками.** Работает в эмуляции ОС 90-х: браузер, поиск, почта; ищет нарушения на страницах и
жмёт «молоток», затем кликает нарушение.

**2. Интерфейс.**
- HypnOS — почти полноценная ОС, через неё даже настройки игры ([PC Gamer](https://pcgamer.com/hypnospace-outlaw-review),
  [GameCritics](https://gamecritics.com/gareth-payne/hypnospace-outlaw-review/)).
- Часть страниц не в каталоге и находится только поиском по верному слову (PC Gamer).
- Жалоба: молоток в браузере → щелчок по нарушению; процедура одна для всех типов нарушений
  ([PC Gamer](https://pcgamer.com/hypnospace-outlaw-review), [Game Informer](https://www.gameinformer.com/review/hypnospace-outlaw/keeping-the-information-superhighway-safe-one-weird-case-at-a-time)).

**3. Почему работает.** Одна универсальная операция «указать нарушение на странице» легко
обучается, а сложность растёт за счёт содержания. Скрытые страницы — тот же «запрос как
гипотеза», что в Her Story.

**4. Критика.** Неинтуитивный UI и зависимость от прохождений (агрегатор отзывов, [vaporlens](https://vaporlens.app/app/844590/hypnospace_outlaw), слабый источник);
к поздним делам знание интерфейса обязательно (Game Informer).

**5. Взять.**
- *Компьютер следователя:* правдоподобная ОС, где интерфейс — часть мира; одна операция «выделить
  → в дело» для всех типов материалов.

**6. Не брать.** Ничего явно против P-1 не найдено; риск — сложность ОС ради атмосферы.

Ссылки: [PC Gamer](https://pcgamer.com/hypnospace-outlaw-review) ·
[Game Informer](https://www.gameinformer.com/review/hypnospace-outlaw/keeping-the-information-superhighway-safe-one-weird-case-at-a-time) ·
[GameCritics](https://gamecritics.com/gareth-payne/hypnospace-outlaw-review/)

---

## 11. Orwell: Keeping an Eye on You (Osmotic Studios, 2016)

**1. Руками.** Читает страницы, переписку, звонки; перетаскивает подсвеченные фрагменты («датачанки»)
в профиль подозреваемого; выбирает, какую из противоречащих версий загрузить.

**2. Интерфейс.**
- Датачанки — подсвеченные извлекаемые фрагменты ([The Escapist](https://www.escapistmagazine.com/?p=60829));
  обычные синие, конфликтующие жёлтые ([Press Start](https://press-start.com.au/?p=38519)).
- Выбор версии при конфликте, загрузка необратимо влияет на сюжет ([Wikipedia](https://en.wikipedia.org/wiki/Orwell:_Keeping_an_Eye_on_You),
  [Destructoid](https://www.destructoid.com/review-in-progress-orwell-ignorance-is-strength/)).
- В финале лимит в 20 датачанков ([Wikipedia](https://en.wikipedia.org/wiki/Orwell:_Keeping_an_Eye_on_You)).

**3. Почему работает.** Выбор версии с последствиями превращает «улику» в решение с
ответственностью. Это близко к ходатайству: что ты отправишь, то и запустит процесс.

**4. Критика.** Собственно исследования мало ([Wikipedia → RPS](https://en.wikipedia.org/wiki/Orwell:_Keeping_an_Eye_on_You));
развязка висит на «угадывании по интуиции» (Wikipedia → PC Gamer); игра вынуждает загружать
определённые фрагменты, чтобы двигаться ([Well-Played](https://www.well-played.com.au/orwell-review/)).

**5. Взять.**
- *Папка ходатайства:* перетаскивание выделенного фрагмента в поле; последствие отправки
  (ответ организации) необратимо и меняет дальнейшее — вариант для автора.

**6. Не брать.** Главное: **подсветку датачанков** — игра заранее размечает, что «важно», а это
полная противоположность P-1. Именно эту разницу «БУНКЕР» должен держать: выделение делает игрок, по
любой строке.

Ссылки: [Wikipedia](https://en.wikipedia.org/wiki/Orwell:_Keeping_an_Eye_on_You) ·
[Press Start](https://press-start.com.au/?p=38519) ·
[The Escapist](https://www.escapistmagazine.com/?p=60829) ·
[Well-Played](https://www.well-played.com.au/orwell-review/)

---

## 12. The Roottrees are Dead (Evil Trout / Jeremy Johnston, 2025)

**1. Руками.** Ищет в эмулированном интернете 90-х (SpiderSearch), смотрит фото, вписывает имена,
профессии и портреты в большое генеалогическое древо на доске.

**2. Интерфейс.**
- Пробковая доска с древом; верные записи фиксируются, когда три верны ([Checkpoint Gaming](https://checkpointgaming.net/reviews/2025/01/the-roottrees-are-dead-review-tracing-family-roots/));
  другие источники описывают это как «в стиле Obra Dinn» без числа ([Klardendum](https://klardendum.com/?p=24733)) —
  точный порог **не проверен окончательно**.
- Зафиксированное нельзя изменить; верные имена убираются из пула ([Wikiwand](https://www.wikiwand.com/en/articles/The_Roottrees_are_Dead)).
- Обратная связь «что-то ещё неверно» не мгновенная, поэтому перебор утомителен ([Spectre Collie](https://spectrecollie.com/?p=22627)).
- Блокнот «один из самых ловких», легко переключаться между уликами и заметками
  ([PC Gamer](https://www.pcgamer.com/games/puzzle/the-roottrees-are-dead-review), [Polygon через зеркало](https://updategamers.netlify.app/host-https-www.polygon.com/impressions/518003/the-roottrees-are-dead-mystery-review-impressions/)).

**3. Почему работает.** Групповая фиксация (см. Obra Dinn) плюс поиск по старому вебу: проверка без
раскрытия. Удаление верных имён из пула сокращает пространство поиска честно, за заслугу.

**4. Критика.** Генеративная графика ([PC Gamer](https://www.pcgamer.com/games/puzzle/the-roottrees-are-dead-review));
игра немного затянута ([Vice](https://www.vice.com/en/article/the-roottrees-are-dead-is-a-puzzling-narrative-that-made-me-an-armchair-detective-review)).

**5. Взять.**
- *Компьютер:* поиск в архиве как имитация медленного старого поиска (и это удовольствие, а не
  только помеха: [PC Gamer](https://www.pcgamer.com/games/puzzle/the-best-part-of-this-brilliant-detective-game-is-going-back-to-a-time-when-searching-the-internet-was-a-huge-pain-uh-for-different-reasons-than-it-is-now)).
- *Форма решения:* «удаление из пула после подтверждения» — только если автор выберет
  промежуточную проверку.

**6. Не брать.** Фиксацию без возможности пересмотра, если в «БУНКЕРЕ» заключение пишется один раз.

Ссылки: [Checkpoint Gaming](https://checkpointgaming.net/reviews/2025/01/the-roottrees-are-dead-review-tracing-family-roots/) ·
[PC Gamer](https://www.pcgamer.com/games/puzzle/the-roottrees-are-dead-review) ·
[Spectre Collie](https://spectrecollie.com/?p=22627) ·
[Wikipedia](https://en.wikipedia.org/wiki/The_Roottrees_are_Dead)

---

## 13. Paradise Killer (Kaizen Game Works, 2020)

**1. Руками.** Свободно бродит по острову, собирает улики и показания, сам решает, когда начать суд;
на суде предъявляет доказательства и обвиняет.

**2. Интерфейс.**
- Суд можно начать в любой момент; чем больше улик, тем вероятнее осуждение ([Wikipedia → Destructoid](https://en.wikipedia.org/wiki/Paradise_Killer)).
- Игра не сообщает, хватает ли доказательств ([Jump Dash Roll](https://jumpdashroll.com/article/paradise-killer-review),
  [Gaming Trend](https://gamingtrend.com/red-skies-love-dies-truth-hides-paradise-killer-review/)).
- Структура дела (как хранятся улики) — **не проверено** по источнику.

**3. Почему работает.** Истина — то, что игрок смог доказать: ответственность и свобода. GMTK
(по автоконспекту) приводит игру как пример, где обвинение — центральная сцена
([videohighlight](https://videohighlight.com/v/I7q363Ic26o), слабый источник).

**4. Критика.** Суд — «пришитый эссе-вывод» ([Select Button](https://selectbutton.com/reviews/paradise-killer-review));
финал неудовлетворителен; приходится спрашивать всех об одной и той же улике ([Entertainium](https://entertainium.co/2020/09/28/paradise-killer-review/));
это не головоломка, а «информированное угадывание» (там же, по выдержке поиска).

**5. Взять.**
- *Форма решения:* подача в любой момент, без подтверждения «достаточно ли» (совпадает с P-1).
  Опоры-цитаты к каждому пункту — защита от «эссе без доказательств».

**6. Не брать.** Повторы «спроси всех о каждом» (дорогая и скучная операция).

Ссылки: [Wikipedia](https://en.wikipedia.org/wiki/Paradise_Killer) ·
[Select Button](https://selectbutton.com/reviews/paradise-killer-review) ·
[Jump Dash Roll](https://jumpdashroll.com/article/paradise-killer-review) ·
[Entertainium](https://entertainium.co/2020/09/28/paradise-killer-review/)

---

## 14. Disco Elysium (ZA/UM, 2019)

**1. Руками.** Читает диалог в правой колонке, выбирает реплики, бросает проверки навыков,
«вынашивает» мысли в кабинете мыслей.

**2. Интерфейс.**
- Колонка диалога сделана по модели ленты Twitter: текст «поднимается» колонкой, люди схватывают
  суть, а не читают каждое слово (Курвиц) ([80.lv](https://80.lv/articles/disco-elysium-working-on-ui-design)).
- Кабинет мыслей: мысль открывается в разговоре, «вынашивается» несколько игровых часов, слоты
  ограничены ([Wikipedia](https://en.wikipedia.org/wiki/Disco_Elysium)); фича едва не потопила проект
  ([GameSpot](https://gamespot.com/articles/how-the-feature-that-almost-sunk-disco-elysium-was/1100-6472676/)).
- Журнал задач со списком текущих дел и прогрессом ([GamePressure](https://www.gamepressure.com/disco-elysium/user-interface/z5e3e8)).

**3. Почему работает.** Длинный текст читается колонкой с ясной иерархией: кто говорит, что выбрать.

**4. Критика.** Eurogamer — «заметное отсутствие фокуса» ([Wikipedia](https://en.wikipedia.org/wiki/Disco_Elysium));
UI нельзя настроить (GamePressure). Конкретной критики журнала не найдено (**не проверено**).

**5. Взять.**
- *Просмотрщик:* стенограммы допросов и расшифровки — колонкой с чёткой меткой говорящего, удобной
  для выделения строки.

**6. Не брать.** Журнал задач с прогрессом (это счётчик и указатель цели, P-1); внутренние голоса,
подсказывающие вывод.

Ссылки: [Wikipedia](https://en.wikipedia.org/wiki/Disco_Elysium) ·
[80.lv](https://80.lv/articles/disco-elysium-working-on-ui-design) ·
[GameSpot](https://gamespot.com/articles/how-the-feature-that-almost-sunk-disco-elysium-was/1100-6472676/)

---

## 15. Sherlock Holmes: Crimes & Punishments (Frogwares, 2014)

**1. Руками.** Осматривает места, собирает улики, на «доске дедукции» соединяет факты в выводы,
выбирает трактовку, затем осуждает или отпускает виновного.

**2. Интерфейс.**
- Доска дедукции: связанные факты образуют дерево выводов; разные трактовки ведут к разным
  заключениям, можно ошибиться ([Wikipedia](https://en.wikipedia.org/wiki/Sherlock_Holmes:_Crimes_%26_Punishments)).
- Некоторые узлы дают выбор из нескольких трактовок ([The Sixth Axis](https://www.thesixthaxis.com/2014/09/30/sherlock-holmes-crimes-punishments-review/));
  дело можно закрыть с неверными данными (там же).
- 3–5 решений на дело; после вывода — моральный выбор «оправдать/осудить» (Wikipedia).
- «Шерлоковское зрение» подсвечивает скрытые улики (Wikipedia).
- Можно ли после выбора узнать, был ли прав, — **не проверено**.

**3. Почему работает.** Дерево показывает, *из чего* следует вывод: явная цепочка «факт → факт →
заключение». Возможность ошибиться без сообщения — честное следствие.

**4. Критика.** Финальные выводы строятся на сети косвенных улик (IGN, Wikipedia); «правильный» выбор
обычно очевиден ([The Skinny](https://www.theskinny.co.uk/tech/gaming/sherlock-holmes-crimes-punishments));
мутные развязки, ужасное управление взломом замков ([OpenCritic](https://opencritic.com/game/203/-/reviews)).

**5. Взять.**
- *Доска:* опорная структура «две копии → нить → подпись вывода» — игрок формулирует, что из
  связи следует. Игра не проверяет доску.
- *Форма решения:* выбор из нескольких правдоподобных трактовок по каждому пункту (совпадает с
  «выбор + опоры»).
- *Замки:* предостережение — мини-игра взлома должна быть простой и надёжной в управлении.

**6. Не брать.** «Шерлоковское зрение» (подсветка); проверку и «зажигание» узлов доски (если игра
подтверждает связь, доска становится подсказкой).

Ссылки: [Wikipedia](https://en.wikipedia.org/wiki/Sherlock_Holmes:_Crimes_%26_Punishments) ·
[The Sixth Axis](https://www.thesixthaxis.com/2014/09/30/sherlock-holmes-crimes-punishments-review/) ·
[The Skinny](https://www.theskinny.co.uk/tech/gaming/sherlock-holmes-crimes-punishments) ·
[GameCritics](https://gamecritics.com/jay-pullman/sherlock-holmes-crimes-punishments-review/)

---

## 16. Sherlock Holmes Chapter One (Frogwares, 2021)

**1. Руками.** Ходит по открытому острову, собирает улики в дело, прикрепляет («pin») улику, чтобы
спрашивать о ней людей или следовать по следу, соединяет факты во «дворце разума», выбирает
трактовку.

**2. Интерфейс.**
- Дворец разума: соединить два факта → получить информацию; затем экран выводов с «???»;
  некоторые сочетания дают несколько трактовок, можно выбрать неверного подозреваемого
  ([Pro Game Guides](https://progameguides.com/sherlock-holmes-chapter-one/how-the-mind-palace-works-in-sherlock-holmes-chapter-one/)).
  Источники расходятся, можно ли соединить неверное (там же).
- Casebook: выбрать дело, прикрепить улику ([Selphie1999](https://selphie1999gaming.com/game-guides/sherlock-holmes-chapter-one-love-death-and-cordona-100-case-walkthrough-guide/));
  режим Concentration облегчает поиск улик и реконструкцию событий ([TrueAchievements](https://www.trueachievements.com/game/Sherlock-Holmes-Chapter-One/walkthrough/3)).
- Компас показывает близкие ненайденные улики ([CGMagazine](https://www.cgmagonline.com/review/game/sherlock-holmes-chapter-one-review)).
- Концовка зависит от выбранных рассуждений ([Wikipedia](https://en.wikipedia.org/wiki/Sherlock_Holmes_Chapter_One)).

**3. Почему работает.** «Прикрепить улику» — короткая операция «держу в голове этот факт» при
разговоре и ходьбе; снижает нагрузку.

**4. Критика.** Ответы не всегда ясны ([PC Gamer](https://pcgamer.com/sherlock-holmes-chapter-one-review),
по выдержке); пустой открытый мир, слабый бой ([Wikipedia](https://en.wikipedia.org/wiki/Sherlock_Holmes_Chapter_One)); «элементарно» (IGN, GameSpot — там же).

**5. Взять.**
- *Папка ходатайства / почта:* «прикрепить» выделенную карточку к текущему черновику, чтобы
  она была под рукой при чтении других документов.

**6. Не брать.** Компас ненайденных улик, Concentration-подсветку, «???» на месте ещё не сделанного
вывода (сообщает, что вывод существует) — всё это противоречит P-1.

Ссылки: [Pro Game Guides](https://progameguides.com/sherlock-holmes-chapter-one/how-the-mind-palace-works-in-sherlock-holmes-chapter-one/) ·
[CGMagazine](https://www.cgmagonline.com/review/game/sherlock-holmes-chapter-one-review) ·
[Wikipedia](https://en.wikipedia.org/wiki/Sherlock_Holmes_Chapter_One) ·
[TrueAchievements](https://www.trueachievements.com/game/Sherlock-Holmes-Chapter-One/walkthrough/3)

---

## 17. L.A. Noire (Team Bondi / Rockstar, 2011; ремастер 2017)

**1. Руками.** Осматривает место, поднимает и вертит предметы, ведёт блокнот, на допросе выбирает
реакцию и предъявляет улику из блокнота.

**2. Интерфейс.**
- Сигнал улики: музыкальный звон и вибрация; когда место отработано, музыка затихает; сигналы
  отключаемы ([Prima](https://primagames.com/eguides/la-noire-2017-remaster/basics/detective-work)).
- Допрос: «Правда/Сомнение/Ложь» в ремастере переименованы в «Добрый коп/Злой коп/Обвинить»
  из-за путаницы, «Сомнение» читалось не как середина ([Push Square](https://www.pushsquare.com/news/2017/11/l_a_noire_remaster_does_away_with_its_often_confusing_trust_doubt_lie_system),
  [Windows Central](https://windowscentral.com/la-noire-changes-interrogation-techniques-remaster)).
- Обвинение во лжи требует предъявить улику из блокнота ([The Sixth Axis](https://www.thesixthaxis.com/2011/03/22/hands-on-l-a-noire/2/),
  [Steam](https://steamcommunity.com/app/110800/discussions/0/1640916564840258700)).
- Очки интуиции убирают неверный ответ или подсвечивают улики ([Prima](https://primagames.com/eguides/la-noire-2017-remaster/basics/intuition-rank)).

**3. Почему работает.** «Обвиняешь — докажи предметом» — то же, что «На основании» в ходатайстве:
утверждение без опоры не принимается.

**4. Критика.** Звон превращает поиск в езду «бульдозером» ([Giant Bomb, отзыв](https://www.giantbomb.com/la-noire/3030-21500/user-reviews/2200-23543/));
без сигналов почти невозможно (там же); ассисты делают расследование скучным ([Game Rant](https://gamerant.com/la-noire-reviews/));
надо точно встать, чтобы взять видимую улику ([Cybershack](https://cybershack.com.au/cybershack/review-la-noire-ps3));
Барлоу критиковал игру за то, что она «заставляет почувствовать себя умным», не давая настоящей
задачи (утверждение встретилось в сводке поиска, конкретное интервью **не установлено, не проверено**).

**5. Взять.**
- *Папка ходатайства:* без опоры в «На основании» отправка бессмысленна (решение автора, будет
  ли это отказ организации или просто невозможность отправить).
- *Подписи действий:* назвать кнопки по действию, а не по суждению (урок переименования).

**6. Не брать.** Звон и вибрацию у улик, «музыка затихла = всё найдено», очки интуиции — всё это
счётчики и подсветка.

Ссылки: [Prima — detective work](https://primagames.com/eguides/la-noire-2017-remaster/basics/detective-work) ·
[Push Square](https://www.pushsquare.com/news/2017/11/l_a_noire_remaster_does_away_with_its_often_confusing_trust_doubt_lie_system) ·
[The Sixth Axis](https://www.thesixthaxis.com/2011/03/22/hands-on-l-a-noire/2/) ·
[Giant Bomb](https://www.giantbomb.com/la-noire/3030-21500/user-reviews/2200-23543/)

---

## 18. Unpacking (Witch Beam, 2021)

**1. Руками.** Вынимает вещи из коробок по одной, вертит, ставит на полки и поверхности; по вещам
восстанавливает жизнь человека без единого слова.

**2. Интерфейс.**
- Нет очков, провалов и наказаний; сюжет передаётся только предметами и окружением ([Game Developer](https://gamedeveloper.com/design/unpacking-the-design-pillars-of-a-chill-puzzle-game)).
- «Вычитающий дизайн»: всё, что не служит ядру, убрано на прототипе; три опоры — созерцание,
  открытие, выражение (там же).
- Около 14 000 фоли-звуков, звук зависит от поверхности, «побеждает мягкий материал»
  ([Game Developer](https://www.gamedeveloper.com/marketing/auditory-tales-from-the-making-of-zen-puzzler-unpacking),
  [Audiokinetic](https://www.audiokinetic.com/en/blog/unpacking-the-fun-behind-the-foley)).
- В конце уровня неуместные вещи обводятся пульсирующим красным контуром со звуком; отключается
  в настройках ([Checkpoint](https://checkpointgaming.net/reviews/2021/11/unpacking-review-home-sweet-home/),
  [NME](https://www.nme.com/reviews/unpacking-review-your-lifes-story-in-boxes-3084559)).

**3. Почему работает.** Предмет рассказывает историю через износ, повтор и отсутствие (вещь
исчезла из следующей квартиры). Звук на поверхности даёт телесную обратную связь без текста.

**4. Критика.** Конкретной критики UI в найденных источниках нет (**не проверено**); частая жалоба
игроков на красный контур — **не проверено**.

**5. Взять.**
- *Стол:* звук бумаги, фото и папки по разным поверхностям (стол, папка, другой лист); вес и
  инерция при перетаскивании.
- *Улики-предметы:* «что пропало между двумя снимками или описями» (нетекстовая операция «найти
  отсутствующее»; совпадает со вкусом автора к следам обращения).
- *Обучение:* без текста, через сам предмет.

**6. Не брать.** Красный контур «не на месте» — прямая подсветка ошибки.

Ссылки: [Game Developer — pillars](https://gamedeveloper.com/design/unpacking-the-design-pillars-of-a-chill-puzzle-game) ·
[Game Developer — audio](https://www.gamedeveloper.com/marketing/auditory-tales-from-the-making-of-zen-puzzler-unpacking) ·
[Audiokinetic](https://www.audiokinetic.com/en/blog/unpacking-the-fun-behind-the-foley) ·
[Checkpoint](https://checkpointgaming.net/reviews/2021/11/unpacking-review-home-sweet-home/)

---

## 19. Lorelei and the Laser Eyes (Simogo, 2024)

**1. Руками.** Ходит по отелю, читает документы, смотрит фильмы, вводит числа и слова в замки,
делает заметки на бумаге.

**2. Интерфейс.**
- «Фотографическая память»: каждый прочитанный документ сохраняется в меню ([Destructoid](https://vip-develop.destructoid.com/?p=495649),
  [Aftermath](https://aftermath.site/lorelei-laser-eyes-tips-steam-nintendo)).
- По сути три кнопки: меню, взаимодействие, подтверждение ([CGMagazine](https://www.cgmagonline.com/review/game/lorelei-and-the-laser-eyes-review)).
- Памяти недостаточно, нужны бумага и ручка ([GameSpot](https://www.GameSpot.com/reviews/lorelei-and-the-laser-eyes-review-a-mastery-of-illusions/1900-6418228/)).

**3. Почему работает.** Архив всего прочитанного снимает страх «пропустил и не вернусь», а
решение остаётся на бумаге игрока. Замок как вопрос «докажи, что понял» — без подсказок.

**4. Критика.** Меню памяти полное, но неуклюжее ([Aftermath](https://aftermath.site/lorelei-laser-eyes-tips-steam-nintendo),
[PC Invasion](https://pcinvasion.com/?p=439421)); неумолимость к ошибкам ([CGMagazine](https://www.cgmagonline.com/review/game/lorelei-and-the-laser-eyes-review));
экраны Game Over не идут игре на пользу ([Twinfinite](https://twinfinite.net/reviews/lorelei-and-the-laser-eyes-review/?amp=1));
слабое место — ряд математических загадок без нарративного контекста ([Room Escape Artist](https://roomescapeartist.com/2024/11/08/lorelei-laser-eyes-review)).

**5. Взять.**
- *Замки:* код = доказательство понимания, а не угадывание; замок должен иметь причину в мире
  (принцип сводов: у материала есть автор и причина).
- *Стол:* документ, однажды выложенный на стол, не исчезает (архив прочитанного без отметок «важно»).

**6. Не брать.** Наказание за неверный ввод в замок, вплоть до Game Over; загадки без связи с
делом.

Ссылки: [Destructoid](https://vip-develop.destructoid.com/?p=495649) ·
[Aftermath](https://aftermath.site/lorelei-laser-eyes-tips-steam-nintendo) ·
[GameSpot](https://www.GameSpot.com/reviews/lorelei-and-the-laser-eyes-review-a-mastery-of-illusions/1900-6418228/) ·
[CGMagazine](https://www.cgmagonline.com/review/game/lorelei-and-the-laser-eyes-review)

---

## 20. The Painscreek Killings (EQ Studios, 2017)

**1. Руками.** Ходит по заброшенному городу, ищет ключи, читает записки и дневники, фотографирует
камерой журналистки.

**2. Интерфейс.**
- Камера фотографирует записки, предметы и виды ([TV Tropes](https://www.tvtropes.org/pmwiki/pmwiki.php/VideoGame/ThePainscreekKillings), источник средний).
- Нет квестовых маркеров и подсказок ([Steam](https://store.steampowered.com/app/624270/The_Painscreek_Killings/)).
- Есть ли гейтинг «предмет появится только после прочтения записки» — **не проверено**.

**3. Почему работает.** Отсутствие маркеров делает осмотр пространства основным действием,
а фото — способом «унести» деталь.

**4. Критика.** Подходит узкой аудитории, по сути линейный «симулятор ходьбы» приличной длины
([Puzzles, Riddles and Murders](https://puzzlesriddlesandmurders.blogspot.com/2025/02/the-painscreek-killings-2017-allows-me.html),
по выдержке поиска; страницу открыть не удалось).

**5. Взять.**
- *Доска:* копия улики = «снимок» с оригинала (близко к доске «БУНКЕРА»).
- *Комната и виды:* без маркеров; внимание ведёт сама обстановка.

**6. Не брать.** — (против P-1 ничего не найдено).

Ссылки: [Steam](https://store.steampowered.com/app/624270/The_Painscreek_Killings/) ·
[TV Tropes](https://www.tvtropes.org/pmwiki/pmwiki.php/VideoGame/ThePainscreekKillings) ·
[IGF](https://igf.com/painscreek-killings)

---

## 21. Not For Broadcast (NotGames, 2022)

**1. Руками.** Переключает камеры на микшере, следит за помехами по осциллографу, глушит мат,
выбирает рекламу и заголовки; после эфира пересматривает запись и неиспользованные кадры.

**2. Интерфейс.**
- Микшер с задержкой эфира 2 с; бип-цензура; помехи по осциллографу; падение аудитории до нуля =
  провал ([Wikipedia](https://en.wikipedia.org/wiki/Not_for_Broadcast)).
- После эфира можно пересмотреть передачу и неиспользованные кадры (там же).
- Задержка эфира нужна, чтобы успеть заглушить ([GameGrin](https://www.gamegrin.com/reviews/not-for-broadcast-review)).

**3. Почему работает.** Многозадачность в реальном времени. Для «БУНКЕРА» интересен не микшер, а
идея «несмонтированного материала»: разница между эфиром и сырыми кадрами показывает, что скрыли.

**4. Критика.** «Пугающая панель» кнопок ([HCC Times](https://hcctimes.org/2023/02/not-for-broadcast-review));
политика «слишком в лоб» в ранней версии ([Wikipedia → Polygon](https://en.wikipedia.org/wiki/Not_for_Broadcast)).

**5. Взять.**
- *Просмотрщик видео:* операция «сравнить смонтированную версию и исходник» — нетекстовая, с причиной
  существования носителя.

**6. Не брать.** Таймеры, шкалу аудитории (счётчик), стресс реального времени.

Ссылки: [Wikipedia](https://en.wikipedia.org/wiki/Not_for_Broadcast) ·
[GameGrin](https://www.gamegrin.com/reviews/not-for-broadcast-review) ·
[PC Gamer](https://www.pcgamer.com/not-for-broadcast-review)

---

## Дополнительные игры

### 22. Chants of Sennaar (Rundisc, 2023)

**1. Руками.** Видит незнакомые глифы, вписывает в журнал свою догадку о значении; на страницах
проверки сопоставляет глифы с картинками.

**2. Интерфейс.** Глифы записываются в журнал, игрок вводит догадки; если все глифы на развороте
верны, все подтверждаются сразу и показываются истинные значения; если глифов не хватает, к
развороту возвращаются позже ([The Language Closet](https://thelanguagecloset.com/2024/12/07/playing-chants-of-sennaar/),
[гайд](https://indiegameculture.com/guides/chants-of-sennaar-abbey-guide-full-walkthrough)). Разработчик
закрепил в Steam список подсказок по уровням ([Steam](https://steamcommunity.com/app/1931770/discussions/0/4143942360095589829)).
Есть ли кнопка подсказки в самой игре — **не проверено** (упоминание есть только в комментарии игрока).

**3. Почему работает.** Проверка «всё на странице или ничего» — тот же принцип, что тройки Obra
Dinn: подтверждение без указания, какая догадка была неверна.

**4. Критика.** Конкретной критики UI не найдено (**не проверено**).

**5. Взять.** *Форма решения:* если автор захочет промежуточную проверку — проверять смысловой блок
целиком.

**6. Не брать.** Автоматический сбор всех встреченных глифов в журнал (аналог автоподсветки
важного): для «БУНКЕРА» лишнее.

Ссылки: [The Language Closet](https://thelanguagecloset.com/2024/12/07/playing-chants-of-sennaar/) ·
[Steam](https://steamcommunity.com/app/1931770/discussions/0/4143942360095589829)

### 23. Overboard! (inkle, 2021)

**1. Руками.** Играет убийцей; проживает один день на лайнере снова и снова, меняя, с кем и когда говорить.

**2. Интерфейс.** Каждое действие двигает время; в конце дня совещание, где решают виновного; герой
не помнит прошлые прогоны, помнит игрок; прогресс отражается списком поставленных вопросов;
повторённые диалоги можно промотать ([bit-tech](https://bit-tech.net/reviews/gaming/pc/overboard-review/1/),
[Nintendo World Report](https://nintendoworldreport.com/review/57396/overboard-switch-review),
[Finger Guns](https://fingerguns.net/reviews/2021/06/08/overboard-review-switch-sea-senor-sea/)).

**3. Почему работает.** Знание игрока и есть ключ: перемотка снимает повтор, но не решение.

**4. Критика.** Изменение одной мелочи требует переиграть весь день, 35-минутные отрезки испытывают
терпение (там же).

**5. Взять.** *Комната и виды / просмотрщик:* быстрый возврат к уже виденному (документ открывается
там, где его оставили).

**6. Не брать.** Список «вопросов» как трекер целей (P-1).

Ссылки: [bit-tech](https://bit-tech.net/reviews/gaming/pc/overboard-review/1/) ·
[Nintendo World Report](https://nintendoworldreport.com/review/57396/overboard-switch-review) ·
[PC Gamer](https://www.pcgamer.com/reverse-murder-mystery-overboard-is-a-deliciously-evil-twist-on-the-detective-genre)

### 24. The Operator (Bureau 81, 2024)

**1. Руками.** Оператор спецслужбы на вымышленной ОС: ищет в базе имён, разбирает телефонные
записи, улучшает зернистое видео, помогает агентам в поле.

**2. Интерфейс.** База имён, несколько программ, каждая используется примерно один раз; найденный
ответ (имя, адрес, «что-то не так») надо соединить с ключевым словом вверху экрана, чтобы
проверить его ([Destructoid](https://www.destructoid.com/reviews/review-the-operator/)).

**3. Почему работает.** Аналитика записей и видео интереснее перестрелок ([Gaming.net](https://www.gaming.net/reviews/the-operator-review-pc)).

**4. Критика.** Неглубоко: игрок в основном толкует инструкции, а узкие инструменты дают ощущение
продвижения, а не ума ([Destructoid](https://www.destructoid.com/reviews/review-the-operator/));
слабый финал ([OpenCritic](https://opencritic.com/game/17026/-/reviews)).

**5. Взять.** *Компьютер и устройства:* инструмент, который нужен ровно в одном месте, — не
порок, если его применение игрок выбирает сам. Риск, который показал Destructoid: когда каждая
программа = одна загадка, это читается как «инструкция».

**6. Не брать.** Явное ключевое слово-вопрос сверху экрана, которое говорит, что искать (P-1).

Ссылки: [Destructoid](https://www.destructoid.com/reviews/review-the-operator/) ·
[Gaming.net](https://www.gaming.net/reviews/the-operator-review-pc) ·
[OpenCritic](https://opencritic.com/game/17026/-/reviews)

### 25. Duck Detective: The Secret Salami (Happy Broccoli Games, 2024)

**1. Руками.** Осматривает героев и место, собирает слова, заполняет «дедукции» в стиле Mad Libs.

**2. Интерфейс.** Процедура разбита на отдельные механики, так что абстрактных действий почти нет
([Gaming Trend](https://gamingtrend.com/reviews/duck-detective-the-secret-salami-review-its-time-to-quack-the-case-ducktective));
обратная связь при ошибке — **не проверено**.

**3. Почему работает.** Лёгкая версия Obra Dinn / Golden Idol ([Xbox Hub](https://www.thexboxhub.com/duck-detective-the-secret-salami-review/)).

**4. Критика.** Подсказки «крайне слабые»: персонаж просто повторяет «осмотри место / поговори»
([Adventure Game Hotspot](https://adventuregamehotspot.com/review/1705/duck-detective-the-secret-salami));
улики не ведут, рецензент включил сюжетный режим ([Prima](https://primagames.com/?p=327995)).

**5. Взять.** Урок: общая подсказка «ищи внимательнее» бесполезна и раздражает. Если игрок
застрял, помогать должен материал (вторая опора), а не голос игры.

**6. Не брать.** Подсказки-реплики.

Ссылки: [Adventure Game Hotspot](https://adventuregamehotspot.com/review/1705/duck-detective-the-secret-salami) ·
[Gaming Trend](https://gamingtrend.com/reviews/duck-detective-the-secret-salami-review-its-time-to-quack-the-case-ducktective) ·
[Prima](https://primagames.com/?p=327995)

---

## Где факты не проверены (сводно)

- Obra Dinn: точное правило уменьшения групп к концу; содержание TIGSource-девлога не прочитано.
- Her Story: причина лимита в 5 результатов (у Барлоу не найдена).
- Immortality: конкретный жест открытия скрытых кадров.
- Papers, Please: обзорная критика UI.
- Strange Horticulture: что происходит при неверном ярлыке или выдаче.
- Shadows of Doubt: соответствие финальной доски девблогу #4 (цвет и толщина нитей).
- Roottrees: точный порог фиксации (три или «группа»).
- Paradise Killer: структура хранения улик.
- Crimes & Punishments: можно ли узнать правильность вывода после выбора.
- Unpacking, Chants of Sennaar: конкретная критика UI.
- Painscreek: гейтинг предметов через прочтение.
- Duck Detective: обратная связь при ошибке.
- GMTK: использован только сторонний автоконспект видео «The 3 Types of Detective Game».

---

## Таблица: игра → что взять → модуль «БУНКЕРА»

| Игра | Что взять | Модуль |
|---|---|---|
| Her Story | Запрос = гипотеза; ограниченная выдача; конец назначает игрок | Компьютер; папка ходатайства; форма решения |
| Telling Lies | Скраб по шкале; щелчок по слову расшифровки → выделение; поиск «второй половины» | Просмотрщик; компьютер |
| Immortality | Пауза и рассмотрение детали кадра (связь строит игрок) | Просмотрщик |
| Obra Dinn | Групповая проверка (вариант для автора); «матрица признаков» как форма игрока | Форма решения; доска |
| Golden Idol | Предложения с пропусками + перетаскиваемые опоры; тестирование на темп; убирать короткие пути | Форма решения; папка ходатайства |
| Rise of the Golden Idol | Черновик рядом с документом (второй слот) | Просмотрщик; папка ходатайства |
| Papers, Please | Перекладывание листов по столу; «указать две строки» как основание; штамп/подпись | Стол; папка ходатайства |
| Strange Horticulture | Лупа на детали; свои пометки игрока без оценки | Стол; доска |
| Shadows of Doubt | Подпись на нити; прикалывание копии одним жестом; форма из вопросов | Доска; форма решения |
| Hypnospace Outlaw | Правдоподобная ОС; одна универсальная операция «выделить → в дело» | Компьютер и устройства |
| Orwell | Перетаскивание фрагмента в поле; необратимые последствия отправки (вариант) | Папка ходатайства; почта |
| Roottrees are Dead | Медленный поиск как удовольствие; удаление из пула после подтверждения (если будет проверка) | Компьютер; форма решения |
| Paradise Killer | Подача в любой момент без сообщения «хватит ли» | Форма решения |
| Disco Elysium | Стенограмма колонкой с меткой говорящего | Просмотрщик |
| Crimes & Punishments | Нить + подпись вывода; выбор из правдоподобных трактовок; простое управление мини-игр | Доска; форма решения; замки |
| Chapter One | «Прикрепить» карточку к черновику | Папка ходатайства; почта |
| L.A. Noire | Обвинение только с опорой; кнопки по действию, а не по суждению | Папка ходатайства; форма решения |
| Unpacking | Звук и вес предметов по поверхностям; «что пропало» между двумя описями или снимками | Стол; улики-предметы |
| Lorelei | Код = доказательство понимания; прочитанное не исчезает | Замки; стол |
| Painscreek | Без маркеров; копия как «снимок» | Комната и виды; доска |
| Not For Broadcast | Сравнение смонтированной версии и исходника | Просмотрщик |
| Chants of Sennaar | Проверка смыслового блока целиком (вариант) | Форма решения |
| Overboard! | Быстрый возврат к виденному | Комната и виды; просмотрщик |
| The Operator | Инструмент, применение которого выбирает игрок (а не «одна программа = одна загадка») | Компьютер и устройства |
| Duck Detective | Не давать общих подсказок-реплик; помогать материалом | Все (антипример) |

**Сквозной список «не брать» (P-1):** подсветка собираемого (Golden Idol, Orwell, Sherlock Vision,
Concentration), компас и звон ненайденного (Chapter One, L.A. Noire), счётчики прогресса
(Her Story database checker, журнал задач Disco Elysium, шкала аудитории), «≤2 ошибки»
(Golden Idol), проявление лица как сигнал достаточности (Obra Dinn), автонити и смысловой цвет нитей
(Shadows of Doubt), красный контур ошибки (Unpacking), уровневые и реплик-подсказки (Rise, Duck
Detective), автоматический банк найденного (Rise, Chants of Sennaar).
