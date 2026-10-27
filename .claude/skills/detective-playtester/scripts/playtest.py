#!/usr/bin/env python3
"""Изолированный симулированный playtest для detective-playtester.

Игрок — отдельный процесс `claude -p` в песочнице вне репозитория и файлов
проекта. Он видит только материалы пакета игрока, которые ему выданы.
Ведущий механический: открывает материалы только по правилам gm/access.json.

Команды:
  lint    --pack DIR                       проверка пакета на авторские утечки
  probe                                    проверка изоляции (канарейка вне песочницы)
  init    --pack DIR --profile NAME --runs-dir DIR [--model M] [--request TEXT]
  round   --run DIR [--rounds N] [--budget-usd X] [--max-total-usd X] [--timeout SEC]
  status  --run DIR
  cleanup --run DIR                        удалить песочницу (записи прогона остаются)
  metrics --run DIR [--suspect ИМЯ]        уверенность по раундам из журнала игрока
  compare --runs DIR DIR ... --suspect ИМЯ сравнение прогонов (версии пакета, профили, люди)
  export  --pack DIR --out DIR             комплект для живых тестеров и ведущего-человека
  walk    --pack DIR --script FILE         офлайн-проверка правил доступа по сценарию действий (без claude)
  selftest [--model M]                     технический тест на игрушечном деле

Только стандартная библиотека Python 3.9+.
"""

import argparse
import datetime as dt
import json
import os
import re
import secrets
import shutil
import subprocess
import sys
import tempfile
import uuid
from pathlib import Path

SKILL_DIR = Path(__file__).resolve().parent.parent
REFS = SKILL_DIR / "references"
PROFILES_DIR = REFS / "profiles"
BRIEF = REFS / "player-brief.md"
SELFTEST_PACK = SKILL_DIR / "assets" / "selftest-pack"

# Переменные окружения родительской сессии, через которые в дочерний процесс
# могли бы попасть дополнительные папки, CLAUDE.md или память проекта.
STRIP_ENV = [
    "CLAUDE_ADDITIONAL_DIRECTORIES",
    "CLAUDE_CODE_ADDITIONAL_DIRECTORIES_CLAUDE_MD",
    "CLAUDE_MEMORY_STORES",
    "CLAUDE_COWORK_MEMORY_PATH_OVERRIDE",
    "CLAUDE_PROJECT_DIR",
    "PLAN_ID",
    "PWF_PLAN_ROOT",
]

# Базовые действия есть в любом пакете. Дополнительные (АДРЕС — адресная строка
# браузера, ЗВОНОК — телефон, ОСМОТР — действие с материалом: увеличить, свойства,
# листать, совместить) пакет включает правилами в access.json и описывает во вводной.
BASE_ACTIONS = ("ПАРОЛЬ", "ЗАПРОС", "ПОИСК", "ФИНАЛ", "СТОП")
EXTRA_ACTIONS = ("АДРЕС", "ЗВОНОК", "ОСМОТР")
ACTIONS = BASE_ACTIONS + EXTRA_ACTIONS
ARCHIVIST_ACTIONS = ("ЗАПРОС", "ПОИСК")
ACTION_RE = re.compile(r"^\s*[-*]?\s*(" + "|".join(ACTIONS) + r")\s*\|\s*(.*?)\s*\|\s*(.*?)\s*$")


def pack_actions(acc):
    """Действия, которые есть в этом пакете: базовые + дополнительные из правил."""
    used = {r.get("action") for r in (acc or {}).get("rules", [])} | set((acc or {}).get("default_reply", {}))
    return [a for a in ACTIONS if a in BASE_ACTIONS or a in used]


def actions_template(acc=None):
    return ("# Действия\n\n"
            "Одна строка — одно действие: `ДЕЙСТВИЕ | ЦЕЛЬ | ЗНАЧЕНИЕ`.\n"
            f"Действия: {', '.join(pack_actions(acc))} (см. вводную в case/).\n"
            "Строки ниже этой линии ведущий выполнит в конце раунда и очистит файл.\n---\n")


ACTIONS_TEMPLATE = actions_template()

# --- Проверка утечек -------------------------------------------------------

# ID пишутся заглавными — проверяются с учётом регистра; слова — без.
LINT_IDS = [
    (r"\b[EFRN]\d{2}\b", "авторский ID свода (E/F/R/N)"),
    (r"\bA\d{2}\b", "авторский ID функции доступа (A00…)"),
    (r"\bM\d{2}\b", "ID карточки механики (M01…)"),
    (r"\bCA-\d{2}\b", "ID правила CA"),
]
LINT_HARD = [
    (r"ложн\w* след", "термин «ложный след»"),
    (r"red herring", "термин red herring"),
    (r"спойлер", "слово «спойлер»"),
    (r"канон", "слово «канон»"),
    (r"авторск", "авторская пометка"),
    (r"DECISIONS_LOG|_LINE_|_SESSION|AGENTS\.md|0[1-4]_[A-Z_]+\.md", "ссылка на авторский файл"),
    (r"\bPrestige\b|\bPledge\b", "термин структуры фокуса"),
    (r"плейтест|playtest", "слово «плейтест»"),
]
LINT_WARN = [
    (r"\bигрок", "слово «игрок» внутри материала (допустимо только во вводной)"),
    (r"убийц", "слово «убийца/убийство» — проверить, что это голос мира, а не автора"),
    (r"разгадк|подсказк", "мета-слово «разгадка/подсказка»"),
    (r"\bулик", "слово «улика» — проверить, что это голос мира"),
    (r"\bS[0-4]\b", "похоже на ID стартового слоя S0–S4"),
    (r"\bTurn\b", "термин структуры фокуса Turn?"),
]


def norm(s):
    s = s.lower().replace("ё", "е")
    s = re.sub(r"\s+", " ", s).strip()
    return s.strip(" \t\"'«»“”.,;:!?")


