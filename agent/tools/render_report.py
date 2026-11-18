#!/usr/bin/env python3
"""Собирает HTML-отчёт из выгрузки report_data и аналитики агента.

Числа, таблицы и графики берутся только из report_data (display-строки
Google Sheets; raw-значения — только для геометрии графиков).
Из analysis.json берутся только тексты и оценки (тон, важность, приоритет).

Использование:
  render_report.py --data report_data_N.json --analysis analysis_N.json \
                   --out report_N.html [--metrics agent/metrics_v1.1.json]
Код выхода: 0 — готово; 2 — ошибка входных данных (отчёт не создан).
"""
import argparse
import html
import json
import os
import re
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
AGENT_DIR = os.path.dirname(HERE)
TEMPLATE_VERSION = "1.1"

TONES = {"positive", "negative", "neutral"}
SEVERITIES = {"critical", "high", "medium", "low"}
PRIORITIES = {"high", "medium", "low"}
WATCH_KEYS = ["unexplained", "idle_cash", "missed_interest"]
SEVERITY_RU = {"critical": "критично", "high": "высокая", "medium": "средняя", "low": "низкая"}
PRIORITY_RU = {"high": "высокий", "medium": "средний", "low": "низкий"}
COMPONENTS = ["net_real_estate", "deposits", "investments", "liquid"]


class InputError(Exception):
    pass


def esc(s):
    return html.escape(str(s), quote=True)


# ---------------------------------------------------------------- данные

class Metrics:
    """Доступ к строкам выгрузки по (key, scope)."""

    def __init__(self, data, mapping):
        self.by_account = {}
        for row in data["rows"]:
            acc = str(row["display"].get("account", "")).strip()
            if acc:
                self.by_account[acc] = row
        self.items = {}
        missing = []
        for m in mapping["metrics"]:
            row = self.by_account.get(m["account"])
            if row is None:
                missing.append(m["account"])
                continue
            self.items[(m["key"], m["scope"])] = {"meta": m, "row": row}
        if missing:
            raise InputError("В выгрузке нет строк: " + "; ".join(missing))

    def get(self, key, scope="family"):
        item = self.items.get((key, scope))
        if item is None:
            raise InputError(f"Нет показателя {key}/{scope}")
        return item

    def raw(self, key, scope, field):
        v = self.get(key, scope)["row"]["raw"].get(field)
        return v if isinstance(v, (int, float)) else None

    def disp(self, key, scope, field):
        return str(self.get(key, scope)["row"]["display"].get(field, "")).strip()


def pretty(display, unit=""):
    """Display-строка Sheets → HTML: типографский минус, неразрывные пробелы, единица."""
    s = display.strip()
    if not s:
        return "—"
    if s.startswith("-"):
        s = "−" + s[1:]
    s = s.replace(" ", " ")
    if unit:
        s += " " + unit
    return f'<span class="num">{esc(s)}</span>'


def signed(display, raw_value, unit=""):
    """Изменение со знаком «+» для положительных значений."""
    s = display.strip()
    if s and raw_value is not None and raw_value > 0 and not s.startswith("+"):
        s = "+" + s
    return pretty(s, unit)


def tone_of(raw_value, favorable):
    if raw_value is None or raw_value == 0 or favorable == "neutral":
        return "flat"
    good = raw_value > 0 if favorable == "up" else raw_value < 0
    return "good" if good else "bad"


def arrow(raw_value):
    if raw_value is None or raw_value == 0:
        return "•"
    return "▲" if raw_value > 0 else "▼"


def unit_of(meta):
    return "" if meta["kind"] == "rate" else "₽"


# ------------------------------------------------------------ аналитика

