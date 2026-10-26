#!/usr/bin/env python3
"""Изолированный симулированный playtest для detective-playtester.

Игрок — отдельный процесс `claude -p` в песочнице вне репозитория и файлов
проекта. Он видит только материалы пакета игрока, которые ему выданы.
Ведущий механический: открывает материалы только по правилам gm/access.json.

Команды:
  lint    --pack DIR                       проверка пакета на авторские утечки
  probe                                    проверка изоляции (канарейка вне песочницы)
  init    --pack DIR --profile NAME --runs-dir DIR [--model M] [--request TEXT]
  round   --run DIR [--rounds N] [--budget-usd X] [--timeout SEC]
  status  --run DIR
  cleanup --run DIR                        удалить песочницу (записи прогона остаются)
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

ACTIONS = ("ПАРОЛЬ", "ЗАПРОС", "ПОИСК", "ФИНАЛ", "СТОП")
ACTION_RE = re.compile(r"^\s*[-*]?\s*(" + "|".join(ACTIONS) + r")\s*\|\s*(.*?)\s*\|\s*(.*?)\s*$")

ACTIONS_TEMPLATE = """# Действия

Одна строка — одно действие: `ДЕЙСТВИЕ | ЦЕЛЬ | ЗНАЧЕНИЕ`.
Действия: ПАРОЛЬ, ЗАПРОС, ПОИСК, ФИНАЛ, СТОП (см. вводную в case/).
Строки ниже этой линии ведущий выполнит в конце раунда и очистит файл.
---
"""

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
            reachable = set()
            for r in rules.get("rules", []):
                if r.get("action") not in ACTIONS:
                    hard.append(f"access.json: правило {r.get('id')}: неизвестное действие {r.get('action')}")
                for rid in r.get("release", []):
                    hits = [n for n in locked if n == rid or n.startswith(rid + "__")]
                    if not hits:
                        hard.append(f"access.json: правило {r.get('id')}: нет файла locked/{rid}__*")
                    reachable.update(hits)
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


def claude_cmd(prompt, *, session_id=None, resume=None, system_prompt=None, model=None, budget=None):
    cmd = [
        "claude", "-p", prompt,
        "--restricted",            # файлы только в рабочей папке, без Bash/WebFetch, без settings
        "--safe-mode",             # без CLAUDE.md, skills, plugins, hooks, MCP, памяти
        "--strict-mcp-config",
        "--tools", "Read,Glob,Grep,Write,Edit",
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
    for extra in ("/mnt/project-files/knowledge/bunker/AGENTS.md", str(Path.cwd() / "CLAUDE.md")):
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


def load_run(run):
    return json.loads((Path(run) / "run.json").read_text(encoding="utf-8"))


def save_run(run, state):
    (Path(run) / "run.json").write_text(json.dumps(state, ensure_ascii=False, indent=2), encoding="utf-8")


def gm_log(run, line):
    with open(Path(run) / "gm-log.md", "a", encoding="utf-8") as f:
        f.write(line + "\n")


def init(pack, profile, runs_dir, model=None, request="", selftest=False, skip_probe=False):
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
    (sandbox / "actions.md").write_text(ACTIONS_TEMPLATE, encoding="utf-8")
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
        "created": dt.datetime.now().isoformat(timespec="seconds"),
    }
    save_run(run, state)
    gm_log(run, f"# Журнал ведущего — {run_id}\n\nПакет: {pack}\nПрофиль: {profile}\n"
                f"Запрос автора: {request or '—'}\n\n| Раунд | Действие | Цель | Значение | Правило | Результат | Открыто |\n|---|---|---|---|---|---|---|")
    print(run)
    return run


def apply_actions(run, state, pack, sandbox):
    acc = json.loads((pack / "gm" / "access.json").read_text(encoding="utf-8"))
    defaults = acc.get("default_reply", {})
    text = (sandbox / "actions.md").read_text(encoding="utf-8")
    body = text.split("\n---\n", 1)[1] if "\n---\n" in text else text
    replies, released_now, final = [], [], None
    for line in body.splitlines():
        m = ACTION_RE.match(line)
        if not m:
            continue
        action, target, value = m.group(1), m.group(2), m.group(3)
        if action in ("ФИНАЛ", "СТОП"):
            final = {"type": action, "target": target, "text": value}
            replies.append(f"- {action}: принято. Игра завершена.")
            gm_log(run, f"| {state['round']} | {action} | {target} | {value} | — | конец | — |")
            continue
        cand = [r for r in acc.get("rules", []) if r.get("action") == action
                and re.search(r.get("target", ".*"), norm(target), flags=re.IGNORECASE)]
        hit = None
        for r in cand:
            if any(re.search(p, norm(value), flags=re.IGNORECASE) for p in r.get("accept", [])):
                hit = r
                break
        if hit:
            files = []
            for rid in hit.get("release", []):
                for f in sorted((pack / "locked").glob("*")):
                    if (f.name == rid or f.name.startswith(rid + "__")) and f.name not in state["released"]:
                        shutil.copy2(f, sandbox / "case" / f.name)
                        state["released"].append(f.name)
                        files.append(f.name)
            released_now += files
            msg = hit.get("ok", "Готово.") if files else hit.get("again", "Уже получено.")
            res, rule = ("успех" if files else "повтор"), hit.get("id")
        elif cand:
            msg, res, rule = cand[0].get("fail", defaults.get(action, "Нет результата.")), "отказ", cand[0].get("id")
            files = []
        else:
            msg, res, rule, files = defaults.get(action, "Нет результата."), "нет правила", "—", []
        replies.append(f"- {action} | {target} | {value} → {msg}" + (f" Новые материалы: {', '.join(files)}." if files else ""))
        gm_log(run, f"| {state['round']} | {action} | {target} | {value} | {rule} | {res} | {', '.join(files) or '—'} |")
    (sandbox / "replies.md").write_text(
        f"# Ответы архива — раунд {state['round']}\n\n" + ("\n".join(replies) if replies else "Действий не было.") + "\n",
        encoding="utf-8")
    shutil.copy2(sandbox / "actions.md", Path(run) / "player-log" / f"actions-{state['round']:02d}.md")
    (sandbox / "actions.md").write_text(ACTIONS_TEMPLATE, encoding="utf-8")
    return released_now, final, len(replies)


def do_round(run, rounds=1, budget=3.0, timeout=1800):
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
        shutil.copy2(sandbox / "journal.md", run / "player-log" / f"journal-{n:02d}.md")
        released, final, n_actions = apply_actions(run, state, pack, sandbox)
        state["last_released"] = released
        if final:
            state["finished"] = final
        idle = idle + 1 if (n_actions == 0 and not released) else 0
        if idle >= 2 and not state["finished"]:
            state["finished"] = {"type": "ОСТАНОВ", "text": "два раунда без действий"}
        save_run(run, state)
        print(f"раунд {n}: rc={data.get('_returncode')} cost={data.get('total_cost_usd')} "
              f"действий={n_actions} открыто={released} финал={state['finished']}")
        if data.get("_returncode") != 0:
            print("Дочерний процесс завершился с ошибкой — смотри rounds/%02d.json" % n)
            break


def status(run):
    s = load_run(run)
    print(json.dumps({k: s[k] for k in ("run_id", "profile", "round", "released", "finished", "isolation_probe")},
                     ensure_ascii=False, indent=2))


def cleanup(run):
    s = load_run(run)
    shutil.rmtree(s["sandbox"], ignore_errors=True)
    print("Песочница удалена:", s["sandbox"])


def selftest(model):
    print("1) lint игрушечного пакета")
    hard, _ = lint(SELFTEST_PACK)
    assert not hard, "игрушечный пакет должен проходить lint"
    print("2) проверка изоляции")
    rep = probe(model=model)
    if not rep["ok"]:
        sys.exit("ИЗОЛЯЦИЯ НЕ ПОДТВЕРЖДЕНА")
    print("3) два раунда игрока на игрушечном деле")
    runs = Path(tempfile.mkdtemp(prefix="selftest-runs-"))
    run = init(SELFTEST_PACK, "speedrunner", runs, model=model, request="selftest", selftest=True, skip_probe=True)
    do_round(run, rounds=2, budget=1)
    status(run)
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
    a = sub.add_parser("round")
    a.add_argument("--run", required=True); a.add_argument("--rounds", type=int, default=1)
    a.add_argument("--budget-usd", type=float, default=3.0); a.add_argument("--timeout", type=int, default=1800)
    a = sub.add_parser("status"); a.add_argument("--run", required=True)
    a = sub.add_parser("cleanup"); a.add_argument("--run", required=True)
    a = sub.add_parser("selftest"); a.add_argument("--model", default="haiku")
    args = ap.parse_args()
    if args.cmd == "lint":
        hard, _ = lint(args.pack)
        sys.exit(1 if hard else 0)
    elif args.cmd == "probe":
        sys.exit(0 if probe(args.model)["ok"] else 1)
    elif args.cmd == "init":
        init(args.pack, args.profile, args.runs_dir, args.model, args.request)
    elif args.cmd == "round":
        do_round(args.run, args.rounds, args.budget_usd, args.timeout)
    elif args.cmd == "status":
        status(args.run)
    elif args.cmd == "cleanup":
        cleanup(args.run)
    elif args.cmd == "selftest":
        selftest(args.model)


if __name__ == "__main__":
    main()
