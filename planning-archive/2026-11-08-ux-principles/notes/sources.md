# Источники по UX и геймдизайну для интерфейса БУНКЕРА

Собрано 2026-11-08 (помощник C, литература). Это рабочая заметка для `game/docs/research/ux-sources.md`,
не канон и не решение автора.

## Как читать

Пометка у каждого правила:

- **[П]**: проверено по первоисточнику: страница автора или издателя, официальный документ, сам текст
  (PDF диссертации прочитан целиком).
- **[ПП]**: по пересказу. Ссылка на пересказ стоит рядом; по книге не сверено.
- **[НП]**: не проверено. Утверждение известно, подтверждения в сети не нашлось.
- **Вывод для БУНКЕРА**: наша интерпретация, в источнике её нет.

Номера страниц даны только там, где их приводит найденный источник. Своих номеров нет.

Коды модулей (по ним собрана сводная таблица):
КОМН — комната и 3D-переходы между видами; СТОЛ — стол вид сверху, бумаги двигаются; ДОК — просмотрщик
документа по центру; ДОСКА — доска с нитями; ПК — компьютер и устройства; ЗАМОК — замки на устройствах;
ХОД — папка ходатайств (строка → карточка в поле); ЗАКЛ — форма заключения; ТЕКСТ — типографика и чтение;
СТИЛЬ — общий визуальный стиль; ВСЁ — сквозное правило.

---

## 1. Steve Swink, «Game Feel: A Game Designer's Guide to Virtual Sensation» (2008, Morgan Kaufmann / CRC Press)

Плюс статья самого Свинка: «Game Feel: The Secret Ingredient», Gamasutra / Game Developer, 23.11.2007,
https://www.gamedeveloper.com/design/game-feel-the-secret-ingredient

- **Определение [ПП]**: game feel — «real-time control of virtual objects in a simulated space, with
  interactions emphasized by polish». Пересказ: https://en.wikipedia.org/wiki/Game_feel ,
  https://arxiv.org/pdf/2011.09201
- **Шесть составляющих [П, статья 2007]**: input, response, context, polish, metaphor, rules. Polish:
  «The interactive impression of physicality created by the harmony of animation, sounds, and effects
  with input-driven motion». Metaphor: «lends emotional meaning to motion and provides familiarity to
  mitigate learning frustration».
- **Правило S1, полировка ради физики мира [П]**: «Any effect that enhances the impression that the game
  world has its own self consistent physics is fair game». Проверка: у каждого перетаскиваемого предмета
  (бумага, фото, карточка) есть свой отклик: звук, тень, лёгкий подъём при захвате. Он одинаков для
  всех предметов одного класса. → СТОЛ, ДОСКА, ХОД.
- **Правило S2, полировка дёшево [П]**: «polish is a notorious time sink»; для мягкого объекта
  «simple squash and stretch deformation is probably enough». Проверка: эффект передаёт свойство
  материала (бумага гнётся, картон нет) самым простым приёмом, без симуляции. → СТОЛ.
- **Правило S3, метафора задаёт ожидания [П]**: «if it's going to be a car, it needs to read as a car».
  Проверка: если предмет на столе выглядит как бумага, он ведёт себя как бумага: двигается, ложится
  поверх других, не отскакивает. Иначе метафора ломается. → СТОЛ, СТИЛЬ.
- **Правило S4, порог «реального времени» [ПП]**: в книге цикл восприятия и реакции около 240 мс со
  ссылкой на Card, Moran & Newell (1983); отклик управления желателен не дольше ~100 мс (Swink,
  pp. 34 f., по лекции https://medienwissenschaft.uni-bayreuth.de/wp-content/uploads/GxD-07-Interfaces.pdf ;
  цифры 100/240 по книге не сверены). Проверка: захват бумаги, начало движения камеры и нажатие на
  строку ходатайства дают видимый отклик за ≤ 100 мс. → ВСЁ.
- **Правило S5, семь принципов хорошего «ощущения» [ПП, Wikipedia]**: predictable results,
  instantaneous response, easy but deep, novelty, appealing response, organic motion, harmony.
  Для нас главные — predictable results и harmony: одно действие всегда даёт один и тот же результат.

**Спор с требованиями автора.** «Juice» (сочная обратная связь) противоречит принципу «не подсвечивать
важное», если отклик зависит от содержания: особый звук или вспышка у ключевого документа уже подсказка.
Где прав кто: Свинк прав для *действия*, автор прав для *смысла*. Отклик должен зависеть от типа
действия и материала, а не от значимости улики (вывод для БУНКЕРА).

---

## 2. Don Norman, «The Design of Everyday Things», revised and expanded edition (2013, Basic Books; 1-е изд. 1988)

Плюс эссе: Norman, «Signifiers, not affordances», ACM Interactions 15(6), 2008, https://jnd.org/signifiers-not-affordances/