def validate_analysis(a):
    def req(cond, msg):
        if not cond:
            raise InputError("analysis.json: " + msg)

    req(isinstance(a, dict), "ожидается объект")
    req(isinstance(a.get("summary"), str) and 0 < len(a["summary"]) <= 900,
        "summary — непустая строка до 900 символов")
    ms = a.get("main_signal")
    req(ms is None or (isinstance(ms, dict) and ms.get("title") and ms.get("text")),
        "main_signal — null или {title, text}")
    ins = a.get("insights", [])
    req(isinstance(ins, list) and len(ins) <= 5, "insights — список до 5 элементов")
    for i in ins:
        req(isinstance(i, dict) and i.get("text") and i.get("tone") in TONES,
            "insights[i] — {text, tone: positive|negative|neutral}")
    rec = a.get("recommendations", [])
    req(isinstance(rec, list) and len(rec) <= 7, "recommendations — список до 7 элементов")
    for r in rec:
        req(isinstance(r, dict) and r.get("text") and r.get("priority") in PRIORITIES,
            "recommendations[i] — {text, priority: high|medium|low}")
    w = a.get("watch", {})
    req(isinstance(w, dict) and set(w) <= set(WATCH_KEYS),
        "watch — объект с ключами " + ", ".join(WATCH_KEYS))
    for k, v in w.items():
        req(isinstance(v, dict) and v.get("severity") in SEVERITIES and v.get("comment"),
            f"watch.{k} — {{severity, comment}}")
    p = a.get("persons", {})
    req(isinstance(p, dict) and set(p) <= {"husband", "wife"}, "persons — {husband, wife}")
    for k, v in p.items():
        req(isinstance(v, dict) and isinstance(v.get("summary", ""), str), f"persons.{k}.summary")
        for lst in ("risks", "opportunities"):
            req(isinstance(v.get(lst, []), list) and len(v.get(lst, [])) <= 4,
                f"persons.{k}.{lst} — список до 4 элементов")
    cc = a.get("changes_comment")
    req(cc is None or isinstance(cc, str), "changes_comment — строка или null")


# -------------------------------------------------------------- блоки

RICH_NUM = re.compile(
    r"[+\-−]?\d{1,3}(?:[  ]\d{3})+(?:,\d+)?(?:[  ]?(?:₽|%))?"
    r"|[+\-−]?\d+(?:,\d+)?[  ]?(?:₽|%)")


def rich(text):
    """Текст агента → HTML: числа с единицами не разрываются переносом строки."""
    def wrap(m):
        s = m.group(0).replace(" ", " ")
        if s.startswith("-"):
            s = "−" + s[1:]
        return f'<span class="num">{s}</span>'
    return RICH_NUM.sub(wrap, esc(text))


def paragraphs(text):
    return "".join(f"<p>{rich(t.strip())}</p>" for t in str(text).split("\n") if t.strip())


def delta_chip(M, key, scope, with_pct=True):
    meta = M.get(key, scope)["meta"]
    ch_raw = M.raw(key, scope, "change_RUR")
    parts = [arrow(ch_raw) + " " + signed(M.disp(key, scope, "change_RUR"), ch_raw, unit_of(meta))]
    pct = M.disp(key, scope, "change_%")
    if with_pct and pct:
        parts.append(signed(pct, M.raw(key, scope, "change_%")))
    t = tone_of(ch_raw, meta["favorable"])
    return f'<span class="delta {t}">{" · ".join(parts)}</span>'


def tile(M, key, scope="family"):
    meta = M.get(key, scope)["meta"]
    ch_raw = M.raw(key, scope, "change_RUR")
    t = tone_of(ch_raw, meta["favorable"])
    pct = M.disp(key, scope, "change_%")
    pct_html = signed(pct, M.raw(key, scope, "change_%")) if pct else ""
    return (f'<div class="tile"><div class="label">{esc(meta["label"])}</div>'
            f'<div class="value">{pretty(M.disp(key, scope, "end_value_RUR"), unit_of(meta))}</div>'
            f'<span class="delta {t}">{arrow(ch_raw)} {pct_html}</span>'
            f'<div class="muted" style="margin-top:6px">'
            f'{signed(M.disp(key, scope, "change_RUR"), ch_raw, unit_of(meta))} за период</div></div>')


def diverging_bars(entries, total=None):
    """entries: [(label, display_html, raw)] — длины столбцов пропорциональны |raw|."""
    vals = [abs(r) for _, _, r in entries + ([total] if total else []) if r is not None]
    mx = max(vals) if vals else 0
    out = ['<div class="bars">']
    for i, (label, disp_html, raw) in enumerate(entries + ([total] if total else [])):
        is_total = total is not None and i == len(entries)
        w = 0 if not mx or raw is None else abs(raw) / mx * 50
        cls = "pos" if (raw or 0) >= 0 else "neg"
        left = 50 if cls == "pos" else 50 - w
        out.append(
            f'<div class="bar-row{" total" if is_total else ""}">'
            f'<div class="bar-head"><span>{esc(label)}</span>{disp_html}</div>'
            f'<div class="track"><span class="axis"></span>'
            f'<span class="fill {cls}" style="left:{left:.2f}%;width:{w:.2f}%"></span></div></div>')
    out.append("</div>")
    return "".join(out)