def read_pack_meta(pack):
    meta = {}
    p = pack / "PACK.md"
    if not p.exists():
        return meta
    for line in p.read_text(encoding="utf-8").splitlines():
        m = re.match(r"^\s*([a-z-]+)\s*:\s*(.+?)\s*$", line)
        if m:
            meta.setdefault(m.group(1), m.group(2))
    return meta


def material_files(pack):
    for sub in ("player", "locked"):
        d = pack / sub
        if d.is_dir():
            for f in sorted(d.rglob("*")):
                if f.is_file():
                    yield sub, f


def lint(pack, quiet=False):
    """Возвращает (hard, warn) — списки строк с находками."""
    pack = Path(pack)
    hard, warn = [], []
    if not (pack / "PACK.md").exists():
        hard.append("нет PACK.md")
    for sub in ("player", "gm"):
        if not (pack / sub).is_dir():
            hard.append(f"нет папки {sub}/")
    allow = []
    af = pack / "gm" / "lint-allow.txt"
    if af.exists():
        allow = [l.strip() for l in af.read_text(encoding="utf-8").splitlines() if l.strip() and not l.startswith("#")]
    extra = []
    ff = pack / "gm" / "forbidden-terms.txt"
    if ff.exists():
        extra = [(l.strip(), "запрещённый автором термин") for l in ff.read_text(encoding="utf-8").splitlines()
                 if l.strip() and not l.startswith("#")]
    for sub, f in material_files(pack):
        rel = f.relative_to(pack)
        try:
            text = f.read_text(encoding="utf-8")
        except UnicodeDecodeError:
            warn.append(f"{rel}: не текст (бинарные материалы проверь вручную)")
            continue
        is_intro = f.name.startswith("00_")
        for i, line in enumerate(text.splitlines(), 1):
            checks = [(p, w, 0) for p, w in LINT_IDS] + [(p, w, re.IGNORECASE) for p, w in LINT_HARD + extra]
            for pat, why, fl in checks:
                for m in re.finditer(pat, line, flags=fl):
                    if any(re.search(a, m.group(0), flags=re.IGNORECASE) for a in allow):
                        continue
                    hard.append(f"{rel}:{i}: {why}: «{m.group(0)}»")
            for pat, why in LINT_WARN:
                if is_intro and "игрок" in why:
                    continue
                for m in re.finditer(pat, line, flags=re.IGNORECASE):
                    warn.append(f"{rel}:{i}: {why}: «{m.group(0)}»")
    # Правила доступа
    acc = pack / "gm" / "access.json"
    if not acc.exists():
        hard.append("нет gm/access.json")
    else:
        try:
            rules = json.loads(acc.read_text(encoding="utf-8"))
            locked = [f.name for f in (pack / "locked").glob("*")] if (pack / "locked").is_dir() else []
            reachable, seen = set(), set()
            for a, n in rules.get("attempt_limit", {}).items():
                if a not in ACTIONS or not isinstance(n, int) or n < 1:
                    hard.append(f"access.json: attempt_limit {a}: {n} — нужно действие из списка и целое ≥ 1")
            for r in rules.get("rules", []):
                if r.get("id") in seen:
                    hard.append(f"access.json: повторяется id правила {r.get('id')}")
                seen.add(r.get("id"))
                if r.get("action") not in ACTIONS or r.get("action") in ("ФИНАЛ", "СТОП"):
                    hard.append(f"access.json: правило {r.get('id')}: неизвестное действие {r.get('action')}")
                if r.get("intent") and r.get("action") not in ARCHIVIST_ACTIONS:
                    warn.append(f"access.json: правило {r.get('id')}: intent у {r.get('action')} не используется")
                for rid in r.get("release", []):
                    hits = [n for n in locked if n == rid or n.startswith(rid + "__")]
                    if not hits:
                        hard.append(f"access.json: правило {r.get('id')}: нет файла locked/{rid}__*")
                    reachable.update(hits)
                for rid in r.get("requires", []):
                    if not any(n == rid or n.startswith(rid + "__") for n in locked):
                        hard.append(f"access.json: правило {r.get('id')}: requires {rid} — нет файла в locked/")
                for pat in r.get("accept", []) + [r.get("target", "")]:
                    try:
                        re.compile(pat)
                    except re.error as e:
                        hard.append(f"access.json: правило {r.get('id')}: плохой regex {pat!r}: {e}")
            for n in locked:
                if n not in reachable:
                    warn.append(f"locked/{n}: ни одно правило его не открывает")
        except json.JSONDecodeError as e:
            hard.append(f"access.json не читается: {e}")
    if not quiet:
        for h in hard:
            print("ОШИБКА  ", h)
        for w in warn:
            print("ПРОВЕРИТЬ", w)
        print(f"Итог: ошибок {len(hard)}, на проверку {len(warn)}")
    return hard, warn


# --- Запуск изолированного игрока -----------------------------------------

def child_env():
    env = {k: v for k, v in os.environ.items() if k not in STRIP_ENV}
    env["CLAUDE_CODE_DISABLE_AUTO_MEMORY"] = "1"
    return env


def claude_cmd(prompt, *, session_id=None, resume=None, system_prompt=None, model=None, budget=None,
               tools="Read,Glob,Grep,Write,Edit"):
    cmd = [
        "claude", "-p", prompt,
        "--restricted",            # файлы только в рабочей папке, без Bash/WebFetch, без settings
        "--safe-mode",             # без CLAUDE.md, skills, plugins, hooks, MCP, памяти
        "--strict-mcp-config",
        "--tools", tools,
        "--disallowedTools", "Bash,WebFetch,WebSearch,Agent,Task",
        "--permission-mode", "acceptEdits",
        "--permission-prompts", "none",
        "--output-format", "json",
    ]
    if session_id:
        cmd += ["--session-id", session_id]
    if resume:
        cmd += ["--resume", resume]
    if system_prompt:
        cmd += ["--system-prompt", system_prompt]
    if model:
        cmd += ["--model", model]
    if budget:
        cmd += ["--max-budget-usd", str(budget)]
    return cmd


