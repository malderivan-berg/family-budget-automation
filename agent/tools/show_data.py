#!/usr/bin/env python3
"""Компактная таблица показателей выгрузки для чтения агентом.

Печатает display-строки (именно их можно цитировать в текстах) по семье, мужу и жене.
Использование: show_data.py --data report_data_N.json [--metrics agent/metrics_v1.1.json]
"""
import argparse
import json
import os

AGENT_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--data", required=True)
    ap.add_argument("--metrics", default=os.path.join(AGENT_DIR, "metrics_v1.1.json"))
    a = ap.parse_args()
    data = json.load(open(a.data, encoding="utf-8"))
    mapping = json.load(open(a.metrics, encoding="utf-8"))
    by_acc = {r["display"].get("account", "").strip(): r for r in data["rows"]}
    print(f"report_id={data['report_id']}  период {data['period_start']} → {data['period_end']}  "
          f"({data['duration_days']} дн.)")
    print(f"{'key':24} {'scope':8} {'kind':8} {'start':>14} {'end':>14} {'change':>14} {'%':>8}")
    for m in mapping["metrics"]:
        r = by_acc.get(m["account"])
        if not r:
            print(f"{m['key']:24} {m['scope']:8} НЕТ В ВЫГРУЗКЕ: {m['account']}")
            continue
        d = r["display"]
        print(f"{m['key']:24} {m['scope']:8} {m['kind']:8} {d.get('start_value_RUR', ''):>14} "
              f"{d.get('end_value_RUR', ''):>14} {d.get('change_RUR', ''):>14} {d.get('change_%', ''):>8}")
    extra = [acc for acc in by_acc if acc not in {m["account"] for m in mapping["metrics"]}]
    if extra:
        print("Строки выгрузки без описания в metrics:", "; ".join(extra))


if __name__ == "__main__":
    main()
