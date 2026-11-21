# Сервис генерации изображений по подписке через MCP (ноябрь 2026)

**Статус:** исследование от 21.11.2026. Не канон и не решение. Дополняет раздел 1
`art-pipeline.md` (10.11). Решение по сервису — ART-3 в `design/DECISIONS.md`, сейчас там MC-C
«пока никакой».

**Запрос автора:** подписка, лучшая модель (Nano Banana?), подключение к Claude через MCP,
работа прямо в чате, всё в рамках подписки, самый выгодный вариант.

**Как проверено:** только поиск. Сайты сервисов из облачной сессии не открываются
(higgsfield.ai, krea.ai, magnific.com, adobe.com закрыты сетевыми правилами окружения).
Цифры взяты со сторонних обзоров за октябрь–ноябрь 2026, и источники местами расходятся.
Перед оплатой открой страницу цен сам и проверь, примет ли сервис твой способ оплаты.

---

## 1. Главное

1. **Безлимита через MCP по подписке сейчас нет ни у кого.** Все сервисы с коннектором к Claude
   списывают за генерацию через MCP кредиты, которые входят в план. Безлимит, где он есть,
   действует только на их сайте. Исключение — пробные периоды (Higgsfield: 72 часа безлимита
   через MCP).
2. **Значит, условие «всё в подписке» выполнимо так:** месячный план с пакетом кредитов, из
   которого платятся генерации в чате. Это фиксированная сумма в месяц и лимит картинок.
3. **Модель:** для нас лучше всего подходит **Nano Banana Pro**. Наш материал — фото, кадры
   камер, портреты одних и тех же людей. Pro лучше всех держит лицо и предмет по нескольким
   референсам и правит по образцу. Сильный текст на картинке нам почти не нужен: документы
   верстаются, а не генерируются (`design/CLAUDE.md`). Nano Banana 2 (февраль 2026) быстрее и
   дешевле, но слабее Pro по сложным сценам. Про Nano Banana 2.1 (по обзорам — октябрь 2026)
   подтверждения от Google не нашлось.
4. **Подписка Google (AI Pro / Ultra) к Claude не подключается.** Официального MCP у Google
   нет. Сторонние MCP для Nano Banana работают через API-ключ: это оплата за каждую картинку,
   а не подписка.

## 2. Сравнение

Цена одной картинки Nano Banana Pro через MCP — оценка по обзорам.

| Сервис | Коннектор к Claude | Цена плана | Nano Banana Pro через MCP | Чем силён | Минус |
|---|---|---|---|---|---|
| **Krea** | есть в каталоге коннекторов Claude, вход через аккаунт | Basic $9 (5 000 ед.), Pro $35 (20 000 ед.), за год Pro около $21/мес; бесплатно 100 ед. в день | около 78 ед.; ≈ $0,08 (Pro за год) – $0,14 (Pro помесячно); на Pro около 250 картинок в месяц | несколько моделей, мульти-референс, апскейл, свои обученные стили; можно попробовать бесплатно | единицы не переносятся на следующий месяц; цифры по Pro в обзорах расходятся |
| **Higgsfield** | официальный удалённый MCP, OAuth | Starter $15–19, Plus $47–59 | по обзорам 2 кредита ≈ $0,08 на Plus; безлимит сайта на MCP не действует | видео (Veo, Kling, Sora, Seedance), Soul ID для постоянства лица; пробный период 72 ч безлимита через MCP | после пробного периода автопродление на Ultra со скидкой 40% на первый месяц, если не отменить |
| **Magnific** (бывший Freepik) | официальный MCP, OAuth, любой платный план | Premium+ $45/мес или $33,75 за год, 45 000 кредитов | только кредиты; цену Nano Banana Pro не нашёл; с ближайшего продления Pro 1K/2K уходит из безлимита сайта | лучший апскейл, аудио, 3D | для чата не выгоднее других, безлимит сайта сокращается |
| **Adobe** (Adobe for Creativity) | официальный коннектор в Claude, работает даже без платного Adobe | Firefly Standard $9,99, Pro $19,99 (4 000 кредитов) | около 40 кредитов ≈ $0,20 (Pro); не подтверждено, что коннектор вообще вызывает партнёрские модели | собственная модель Firefly безлимитна на платных планах; Photoshop-правки | Nano Banana дорогой, доступ через коннектор не подтверждён |
| Google API напрямую | сторонний MCP + API-ключ | без подписки, оплата за запрос | цена Google за картинку (у Pro выше, чем у Nano Banana 2) | без посредника, полная модель | не подписка: нужен ключ с оплатой, лимит трат ставишь сам |