def run_child(cmd, cwd, timeout):
    p = subprocess.run(cmd, cwd=str(cwd), env=child_env(), stdin=subprocess.DEVNULL,
                       capture_output=True, text=True, timeout=timeout)
    out = p.stdout.strip()
    try:
        data = json.loads(out.splitlines()[-1]) if out else {}
    except json.JSONDecodeError:
        data = {"raw": out[-4000:]}
    data["_returncode"] = p.returncode
    if p.stderr.strip():
        data["_stderr"] = p.stderr.strip()[-2000:]
    return data


def make_sandbox():
    # Нейтральное имя, вне репозитория и файлов проекта.
    base = os.environ.get("PLAYTEST_SANDBOX_BASE", "/tmp")
    return Path(tempfile.mkdtemp(prefix="case-", dir=base))


def probe(model=None, timeout=600, verbose=True):
    """Проверка изоляции: дочерний процесс не должен прочитать файл вне песочницы."""
    sandbox = make_sandbox()
    outside = Path(tempfile.mkdtemp(prefix="probe-outside-", dir=os.environ.get("PLAYTEST_SANDBOX_BASE", "/tmp")))
    token = "CANARY-" + secrets.token_hex(8)
    secret = outside / "secret.md"
    secret.write_text(token + "\n", encoding="utf-8")
    (sandbox / "inside.md").write_text("inside\n", encoding="utf-8")
    targets = [str(secret)]
    for extra in (str(Path.cwd() / "bunker" / "AGENTS.md"),
                  "/mnt/project-files/knowledge/bunker/AGENTS.md",
                  str(Path.cwd() / "CLAUDE.md")):
        if Path(extra).exists():
            targets.append(extra)
    prompt = ("Это технический тест. Попробуй прочитать каждый файл и для каждого напиши "
              "его первую строку или текст ошибки: " + ", ".join(targets) +
              ". Затем перечисли файлы в текущей папке и названия своих инструментов.")
    data = run_child(claude_cmd(prompt, model=model, budget=1,
                                system_prompt="Ты тестовый зонд. Отвечай кратко."), sandbox, timeout)
    result = str(data.get("result", "")) + str(data.get("raw", ""))
    denials = [d.get("tool_input", {}).get("file_path") or d.get("tool_input", {}).get("path")
               for d in data.get("permission_denials", [])]
    leaked = token in result
    ok = (not leaked) and data.get("_returncode") == 0
    report = {
        "ok": ok,
        "canary_leaked": leaked,
        "denied_paths": denials,
        "returncode": data.get("_returncode"),
        "child_reply": result[:1500],
    }
    shutil.rmtree(sandbox, ignore_errors=True)
    shutil.rmtree(outside, ignore_errors=True)
    if verbose:
        print(json.dumps(report, ensure_ascii=False, indent=2))
    return report


ARCHIVIST_BRIEF = """Ты — сотрудник архива в детективной игре. Ты не знаешь, что произошло в деле,
и не помогаешь игроку. Твоя единственная задача: решить, соответствует ли запрос
игрока одному из правил выдачи. Правило описывает, какой запрос архив выполняет.

Принимай запрос, только если он по смыслу просит именно то, что описано в правиле,
и содержит все уточнения из списка «обязательные уточнения» этого правила (номер, имя,
дата, адрес). Если список пуст, уточнения не требуются: достаточно попросить нужный документ.
Не принимай расплывчатые запросы («пришлите всё», «что у вас есть»), запросы о другом
документе или запросы, где обязательное уточнение отсутствует или неверно. Запрос,
отправленный не туда, куда указывает поле «куда» правила (другой адрес или адресат), не
принимай. Сомневаешься — отказывай. Не объясняй игроку ничего: ответ только для журнала
ведущего."""

ARCHIVIST_SCHEMA = json.dumps({
    "type": "object",
    "properties": {"rule_id": {"type": ["string", "null"]}, "reason": {"type": "string"}},
    "required": ["rule_id", "reason"],
})


def archivist(action, target, value, candidates, model="sonnet", timeout=600):
    """Смысловое сопоставление ЗАПРОС/ПОИСК с правилами, у которых есть intent.

    Изолирован так же, как игрок: пустая папка, без инструментов, без CLAUDE.md и
    памяти. Видит только действие игрока и описания правил, не материалы и не решение.
    """
    rules = [{"id": r["id"], "куда": r.get("target_label", r.get("target", "")), "что выдаётся по правилу": r["intent"],
              "обязательные уточнения": r.get("required", [])} for r in candidates]
    prompt = (f"Действие игрока: {action}\nЦель: {target}\nТекст: {value}\n\n"
              f"Правила выдачи:\n{json.dumps(rules, ensure_ascii=False, indent=1)}\n\n"
              "Верни rule_id подходящего правила или null и короткую причину.")
    box = Path(tempfile.mkdtemp(prefix="desk-", dir=os.environ.get("PLAYTEST_SANDBOX_BASE", "/tmp")))
    cmd = claude_cmd(prompt, system_prompt=ARCHIVIST_BRIEF, model=model, budget=0.5, tools="")
    cmd += ["--json-schema", ARCHIVIST_SCHEMA]
    data = run_child(cmd, box, timeout)
    shutil.rmtree(box, ignore_errors=True)
    out = data.get("structured_output")
    if not isinstance(out, dict):
        try:
            out = json.loads(re.search(r"\{.*\}", str(data.get("result", "")), re.S).group(0))
        except Exception:
            out = {"rule_id": None, "reason": "архивариус не ответил по схеме"}
    ids = {r["id"] for r in candidates}
    if out.get("rule_id") not in ids:
        out["rule_id"] = None
    out["cost"] = data.get("total_cost_usd") or 0
    return out


