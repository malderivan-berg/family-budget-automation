#!/usr/bin/env python3
"""Static gate for the pinned self-contained FBA renderer, not a browser audit."""
import argparse
import json
import re
import sys
from html.parser import HTMLParser
from pathlib import Path

REQUIRED = (
    "Главное", "Состояние капитала", "Динамика капитала",
    "Учтённые операции", "Капитал мужа", "Капитал жены",
)
TAGS = set("html head meta title style body main header section h1 h2 h3 div p span ul li small footer".split())
VOID = {"meta"}
ATTRS = {"class", "style", "lang", "charset", "name", "content"}
# Only the existing renderer's self-contained CSS subset is supported.
UNSAFE_CSS = re.compile(r"url\s*\(|@import|expression\s*\(|javascript:|\\|/\*", re.I)


class Gate(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.stack, self.sections, self.issues = [], [], []
        self.current = None
        self.css = []
        self.doctypes = 0
        self.main_count = 0

    def handle_decl(self, decl):
        if decl.lower() == "doctype html":
            self.doctypes += 1
        else:
            self.issues.append("unexpected_declaration")

    def unknown_decl(self, data):
        self.issues.append("unexpected_declaration")

    def handle_pi(self, data):
        self.issues.append("unexpected_processing_instruction")

    def handle_starttag(self, tag, attrs):
        if tag not in TAGS:
            self.issues.append("unexpected_tag:" + tag)
        names = [k for k, _ in attrs]
        if len(set(names)) != len(names) or any(k not in ATTRS for k in names):
            self.issues.append("unexpected_attribute:" + tag)
        values = dict(attrs)
        if "style" in values and UNSAFE_CSS.search(values["style"] or ""):
            self.issues.append("unexpected_css")
        if tag == "meta" and values not in ({"charset": "utf-8"}, {"name": "viewport", "content": "width=device-width,initial-scale=1"}):
            self.issues.append("unexpected_meta")
        if tag == "main":
            self.main_count += 1
        if tag == "section":
            if self.current is not None or not self.stack or self.stack[-1] != "main":
                self.issues.append("unexpected_section_nesting")
            self.current = {"heading": [], "body": [], "headings": 0}
        if tag == "h2" and self.current is not None:
            self.current["headings"] += 1
        if tag not in VOID:
            self.stack.append(tag)

    def handle_startendtag(self, tag, attrs):
        self.handle_starttag(tag, attrs)
        if tag not in VOID:
            self.handle_endtag(tag)

    def handle_data(self, data):
        if "style" in self.stack:
            self.css.append(data)
        if self.current is not None:
            target = "heading" if "h2" in self.stack else "body"
            self.current[target].append(data)

    def handle_endtag(self, tag):
        if not self.stack or self.stack[-1] != tag:
            self.issues.append("unbalanced_tag:" + tag)
            return
        self.stack.pop()
        if tag == "section" and self.current is not None:
            self.sections.append(self.current)
            self.current = None


def check(html, expected_css):
    p = Gate()
    p.feed(html)
    p.close()
    if p.stack or p.current is not None or p.doctypes != 1 or p.main_count != 1:
        p.issues.append("incomplete_document")
    if "".join(p.css) != expected_css:
        p.issues.append("stylesheet_mismatch")
    headings = {}
    for section in p.sections:
        name = " ".join("".join(section["heading"]).split())
        if section["headings"] != 1 or not name:
            p.issues.append("invalid_section_heading")
        headings.setdefault(name, []).append(section)
    for name in REQUIRED:
        matches = headings.get(name, [])
        if len(matches) != 1 or not "".join(matches[0]["body"]).strip():
            p.issues.append("missing_duplicate_or_empty_section:" + name)
    return {"ok": not p.issues, "issues": p.issues,
            "required_sections": len(REQUIRED), "geometry_checked": False}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--html", required=True)
    parser.add_argument("--css", required=True, help="Pinned renderer stylesheet")
    parser.add_argument("--json-out")
    args = parser.parse_args()
    try:
        result = check(Path(args.html).read_text(encoding="utf-8"),
                       Path(args.css).read_text(encoding="utf-8"))
        if args.json_out:
            Path(args.json_out).write_text(json.dumps(result, ensure_ascii=False, indent=2), encoding="utf-8")
    except (OSError, UnicodeError, ValueError) as exc:
        print(type(exc).__name__, file=sys.stderr)
        return 2
    print(json.dumps(result, ensure_ascii=False))
    return 0 if result["ok"] else 1


if __name__ == "__main__":
    sys.exit(main())
