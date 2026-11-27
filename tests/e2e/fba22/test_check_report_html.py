"""Synthetic regression for the static HTML gate. No financial data."""
import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[3] / "agent" / "tools"))
from check_report_html import check, REQUIRED

css = '/* pinned comment */p{color:black}'
sections = [f'<section><h2>{s}</h2><p>Текст</p></section>' for s in REQUIRED]

def doc(parts):
    return '<!DOCTYPE html><html lang="ru"><head><meta charset="utf-8"><title>Отчёт</title><style>' + css + '</style></head><body><main>' + ''.join(parts) + '</main></body></html>'

cases = [
    ('valid', doc(sections), True),
    ('optional', doc(sections + ['<section><h2>Рекомендации</h2><p>Текст</p></section>']), True),
    ('missing', doc(sections[:-1]), False),
    ('duplicate', doc(sections + [sections[0]]), False),
    ('empty', doc([sections[0].replace('<p>Текст</p>', '')] + sections[1:]), False),
    ('script', doc(sections + ['<script>alert(1)</script>']), False),
    ('external', doc(sections + ['<img src="https://example.test/a">']), False),
    ('event', doc(sections + ['<div onclick="x">x</div>']), False),
    ('css', doc(sections + ['<div style="background:url(https://example.test)">x</div>']), False),
    ('broken', doc(sections).replace('</main>', ''), False),
    ('refresh', doc(sections).replace('<meta charset="utf-8">', '<meta http-equiv="refresh" content="0;url=https://example.test">'), False),
    ('changed stylesheet', doc(sections).replace('color:black', 'color:red'), False),
]
for name, html, want in cases:
    result = check(html, css)
    assert result['ok'] == want, (name, result)
    assert result['geometry_checked'] is False
print(f'{len(cases)} synthetic cases passed')