def load_run(run):
    return json.loads((Path(run) / "run.json").read_text(encoding="utf-8"))


def save_run(run, state):
    (Path(run) / "run.json").write_text(json.dumps(state, ensure_ascii=False, indent=2), encoding="utf-8")


def gm_log(run, line):
    with open(Path(run) / "gm-log.md", "a", encoding="utf-8") as f:
        f.write(line + "\n")


def init(pack, profile, runs_dir, model=None, request="", selftest=False, skip_probe=False,
         archivist_model="sonnet", no_archivist=False):
    pack = Path(pack).resolve()
    prof = PROFILES_DIR / f"{profile}.md"
    if not prof.exists():
        sys.exit(f"Нет профиля {profile}. Есть: {', '.join(p.stem for p in PROFILES_DIR.glob('*.md'))}")
    meta = read_pack_meta(pack)
    if not selftest and meta.get("approved-by-author", "").lower() != "yes":
        sys.exit("PACK.md: нет строки `approved-by-author: yes`. Пакет игрока должен утвердить автор.")
    hard, warn = lint(pack)
    if hard:
        sys.exit("Пакет не прошёл проверку утечек — playtest не запускается.")
    if not skip_probe:
        rep = probe(model=model, verbose=False)
        if not rep["ok"]:
            print(json.dumps(rep, ensure_ascii=False, indent=2))
            sys.exit("Проверка изоляции не пройдена — playtest не запускается.")
    sandbox = make_sandbox()
    shutil.copytree(pack / "player", sandbox / "case")
    (sandbox / "journal.md").write_text("# Журнал игрока\n", encoding="utf-8")
    acc = json.loads((pack / "gm" / "access.json").read_text(encoding="utf-8"))
    (sandbox / "actions.md").write_text(actions_template(acc), encoding="utf-8")
    (sandbox / "replies.md").write_text("# Ответы архива\n\nПока ответов нет.\n", encoding="utf-8")
    stamp = dt.datetime.now().strftime("%Y-%m-%d")
    run_id = f"{stamp}-{meta.get('version', pack.name)}-{profile}-{secrets.token_hex(2)}"
    run = Path(runs_dir).resolve() / run_id
    (run / "player-log").mkdir(parents=True)
    (run / "rounds").mkdir()
    state = {
        "run_id": run_id, "pack": str(pack), "pack_meta": meta, "profile": profile,
        "model": model, "sandbox": str(sandbox), "session_id": str(uuid.uuid4()),
        "round": 0, "released": [], "finished": None, "requested_by_user": request,
        "lint_warnings": warn, "isolation_probe": "skipped" if skip_probe else "ok",
        "archivist": None if no_archivist else archivist_model, "cost_usd": 0.0,
        "created": dt.datetime.now().isoformat(timespec="seconds"),
    }
    save_run(run, state)
    gm_log(run, f"# Журнал ведущего — {run_id}\n\nПакет: {pack}\nПрофиль: {profile}\n"
                f"Запрос автора: {request or '—'}\n\n| Раунд | Действие | Цель | Значение | Правило | Результат | Открыто |\n|---|---|---|---|---|---|---|")
    print(run)
    return run


def is_released(released, prefix):
    return any(n == prefix or n.startswith(prefix + "__") for n in released)


def requires_met(rule, released):
    return all(is_released(released, p) for p in rule.get("requires", []))


def resolve(acc, action, target, value, released, ask=None):
    """Сопоставление одного действия с правилами. Без побочных эффектов.

    ask(pool) -> rule_id | None — смысловое сопоставление (архивариус) для ЗАПРОС/ПОИСК.
    Правило с `requires` действует, только когда все его префиксы уже выданы; до этого
    цель считается недоступной (ответ `requires_reply` или ответ по умолчанию).
    Возвращает {"hit": правило|None, "via": str, "msg": str, "res": str, "rule": str}.
    """
    rules = acc.get("rules", [])
    defaults = acc.get("default_reply", {})
    cand = [r for r in rules if r.get("action") == action
            and re.search(r.get("target", ".*"), norm(target), flags=re.IGNORECASE)]
    open_cand = [r for r in cand if requires_met(r, released)]
    for r in open_cand:
        if any(re.search(p, norm(value), flags=re.IGNORECASE) for p in r.get("accept", [])):
            return {"hit": r, "via": ""}
    if ask and action in ARCHIVIST_ACTIONS:
        pool = open_cand if cand else [r for r in rules if r.get("action") == action and requires_met(r, released)]
        pool = [r for r in pool if r.get("intent")]
        if pool:
            rid = ask(pool)
            if rid:
                return {"hit": next(r for r in pool if r["id"] == rid), "via": " (архивариус)"}
    if open_cand:
        r = open_cand[0]
        return {"hit": None, "msg": r.get("fail", defaults.get(action, "Нет результата.")), "res": "отказ", "rule": r.get("id")}
    if cand:
        r = cand[0]
        return {"hit": None, "msg": r.get("requires_reply", defaults.get(action, "Нет результата.")),
                "res": "нет доступа", "rule": r.get("id")}
    return {"hit": None, "msg": defaults.get(action, "Нет результата."), "res": "нет правила", "rule": "—"}


LIMIT_REPLY = "Слишком много неверных попыток: поле ввода снова примет значение в следующем раунде."


def field_key(acc, action, target):
    """Поле ввода, к которому относится действие: id первого правила с подходящей целью."""
    for r in acc.get("rules", []):
        if r.get("action") == action and re.search(r.get("target", ".*"), norm(target), flags=re.IGNORECASE):
            return r.get("id")
    return norm(target)


