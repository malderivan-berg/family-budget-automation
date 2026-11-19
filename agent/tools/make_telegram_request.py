#!/usr/bin/env python3
"""
Family Budget Automation — make_telegram_request.py

Собирает telegram_request_N.json (Telegram Request v1.1) из выгрузки
report_data и ID загруженного report_N.html. Адресаты и подпись берутся
из report_data.delivery без изменений: модель их не перепечатывает.

Формат совпадает с TelegramManager.createTelegramRequest_ (v0.9), который
разбирает сценарий 2 Nodul. Отличия v1.1: уникальное имя файла запроса
и htmlFileName = report_N.html.

Пример:
  python3 make_telegram_request.py --data report_data_9.json \
      --html-file-id 1AbC... --out telegram_request_9.json
Код выхода: 0 — файл создан, 2 — ошибка входных данных.
"""
import argparse
import json
import re
import sys
from datetime import datetime, timezone
from zoneinfo import ZoneInfo

TIMEZONE = "Europe/Moscow"          # часовой пояс проекта Apps Script
DRIVE_ID_RE = re.compile(r"^[A-Za-z0-9_-]{10,}$")


def fail(message):
    print("ERROR: " + message, file=sys.stderr)
    sys.exit(2)


def build_request(data, html_file_id, now_utc):
    if data.get("schema") != "report_data":
        fail("это не выгрузка report_data")
    report_id = data.get("report_id")
    if not isinstance(report_id, int):
        fail("report_id должен быть целым числом")
    if not DRIVE_ID_RE.match(html_file_id or ""):
        fail("html-file-id не похож на ID файла Google Drive")

    delivery = data.get("delivery") or {}
    users = delivery.get("users") or []
    caption = delivery.get("caption")
    if not users:
        fail("в delivery.users нет получателей")
    if not caption:
        fail("в delivery нет caption")
    for user in users:
        if not user.get("userId") or not user.get("chatId"):
            fail("у получателя нет userId или chatId")

    local = now_utc.astimezone(ZoneInfo(TIMEZONE))
    return {
        "requestId": "tg_%d_%s" % (report_id, local.strftime("%Y%m%d_%H%M%S")),
        "reportId": report_id,
        "users": [
            {"userId": str(u["userId"]), "chatId": str(u["chatId"]), "caption": caption}
            for u in users
        ],
        "htmlFileId": html_file_id,
        "htmlFileName": "report_%d.html" % report_id,
        # как Date.toISOString() в Apps Script: UTC, миллисекунды, «Z»
        "timestamp": now_utc.strftime("%Y-%m-%dT%H:%M:%S.") +
                     "%03dZ" % (now_utc.microsecond // 1000),
    }


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--data", required=True, help="report_data_N.json")
    ap.add_argument("--html-file-id", required=True, help="ID загруженного report_N.html")
    ap.add_argument("--out", required=True, help="telegram_request_N.json")
    args = ap.parse_args()

    with open(args.data, encoding="utf-8") as f:
        data = json.load(f)
    request = build_request(data, args.html_file_id, datetime.now(timezone.utc))
    with open(args.out, "w", encoding="utf-8") as f:
        json.dump(request, f, ensure_ascii=False, indent=2)
    print("OK: %s — получателей %d" % (args.out, len(request["users"])))


if __name__ == "__main__":
    main()
