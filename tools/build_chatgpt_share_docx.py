#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import re
import subprocess
import tempfile
from html import unescape
from pathlib import Path

from docx import Document
from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx.oxml.ns import qn
from docx.shared import Inches, Pt, RGBColor
from lxml import etree, html


PANDOC = Path("/opt/homebrew/bin/pandoc")
OUT_DIR = Path("/Users/dongpinhu/Desktop/SENA")


def has_class(el: etree._Element, class_name: str) -> bool:
    return class_name in (el.get("class") or "").split()


def extract_tex(el: etree._Element) -> str:
    annotations = el.xpath(
        './/*[local-name()="annotation" and @encoding="application/x-tex"]'
    )
    if annotations:
        return unescape("".join(annotations[0].itertext())).strip()
    return unescape("".join(el.itertext())).strip()


def replace_element_with_text(el: etree._Element, text: str) -> None:
    parent = el.getparent()
    if parent is None:
        return
    index = parent.index(el)
    if index == 0:
        parent.text = (parent.text or "") + text
    else:
        previous = parent[index - 1]
        previous.tail = (previous.tail or "") + text
    if el.tail:
        if index == 0:
            parent.text = (parent.text or "") + el.tail
        else:
            previous = parent[index - 1]
            previous.tail = (previous.tail or "") + el.tail
    parent.remove(el)


def preprocess_html(raw_html: str, math_tokens: dict[str, tuple[str, str]]) -> str:
    root = html.fragment_fromstring(f"<div>{raw_html}</div>", create_parent=True)

    for el in list(root.xpath(".//button | .//script | .//style")):
        parent = el.getparent()
        if parent is not None:
            parent.remove(el)

    for el in list(root.xpath(".//img | .//picture | .//source | .//svg")):
        alt = (el.get("alt") or el.get("aria-label") or "").strip()
        replacement = "[Image omitted" + (f": {alt}" if alt else "") + "]"
        replace_element_with_text(el, replacement)

    # Replace display math first so nested inline KaTeX spans are removed with it.
    for el in list(root.xpath('.//*[contains(concat(" ", normalize-space(@class), " "), " katex-display ")]')):
        tex = extract_tex(el)
        token = f"MATHDISPLAYTOKEN{len(math_tokens) + 1:05d}"
        math_tokens[token] = ("display", tex)
        replace_element_with_text(el, f"\n\n{token}\n\n")

    for el in list(root.xpath('.//*[contains(concat(" ", normalize-space(@class), " "), " katex ")]')):
        tex = extract_tex(el)
        token = f"MATHINLINETOKEN{len(math_tokens) + 1:05d}"
        math_tokens[token] = ("inline", tex)
        replace_element_with_text(el, token)

    simplify_links_and_attributes(root)
    return html.tostring(root, encoding="unicode", method="html")


def simplify_links_and_attributes(root: etree._Element) -> None:
    for a in root.xpath(".//a"):
        href = a.get("href")
        label = (a.get("aria-label") or a.get("alt") or "").strip()
        visible_text = " ".join("".join(a.itertext()).split())
        if label.startswith("Citation:") and (
            not visible_text or "Image omitted" in visible_text
        ):
            a.text = label
            for child in list(a):
                a.remove(child)
        a.attrib.clear()
        if href:
            a.set("href", href)

    table_attrs = {"colspan", "rowspan"}
    for el in root.iter():
        if el.tag == "a":
            continue
        keep = {key: value for key, value in el.attrib.items() if key in table_attrs}
        el.attrib.clear()
        el.attrib.update(keep)


def html_to_markdown(processed_html: str) -> str:
    with tempfile.TemporaryDirectory() as tmp:
        input_path = Path(tmp) / "message.html"
        input_path.write_text(processed_html, encoding="utf-8")
        proc = subprocess.run(
            [
                str(PANDOC),
                "-f",
                "html",
                "-t",
                "markdown-native_divs-native_spans",
                "--wrap=none",
                str(input_path),
            ],
            check=True,
            text=True,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
        )
    return proc.stdout.strip()


def restore_math_tokens(markdown: str, math_tokens: dict[str, tuple[str, str]]) -> str:
    for token, (kind, tex) in math_tokens.items():
        if kind == "display":
            replacement = f"\n\n$$\n{tex}\n$$\n\n"
        else:
            replacement = f"${tex}$"
        markdown = markdown.replace(token, replacement)
    return re.sub(r"\n{4,}", "\n\n\n", markdown).strip()


def message_to_markdown(message: dict) -> str:
    if message.get("role") != "assistant":
        return normalize_plain_text(message.get("text") or "")
    full_text = message.get("text") or ""
    math_tokens: dict[str, tuple[str, str]] = {}
    processed = preprocess_html(message.get("html") or "", math_tokens)
    markdown = html_to_markdown(processed)
    markdown = restore_math_tokens(markdown, math_tokens)
    if "[Truncated]" in markdown or r"\[Truncated\]" in markdown:
        markdown = markdown.replace("[Truncated]", "").replace(r"\[Truncated\]", "").strip()
        tail = missing_tail(full_text, markdown)
        if tail:
            markdown = f"{markdown}\n\n{plain_text_to_markdown(tail)}"
    return markdown or (message.get("text") or "").strip()


def normalize_plain_text(text: str) -> str:
    text = text.replace("\r\n", "\n").replace("\r", "\n").strip()
    return re.sub(r"\n{3,}", "\n\n", text)