def structure(M, scope):
    raws = [M.raw(k, scope, "end_value_RUR") for k in COMPONENTS]
    if any(r is None or r < 0 for r in raws) or sum(raws) <= 0:
        return ""
    total = sum(raws)
    segs = "".join(f'<span class="c{i + 1}" style="width:{r / total * 100:.2f}%"></span>'
                   for i, r in enumerate(raws))
    legend = "".join(
        f'<div class="item"><span><span class="dot c{i + 1}"></span>'
        f'{esc(M.get(k, scope)["meta"]["label"])}</span>'
        f'{pretty(M.disp(k, scope, "end_value_RUR"), "₽")}</div>'
        for i, k in enumerate(COMPONENTS))
    return f'<div class="stack">{segs}</div><div class="legend">{legend}</div>'


def component_bars(M, scope):
    entries = []
    for k in COMPONENTS:
        raw = M.raw(k, scope, "change_RUR")
        entries.append((M.get(k, scope)["meta"]["label"],
                        signed(M.disp(k, scope, "change_RUR"), raw, "₽"), raw))
    nw_raw = M.raw("net_worth", scope, "change_RUR")
    total = ("Изменение чистого капитала",
             signed(M.disp("net_worth", scope, "change_RUR"), nw_raw, "₽"), nw_raw)
    return diverging_bars(entries, total)


def value_row(M, key, scope, note=None, show_change=True):
    meta = M.get(key, scope)["meta"]
    u = unit_of(meta)
    right = pretty(M.disp(key, scope, "end_value_RUR"), u)
    if show_change and meta["kind"] in ("stock", "daily", "rate"):
        ch_raw = M.raw(key, scope, "change_RUR")
        t = tone_of(ch_raw, meta["favorable"])
        pct = M.disp(key, scope, "change_%")
        ch = signed(M.disp(key, scope, "change_RUR"), ch_raw, u)
        if pct:
            ch += " · " + signed(pct, M.raw(key, scope, "change_%"))
        right += f'<small class="{t}-t">{ch}</small>'
    small = f"<small>{esc(note)}</small>" if note else ""
    return f'<div class="row"><div class="l">{esc(meta["label"])}{small}</div><div class="r">{right}</div></div>'


def flow_row(M, key, scope, label=None):
    meta = M.get(key, scope)["meta"]
    raw = M.raw(key, scope, "end_value_RUR")
    cls = "good-t" if key == "income" and raw else ("bad-t" if key == "expense" and raw else "")
    return (f'<div class="row"><div class="l">{esc(label or meta["label"])}</div>'
            f'<div class="r {cls}">{pretty(M.disp(key, scope, "end_value_RUR"), "₽")}</div></div>')


def watch_card(M, key, w):
    sev = w["severity"]
    head = {"unexplained": "Необъяснённое изменение капитала семьи",
            "idle_cash": "Бездействующие деньги семьи",
            "missed_interest": "Упущенный процентный доход семьи"}[key]
    body = []
    if key == "unexplained":
        body.append(f'<div class="watch-value">{pretty(M.disp("unexplained", "family", "end_value_RUR"), "₽")}</div>')
        body.append(f'<div class="muted">за период; в прошлом отчёте — '
                    f'{pretty(M.disp("unexplained", "family", "start_value_RUR"), "₽")}</div>')
        details = [("Муж", "husband"), ("Жена", "wife")]
        body.append('<div class="rows">' + "".join(
            f'<div class="row"><div class="l">{n}</div><div class="r">'
            f'{pretty(M.disp("unexplained", s, "end_value_RUR"), "₽")}</div></div>' for n, s in details) + "</div>")
    elif key == "idle_cash":
        body.append(f'<div class="watch-value">{pretty(M.disp("idle_cash", "family", "end_value_RUR"), "₽")}</div>')
        body.append(delta_chip(M, "idle_cash", "family"))
        body.append('<div class="rows">' + "".join(
            f'<div class="row"><div class="l">{n}</div><div class="r">'
            f'{pretty(M.disp("idle_cash", s, "end_value_RUR"), "₽")}</div></div>'
            for n, s in (("Муж", "husband"), ("Жена", "wife"))) + "</div>")
    else:
        body.append(f'<div class="watch-value">{pretty(M.disp("missed_interest_daily", "family", "end_value_RUR"), "₽")}'
                    f'<span class="muted"> в день</span></div>')
        body.append(delta_chip(M, "missed_interest_daily", "family"))
        body.append(f'<div class="muted" style="margin-top:8px">Расчёт по минимальной ставке накопительных счетов: '
                    f'{pretty(M.disp("min_savings_rate", "family", "end_value_RUR"))}</div>')
    return (f'<div class="card {sev}"><div class="watch-top"><h3>{esc(head)}</h3>'
            f'<span class="pill {sev}">{SEVERITY_RU[sev]}</span></div>'
            + "".join(body) + f'<p style="margin-top:10px">{rich(w["comment"])}</p></div>')