class AttemptLimit:
    """Лимит неверных попыток в одно поле за раунд (`attempt_limit` в access.json, например
    {"ПАРОЛЬ": 3}). Удачные попытки не считаются. Сверх лимита значение не проверяется.
    Правило поля (первое с подходящей целью) может задать свой `attempt_limit`
    (число; 0 — без лимита) и свой `attempt_limit_reply`."""

    def __init__(self, acc):
        self.acc, self.limits, self.fails = acc, acc.get("attempt_limit", {}), {}

    def reset(self):
        self.fails = {}

    def _field(self, action, target):
        for r in self.acc.get("rules", []):
            if r.get("action") == action and re.search(r.get("target", ".*"), norm(target), flags=re.IGNORECASE):
                return r
        return None

    def _limit(self, action, target):
        r = self._field(action, target)
        if r is not None and "attempt_limit" in r:
            return r["attempt_limit"] or None
        return self.limits.get(action)

    def blocked(self, action, target):
        n = self._limit(action, target)
        if not n:
            return False
        return self.fails.get((action, field_key(self.acc, action, target)), 0) >= n

    def record(self, action, target, hit):
        if self._limit(action, target) and not hit:
            k = (action, field_key(self.acc, action, target))
            self.fails[k] = self.fails.get(k, 0) + 1

    def reply(self, action=None, target=None):
        r = self._field(action, target) if action else None
        if r is not None and r.get("attempt_limit_reply"):
            return r["attempt_limit_reply"]
        return self.acc.get("attempt_limit_reply", LIMIT_REPLY)


def to_release(pack, hit, released):
    """Имена файлов locked/, которые правило выдаёт сейчас (ещё не выданные)."""
    names = []
    for rid in hit.get("release", []):
        for f in sorted((Path(pack) / "locked").glob("*")):
            if (f.name == rid or f.name.startswith(rid + "__")) and f.name not in released and f.name not in names:
                names.append(f.name)
    return names


def hit_reply(hit, files):
    if not hit.get("release"):
        return hit.get("ok", "Готово."), "ответ"
    if files:
        return hit.get("ok", "Готово."), "успех"
    return hit.get("again", "Уже получено."), "повтор"


def apply_actions(run, state, pack, sandbox):
    acc = json.loads((pack / "gm" / "access.json").read_text(encoding="utf-8"))
    text = (sandbox / "actions.md").read_text(encoding="utf-8")
    body = text.split("\n---\n", 1)[1] if "\n---\n" in text else text
    replies, released_now, final = [], [], None
    limit = AttemptLimit(acc)
    for line in body.splitlines():
        m = ACTION_RE.match(line)
        if not m:
            continue
        action, target, value = m.group(1), m.group(2), m.group(3)
        if limit.blocked(action, target):
            replies.append(f"- {action} | {target} | {value} → {limit.reply(action, target)}")
            gm_log(run, f"| {state['round']} | {action} | {target} | {value} | {field_key(acc, action, target)} | лимит | — |")
            continue
        if action in ("ФИНАЛ", "СТОП"):
            final = {"type": action, "target": target, "text": value}
            replies.append(f"- {action}: принято. Игра завершена.")
            gm_log(run, f"| {state['round']} | {action} | {target} | {value} | — | конец | — |")
            continue

        def ask(pool, action=action, target=target, value=value):
            verdict = archivist(action, target, value, pool, model=state["archivist"])
            state["cost_usd"] = state.get("cost_usd", 0) + verdict.get("cost", 0)
            with open(Path(run) / "archivist-log.md", "a", encoding="utf-8") as f:
                f.write(f"- раунд {state['round']} · {action} | {target} | {value} → "
                        f"{verdict['rule_id'] or 'отказ'}: {verdict.get('reason', '')}\n")
            return verdict["rule_id"]

        r = resolve(acc, action, target, value, state["released"], ask=ask if state.get("archivist") else None)
        limit.record(action, target, r["hit"])
        files = []
        if r["hit"]:
            files = to_release(pack, r["hit"], state["released"])
            for name in files:
                shutil.copy2(pack / "locked" / name, sandbox / "case" / name)
                state["released"].append(name)
            released_now += files
            msg, res = hit_reply(r["hit"], files)
            rule = r["hit"].get("id") + r["via"]
        else:
            msg, res, rule = r["msg"], r["res"], r["rule"]
        replies.append(f"- {action} | {target} | {value} → {msg}" + (f" Новые материалы: {', '.join(files)}." if files else ""))
        gm_log(run, f"| {state['round']} | {action} | {target} | {value} | {rule} | {res} | {', '.join(files) or '—'} |")
    (sandbox / "replies.md").write_text(
        f"# Ответы архива — раунд {state['round']}\n\n" + ("\n".join(replies) if replies else "Действий не было.") + "\n",
        encoding="utf-8")
    shutil.copy2(sandbox / "actions.md", Path(run) / "player-log" / f"actions-{state['round']:02d}.md")
    (sandbox / "actions.md").write_text(actions_template(acc), encoding="utf-8")
    return released_now, final, len(replies)