## 3. Вывод

- **Самый выгодный вариант для работы в чате — Krea Pro**, если цены подтвердятся:
  официальный коннектор в каталоге Claude, Nano Banana Pro примерно по $0,08–0,14 за картинку,
  есть бесплатный дневной лимит, чтобы проверить подключение без оплаты.
- **Higgsfield** — если важно видео (ART-7) и постоянство лиц через Soul ID. Его 72 часа
  безлимита через MCP подходят для пачки проб стиля (этап 4), если отменить подписку вовремя.
- **Magnific и Adobe** для этой цели слабее: кредиты в MCP не дешевле, а сильные стороны (апскейл,
  Photoshop) — на других этапах.
- Мысль из исследования 10.11 остаётся в силе: самый дешёвый поиск стиля — вручную на сайте, где
  безлимит действует; MCP окупается на производстве, где важны проверка по канону и лог промпта.

## 4. Что проверить перед оплатой

1. Страница цен Krea: стоимость Nano Banana Pro в единицах и сколько единиц в Pro.
2. Подключение Krea в claude.ai: Customize → Connectors. Сделать одну бесплатную картинку в
   новой сессии и посмотреть, вижу ли я её в чате.
3. Если картинки нужно скачивать в контейнер (наложить зерно, дату, отдать файл), нужен
   доступ к хранилищу сервиса в настройках окружения. Сейчас эти адреса закрыты.
4. Оплата: принимает ли сервис твою карту.

## Источники

- Higgsfield: [Unlimited MCP](https://higgsfield.ai/blog/unlimited-mcp),
  [цены](https://higgsfield.ai/pricing), [MCP и кредиты](https://www.layer3labs.io/guides/higgsfield-mcp),
  [пробный период MCP](https://x.com/higgsfield/status/2120160293678641600),
  [11.11 deals](https://higgsfield.ai/blog/higgsfield-11-11-deals),
  [Nano Banana 2 — где безлимит](https://higgsfield.ai/blog/unlimited-nano-banana-2-plans)
- Krea: [Krea MCP](https://www.krea.ai/mcp),
  [цены (wavespeed)](https://wavespeed.ai/blog/cost-and-billing/krea-ai-pricing-2026/),
  [единицы (oakgen)](https://oakgen.ai/blog/krea-ai-pricing-compute-units),
  [сравнение цен Nano Banana Pro](https://www.8frame.co/blog/nano-banana-pro-price-comparison-2026),
  [MCP для Claude (OpenArt)](https://openart.ai/blog/best-image-generation-mcp-servers-for-claude/)
- Magnific: [цены](https://www.magnific.com/pricing),
  [genativity](https://genativity.com/guides/magnific-pricing),
  [pikes.ai](https://pikes.ai/blog/magnific-freepik-pricing-2026)
- Adobe: [FAQ коннектора](https://developer.adobe.com/adobe-for-creativity/support/),
  [XDA](https://www.xda-developers.com/integrated-claude-with-adobe-without-paying-for-creative-cloud/),
  [акции Firefly](https://helpx.adobe.com/firefly/web/get-started/learn-the-basics/current-firefly-promotions.html),
  [Nano Banana Pro за 40 кредитов](https://community.adobe.com/t5/adobe-firefly-discussions/nano-banana-pro-is-40-credits-now/td-p/15634094),
  [цены Firefly](https://www.renderahouse.com/blog/adobe-firefly-pricing)
- Google: [Nano Banana 2](https://blog.google/innovation-and-ai/technology/ai/nano-banana-2/),
  [Nano Banana 2 Lite](https://blog.google/innovation-and-ai/models-and-research/gemini-models/gemini-omni-flash-nano-banana-2-lite/),
  [Nano Banana 2.1 (сторонний обзор)](https://felloai.com/nano-banana-2-1/),
  [gemini-pro-mcp: картинки только по ключу](https://mcpservers.org/servers/muzaqil555/gemini-pro-mcp)
