#!/usr/bin/env python3
"""Конвертация Markdown -> Word (.docx) через установленный Microsoft Word.

    python tools/md2docx.py tools/README.md tools/DATA_MAP.md

Промежуточно собирается HTML (UTF-8, таблицы и код оформлены), затем Word
открывает его и сохраняет в .docx рядом с исходником. Требуется Windows с Word.
Зависимости: pip install markdown pywin32 (pywin32 обычно уже есть).
"""
import os
import sys
import tempfile

import markdown

CSS = """
body { font-family: 'Segoe UI', Calibri, sans-serif; font-size: 11pt; line-height: 1.35; }
h1 { font-size: 20pt; color: #1F3864; border-bottom: 2px solid #1F3864; padding-bottom: 4px; }
h2 { font-size: 15pt; color: #2E5496; margin-top: 18pt; }
h3 { font-size: 12.5pt; color: #2E5496; }
table { border-collapse: collapse; width: 100%; margin: 8pt 0; }
th, td { border: 1px solid #9CB3D0; padding: 4pt 6pt; font-size: 9.5pt; vertical-align: top; }
th { background: #DCE6F1; text-align: left; }
code { font-family: Consolas, 'Courier New', monospace; font-size: 9.5pt; background: #F2F2F2; }
pre { font-family: Consolas, 'Courier New', monospace; font-size: 9pt; background: #F7F7F7;
      border: 1px solid #D9D9D9; padding: 6pt; }
blockquote { border-left: 3px solid #C00000; margin-left: 0; padding-left: 10pt; color: #333; }
"""

WD_FORMAT_DOCX = 16


def md_to_html(md_path: str) -> str:
    with open(md_path, encoding="utf-8") as f:
        text = f.read()
    body = markdown.markdown(
        text, extensions=["tables", "fenced_code", "sane_lists", "toc"]
    )
    title = os.path.splitext(os.path.basename(md_path))[0]
    return (
        '<!DOCTYPE html><html><head><meta charset="utf-8">'
        f"<title>{title}</title><style>{CSS}</style></head><body>{body}</body></html>"
    )


def convert(md_path: str, word) -> str:
    html = md_to_html(md_path)
    tmp = os.path.join(tempfile.gettempdir(), os.path.basename(md_path) + ".html")
    # BOM: без него Word может принять UTF-8 за кодировку системы и испортить кириллицу
    with open(tmp, "w", encoding="utf-8-sig") as f:
        f.write(html)

    docx = os.path.abspath(os.path.splitext(md_path)[0] + ".docx")
    doc = word.Documents.Open(os.path.abspath(tmp), ConfirmConversions=False)
    try:
        doc.SaveAs2(docx, FileFormat=WD_FORMAT_DOCX)
    finally:
        doc.Close(False)
    os.remove(tmp)
    return docx


def main(paths):
    if not paths:
        print(__doc__)
        return 1
    import win32com.client  # pywin32

    word = win32com.client.Dispatch("Word.Application")
    word.Visible = False
    word.DisplayAlerts = False
    try:
        for p in paths:
            out = convert(p, word)
            print(f"{p} -> {out}  ({os.path.getsize(out) // 1024} КБ)")
    finally:
        word.Quit()
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