def plain_text_to_markdown(text: str) -> str:
    text = normalize_plain_text(text)
    lines = []
    for line in text.splitlines():
        stripped = line.strip()
        if re.match(r"^\d+\.\d+\s+", stripped):
            lines.append(f"### {stripped}")
        elif re.match(r"^\d+\.\s+", stripped):
            lines.append(f"## {stripped}")
        else:
            lines.append(line)
    return "\n".join(lines).strip()


def missing_tail(full_text: str, markdown_prefix: str) -> str:
    markers = [
        "5. 作为网络分析文献专家看",
        "5.1 最接近的网络科学传统",
        "最终结论",
    ]
    for marker in markers:
        pos = full_text.find(marker)
        if pos != -1 and marker not in markdown_prefix:
            return full_text[pos:]
    return ""


def build_markdown(extraction: dict) -> str:
    title = extraction.get("title") or "ChatGPT Shared Conversation"
    url = extraction.get("url") or ""
    extracted_at = extraction.get("extractedAt") or ""

    parts = [
        f"# {title}",
        "",
        f"Source: {url}",
        f"Extracted: {extracted_at}",
        "",
        "This document is a complete transcript of the shared ChatGPT conversation body.",
        "",
    ]

    role_labels = {
        "user": "User",
        "assistant": "ChatGPT",
        "system": "System",
        "tool": "Tool",
    }

    for message in extraction.get("messages", []):
        idx = message.get("index", "")
        role = role_labels.get(message.get("role", ""), message.get("role", "Message").title())
        parts.append(f"## Message {idx}: {role}")
        parts.append("")
        parts.append(message_to_markdown(message))
        parts.append("")

    return "\n".join(parts).strip() + "\n"


def pandoc_markdown_to_docx(markdown_path: Path, docx_path: Path) -> None:
    subprocess.run(
        [
            str(PANDOC),
            "-f",
            "markdown+tex_math_dollars",
            "-t",
            "docx",
            "--metadata",
            "lang=zh-Hans",
            "-o",
            str(docx_path),
            str(markdown_path),
        ],
        check=True,
    )


def set_style_font(style, name: str, east_asia: str, size_pt: float, bold: bool | None = None) -> None:
    font = style.font
    font.name = name
    font.size = Pt(size_pt)
    if bold is not None:
        font.bold = bold
    style.element.rPr.rFonts.set(qn("w:eastAsia"), east_asia)


def postprocess_docx(docx_path: Path) -> None:
    doc = Document(docx_path)

    for section in doc.sections:
        section.top_margin = Inches(1)
        section.bottom_margin = Inches(1)
        section.left_margin = Inches(1)
        section.right_margin = Inches(1)

    styles = doc.styles
    set_style_font(styles["Normal"], "Times New Roman", "SimSun", 12)
    styles["Normal"].paragraph_format.alignment = WD_ALIGN_PARAGRAPH.JUSTIFY
    styles["Normal"].paragraph_format.line_spacing = 2.0
    styles["Normal"].paragraph_format.space_after = Pt(0)

    for name, size, color in [
        ("Heading 1", 16, RGBColor(0x1F, 0x4D, 0x78)),
        ("Heading 2", 13, RGBColor(0x2E, 0x74, 0xB5)),
        ("Heading 3", 12, RGBColor(0x1F, 0x4D, 0x78)),
    ]:
        if name in styles:
            set_style_font(styles[name], "Times New Roman", "SimSun", size, True)
            styles[name].font.color.rgb = color
            styles[name].paragraph_format.line_spacing = 1.15
            styles[name].paragraph_format.space_before = Pt(10)
            styles[name].paragraph_format.space_after = Pt(6)

    for paragraph in doc.paragraphs:
        style_name = paragraph.style.name if paragraph.style else ""
        if style_name.startswith("Heading"):
            paragraph.alignment = WD_ALIGN_PARAGRAPH.LEFT
        elif contains_math(paragraph):
            paragraph.alignment = WD_ALIGN_PARAGRAPH.CENTER
            paragraph.paragraph_format.line_spacing = 1.15
            paragraph.paragraph_format.space_before = Pt(6)
            paragraph.paragraph_format.space_after = Pt(6)
        else:
            paragraph.alignment = WD_ALIGN_PARAGRAPH.JUSTIFY
        for run in paragraph.runs:
            run.font.name = "Times New Roman"
            run._element.rPr.rFonts.set(qn("w:eastAsia"), "SimSun")

    doc.core_properties.title = "SNA与ENA数据展示问题"
    doc.core_properties.subject = "ChatGPT shared conversation transcript"
    doc.save(docx_path)


def contains_math(paragraph) -> bool:
    xml = paragraph._p.xml
    return "m:oMath" in xml or "m:oMathPara" in xml


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--input", default=str(OUT_DIR / "chatgpt_share_extraction.json"))
    parser.add_argument("--markdown", default=str(OUT_DIR / "SNA_ENA_ChatGPT_Share_Transcript.md"))
    parser.add_argument("--docx", default=str(OUT_DIR / "SNA_ENA_ChatGPT_Share_Transcript.docx"))
    args = parser.parse_args()

    input_path = Path(args.input)
    markdown_path = Path(args.markdown)
    docx_path = Path(args.docx)

    if not PANDOC.exists():
        raise SystemExit(f"Pandoc not found at {PANDOC}")

    extraction = json.loads(input_path.read_text(encoding="utf-8"))
    markdown = build_markdown(extraction)
    markdown_path.write_text(markdown, encoding="utf-8")
    pandoc_markdown_to_docx(markdown_path, docx_path)
    postprocess_docx(docx_path)
    print(f"Wrote {markdown_path}")
    print(f"Wrote {docx_path}")


if __name__ == "__main__":
    main()