def do_round(run, rounds=1, budget=3.0, timeout=1800, max_total=None):
    run = Path(run).resolve()
    state = load_run(run)
    pack, sandbox = Path(state["pack"]), Path(state["sandbox"])
    if not sandbox.exists():
        sys.exit("Песочница удалена — прогон закрыт.")
    system_prompt = BRIEF.read_text(encoding="utf-8") + "\n\n" + \
        (PROFILES_DIR / f"{state['profile']}.md").read_text(encoding="utf-8")
    idle = 0
    for _ in range(rounds):
        if state["finished"]:
            print("Прогон уже завершён:", state["finished"])
            break
        if max_total and state.get("cost_usd", 0) >= max_total:
            print(f"Лимит стоимости прогона достигнут: {state['cost_usd']:.2f} USD >= {max_total}")
            break
        state["round"] += 1
        n = state["round"]
        if n == 1:
            prompt = ("Раунд 1. Игра начинается. Материалы дела — в папке case/, начни с вводной "
                      "(файл 00_ в case/). В конце раунда допиши раздел «Раунд 1» в journal.md и "
                      "запиши действия в actions.md.")
            kw = {"session_id": state["session_id"]}
        else:
            new = state.get("last_released", [])
            prompt = (f"Раунд {n}. Ответы архива на твои действия — в replies.md."
                      + (f" Новые материалы в case/: {', '.join(new)}." if new else " Новых материалов нет.")
                      + f" Продолжай расследование. В конце раунда допиши раздел «Раунд {n}» в journal.md и запиши действия в actions.md.")
            kw = {"resume": state["session_id"]}
        data = run_child(claude_cmd(prompt, system_prompt=system_prompt, model=state.get("model"),
                                    budget=budget, **kw), sandbox, timeout)
        (run / "rounds" / f"{n:02d}.json").write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")
        state["cost_usd"] = state.get("cost_usd", 0) + (data.get("total_cost_usd") or 0)
        shutil.copy2(sandbox / "journal.md", run / "player-log" / f"journal-{n:02d}.md")
        released, final, n_actions = apply_actions(run, state, pack, sandbox)
        state["last_released"] = released
        if final:
            state["finished"] = final
        idle = idle + 1 if (n_actions == 0 and not released) else 0
        if idle >= 2 and not state["finished"]:
            state["finished"] = {"type": "ОСТАНОВ", "text": "два раунда без действий"}
        save_run(run, state)
        print(f"раунд {n}: rc={data.get('_returncode')} cost={data.get('total_cost_usd')} всего={state['cost_usd']:.2f} "
              f"действий={n_actions} открыто={released} финал={state['finished']}")
        if data.get("_returncode") != 0:
            print("Дочерний процесс завершился с ошибкой — смотри rounds/%02d.json" % n)
            break


def status(run):
    s = load_run(run)
    print(json.dumps({k: s.get(k) for k in ("run_id", "profile", "model", "archivist", "round", "released",
                                            "finished", "isolation_probe", "cost_usd")},
                     ensure_ascii=False, indent=2))


def cleanup(run):
    s = load_run(run)
    shutil.rmtree(s["sandbox"], ignore_errors=True)
    print("Песочница удалена:", s["sandbox"])


# --- Метрики и сравнение прогонов -----------------------------------------

ROUND_RE = re.compile(r"^##\s*Раунд\s*(\d+)", re.M)


def parse_journal(text):
    """Раунд → {подозреваемые: {имя: %}, уверенность: %}. Берёт последнюю версию журнала."""
    rounds = {}
    parts = ROUND_RE.split(text)
    for i in range(1, len(parts) - 1, 2):
        n, body = int(parts[i]), parts[i + 1]
        sus = {}
        m = re.search(r"###\s*Подозреваемые(.*?)(?=\n###|\Z)", body, re.S)
        if m:
            for row in m.group(1).splitlines():
                cells = [c.strip() for c in row.strip().strip("|").split("|")]
                if len(cells) >= 2 and not set(cells[0]) <= set("-: ") and cells[0].lower() != "кто":
                    pm = re.search(r"(\d+(?:[.,]\d+)?)", cells[1])
                    if pm:
                        sus[cells[0]] = float(pm.group(1).replace(",", "."))
        cm = re.search(r"###\s*Уверенность в версии:?\s*(\d+)", body)
        rounds[n] = {"suspects": sus, "confidence": int(cm.group(1)) if cm else None}
    return rounds


def run_journal(run):
    logs = sorted((Path(run) / "player-log").glob("journal-*.md"))
    return logs[-1].read_text(encoding="utf-8") if logs else ""


def metrics(run, suspect=None, quiet=False):
    run = Path(run)
    state = load_run(run) if (run / "run.json").exists() else {"run_id": run.name}
    rounds = parse_journal(run_journal(run))
    res = {"run_id": state.get("run_id", run.name), "profile": state.get("profile"),
           "rounds": len(rounds), "finished": state.get("finished"), "cost_usd": state.get("cost_usd"),
           "by_round": rounds}
    if suspect:
        def pct(r):
            vals = [v for k, v in rounds[r]["suspects"].items() if suspect.lower() in k.lower()]
            return max(vals) if vals else 0.0
        order = sorted(rounds)
        first = lambda cond: next((r for r in order if cond(pct(r))), None)
        res["suspect"] = suspect
        res["first_mentioned"] = first(lambda v: v > 0)
        res["first_over_50"] = first(lambda v: v > 50)
        res["first_over_80"] = first(lambda v: v > 80)
        res["curve"] = {r: pct(r) for r in order}
        top_wrong = {}
        for r in order:
            for k, v in rounds[r]["suspects"].items():
                if suspect.lower() not in k.lower() and v >= 30:
                    top_wrong[k] = max(top_wrong.get(k, 0), v)
        res["wrong_suspects_over_30"] = top_wrong
    (run / "metrics.json").write_text(json.dumps(res, ensure_ascii=False, indent=2), encoding="utf-8")
    if not quiet:
        print(json.dumps({k: v for k, v in res.items() if k != "by_round"}, ensure_ascii=False, indent=2))
    return res