- **Структура [ПП]**: в гл. 1 «The Psychopathology of Everyday Things» есть раздел «Fundamental Principles
  of Interaction» (с. 10 по оглавлению 2013 г., пересказ оглавления: https://www.jnd.org/books/the-design-of-everyday-things-revised-and-expanded/).
  Гл. 4 называется «Knowing What to Do: Constraints, Discoverability, and Feedback» (то же оглавление).
  Названия гл. 2–3 по оглавлению не сверены [НП].
- **Семь принципов [ПП]**: discoverability, feedback, conceptual model, affordances, signifiers, mappings,
  constraints. Пересказы: https://www.ybrikman.com/blog/2015/01/26/the-design-of-everyday-things/ и др.
- **Правило N1, сигнификатор, а не аффорданс [П, эссе 2008]**: «The perceivable part of an affordance is
  a signifier»; «Forget affordances: what people need, and what design must provide, are signifiers».
  Сигнификатором может быть и случайный след, и отсутствие («пустая платформа — поезд ушёл»).
  Проверка: игрок понимает, что предмет можно взять, повернуть или открыть, по самому предмету (край
  листа, ручка ящика, скоба папки), без надписи «нажми». → СТОЛ, ПК, ЗАМОК.
- **Правило N2, два разрыва [П, NN/g, Whitenton, 11.03.2018,
  https://www.nngroup.com/articles/two-ux-gulfs-evaluation-execution/]**: gulf of execution («Taking action
  to accomplish a specific goal») и gulf of evaluation («Understanding the state of the system»). Первым
  чинят разрыв оценки: игрок, неверно понявший состояние, строит неверный план. Проверка: по экрану видно,
  открыт ли замок, отправлено ли ходатайство, прикреплена ли нить, без отдельного вопроса. → ЗАМОК, ХОД, ДОСКА.
- **Правило N3, мостики [ПП, ybrikman]**: «We bridge the Gulf of Execution through the use of signifiers,
  constraints, mappings, and a conceptual model. We bridge the Gulf of Evaluation through the use of
  feedback and a conceptual model». → ВСЁ.
- **Правило N4, обратная связь немедленно [ПП]**: «Feedback must be immediate: even a delay of a tenth of
  a second can be disconcerting» (цитата по читательским выпискам: https://www.goodreads.com/notes/18872940-the-design-of-everyday-things/8125219-joe-beltr-n/cb4fe4b7-6212-4205-bb3e-7e70f74ad4b4 ;
  по книге не сверено). У Нормана есть и обратная мысль: лишняя обратная связь тоже вредна [НП].
- **Правило N5, отображение (mapping) [ПП]**: связь управления и результата «enhanced as much as possible
  through spatial layout and temporal contiguity». Проверка: кнопка действия стоит рядом с объектом,
  на который действует, и результат появляется там же. → ДОК, ХОД, ЗАМОК.
- **Правило N6, ограничения [ПП]**: «physical, logical, semantic, and cultural constraints guides actions».
  Проверка: в поле заключения или ходатайства нельзя положить то, чего туда физически не кладут.
  Ограничение показано формой (слот размером с карточку), а не сообщением об ошибке. → ХОД, ЗАКЛ.

**Спор с требованиями автора.** Discoverability у Нормана — сделать возможные действия видимыми.
Принцип «не подсказывать» с этим не спорит, если различать *видимость действия* (что можно сделать)
и *видимость смысла* (что важно). Норман говорит о первом.

---

## 3. Steve Krug, «Don't Make Me Think» (1-е изд. 2000; «Revisited», 3-е изд., 2014, New Riders)

Сам текст не открыт, всё ниже по пересказам.

- **Правило K1 [ПП]**: гл. 2 «How We Really Use the Web: Scanning, Satisficing, and Muddling Through».
  Люди не читают, а просматривают; берут первый приемлемый вариант; пользуются, не понимая устройства.
  Пересказ: https://www.oreilly.com/library/view/dont-make-me/0321344758/ch02.html , https://www.web-developpeur.com/en/library/dont-make-me-think/
  Проверка для БУНКЕРА: игрок не читает подписи интерфейса; управление должно работать и тогда, когда
  подпись не прочитана. → ВСЁ.
- **Правило K2 [ПП]**: гл. 4 «Animal, Vegetable, or Mineral?»: «It doesn't matter how many times I have to
  click, as long as each click is a mindless, unambiguous choice» (с. 41 по одному пересказу, издание не
  указано). Проверка: каждый шаг навигации (стол → компьютер → устройство) однозначен. → КОМН.
- **Правило K3 [ПП]**: гл. 5 «Omit Needless Words»: «Get rid of half the words on each page, then get rid
  of half of what's left» (с. 45 по пересказу). Относится к тексту интерфейса, не к документам дела. → ВСЁ.
- **Trunk test** (гл. 6 о навигации) [НП]: по экрану в любой момент понятно, где я и как отсюда выйти.

**Спор с требованиями автора.** «Не заставляй думать» прямо противоречит жанру. Разделение: интерфейс
не должен заставлять думать, дело должно (см. §4, Ходент: случайное и намеренное трение).

---

## 4. Celia Hodent, «The Gamer's Brain: How Neuroscience and UX Can Impact Video Game Design» (2017, CRC Press)

- **Правило H1 [П, аннотация главы у издателя, https://www.taylorfrancis.com/chapters/mono/10.4324/9781003045670-2/brains-video-games-celia-hodent]**:
  «Perception is subjective, attention is scarce, and memory is error prone». Проверка: информация,
  нужная для действия (что я уже открыл, какие ходатайства отправлены), видна в мире, а не хранится
  в голове игрока. Улики при этом не подсвечиваются. → ХОД, ДОСКА, ПК.
- **Правило H2, семь столпов юзабилити [ПП, видео Ходент в пересказе IxDF,
  https://ixdf.org/literature/article/the-game-ux-twist-usability-principles-for-games]**: signs and feedback;
  clarity; form follows function; consistency; minimum workload; error prevention and recovery;
  flexibility (and accessibility). Второй столп UX у Ходент — engage-ability (мотивация, эмоция, game flow).
- **Правило H3, намеренное трение [ПП, IxDF]**: принципы юзабилити применяются только к случайному
  трению (путаница, усталость, ошибка без замысла); намеренное трение защищают. Проверка: про каждую
  трудность можно сказать, она от интерфейса (убрать) или от дела (оставить). → ВСЁ.
- **Правило H4, minimum workload [ПП, IxDF]**: снижать когнитивную, память- и физическую нагрузку
  там, где вызов не задуман. Это прямо поддерживает требование автора «мышь двигается минимально». → ВСЁ.
- **Правило H5, form follows function [ПП, IxDF]**: назначение системы понятно из одного взгляда на неё.
  Проверка: замок выглядит как замок данного типа, поле карточки ходатайства выглядит как место,
  куда кладут карточку. → ЗАМОК, ХОД.
- **Правило H6, учиться действием [ПП, https://sobrief.com/books/the-gamers-brain]**: учить в контексте
  и с целью, а не текстом. → КОМН (первый вход), ПК.

**Спор с требованиями автора.** В столпе clarity и в GAG (§11) есть «явные указатели». Ходент сама
отделяет случайное трение от намеренного, так что спора нет, пока указатели касаются управления.

---

## 5. Jesse Schell, «The Art of Game Design: A Book of Lenses» (1-е изд. 2008; 3-е изд. 2019, CRC Press)

Номера линз в разных изданиях разные; ниже только названия. Вопросы взяты из неофициальной транскрипции
(gitbook «jesse-schell-the-art-of-game-design-lenses») в пересказе поиска; страница отдала 401 [ПП].

- **Lens of the Physical Interface [ПП]**: что игрок берёт в руки, как это отображается на мир игры, как
  он видит, слышит, трогает мир. У нас это мышь и что она «держит». → СТОЛ.
- **Lens of the Virtual Interface [ПП]**: какие элементы мира удобнее делать экранным элементом (меню),
  а какие прямым взаимодействием. → ХОД, ДОК.
- **Lens of Transparency [ПП]**: интерфейс исчезает; учится без раздумья; работает под нагрузкой;
  никого не путает. → ВСЁ.
- **Lens of Feedback [ПП]**: название найдено, вопросы не найдены [НП].
- **Lens of Juiciness [ПП]**: даёт ли интерфейс непрерывный отклик на каждое действие; есть ли
  интересное «вторичное движение» (second-order motion). → СТОЛ, ДОСКА.
- **Lens of Accessibility (в смысле «как игрок поймёт, с чего начать») [ПП, https://cgdc.org/?p=3900
  по поиску]**: нужно ли объяснение; зовёт ли объект потрогать и поиграть с ним. → ЗАМОК, ПК.
- **Lens of Visible Progress [ПП]**: что здесь значит прогресс; хватает ли промежуточных вех; какой
  прогресс скрыт и как его показать. → ХОД, ДОСКА, ЗАКЛ.
- **Lens of the Puzzle и Lens of Curiosity [ПП, https://schellgames.com/blog/schell-games-your-puzzle-experts]**:
  у задачи ясная достижимая цель, и она порождает вопросы. → ЗАМОК, ЗАКЛ.

---

## 6. Закон Фиттса и его следствия

Первоисточник: Paul M. Fitts, 1954 (J. Exp. Psychology). Проверенные изложения:
- Laws of UX, https://lawsofux.com/fittss-law/ [П];
- Raluca Budiu, «Fitts's Law and Its Applications in UX», NN/g, 31.07.2022, https://www.nngroup.com/articles/fitts-law/ [П];
- Bruce Tognazzini, «A Quiz Designed to Give You Fitts», AskTog, 02.1999, https://www.asktog.com/columns/022DesignedToGiveFitts.html [П];
- Tognazzini, «First Principles of Interaction Design (Revised & Expanded)», 05.03.2014, https://asktog.com/atc/principles-of-interaction-design/ [П].

- **F1 [П]**: «The time to acquire a target is a function of the distance to and size of the target».
  MT ≈ a + b·log₂(2D/W) (Budiu; численных a, b нет).
- **F2, prime pixel [П, Tog 1999]**: «The prime pixel is located at the current location of the mouse
  pointer»; «This pixel requires zero travel and is, in effect, an infinitely large target». Отсюда
  всплывающие меню у курсора. Проверка: действие над объектом появляется в точке, где игрок им
  взаимодействовал (рядом с курсором после клика по бумаге, у строки ходатайства). → ДОК, ХОД, СТОЛ.
- **F3, края и углы [П, Tog 1999/2014; Budiu]**: «the screen edge is, for all practical purposes,
  infinitely deep»; «the most quickly accessed targets on any computer display are the four corners».
  Budiu: края дают выигрыш только для мыши, «no advantage for touchscreens».
- **F4, сумма целей [П, Tog 2014]**: «The time to acquire multiple targets is the sum of the time to
  acquire each». Проверка: посчитать число отдельных наведений для типовой операции (открыть ходатайство
  и вложить карточку) и сокращать именно его. → ХОД, ЗАКЛ.
- **F5, большие и разнесённые цели [П, Budiu]**: «make targets big»; не теснить мелкие цели рядом.
  Невидимое расширение области клика помогает слабо: если игрок не знает о нём, он всё равно
  замедляется у видимой границы. Проверка: видимый размер частых целей не меньше области клика. → СТОЛ, ЗАМОК.
- **F6, последовательные элементы рядом [П, Budiu]**: элементы, которыми пользуются подряд, ставить
  рядом, но без риска промахнуться в соседа; кнопку «Отправить» ставить у последнего поля; цели размещать
  «close to the user's most probable prior location». → ХОД, ЗАКЛ.
- **F7, круговые меню [П, Tog 1999; Budiu]**: все пункты на одном расстоянии от точки вызова,
  направление запоминается моторной памятью. Budiu: такие меню редки и могут быть непривычны.
  Эмпирическое сравнение: Callahan, Hopkins, Weiser, Shneiderman, CHI 1988 [НП, текст не открыт].
- **F7a, подтверждение клика [П, Tog 2014, раздел Latency Reduction]**: «Acknowledge all button clicks by
  visual or aural feedback within 50 milliseconds»; «Trap multiple clicks of the same button or object».
  Проверка: повторный клик по «Отправить» не отправляет второй раз. → ХОД, ЗАКЛ, ЗАМОК.
- **F8, замер секундомером [П, Tog 2014]**: «Fitts's Law requires a stop watch test». Проверка: время
  типовой операции меряется на прототипе, а не оценивается на глаз. → ВСЁ.

**Спор с требованиями автора (подробно).** Фиттс и Тог хвалят края и углы экрана, автор хочет кнопки
рядом с объектом. Кто прав, зависит от случая:
1. *Действие над конкретным объектом* (вложить, перевернуть, отложить): прав автор. Курсор уже у объекта,
   prime pixel даёт нулевой путь, край экрана дал бы самый длинный путь.
2. *Глобальное действие из любой точки* (вернуться в комнату): край выигрывает, но только если это край
   *экрана*. В браузере в окне край страницы не останавливает курсор, он уходит за пределы окна, и
   «бесконечной глубины» нет. Budiu об этом же: для веба выгоды мало, если браузер не во весь экран
   (пересказ: https://blog.codinghorror.com/fitts-law-and-infinite-width/). Вывод для БУНКЕРА: стрелка
   «Комната» у нижнего края имеет смысл как *постоянное место* (Jakob's law, привычка), а бесконечной
   целью становится только в полноэкранном режиме (Fullscreen API).
3. *Мелкие реалистичные предметы* (скрепка, ручка, наклейка на диске): реализм против F5. Предмет
   увеличивают или приближают при наведении, а не оставляют мелким ради правдоподобия.

---

## 7. Закон Хика (Hick–Hyman, 1952)

Источник: https://lawsofux.com/hicks-law/ [П].

- **HH1 [П]**: «The time it takes to make a decision increases with the number and complexity of choices».
- **HH2 [П]**: «Break complex tasks into smaller steps in order to decrease cognitive load». → ЗАКЛ.
- **HH3 [П]**: «Avoid overwhelming users by highlighting recommended options» — **прямо спорит с
  автором**. Для БУНКЕРА неприменимо к уликам и вариантам ответа; применимо к управлению (например,
  основное действие с бумагой визуально главнее второстепенного).
- **HH4 [П]**: «Be careful not to simplify to the point of abstraction». Если в папке ходатайств
  остаются три абстрактные кнопки, пропадает сама процедура. → ХОД.

Оговорка (вывод для БУНКЕРА): Хик описывает время выбора из известных вариантов. Выбор улики в
детективе требует рассуждения, а это другой процесс; закон применим к меню и действиям, не к делу.

---

## 8. Jakob Nielsen, «10 Usability Heuristics for User Interface Design» (1994; обзор 30.01.2024)

https://www.nngroup.com/articles/ten-usability-heuristics/ [П]. Плюс Nielsen, «Response Times: The 3
Important Limits» (из «Usability Engineering», 1993, гл. 5), https://www.nngroup.com/articles/response-times-3-important-limits/ [П].

- **NH1, visibility of system status [П]**: «The design should always keep users informed about what is
  going on». Проверка: состояние замка, ходатайства, нити видно без отдельного запроса. → ЗАМОК, ХОД, ДОСКА.
- **NH2, match with the real world [П]**: «The design should speak the users' language» и следовать
  соглашениям реального мира. Основание для «стола как настоящего стола». → СТОЛ, СТИЛЬ.
- **NH3, user control and freedom [П]**: явный выход из ошибочного действия без долгого пути.
  Проверка: любую бумагу можно вернуть на стол, любую нить снять, черновик заключения не теряется. → ВСЁ.
- **NH5, error prevention [П]**: убрать условия для ошибки или спросить подтверждение до необратимого шага.
  Проверка: отправка ходатайства и сдача заключения, если они необратимы, требуют явного действия, которое
  нельзя совершить случайно. → ХОД, ЗАКЛ.
- **NH6, recognition rather than recall [П]**: «Minimize the user's memory load by making elements,
  actions, and options visible». → ХОД, ДОСКА.
- **NH8, aesthetic and minimalist design [П]**: «Interfaces should not contain information that is
  irrelevant or rarely needed». → ВСЁ.
- **NH10, help and documentation [П]**: «It's best if the system doesn't need any additional explanation».
- **Время отклика [П]**: 0,1 с — ощущение мгновенной реакции; 1 с — задержка заметна, но поток мысли не
  рвётся; после 1 с теряется ощущение прямой работы с данными; 10 с — предел удержания внимания, нужна
  индикация хода. Проверка для переходов: движение камеры начинается за ≤ 0,1 с, а весь переход
  заметно короче 1 с (вывод для БУНКЕРА). → КОМН.

---

## 9. Laws of UX (Jon Yablonski, https://lawsofux.com/) — отдельные законы [П]

- **Jakob's Law**: «Users spend most of their time on other sites»: ожидания переносятся с похожих
  продуктов. Проверка: перетаскивание, закрытие документа (клик мимо, Esc как *дополнение*), прокрутка
  работают как в привычных программах. → ДОК, СТОЛ.
- **Doherty Threshold (Doherty & Thadani, IBM Systems Journal, 1982)**: отклик < 400 мс; «Purposefully
  adding a delay to a process can actually increase its perceived value». Проверка: ответ системы на
  действие ≤ 400 мс. Намеренную паузу допускать только там, где она что-то значит в мире (например,
  механизм замка). → ВСЁ, ЗАМОК.
- **Miller's Law (1956)**: «Don't use the "magical number seven" to justify unnecessary design
  limitations»; группировать в осмысленные куски. → ДОСКА, ХОД.
- **Tesler's Law**: сложность нельзя убрать, только перенести; «spend an extra week simplifying» вместо
  того, чтобы миллионы людей теряли по минуте. Для нас: сложность рассуждения остаётся игроку, сложность
  управления берёт система. → ВСЁ.
- **Zeigarnik Effect**: незавершённое помнится лучше; «Invite content discovery by providing clear
  signifiers of additional content». Осторожно: искусственный прогресс-бар был бы подсказкой. → ДОСКА, ЗАКЛ.
- **Peak-End Rule (Kahneman et al., 1993)**: впечатление определяют пик и конец. Отсюда особое внимание
  к форме заключения и моменту ответа. → ЗАКЛ.
- **Aesthetic-Usability Effect (Hitachi, 1995)**: «Visually pleasing design can mask usability problems and
  prevent issues from being discovered during usability testing». Проверка: красивый стол проверяют
  секундомером и наблюдением, а не мнением тестера (см. F8). → СТОЛ, СТИЛЬ.
- **Law of Proximity**: «Elements in close proximity are perceived to share similar functionality».
  Теоретическая опора для «кнопки рядом с объектом»; верно и обратное: кнопка рядом с чужим объектом
  будет считаться его кнопкой. → ДОК, ХОД.
- **Law of Common Region / Uniform Connectedness**: общая рамка или линия связи делает элементы
  группой. Нить на доске — это и есть uniform connectedness. → ДОСКА.
- **Von Restorff Effect**: отличающийся элемент запоминается. Значит, любая непреднамеренно отличающаяся
  улика (другой шрифт, новее бумага) читается как важная. Проверка: значимые и незначимые материалы
  одного типа выглядят одинаково «обработанными». → СТОЛ, ДОК, СТИЛЬ.

---

## 10. Ben Shneiderman, «Direct Manipulation: A Step Beyond Programming Languages», IEEE Computer 16(8), 1983, pp. 57–69

Текст не открыт; по пересказу NN/g: Sherugar & Budiu, «Direct Manipulation», 21.08.2016 (обзор 14.10.2024),
https://www.nngroup.com/articles/direct-manipulation/ [ПП для Шнейдермана, П для NN/g].

- **DM1 [ПП]**: постоянное отображение объекта интереса; физические действия вместо синтаксиса;
  быстрые, пошаговые, обратимые действия с немедленно видимым результатом. Основание для «прямого
  действия вместо кнопок». → СТОЛ, ДОСКА, ХОД.
- **DM2 [П, NN/g]**: перетаскивание хорошо там, где есть аналог в реальном мире; неудобно для
  дальних или массовых перемещений: тогда нужен вариант «Переместить в…». Проверка: если карточку надо
  нести через весь экран, есть одношаговая альтернатива (клик по карточке → клик по месту). → ХОД, ДОСКА.
- **DM3 [П, NN/g]**: прямое манипулирование может не работать для людей с нарушениями моторики и
  зрения, если опирается на жесты, а не на нажатия. → ВСЁ (см. §12, XAG 107).
- **DM4 [П, NN/g]**: когда действие недоступно, нужен ответ в контексте, почему; отсутствие отклика
  раздражает. Проверка: попытка положить карточку не туда даёт физический отказ (карточка возвращается),
  а не тишину. → ХОД, ДОСКА, ЗАМОК.

Bret Victor в сводку не включён: проверенных правил, применимых к нашим модулям, я не набрал.

---

## 11. Game Accessibility Guidelines (https://gameaccessibilityguidelines.com/)

Basic: https://gameaccessibilityguidelines.com/basic/ ; Intermediate: https://gameaccessibilityguidelines.com/intermediate/ [П].

Basic, касается нас:
- «Ensure interactive elements / virtual controls are large and well spaced» → СТОЛ, ЗАМОК, ХОД.
- «Ensure that all areas of the user interface can be accessed using the same input method as the
  gameplay»: мышью и игра, и меню. Совпадает с автором. → ВСЁ.
- «Allow controls to be remapped / reconfigured» → (клавиши, если будут).
- «Allow players to progress through text prompts at their own pace»: никакого автопролистывания. → ДОК.
- «Use an easily readable default font size»: на странице правила «28px minimum when viewed on a 1080p
  screen» (данные Amazon 10-foot UI, то есть для ТВ) и «use 28px as a minimum rather than a target»,
  https://gameaccessibilityguidelines.com/use-an-easily-readable-default-font-size/ . Для ПК точнее XAG 101 (§12). → ТЕКСТ.
- «Provide high contrast between text/UI and background» → ТЕКСТ, СТИЛЬ.
- «Ensure no essential information is conveyed by a fixed colour alone» → ДОСКА (цвета нитей), ЗАМОК (индикатор).
- «If any subtitles / captions are used, present them in a clear, easy to read way»; «Ensure no
  essential information is conveyed by sounds alone»; «Provide subtitles for all important speech» → ПК (аудио, видео).
- «Provide separate volume controls…» → ПК.
- «Ensure that all settings are saved/remembered» → ВСЁ.

Intermediate, касается нас:
- «Avoid / provide alternatives to requiring buttons to be held down» → СТОЛ (удержание при перетаскивании).
- Не требовать одновременных действий вроде click-drag или swipe; давать их только как дополнительный
  способ (https://gameaccessibilityguidelines.com/ensure-that-multiple-simultaneous-actions-eg-click-drag-or-swipe-are-not-required-and-included-only-as-a-supplementary-alternative-input-method/) → СТОЛ, ДОСКА, ХОД.
- «Make interactive elements that require accuracy (eg. cursor/touch controlled menu options) stationary»:
  кнопки у объекта не должны уезжать, пока к ним ведут курсор. → ДОК, ХОД.
- «Allow interfaces to be resized» → ТЕКСТ, ДОК.
- «Provide a choice of text colour, low/high contrast choice as a minimum»; «Provide an option to adjust contrast» → ТЕКСТ.
- «Provide an option to turn off / hide background movement» → КОМН.
- «Avoid placing essential temporary information outside the player's eye-line» → ВСЁ (сообщения у объекта, не в углу).
- «Give a clear indication that interactive elements are interactive»: «clear and consistent differences
  in style, contrast, or additional signifiers» (https://gameaccessibilityguidelines.com/give-a-clear-indication-that-interactive-elements-are-interactive/).
- «Highlight important words»; «Indicate / allow reminder of current objectives»; «Include contextual
  in-game help / guidance / tips»: **спорят с автором**, см. итоговый список.
- «Provide an autosave feature» → ВСЁ.

---

## 12. Xbox Accessibility Guidelines (Microsoft, https://learn.microsoft.com/en-us/gaming/accessibility/xbox-accessibility-guidelines/)

[П], страницы XAG 101 (ms.date 2022-05-09), 102 (2023-06-08), 107 (2022-05-09).

**XAG 101, Text display** (https://learn.microsoft.com/en-us/gaming/accessibility/xbox-accessibility-guidelines/101):
- Минимальный размер текста по умолчанию для **PC: 18 px при 1080p, 36 px при 4K**; console: 26 px
  при 1080p. Размер считается как высота от нижнего выносного элемента до верхнего (descender + x-height
  + ascender), а не кегль CSS. Проверка: замерить на скриншоте строку документа. → ТЕКСТ, ДОК.
- Масштабирование до 200 % без потери содержания; при увеличении прокрутка только в одном направлении. → ДОК.
- Для блоков больше двух строк, если нет настроек: **длина строки ≤ 80 знаков** (без пробелов),
  **межстрочный ≥ 1,5**, абзацный отступ ≥ 2× межстрочного, межбуквенный ≥ 0,12 кегля, междусловный
  ≥ 0,16 кегля. → ТЕКСТ.
- Хотя бы один вариант шрифта без засечек; для стилизованного шрифта — нестилизованная замена. Не
  выравнивать по ширине и не центрировать строки текста. → ТЕКСТ, ДОК (документы дела стилизованы
  намеренно: нужен режим чтения, см. споры).

**XAG 102, Contrast** (…/102):
- Обычный текст и важные визуальные элементы **≥ 4,5:1**; крупный текст (на PC от 36 px при 1080p)
  и крупные элементы **≥ 3:1**; текст неактивных элементов ≥ 3:1; режим высокого контраста ≥ 7:1.
- Текст на неоднородном фоне меряют по самому неконтрастному участку фона. → ДОК (бумага с пятнами), ДОСКА.
- «Avoid relying on color alone to communicate information». → ДОСКА, ЗАМОК.
- Текст не должен быть частью картинки (кроме логотипов), иначе его нельзя подстроить. Спорит с
  «документами как фото» (см. споры). → ДОК.

**XAG 107, Input** (…/107):
- «A UI should be navigable by using single, non-simultaneous key presses». → ВСЁ.
- «For games that support keyboard input, players should be able to access all controls … using a keyboard alone».
- Без жестов по траектории (в том числе «clicking and dragging») или с альтернативой. → СТОЛ, ДОСКА.
- Срабатывание на отпускании кнопки (up event), а не на нажатии; отмена: увести курсор до отпускания;
  если отмены нет — простой Undo. Проверка: клик по «Отправить ходатайство» срабатывает на отпускании. → ХОД, ЗАКЛ, ЗАМОК.
- Долгое удержание (в примерах 2–3 с и дольше) и одновременные нажатия избегать; long press допустим
  как альтернатива, если «less than 3 seconds». → ЗАМОК (если замок «крутится» удержанием).
- Чувствительность аналогового ввода (мыши) регулируется хотя бы на ±50 %. → КОМН (если камера от мыши).

---

## 13. Game UI Database (Edd Coates, https://www.gameuidatabase.com/)

Сайт ответил 403; описание по прессе [ПП]: https://80.lv/articles/ui-artist-created-a-database-of-games-menus ,
https://gamedeveloper.com/design/game-ui-database-relaunches-with-new-features-video-support-and-over-55-000-screenshots ,
https://creativebloq.com/3d/video-game-design/game-ui-database-20-is-the-ultimate-free-reference-tool-for-game-designers

- Что это: бесплатный каталог скриншотов и видео интерфейсов игр. Запуск 12.2020 (11 569 скриншотов,
  325 игр); версия 2.0 (08.2024) — более 55 000 скриншотов и 1 700 видео из 1 341 игры. Фильтры: тип
  экрана, элементы HUD, управление (device/controls), текстуры и узоры, цвет, жанр, тема, камера.
- Как пользоваться для БУНКЕРА (вывод): (1) брать игры-соседи — Return of the Obra Dinn, Her Story,
  Telling Lies, The Case of the Golden Idol, Papers, Please, Unpacking, Hypnospace Outlaw — и смотреть
  экраны типа «журнал / доска / инвентарь / документ»; (2) фильтр по материалу и узору (бумага, картон,
  дерево) — против «нейрослопа»; (3) видео смотреть ради переходов и откликов, а не статики;
  (4) записывать не «как красиво», а «сколько наведений на операцию» (F4).
- Наличие конкретных игр в базе не проверено [НП].

---

## 14. Fagerholt & Lorentzon; Andrews: диегетический интерфейс

**Erik Fagerholt, Magnus Lorentzon, «Beyond the HUD — User Interfaces for Increased Player Immersion in FPS
Games», магистерская диссертация, Chalmers University of Technology (совместно с EA DICE), 2009.**
PDF: https://publications.lib.chalmers.se/records/fulltext/111921.pdf ; карточка: https://odr.chalmers.se/handle/20.500.12380/111921
[П, текст прочитан; страницы по нумерации PDF].

- **FL1, пространство дизайна (§10.1, с. 72–75)**: две оси — принадлежит ли элемент *вымыслу* мира и
  *пространству* мира. Non-diegetic (оверлей, «especially suitable for conveying information with a high
  level of detail»), meta-perception (искажение экрана, ощущения героя), meta-representation (в вымысле,
  но вне пространства: телефон, GPS, терминал, показанный оверлеем), geometric (в пространстве, но не
  в вымысле: контур, метка), diegetic (и то и другое), signifiers (подвид диегетических: «smoke is a
  signifier of fire», «Interpreting signifiers requires logical reasoning»).
  Для БУНКЕРА: просмотрщик документа по центру — это meta-representation (вещь из мира, показанная
  вне пространства), а не нарушение диегетики. → ДОК, ПК.
- **FL2 (с. 75)**: «a fully diegetic user interface is not automatically more immersive». → СТИЛЬ, КОМН.
- **FL3, усилители и подавители аффордансов (§10.3, с. 80–81)**: при реалистичной графике игроки
  выводят аффордансы из мира; если существующие не усилены, а ложные не подавлены, ожидание не
  совпадает с правилами. Подавитель: неинтерактивное нейтрально, интерактивное отличается (свет, тень,
  движение). Пример: открытое окно с качающейся занавеской вместо подсказки-кнопки (Design Example #2,
  Resident Evil 5). Проверка для стола: всё, что выглядит как берущаяся бумага, берётся; что не берётся
  (часть столешницы, лампа), не выглядит отдельным предметом. → СТОЛ, КОМН.
- **FL4, рассуждение вместо указаний (с. 81–82)**: «Explicit information is not always desired from the
  player's point of view, and might reversely spoil the game experience by making the player feel that the
  game tells him/her what to do». Сигнификаторы — лучший усилитель, потому что взывают к рассуждению.
  Прямая опора принципа «не подсказывать». → ВСЁ.
- **FL5, связность мира (с. 95)**: сильнее всего на погружение влияет «the coherence of the game world»
  (по Juul): несвязный мир заставляет рассуждать «от правил», а не «от мира». → СТИЛЬ, КОМН.

**Marcus Andrews, «Game UI Discoveries: What Players Want», Gamasutra / Game Developer, 23.02.2010,**
https://www.gamedeveloper.com/design/game-ui-discoveries-what-players-want [П].

- **MA1**: «The rule of functionality preservation and translation must be met»; «always make preserved
  functionality your main goal!». Проверка: перенос функции в мир (стол, ящик, папка) не делает её
  медленнее или менее видимой, чем был бы обычный элемент. → ВСЁ.
- **MA2**: если к диегетическому решению приходится добавлять недиегетические подпорки, «you might have to
  rethink the solution as a whole». → ХОД, ЗАМОК.
- **MA3, порядок работы**: описать, что должен чувствовать герой → перечислить функции UI → назначить
  каждой способ (диегетический, HUD, звук) → проверить, что игрок в курсе функций и чувствует нужное → итерации.
- В статье нет опроса и процентов, вопреки названию.

---

## 15. Типографика для чтения с экрана

- **Matthew Butterick, «Practical Typography»** (онлайн-книга, https://practicaltypography.com/) [П]:
  - «Aim for an average line length of 45–90 characters, including spaces» (https://practicaltypography.com/line-length.html);
    проверка «алфавитом»: 2–3 алфавита на строку. → ТЕКСТ, ДОК.
  - «the optimal line spacing is between 120% and 145% of the point size» (…/line-spacing.html); в CSS
    `line-height` без единиц. → ТЕКСТ.
  - Для веба «body text of 15–25 pixels» (…/point-size.html). → ТЕКСТ.
- **Robert Bringhurst, «The Elements of Typographic Style», §2.1.2 «Choose a comfortable measure»** [ПП,
  https://webtypography.net/2.1.2]: 45–75 знаков — удовлетворительная длина для одной колонки; 66 знаков
  считаются идеалом; для нескольких колонок 40–50. С. 26 по пересказу (https://www.caretypography.com/the-finer-points-of-typography).
- **WCAG 2.2, SC 1.4.8 Visual Presentation (AAA)**, https://www.w3.org/WAI/WCAG22/Understanding/visual-presentation.html [П]:
  ширина ≤ 80 знаков; без выравнивания по ширине; межстрочный не меньше полуторного; абзацный ≥ 1,5×
  межстрочного; увеличение до 200 % без горизонтальной прокрутки. Достаточно *механизма*, не обязательно по умолчанию.
- **Edward Tufte, «Visual Explanations» (1997), глава «Smallest effective difference»** [ПП,
  https://boxesandarrows.com/three-lessons-from-tufte-special-deliverable-6 , с. 73]: «Make all visual
  distinctions as subtle as possible, but still clear and effective». Для БУНКЕРА: интерфейс различает
  состояния минимальными средствами (тень, сдвиг), без кислотных выделений. → СТИЛЬ, ДОСКА.

**Расхождение в цифрах**: длина строки 45–75 (Брингхерст), 45–90 (Баттерик), ≤ 80 (WCAG, XAG). Безопасный
коридор для просмотрщика: 45–75 знаков; 80 — верхняя граница.
Межстрочный: 1,2–1,45 (Баттерик) против ≥ 1,5 (WCAG/XAG). Решение (вывод): по умолчанию ~1,4–1,5,
настройка — до 1,5 и выше.

---

## 16. Game Maker's Toolkit (Mark Brown)

- Видео «How Do Detective Games Work?» под таким названием **не найдено**.
- **«What Makes a Good Detective Game?» (2017)** — существует (страница субтитров https://amara.org/v/C3BEu);
  содержание не получено [НП].
- **«The 3 Types of Detective Game» (2023)**: содержание по ИИ-пересказу страницы
  https://videohighlight.com/v/I7q363Ic26o [ПП, источник слабый, таймкоды оттуда]:
  - три типа — дедукция (Obra Dinn, Golden Idol), противоречие (Lucifer Within Us), расследование
    (Shadows of Doubt; базы данных: Her Story, Hypnospace Outlaw);
  - плохо устроенные «проверялки» выдают ответ или опекают игрока; выбор из вариантов сужает мышление
    и зовёт угадывать; Obra Dinn не задаёт наводящих вопросов и доверяет игроку записывать и связывать
    самому (≈15:40–18:00);
  - признаки хорошей игры (≈19:07–22:49): вопросы прямые и конкретные; сложность растёт; «Multiple
    avenues are provided to reach the right answer»; пошаговые подтверждения дают маленькие победы;
    полезные инструменты — блокнот, доска, пометки на записях, закладки (≈20:11).
  → ДОСКА, ЗАКЛ, ХОД.

---

## 17. Доклады и интервью разработчиков

- **Sam Barlow, «Making 'Her Story' — Telling a Story Using The Player's Imagination», GDC 2016, Game
  Narrative Summit**, https://www.gdcvault.com/play/1023430/Making-Her-Story-Telling-a [П, аннотация]:
  «a player's brain is still the world's most powerful game engine». Пересказ Game Developer, 15.08.2016
  (https://gamedeveloper.com/design/video-making-i-her-story-i-and-using-the-player-s-imagination-as-a-narrative-tool):
  игроки сами исписывали «pages of notes about keywords and theories». Для БУНКЕРА: дать место для
  записей игрока (доска), но не заполнять его за игрока. → ДОСКА.
- **Lucas Pope (Return of the Obra Dinn)**: доклада на GDC Vault **не найдено**. Есть разговор на канале
  GDC в Twitch, пересказ Game Developer, 26.11.2018 (https://gamedeveloper.com/design/for-lucas-pope-i-return-of-the-obra-dinn-i-was-a-bunch-of-appealing-design-problems) [ПП]:
  «create clues in the environment»; основной цикл — «filling out a matrix of features for your list of
  identities». Механика «судьбы подтверждаются тройками, чтобы нельзя было угадывать» описана в обзорах
  и видна в самой игре; прямой цитаты Поупа о причине не найдено [ПП, https://en.wikipedia.org/wiki/Return_of_the_Obra_Dinn и обзоры].
  → ЗАКЛ.
- **Papers, Please**: «clunky» интерфейс — намеренное решение, навеянное HyperCard (Johnny Cullen,
  VG247, 05.03.2014, по https://en.wikipedia.org/wiki/Papers,_Please) [ПП]. По заметкам разработки
  (TIGSource, 2012, в пересказе вики фанатов https://papersplease.fandom.com/wiki/File:Fingerprint-beta.png)
  ранний штамп перетаскиванием «felt unresponsive», его заменили выезжающей планкой штампов [ПП].
  Правило: если перетаскивание ощущается вязким, его меняют на вещь, которая сама выезжает к руке. → СТОЛ, ХОД.
- **The Case of the Golden Idol (Color Gray Games)**: доклада на GDC **не найдено**. Интервью Андрея
  Клявиньша, Game Developer: «Pursuing the "Aha!" moment…» (https://www.gamedeveloper.com/design/case-of-the-golden-idol) [П, интервью]:
  банк слов работал лучше сборки фраз; оценка «всё верно / неверно» раздражала в сложных сценах, и
  добавили частичную подсказку «two or fewer slots are incorrect»; «Given the opportunity, players will
  optimize the fun out of a game»; сцены урезали до нужного решению и намеренной ложной нити; несколько
  улик ведут к одному выводу. Второе интервью (Joel Couture, Game Developer, 02.03.2023,
  https://gamedeveloper.com/business/-the-case-of-the-golden-idol-i-used-frequent-testing-to-improve-its-mystery-solving):
  тестировать «As early as possible»; качественные интервью важнее метрик; картинку яблока, которую
  тестеры не узнавали, перерисовали. → ЗАКЛ, ХОД, ДОК.
- **Jon Ingold (inkle), «The Burden of Proof: Narrative Deduction Mechanics for Detective Games», GDC 2022,
  Design** (https://gdcvault.com/play/1027723/The-Burden-of-Proof-Narrative) [П, аннотация]: как игроку
  доказать игре разгадку и как дать конкретную обратную связь, не задушив свободу (кейс Overboard!).
  Содержание доклада не получено [НП]. Это ближайший найденный доклад «как делать детективы»;
  «Designing Detective Games» Томаса Грипа (Frictional) **не найден**. → ЗАКЛ.
- **Jonathan Blow (The Witness)**: интервью TIME, Matt Peckham, 09.06.2016,
  https://time.com/4355763/the-witness-jonathan-blow-interview [П]: «I'm interested in nonverbal
  communication broadly»; нужна «extreme clarity, at least around the first layer of puzzles» («You
  always know that you're drawing a line on the panel»); ответы не давать, иначе «you then spoil the game».
  Правило: ясным должно быть *действие* (что я делаю), трудным — *смысл*. Доклад «Truth in Game Design»
  (GDC Europe 2011) упоминается, содержание не найдено [НП]. → ЗАМОК, ПК.
- **Wren Brier (Witch Beam), «'Unpacking' Zen: Designing a Game Without Fail States or Scores», GDC 2023**
  (https://www.gdcvault.com/play/1029400/-Unpacking-Zen-Designing-a) [П, название]; пересказ Game Developer,
  21.04.2023 (https://gamedeveloper.com/design/unpacking-the-design-pillars-of-a-chill-puzzle-game) [ПП]:
  столпы «contemplation, discovery, and expression»; «subtractive design is all about strengthening the
  core of a game by removing anything that isn't serving the core ideas». Звук: более 14 000 фоли-эффектов,
  у предметов свои звуки взятия и постановки (https://en.wikipedia.org/wiki/Unpacking_(video_game) [ПП]);
  дизайнер Tim Dawson: звуки вместе с «snap placement» дали предметам «an extra layer of physicality»
  (https://limitedrungames.com/blogs/news/unpacking-unpacking-with-designer-tim-dawson) [ПП]. → СТОЛ.

---

## 18. «Нейрослоп»: как узнаётся ИИ-интерфейс

- **Anthropic Applied AI (P. Rajasekaran, J. Wei, A. Bricken), «Improving frontend design through Skills»,
  12.11.2025**, https://claude.com/blog/improving-frontend-design-through-skills [П]: без указаний результат
  сходится к «Inter fonts, purple gradients on white backgrounds, and minimal animations»; причина названа
  «distributional convergence». Избегать: «Overused font families (Inter, Roboto, Arial, system fonts)»,
  «Clichéd color schemes (particularly purple gradients on white backgrounds)», «Predictable layouts and
  component patterns», «Cookie-cutter design that lacks context-specific character». Советы: «Commit to a
  cohesive aesthetic»; одна продуманная анимация загрузки лучше россыпи эффектов; фон с атмосферой вместо
  плоского цвета.
- **«Why Your AI Keeps Building the Same Purple Gradient Website», prg.sh, 26.10.2025** (автор на странице
  не указан), https://prg.sh/ramblings/Why-Your-AI-Keeps-Building-the-Same-Purple-Gradient-Website [П]:
  признаки — Inter/Roboto, фиолетово-индиговые акценты, центрированный заголовок с кнопкой, три блока с
  иконками в ряд, белый или светло-серый фон, скругления везде, одинаковые мягкие тени; нет иерархии и
  состояний ошибок. Происхождение: `bg-indigo-500` из Tailwind UI (извинение Адама Уотана, 08.2025, по статье).
- **Paul Bakaus, Impeccable — каталог «AI slop»**, https://impeccable.style/slop (дата на странице не
  указана) [П]: «Identical card grids», «Nested cards», «Monotonous spacing», «Glassmorphism everywhere»,
  «Extreme border-radius on cards», «Gradient text», «Dark mode with glowing accents», «Single font for
  everything», «Flat type hierarchy», «Pulsing status dot», «Bounce or elastic easing», «Em-dash overuse»
  и др.
- **Kosta Canatselis, «Spot the slop: a UI designer's guide to fixing AI defaults», 23.07.2026**,
  https://world.hey.com/kostac/spot-the-slop-a-ui-designer-s-guide-to-fixing-ai-defaults-4c448c9c [П]:
  «uniform everything» (одинаковые отступы, радиусы, высоты карточек, глазу не за что зацепиться);
  пропущенные пустые, загрузочные и ошибочные состояния; одинаковое появление «fade in» у всего;
  цвета назначать функциям, а не декору.

Проверяемые правила для БУНКЕРА (вывод из четырёх статей):
- **NS1**: ни одного элемента интерфейса, который мог бы стоять на любом SaaS-сайте: карточки со
  скруглением и тенью сеткой, градиентные кнопки, «пилюли»-бейджи, эмодзи-иконки. Каждый элемент
  отвечает на вопрос «какой это предмет в кабинете 19xx года?». → СТИЛЬ.
- **NS2**: шрифт интерфейса выбран под эпоху и материал, не Inter/Roboto/системный по умолчанию;
  минимум два начертания с разной ролью. → СТИЛЬ, ТЕКСТ.
- **NS3**: радиусы, тени и отступы не одинаковы везде: у бумаги нет скруглений, у картонной папки
  — свои, у металла — свои. Однородность материалов внутри класса нужна (Von Restorff), но разных классов —
  нет. → СТОЛ, СТИЛЬ.
- **NS4**: движения различаются по физике предмета (бумага, ящик, дверца), а не одним fade-in. Без
  «bounce/elastic». → КОМН, СТОЛ.
- **NS5**: состояния «пусто / ошибка / недоступно» нарисованы как состояния вещей (пустой лоток, возврат
  карточки), а не тостами. → ХОД, ЗАМОК.

---

## 19. Физичность и скевоморфизм в играх

- **Chris Furniss, «Building context: toy-like interfaces in games», Game Developer, 15.12.2014**,
  https://www.gamedeveloper.com/design/building-context-toy-like-interfaces-in-games [П]:
  - скевоморфизм уместнее в играх, чем в приложениях: игры «играют», приложениями «пользуются»;
  - «a user interface is like a joke: if you have to explain it, it's not very good»;
  - Papers, Please — «the ultimate example of skeumorphism»: интерфейс громоздкий, но не раздражает,
    потому что «The friction always comes from the player trying to juggle all of the tasks presented
    before them»: различать **трение интерфейса** и **трение задачи**;
  - антипример (Frozen Free Fall): «Interactive elements don't look interactive, and are presented
    inconsistently». → СТОЛ, СТИЛЬ.
- **Indieklem, «The Diegetic Dilemma», 10.03.2025**, https://indieklem.substack.com/p/19-the-diegetic-dilemma-benefits [П]:
  при систематическом использовании диегетика «can become a significant cognitive burden»; показывать
  в мире только немногое нужное сейчас; для критичной информации — доступная недиегетическая замена;
  проверять на игроках рано. → КОМН, ПК.
- **Papers, Please, Unpacking**: см. §17.

---

## Сводная таблица: правило → источник → модуль БУНКЕРА

| # | Правило (проверяемое) | Источник | Модуль |
|---|---|---|---|
| 1 | Видимый отклик на захват, клик, начало перехода ≤ 100 мс | Swink [ПП]; Nielsen 0,1 с [П]; Tog 50 мс на клик [П] | ВСЁ |
| 2 | Ответ системы на действие ≤ 400 мс; переход заметно короче 1 с | Doherty [П]; Nielsen 1 с [П] | КОМН, ВСЁ |
| 3 | Отклик зависит от типа действия и материала, не от значимости улики | Swink [П] + вывод | СТОЛ, ДОСКА, ДОК |
| 4 | Предмет ведёт себя согласно метафоре (бумага как бумага) | Swink metaphor [П]; NH2 [П] | СТОЛ |
| 5 | Действие над объектом появляется в точке взаимодействия (prime pixel) | Tog 1999 [П]; Budiu [П]; Proximity [П] | ДОК, ХОД, СТОЛ |
| 6 | Посчитать наведения на типовую операцию и уменьшать их число | Tog 2014 [П] | ХОД, ЗАКЛ |
| 7 | Время операций меряют секундомером на прототипе | Tog 2014 [П]; Aesthetic-usability [П] | ВСЁ |
| 8 | Частые цели крупные и разнесённые; видимый размер ≈ области клика | Budiu [П]; GAG basic [П] | СТОЛ, ЗАМОК |
| 9 | Кнопки у объекта неподвижны, пока к ним ведут курсор | GAG intermediate [П] | ДОК, ХОД |
| 10 | Глобальный выход («Комната») всегда на одном месте; край бесконечен только во весь экран | Tog [П]; Budiu [П]; Jakob's law [П] | КОМН |
| 11 | Возможность действия видна по самому предмету (сигнификатор), без надписи | Norman 2008 [П]; Fagerholt §10.3 [П] | СТОЛ, ПК, ЗАМОК |
| 12 | Что выглядит берущимся, берётся; что не берётся, не выглядит отдельным предметом | Fagerholt §10.3 [П] | СТОЛ, КОМН |
| 13 | Состояние (замок, ходатайство, нить) читается с экрана без запроса | Norman/NN/g [П]; NH1 [П] | ЗАМОК, ХОД, ДОСКА |
| 14 | Ограничение показано формой (слот), отказ — физический (возврат карточки) | Norman [ПП]; NN/g DM [П] | ХОД, ЗАКЛ, ДОСКА |
| 15 | Каждое действие обратимо; черновик не теряется | NH3 [П]; Tog «Protect users' work» [П]; XAG 107 [П] | ВСЁ |
| 16 | Необратимые шаги (отправить, сдать) — на отпускании кнопки, с отменой «увести курсор» | XAG 107 [П]; NH5 [П] | ХОД, ЗАКЛ |
| 17 | У перетаскивания есть одношаговая альтернатива (клик → клик) | GAG [П]; XAG 107 [П]; NN/g DM [П] | СТОЛ, ДОСКА, ХОД |
| 18 | Нет долгого удержания и одновременных нажатий; long press < 3 с только как альтернатива | XAG 107 [П]; GAG [П] | ЗАМОК, СТОЛ |
| 19 | Интерфейс полностью доступен мышью; клавиатура — дополнение | GAG basic [П]; требование автора | ВСЁ |
| 20 | Трудность от интерфейса убрать, трудность от дела оставить | Hodent [ПП]; Furniss [П]; Tesler [П] | ВСЁ |
| 21 | Текст документа на ПК ≥ 18 px при 1080p (высота по выносным), масштаб до 200 % | XAG 101 [П] | ДОК, ТЕКСТ |
| 22 | Строка 45–75 знаков (≤ 80); межстрочный 1,4–1,5; без выключки по ширине | Bringhurst [ПП]; Butterick [П]; WCAG 1.4.8 [П]; XAG 101 [П] | ДОК, ТЕКСТ |
| 23 | Контраст текста ≥ 4,5:1 по самому светлому участку «бумаги» | XAG 102 [П] | ДОК, ДОСКА |
| 24 | Ничего важного только цветом (нити, индикаторы замков) | GAG [П]; XAG 102 [П] | ДОСКА, ЗАМОК |
| 25 | Ничего важного только звуком; субтитры у аудио/видео | GAG [П] | ПК |
| 26 | Материалы одного типа обработаны одинаково, чтобы «другой» не выдавал важное | Von Restorff [П] + вывод | СТОЛ, ДОК, СТИЛЬ |
| 27 | Перенос функции в мир не делает её медленнее (functionality preservation) | Andrews [П] | ВСЁ |
| 28 | Просмотрщик по центру = meta-representation, это допустимо | Fagerholt §10.1 [П] | ДОК, ПК |
| 29 | Не опираться на HUD-подпорки к диегетическому решению; иначе пересмотреть решение | Andrews [П] | ХОД, ЗАМОК |
| 30 | Проверка заключения не даёт угадывать (группы, частичная обратная связь без указания места) | Obra Dinn [ПП]; Golden Idol [П]; GMTK [ПП] | ЗАКЛ |
| 31 | Несколько путей к одному выводу | Golden Idol [П]; GMTK [ПП] | ЗАКЛ, ДОСКА |
| 32 | Место для записей игрока есть, но не заполняется за него | Barlow [ПП]; GMTK [ПП] | ДОСКА |
| 33 | Действие предельно ясно, смысл трудный | Blow [П]; FL4 [П] | ЗАМОК, ПК |
| 34 | Нет примет «нейрослопа» (карточки сеткой, градиенты, Inter, эмодзи, одинаковые радиусы/fade) | Anthropic 2025 [П]; prg.sh [П]; Impeccable [П]; Canatselis [П] | СТИЛЬ |
| 35 | Состояния «пусто / ошибка» — состояния вещей, а не тосты | Canatselis [П] + вывод | ХОД, ЗАМОК |
| 36 | Стол тихо звучит: у взятия и постановки предмета свой звук по материалу | Unpacking [ПП] | СТОЛ |
| 37 | Вязкое перетаскивание заменить на вещь, которая сама выезжает к руке | Papers, Please [ПП] | СТОЛ, ХОД |
| 38 | Различия состояний минимальными средствами | Tufte [ПП] | СТИЛЬ, ДОСКА |
| 39 | Пик и конец (заключение, ответ) проработаны отдельно | Peak-end [П] | ЗАКЛ |
| 40 | Сложную форму разбить на шаги, не упрощая до абстракции | Hick [П] | ЗАКЛ, ХОД |

---

## Где источники спорят с требованиями автора

1. **Края экрана против «кнопки рядом с объектом»** (Фиттс, Тог). Разбор в §6: для действий над
   объектом прав автор (prime pixel); для одного глобального выхода край выгоден только во весь
   экран, а в окне браузера важнее постоянное место. Решать автору: делать ли полноэкранный режим.
2. **«Явно показывать интерактивность» (GAG intermediate, Hodent clarity) против «не подсвечивать
   важное».** Спор снимается разделением: интерактивность («это можно взять») показывать можно и
   нужно, причём диегетически (FL3, занавеска вместо подсказки); значимость («это важно») — нельзя.
   Риск: подсветка интерактивности выдаёт важность, если интерактивны только улики. Отсюда правило 12:
   интерактивно всё бумажное, а не только нужное.
3. **«Highlight important words», «reminder of current objectives», «contextual in-game help / tips»
   (GAG intermediate)** — прямой конфликт с принципом игры. Для текста документов дела и для целей
   расследования отвергать. Для текста интерфейса (что делает кнопка, как закрыть) допустимо.
   Решать автору: допускать ли опциональный режим доступности (например, «напомнить, какие ходатайства
   отправлены» — это состояние, а не подсказка).
4. **Перетаскивание (прямое действие, «стол как настоящий»)** против GAG/XAG: click-drag не должен быть
   единственным способом. Совместимо: перетаскивание основное, «клик — взять, клик — положить» как
   альтернатива. Это не кнопка, а то же прямое действие без удержания.
5. **XAG 107: «всё доступно с одной клавиатуры»** против «ничего только с клавиатуры». Это не
   противоречие: автор запрещает *только* клавиатуру, XAG просит *и* клавиатуру. Решать автору,
   нужен ли полный клавиатурный путь (доступность) или только мышь.
6. **XAG 101/102: нестилизованный шрифт, текст не в картинке, контраст 4,5:1** против документов
   как вещей со следами обращения (сгибы, продавленный карандаш, пятна, машинопись). Документ как
   улика должен остаться картинкой, иначе пропадут следы. Вывод: режим чтения (расшифровка/увеличение)
   допустим только там, где он не раскрывает содержимое следов. Иначе продавленный карандаш станет
   подсказкой. Решать автору документ за документом; это затрагивает доказательность, канон не трогать молча.
7. **Juice (Свинк, линза Juiciness)** против «не подсвечивать». Отклик одинаков для всех предметов
   одного класса (правило 3); особый отклик ключевой улики — утечка решения.
8. **Krug / Nielsen «не заставляй думать», «recognition rather than recall»** против жанра. Применимы
   к управлению, не к делу (Hodent H3, Furniss: трение интерфейса и трение задачи).
9. **Papers, Please: намеренно громоздкий интерфейс как часть опыта** против «мышь двигается
   минимально». У Pope громоздкость работает на давление очереди; давление времени в БУНКЕРЕ в задаче
   не упомянуто; если его нет, прав автор. Пример полезен обратным: вязкое
   перетаскивание Поуп сам заменил.
10. **«Переходы как движение в комнате»** против порогов отклика (Nielsen 1 с, Doherty 400 мс) и GAG
   «turn off background movement». Движение камеры допустимо, если начинается мгновенно и не длинное;
   нужна настройка «уменьшить движение». Длительность 400 мс для анимации — наш перенос порога Доэрти,
   в самом источнике речь о времени ответа системы.
11. **Реалистичный масштаб предметов** («стол как настоящий») против крупных целей (Фиттс, GAG).
   Мелкое увеличивать при наведении или приближении, а не расширять невидимую область клика (Budiu).
12. **Hick: «highlighting recommended options»** — к выбору улик и вариантов заключения не
   применять; к основному и второстепенному действию с предметом можно.
13. **Lens of Visible Progress, Zeigarnik «artificial progress»** против «не подсказывать»: шкала
   прогресса расследования раскрыла бы объём оставшегося. Прогресс показывать только как следы работы
   игрока (заполненная доска, стопка отправленных ходатайств), а не как процент.
14. **Aesthetic-usability effect** — не спор, а предупреждение: красивый скевоморфный стол скроет
   проблемы на тесте. Нужны замеры времени и наблюдение (Tog: секундомер).

## Не найдено или не проверено

- GMTK «How Do Detective Games Work?» под этим названием; доклад Лукаса Поупа на GDC Vault; доклад
  Color Gray Games на GDC; «Designing Detective Games» Томаса Грипа / Frictional.
- Содержание доклада Ingold «The Burden of Proof» (только аннотация); Blow «Truth in Game Design».
- Номера страниц у Нормана, Круга (кроме пересказанных 41/45), Ходент, Шелла; номера линз Шелла (разнятся по изданиям).
- Цифры 100/240 мс у Свинка — по лекционным слайдам, не по книге.
- Bret Victor — не разбирался.