def section_title(text, note=None):
    """Заголовок раздела (уровень h2) и необязательная пояснительная строка."""
    out = f'<h2 class="section-title">{esc(text)}</h2>'
    if note:
        out += f'<div class="section-note">{esc(note)}</div>'
    return out


def person_section(M, scope, title, p):
    nw = M.get("net_worth", scope)["meta"]
    parts = [f'<section>{section_title(title)}',
             f'<div class="card"><div class="person-head"><h3>{esc(nw["label"])}</h3>'
             f'<div class="watch-value">{pretty(M.disp("net_worth", scope, "end_value_RUR"), "₽")}</div></div>'
             f'{delta_chip(M, "net_worth", scope)}']
    if p.get("summary"):
        parts.append(f'<div style="margin-top:12px">{paragraphs(p["summary"])}</div>')
    st = structure(M, scope)
    if st:
        parts.append('<div class="sub-h">Структура капитала</div>' + st)
    parts.append('<div class="sub-h">Из чего сложилось изменение</div>' + component_bars(M, scope))
    parts.append('<div class="sub-h">Показатели</div><div class="rows">'
                 + "".join(value_row(M, k, scope) for k in COMPONENTS + ["idle_cash"])
                 + flow_row(M, "income", scope) + flow_row(M, "expense", scope)
                 + f'<div class="row"><div class="l">{esc(M.get("unexplained", scope)["meta"]["label"])}</div>'
                   f'<div class="r">{pretty(M.disp("unexplained", scope, "end_value_RUR"), "₽")}</div></div>'
                 + "</div>")
    for lst, name in (("risks", "Риски"), ("opportunities", "Возможности")):
        if p.get(lst):
            parts.append(f'<div class="sub-h">{name}</div><ul class="clean">'
                         + "".join(f"<li>{rich(x)}</li>" for x in p[lst]) + "</ul>")
    parts.append("</div></section>")
    return "".join(parts)


# ---------------------------------------------------------------- сборка

def fmt_date(iso):
    y, m, d = iso[:10].split("-")
    return f"{d}.{m}.{y}"


