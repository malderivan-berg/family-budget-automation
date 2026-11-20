#!/usr/bin/env python3
"""Сверка: каждое число в видимом тексте отчёта должно быть в выгрузке.

Допустимые числа:
  • любое число из display-строк выгрузки (значения, тексты, описания);
  • report_id и duration_days;
  • даты периода в формате ДД.ММ.ГГГГ.
Сравнение — по абсолютной величине (знак передаётся словами и стрелками),
проценты сравниваются только с процентами. Округление и пересчёт не допускаются:
«1,98 млн» вместо «1 980 239» — нарушение.

Использование:
  check_numbers.py --data report_data_N.json --html report_N.html [--json-out check_N.json]
  check_numbers.py --data report_data_N.json --text analysis_N.json   (проверка текстов до сборки)
Код выхода: 0 — расхождений нет; 1 — есть расхождения; 2 — ошибка входных данных.
"""
import argparse
import json
import re
import sys
from html.parser import HTMLParser

SPACES = "    "
NUM_RE = re.compile(
    r"(?<![\w.,])([+\-−–]?\d{1,3}(?:[" + SPACES + r"]\d{3})+(?:,\d+)?|[+\-−–]?\d+(?:[.,]\d+)?)"
    r"(\s?%)?")
DATE_RE = re.compile(r"(?<!\d)(\d{2})\.(\d{2})\.(\d{4})(?!\d)")
ISO_RE = re.compile(r"(?<!\d)(\d{4})-(\d{2})-(\d{2})(?!\d)")


def to_float(token):
    t = token
    for ch in SPACES:
        t = t.replace(ch, "")
    t = t.lstrip("+-−–").replace(",", ".")
    return float(t)


def numbers_in(text):
    """Возвращает (даты, [(токен, значение, это_процент)])."""
    dates = ["%s.%s.%s" % m.groups() for m in DATE_RE.finditer(text)]
    text = DATE_RE.sub(" ", text)
    found = []
    for m in NUM_RE.finditer(text):
        tok = m.group(0).strip()
        try:
            found.append((tok, to_float(m.group(1)), bool(m.group(2))))
        except ValueError:
            pass
    return dates, found


class VisibleText(HTMLParser):
    def __init__(self):
        super().__init__()
        self.skip = 0
        self.parts = []

    def handle_starttag(self, tag, attrs):
        if tag in ("style", "script", "title"):
            self.skip += 1

    def handle_endtag(self, tag):
        if tag in ("style", "script", "title") and self.skip:
            self.skip -= 1

    def handle_data(self, data):
        if not self.skip and data.strip():
            self.parts.append(data)


def allowed_sets(data):
    plain, pct, dates = set(), set(), set()

    def add_text(s):
        ds, nums = numbers_in(str(s))
        dates.update(ds)
        for _, v, is_pct in nums:
            (pct if is_pct else plain).add(round(v, 6))

    if str(data.get("schema_version")) == "2.0":
        # все таблицы выгрузки; даты — из raw (YYYY-MM-DD), как их печатает шаблон
        for table in data["tables"].values():
            for row in table.get("rows", []):
                for v in row.get("display", {}).values():
                    add_text(v)
                for v in row.get("raw", {}).values():
                    m = ISO_RE.fullmatch(v) if isinstance(v, str) else None
                    if m:
                        y, mo, d = m.groups()
                        dates.add(f"{d}.{mo}.{y}")
    else:
        for row in data["rows"]:
            for v in row.get("display", {}).values():
                add_text(v)
    plain.add(round(float(data["report_id"]), 6))
    plain.add(round(float(data["duration_days"]), 6))
    for key in ("period_start", "period_end"):
        m = ISO_RE.search(str(data.get(key, "")))
        if m:
            y, mo, d = m.groups()
            dates.add(f"{d}.{mo}.{y}")
    return plain, pct, dates


def check_text(text, plain, pct, dates):
    violations, checked = [], 0
    ds, nums = numbers_in(text)
    for d in ds:
        checked += 1
        if d not in dates:
            violations.append({"token": d, "reason": "дата вне периода отчёта"})
    for tok, v, is_pct in nums:
        checked += 1
        pool = pct if is_pct else plain
        if round(v, 6) not in pool:
            violations.append({"token": tok, "reason": "нет в выгрузке" + (" (процент)" if is_pct else "")})
    return checked, violations


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--data", required=True)
    g = ap.add_mutually_exclusive_group(required=True)
    g.add_argument("--html")
    g.add_argument("--text", help="analysis.json: проверить все строковые поля")
    ap.add_argument("--json-out")
    a = ap.parse_args()
    try:
        data = json.load(open(a.data, encoding="utf-8"))
        plain, pct, dates = allowed_sets(data)
        if a.html:
            p = VisibleText()
            p.feed(open(a.html, encoding="utf-8").read())
            chunks = p.parts
        else:
            chunks = []

            def walk(x):
                if isinstance(x, str):
                    chunks.append(x)
                elif isinstance(x, dict):
                    for k, v in x.items():
                        if k not in ("tone", "priority", "severity"):
                            walk(v)
                elif isinstance(x, list):
                    for v in x:
                        walk(v)
            walk(json.load(open(a.text, encoding="utf-8")))
    except (OSError, ValueError, KeyError) as e:
        print(f"CHECK ERROR: {e}", file=sys.stderr)
        sys.exit(2)

    total, viol = 0, []
    for chunk in chunks:
        c, v = check_text(chunk, plain, pct, dates)
        total += c
        for item in v:
            item["context"] = chunk.strip()[:160]
        viol.extend(v)

    result = {"checked": total, "violations": viol, "ok": not viol}
    if a.json_out:
        json.dump(result, open(a.json_out, "w", encoding="utf-8"), ensure_ascii=False, indent=2)
    print(f"checked={total} violations={len(viol)}")
    for item in viol[:50]:
        print(f"  ✗ {item['token']!r}: {item['reason']} — «{item['context']}»")
    sys.exit(0 if not viol else 1)


if __name__ == "__main__":
    main()
