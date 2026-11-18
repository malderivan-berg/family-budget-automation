#!/usr/bin/env python3
"""Проверка вёрстки: рендер на ширине телефона, поиск горизонтального переполнения.

Использование:
  render_check.py --html report_N.html --png report_N.png [--width 390]
Код выхода: 0 — ок; 1 — есть переполнение; 3 — Playwright недоступен (проверка пропущена).
"""
import argparse
import asyncio
import json
import sys

JS_OVERFLOW = """
() => {
  const vw = document.documentElement.clientWidth;
  const bad = [];
  for (const el of document.querySelectorAll('body *')) {
    const r = el.getBoundingClientRect();
    if (r.width && (r.right > vw + 1 || r.left < -1)) {
      bad.push({tag: el.tagName.toLowerCase(), cls: el.className && String(el.className).slice(0, 40),
                text: (el.innerText || '').trim().slice(0, 60), right: Math.round(r.right)});
    }
  }
  return {viewport: vw, scrollWidth: document.documentElement.scrollWidth,
          height: document.documentElement.scrollHeight, overflow: bad.slice(0, 20)};
}
"""


async def run(html_path, png_path, width):
    from playwright.async_api import async_playwright
    async with async_playwright() as p:
        browser = await p.chromium.launch()
        page = await browser.new_page(viewport={"width": width, "height": 844}, device_scale_factor=1)
        # отчёт должен быть автономным: внешние запросы блокируются
        await page.route("**/*", lambda r: r.continue_() if r.request.url.startswith("file:") else r.abort())
        await page.goto("file://" + html_path)
        await page.wait_for_timeout(300)
        res = await page.evaluate(JS_OVERFLOW)
        await page.screenshot(path=png_path, full_page=True)
        await browser.close()
        return res


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--html", required=True)
    ap.add_argument("--png", required=True)
    ap.add_argument("--width", type=int, default=390)
    a = ap.parse_args()
    try:
        import playwright  # noqa: F401
    except ImportError:
        print("SKIP: Playwright недоступен, проверка вёрстки пропущена")
        sys.exit(3)
    import os
    res = asyncio.run(run(os.path.abspath(a.html), a.png, a.width))
    print(json.dumps(res, ensure_ascii=False, indent=1))
    ok = res["scrollWidth"] <= res["viewport"] and not res["overflow"]
    print("OK" if ok else "OVERFLOW")
    sys.exit(0 if ok else 1)


if __name__ == "__main__":
    main()