def render(data, analysis, mapping, css, instruction_version):
    validate_analysis(analysis)
    M = Metrics(data, mapping)
    rid = data["report_id"]
    period = (f'{fmt_date(data["period_start"])} — {fmt_date(data["period_end"])}'
              f' · {int(data["duration_days"])} дн.')
    persons = analysis.get("persons", {})
    watch = analysis.get("watch", {})

    out = [f'<!DOCTYPE html><html lang="ru"><head><meta charset="utf-8">'
           f'<meta name="viewport" content="width=device-width,initial-scale=1">'
           f'<title>Финансовый отчёт семьи №{esc(rid)}</title><style>{css}</style></head>'
           f'<body><main class="report">']
    # Заголовок
    out.append(f'<header><div class="eyebrow">Family Office · отчёт №{esc(rid)}</div>'
               f'<h1>Финансовое состояние семьи</h1><span class="chip">{esc(period)}</span></header>')
    # Главное
    out.append(f'<section>{section_title("Главное")}<div class="card">'
               + paragraphs(analysis["summary"]) + "</div>")
    ms = analysis.get("main_signal")
    if ms:
        out.append(f'<div class="card accent"><h3>{esc(ms["title"])}</h3>{paragraphs(ms["text"])}</div>')
    out.append("</section>")
    # KPI
    out.append(f'<section>{section_title("Состояние капитала")}'
               f'<div class="card hero"><h3>Чистый капитал семьи</h3>'
               f'<div class="value">{pretty(M.disp("net_worth", "family", "end_value_RUR"), "₽")}</div>'
               f'{delta_chip(M, "net_worth", "family")}</div>'
               '<div class="grid" style="margin-top:10px">'
               + "".join(tile(M, k) for k in ("liquid", "deposits", "investments", "net_real_estate"))
               + "</div></section>")
    # Изменения
    out.append(f'<section>{section_title("Динамика капитала")}'
               '<div class="card"><h3>Из чего сложилось изменение</h3>')
    if analysis.get("changes_comment"):
        out.append(paragraphs(analysis["changes_comment"]))
    out.append(component_bars(M, "family"))
    st = structure(M, "family")
    if st:
        out.append('<div class="sub-h">Структура капитала на конец периода</div>' + st)
    nw_entries = [(n, signed(M.disp("net_worth", s, "change_%"), M.raw("net_worth", s, "change_%")),
                   M.raw("net_worth", s, "change_%")) for n, s in (("Семья", "family"), ("Муж", "husband"), ("Жена", "wife"))]
    out.append('<div class="sub-h">Изменение чистого капитала, %</div>' + diverging_bars(nw_entries))
    out.append("</div></section>")
    # Зоны внимания
    if watch:
        out.append(f'<section>{section_title("На что обратить внимание")}'
                   + "".join(watch_card(M, k, watch[k]) for k in WATCH_KEYS if k in watch) + "</section>")
    # Учтённые операции
    out.append(f'<section>{section_title("Учтённые операции", "Операции, внесённые в календарь за период отчёта")}'
               '<div class="card"><div class="rows">'
               + flow_row(M, "income", "family", "Доходы семьи") + flow_row(M, "expense", "family", "Расходы семьи")
               + flow_row(M, "income", "husband", "Доходы мужа") + flow_row(M, "expense", "husband", "Расходы мужа")
               + flow_row(M, "income", "wife", "Доходы жены") + flow_row(M, "expense", "wife", "Расходы жены")
               + '</div></div></section>')
    # Муж / жена
    out.append(person_section(M, "husband", "Капитал мужа", persons.get("husband", {})))
    out.append(person_section(M, "wife", "Капитал жены", persons.get("wife", {})))
    # Выводы
    if analysis.get("insights"):
        out.append(f'<section>{section_title("Главные выводы")}'
                   + "".join(f'<div class="card {i["tone"]}"><p style="margin:0">{rich(i["text"])}</p></div>'
                             for i in analysis["insights"]) + "</section>")
    # Рекомендации
    if analysis.get("recommendations"):
        out.append(f'<section>{section_title("Рекомендации")}'
                   + "".join(f'<div class="card"><span class="pill {r["priority"]}-p">'
                             f'{PRIORITY_RU[r["priority"]]} приоритет</span>'
                             f'<p style="margin:8px 0 0">{rich(r["text"])}</p></div>'
                             for r in analysis["recommendations"]) + "</section>")
    # Подвал
    out.append(f'<footer>Все суммы — в рублях, из Google Sheets (лист «Расчеты», отчёт №{esc(rid)}). '
               f'Тексты — анализ Claude; каждое число в отчёте сверено с выгрузкой. '
               f'Шаблон v{TEMPLATE_VERSION}, инструкция v{esc(instruction_version)}.</footer>')
    out.append("</main></body></html>")
    return "".join(out)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--data", required=True)
    ap.add_argument("--analysis", required=True)
    ap.add_argument("--out", required=True)
    ap.add_argument("--metrics", default=os.path.join(AGENT_DIR, "metrics_v1.1.json"))
    ap.add_argument("--css", default=os.path.join(AGENT_DIR, "template", "report.css"))
    ap.add_argument("--instruction-version", default="?")
    a = ap.parse_args()
    try:
        data = json.load(open(a.data, encoding="utf-8"))
        if data.get("schema") != "report_data" or str(data.get("schema_version")) != "1.0":
            raise InputError("ожидается report_data schema_version 1.0")
        analysis = json.load(open(a.analysis, encoding="utf-8"))
        mapping = json.load(open(a.metrics, encoding="utf-8"))
        css = open(a.css, encoding="utf-8").read()
        doc = render(data, analysis, mapping, css, a.instruction_version)
    except (InputError, KeyError, ValueError) as e:
        print(f"RENDER ERROR: {e}", file=sys.stderr)
        sys.exit(2)
    with open(a.out, "w", encoding="utf-8") as f:
        f.write(doc)
    print(f"OK: {a.out} ({len(doc)} bytes)")


if __name__ == "__main__":
    main()