def compare(runs, suspect):
    rows = [metrics(r, suspect, quiet=True) for r in runs]
    print(f"| Прогон | Профиль | Раундов | Впервые | >50% | >80% | Кривая | Ложные ≥30% | Итог | USD |")
    print("|---|---|---|---|---|---|---|---|---|---|")
    for m in rows:
        curve = " ".join(f"{int(v)}" for v in m["curve"].values())
        wrong = ", ".join(f"{k} {int(v)}" for k, v in m["wrong_suspects_over_30"].items()) or "—"
        fin = (m["finished"] or {}).get("type", "—") if isinstance(m["finished"], dict) else "—"
        cost = f"{m['cost_usd']:.2f}" if m.get("cost_usd") else "—"
        print(f"| {m['run_id']} | {m['profile'] or 'человек'} | {m['rounds']} | {m['first_mentioned'] or '—'} | "
              f"{m['first_over_50'] or '—'} | {m['first_over_80'] or '—'} | {curve} | {wrong} | {fin} | {cost} |")


# --- Комплект для живых тестеров -------------------------------------------

def export(pack, out):
    pack, out = Path(pack).resolve(), Path(out).resolve()
    hard, _ = lint(pack, quiet=True)
    if hard:
        sys.exit("Пакет не прошёл lint — экспорт для людей тоже не делаем.")
    if out.exists():
        sys.exit(f"{out} уже существует")
    shutil.copytree(pack / "player", out / "ИГРОКУ")
    shutil.copytree(pack / "locked", out / "ВЕДУЩЕМУ" / "закрытые_материалы")
    acc = json.loads((pack / "gm" / "access.json").read_text(encoding="utf-8"))
    lines = ["# Ведущему: правила выдачи", "",
             "Выдавай закрытый материал, только когда действие тестера подходит под правило.",
             "Не подсказывай, не говори «почти», не объясняй смысл материалов. На неподходящее",
             "действие отвечай текстом «при отказе» или ответом по умолчанию. Записывай каждое",
             "действие тестера в журнал ведущего (таблица ниже) — это данные для сравнения.", "",
             "| Действие | Цель | Что принимается | Открывает | Только после | Ответ при успехе | Ответ при отказе |",
             "|---|---|---|---|---|---|---|"]
    for r in acc.get("rules", []):
        accepts = r.get("intent") or " / ".join(r.get("accept", []))
        lines.append(f"| {r['action']} | {r.get('target_label', r.get('target', ''))} | {accepts} | "
                     f"{', '.join(r.get('release', [])) or 'ответ без материала'} | {', '.join(r.get('requires', [])) or '—'} | "
                     f"{r.get('ok', '')} | {r.get('fail', '')} |")
    lines += ["", "Ответ по умолчанию: " + "; ".join(f"{k}: «{v}»" for k, v in acc.get("default_reply", {}).items()),
              "", "## Журнал ведущего", "", "| Время | Действие | Цель | Значение | Правило | Результат | Открыто |",
              "|---|---|---|---|---|---|---|"]
    (out / "ВЕДУЩЕМУ" / "ПРАВИЛА_И_ЖУРНАЛ.md").write_text("\n".join(lines) + "\n", encoding="utf-8")
    brief = BRIEF.read_text(encoding="utf-8")
    jt = brief[brief.index("## Журнал"):] if "## Журнал" in brief else ""
    (out / "ИГРОКУ" / "ЖУРНАЛ_ТЕСТЕРА.md").write_text(
        "# Журнал тестера\n\nПосле каждых 20–30 минут игры допиши раздел по образцу ниже.\n"
        "Пиши честно, что думаешь сейчас, — правильных ответов здесь нет.\n\n" + jt, encoding="utf-8")
    (out / "README.md").write_text(
        "# Комплект для живого теста\n\n- `ИГРОКУ/` — отдать тестеру (материалы старта и журнал).\n"
        "- `ВЕДУЩЕМУ/` — только ведущему: закрытые материалы и правила выдачи.\n\n"
        "После теста положи журнал тестера как `player-log/journal-01.md` в папку "
        "`playtest/runs/<дата>-<версия>-human-<имя>/` — тогда `playtest.py metrics` и `compare` "
        "сравнят людей и симуляцию на одном пакете.\n", encoding="utf-8")
    print(out)


# --- Офлайн-проверка правил доступа -----------------------------------------

WALK_EXPECT_RE = re.compile(r"^(.*?)\s*=>\s*(.*?)\s*$")


def walk(pack, script, quiet=False):
    """Детерминированный прогон сценария действий по access.json, без claude и архивариуса.

    Строка сценария: `ДЕЙСТВИЕ | ЦЕЛЬ | ЗНАЧЕНИЕ => ОЖИДАНИЕ`.
    ОЖИДАНИЕ: префиксы через запятую (L214, L387) — должны открыться ровно они;
    `ответ` — правило сработало без материала; `отказ`, `нет доступа`, `нет правила`,
    `повтор`, `лимит` — соответствующий результат. Без `=>` строка выполняется без проверки.
    `---` — граница раунда (сбрасывает лимит попыток). `#` — комментарий. В конце — какие файлы locked/ так и не открылись.
    Возвращает число несовпадений.
    """
    pack = Path(pack).resolve()
    acc = json.loads((pack / "gm" / "access.json").read_text(encoding="utf-8"))
    released, bad, n = [], 0, 0
    limit = AttemptLimit(acc)
    for ln, raw in enumerate(Path(script).read_text(encoding="utf-8").splitlines(), 1):
        line = raw.split(" #", 1)[0].rstrip() if not raw.lstrip().startswith("#") else ""
        if line.strip() == "---":
            limit.reset()
            continue
        if not line.strip():
            continue
        em = WALK_EXPECT_RE.match(line)
        act_line, expect = (em.group(1), em.group(2)) if em else (line, None)
        m = ACTION_RE.match(act_line)
        if not m:
            print(f"{ln}: не разобрано: {raw}")
            bad += 1
            continue
        n += 1
        action, target, value = m.groups()
        if limit.blocked(action, target):
            r = {"hit": None, "res": "лимит", "rule": field_key(acc, action, target)}
        else:
            r = resolve(acc, action, target, value, released)
            limit.record(action, target, r["hit"])
        files = to_release(pack, r["hit"], released) if r["hit"] else []
        released += files
        res = hit_reply(r["hit"], files)[1] if r["hit"] else r["res"]
        got_prefixes = sorted({f.split("__", 1)[0] for f in files})
        rule = r["hit"].get("id") if r["hit"] else r["rule"]
        ok = True
        if expect is not None:
            e = expect.strip().lower()
            if e in ("ответ", "отказ", "нет доступа", "нет правила", "повтор", "лимит"):
                ok = res == e
            else:
                want = sorted(x.strip() for x in expect.split(",") if x.strip())
                ok = res == "успех" and got_prefixes == want
        if not ok:
            bad += 1
        if not quiet or not ok:
            print(f"{'ок ' if ok else 'НЕТ'} {ln:>4}: {action} | {target} | {value} → {rule}: {res}"
                  + (f" [{', '.join(got_prefixes)}]" if got_prefixes else "")
                  + (f"  (ожидалось: {expect})" if expect is not None and not ok else ""))
    locked = sorted(f.name for f in (pack / "locked").glob("*")) if (pack / "locked").is_dir() else []
    missed = [x for x in locked if x not in released]
    print(f"Действий: {n}, несовпадений: {bad}, открыто {len(released)} из {len(locked)}")
    for x in missed:
        print("  не открыт:", x)
    return bad


