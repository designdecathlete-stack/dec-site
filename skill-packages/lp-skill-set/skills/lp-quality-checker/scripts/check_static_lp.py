#!/usr/bin/env python3
import argparse
import json
import re
from html.parser import HTMLParser
from pathlib import Path
from urllib.parse import urlparse


BAD_PATTERNS = [
    "TODO", "FIXME", "undefined", "NaN", "lorem", "ダミー", "仮テキスト",
    "お客様の声", "人気メニュー", "一番人気", "マツエク施術できます",
    "歓迎しま", "file://", "C:\\\\Users", "AppData", ".codex",
]


class MiniHTMLParser(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.tags = []
        self.text_chunks = []
        self.in_title = False
        self.title = ""

    def handle_starttag(self, tag, attrs):
        attrs = dict(attrs)
        self.tags.append((tag, attrs))
        if tag == "title":
            self.in_title = True

    def handle_endtag(self, tag):
        if tag == "title":
            self.in_title = False

    def handle_data(self, data):
        if data.strip():
            self.text_chunks.append(data)
        if self.in_title:
            self.title += data


def read_html(path):
    return path.read_text(encoding="utf-8", errors="replace")


def parse_expected_cta(items):
    expected = {}
    for item in items:
        if "=" not in item:
            raise SystemExit(f"--expected-cta must be file=url, got: {item}")
        name, url = item.split("=", 1)
        expected[name.strip()] = url.strip()
    return expected


def line_for(content, needle):
    idx = content.find(needle)
    if idx < 0:
        return None
    return content.count("\n", 0, idx) + 1


def audit_file(path, root, expected_cta):
    content = read_html(path)
    parser = MiniHTMLParser()
    parser.feed(content)
    tags = parser.tags
    ids = []
    images = []
    links = []
    metas = {}
    issues = []

    for tag, attrs in tags:
        if attrs.get("id"):
            ids.append(attrs["id"])
        if tag == "img":
            images.append(attrs)
        if tag == "a":
            links.append(attrs)
        if tag == "meta" and attrs.get("name"):
            metas[attrs["name"]] = attrs.get("content", "")

    def add(severity, code, message, needle=None):
        issues.append({
            "severity": severity,
            "code": code,
            "message": message,
            "line": line_for(content, needle) if needle else None,
        })

    if not parser.title.strip():
        add("error", "missing-title", "Missing <title>.")
    if not metas.get("description", "").strip():
        add("warning", "missing-description", "Missing meta description.")

    dup_ids = sorted({x for x in ids if ids.count(x) > 1})
    for dup in dup_ids:
        add("error", "duplicate-id", f"Duplicate id: {dup}", f'id="{dup}"')

    id_set = set(ids)
    for attrs in links:
        href = attrs.get("href", "")
        text = attrs.get("aria-label") or ""
        if href.startswith("#") and href != "#" and href[1:] not in id_set:
            add("error", "broken-anchor", f"Internal anchor points to missing id: {href}", href)
        if href.startswith("http") and attrs.get("target") == "_blank" and "noopener" not in attrs.get("rel", ""):
            add("warning", "missing-noopener", f"External target blank link missing rel=noopener: {href}", href)
        if not href:
            add("warning", "empty-link", "Anchor without href.")

    for attrs in images:
        src = attrs.get("src", "")
        alt = attrs.get("alt", "")
        if not src:
            add("error", "missing-img-src", "Image without src.")
            continue
        if src.startswith(("http://", "https://", "data:")):
            continue
        img_path = (path.parent / src).resolve()
        if not img_path.exists():
            add("error", "missing-asset", f"Referenced image does not exist: {src}", src)
        if not alt.strip():
            add("warning", "missing-alt", f"Image missing alt text: {src}", src)
        if img_path.exists() and img_path.suffix.lower() not in {".webp", ".svg"}:
            add("info", "non-webp-image", f"Image is not WebP/SVG: {src}", src)

    image_srcs = [img.get("src", "") for img in images]
    for src in sorted({x for x in image_srcs if image_srcs.count(x) > 1}):
        add("warning", "duplicate-image", f"Same image is used multiple times in this LP: {src}", src)

    for pattern in BAD_PATTERNS:
        if pattern in content:
            add("warning", "suspicious-text", f"Suspicious leftover text/path found: {pattern}", pattern)

    if "�" in content:
        add("error", "replacement-char", "Replacement character found; possible encoding corruption.", "�")

    expected = expected_cta.get(path.name)
    if expected:
        cta_links = [a.get("href", "") for a in links if "LINE" in "".join(parser.text_chunks) or a.get("class")]
        if expected not in content:
            add("error", "missing-expected-cta", f"Expected CTA URL not found: {expected}")
        bad_line_ctas = [
            a.get("href", "") for a in links
            if a.get("href", "").startswith("http") and "s.lmes.jp/landing-qr" in a.get("href", "") and a.get("href") != expected
        ]
        for href in sorted(set(bad_line_ctas)):
            add("error", "wrong-cta", f"Found mismatched LINE CTA URL: {href}", href)

    h1_count = len(re.findall(r"<h1\b", content, flags=re.I))
    if h1_count == 0:
        add("info", "missing-h1", "No <h1> found. Acceptable only if the FV is an image banner and metadata is strong.")
    elif h1_count > 1:
        add("warning", "multiple-h1", f"Multiple <h1> tags found: {h1_count}")

    return {
        "file": str(path.relative_to(root)),
        "title": parser.title.strip(),
        "description": metas.get("description", ""),
        "image_count": len(images),
        "link_count": len(links),
        "issues": issues,
    }


def main():
    ap = argparse.ArgumentParser(description="Audit static landing page HTML files.")
    ap.add_argument("target", help="HTML file or directory containing HTML files")
    ap.add_argument("--expected-cta", action="append", default=[], help="Expected CTA as filename=url")
    ap.add_argument("--json-out", help="Write report JSON to this path")
    args = ap.parse_args()

    target = Path(args.target)
    root = target if target.is_dir() else target.parent
    files = sorted(target.glob("*.html")) if target.is_dir() else [target]
    expected_cta = parse_expected_cta(args.expected_cta)
    report = {
        "target": str(target),
        "files_checked": len(files),
        "results": [audit_file(path, root, expected_cta) for path in files],
    }
    text = json.dumps(report, ensure_ascii=False, indent=2)
    print(text)
    if args.json_out:
        Path(args.json_out).write_text(text + "\n", encoding="utf-8")


if __name__ == "__main__":
    main()