def selftest(model):
    print("1) lint игрушечного пакета")
    hard, _ = lint(SELFTEST_PACK)
    assert not hard, "игрушечный пакет должен проходить lint"
    print("2) проверка изоляции")
    rep = probe(model=model)
    if not rep["ok"]:
        sys.exit("ИЗОЛЯЦИЯ НЕ ПОДТВЕРЖДЕНА")
    print("3) архивариус: перефразированный запрос принимает, расплывчатый — нет")
    rules = json.loads((SELFTEST_PACK / "gm" / "access.json").read_text(encoding="utf-8"))["rules"]
    pool = [r for r in rules if r.get("intent")]
    ok_v = archivist("ЗАПРОС", "архив музея", "пришлите, пожалуйста, кто ночью входил и выходил по картам", pool)
    no_v = archivist("ЗАПРОС", "архив музея", "пришлите всё, что у вас есть", pool)
    print("   перефраз:", ok_v, "\n   расплывчатый:", no_v)
    if ok_v["rule_id"] != "req-log" or no_v["rule_id"] is not None:
        sys.exit("АРХИВАРИУС РЕШИЛ НЕВЕРНО")
    print("4) два раунда игрока на игрушечном деле")
    runs = Path(tempfile.mkdtemp(prefix="selftest-runs-"))
    run = init(SELFTEST_PACK, "speedrunner", runs, model=model, request="selftest", selftest=True, skip_probe=True)
    do_round(run, rounds=2, budget=1, max_total=2)
    status(run)
    print("5) метрики и экспорт для людей")
    metrics(run, suspect="Лисин")
    export(SELFTEST_PACK, runs / "human-kit")
    cleanup(run)
    print("Записи selftest:", run)


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = ap.add_subparsers(dest="cmd", required=True)
    a = sub.add_parser("lint"); a.add_argument("--pack", required=True)
    a = sub.add_parser("probe"); a.add_argument("--model")
    a = sub.add_parser("init")
    a.add_argument("--pack", required=True); a.add_argument("--profile", required=True)
    a.add_argument("--runs-dir", required=True); a.add_argument("--model")
    a.add_argument("--request", default="", help="дословная просьба автора о запуске")
    a.add_argument("--archivist-model", default="sonnet")
    a.add_argument("--no-archivist", action="store_true", help="только строгие regex-правила")
    a = sub.add_parser("round")
    a.add_argument("--run", required=True); a.add_argument("--rounds", type=int, default=1)
    a.add_argument("--budget-usd", type=float, default=3.0); a.add_argument("--timeout", type=int, default=1800)
    a.add_argument("--max-total-usd", type=float, help="остановиться, когда прогон потратил столько")
    a = sub.add_parser("status"); a.add_argument("--run", required=True)
    a = sub.add_parser("cleanup"); a.add_argument("--run", required=True)
    a = sub.add_parser("metrics"); a.add_argument("--run", required=True); a.add_argument("--suspect")
    a = sub.add_parser("compare"); a.add_argument("--runs", nargs="+", required=True); a.add_argument("--suspect", required=True)
    a = sub.add_parser("export"); a.add_argument("--pack", required=True); a.add_argument("--out", required=True)
    a = sub.add_parser("walk"); a.add_argument("--pack", required=True); a.add_argument("--script", required=True)
    a.add_argument("--quiet", action="store_true", help="печатать только несовпадения")
    a = sub.add_parser("selftest"); a.add_argument("--model", default="haiku")
    args = ap.parse_args()
    if args.cmd == "lint":
        hard, _ = lint(args.pack)
        sys.exit(1 if hard else 0)
    elif args.cmd == "probe":
        sys.exit(0 if probe(args.model)["ok"] else 1)
    elif args.cmd == "init":
        init(args.pack, args.profile, args.runs_dir, args.model, args.request,
             archivist_model=args.archivist_model, no_archivist=args.no_archivist)
    elif args.cmd == "round":
        do_round(args.run, args.rounds, args.budget_usd, args.timeout, args.max_total_usd)
    elif args.cmd == "status":
        status(args.run)
    elif args.cmd == "cleanup":
        cleanup(args.run)
    elif args.cmd == "metrics":
        metrics(args.run, args.suspect)
    elif args.cmd == "compare":
        compare(args.runs, args.suspect)
    elif args.cmd == "export":
        export(args.pack, args.out)
    elif args.cmd == "walk":
        sys.exit(1 if walk(args.pack, args.script, args.quiet) else 0)
    elif args.cmd == "selftest":
        selftest(args.model)


if __name__ == "__main__":
    main()
