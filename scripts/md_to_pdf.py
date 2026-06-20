#!/usr/bin/env python3
"""Convert the QA audit Markdown report to a styled, print-ready HTML file."""
import sys
import markdown

SRC = sys.argv[1] if len(sys.argv) > 1 else "ScheduTeach-QA-Audit-Report.md"
OUT = sys.argv[2] if len(sys.argv) > 2 else "ScheduTeach-QA-Audit-Report.html"

with open(SRC, "r", encoding="utf-8") as f:
    text = f.read()

html_body = markdown.markdown(
    text,
    extensions=["tables", "fenced_code", "toc", "sane_lists", "attr_list"],
)

CSS = """
@page { size: A4; margin: 18mm 16mm 20mm 16mm; }
* { box-sizing: border-box; }
body {
  font-family: 'Segoe UI', 'Helvetica Neue', Arial, sans-serif;
  font-size: 10.5pt; line-height: 1.5; color: #1a2230;
  max-width: 100%; margin: 0;
}
h1 {
  font-size: 22pt; color: #0f766e; margin: 0 0 4pt;
  border-bottom: 3px solid #0f766e; padding-bottom: 8pt;
  page-break-after: avoid;
}
h2 {
  font-size: 15pt; color: #0b5e57; margin: 22pt 0 8pt;
  border-bottom: 1px solid #cfe0dd; padding-bottom: 4pt;
  page-break-after: avoid; page-break-before: auto;
}
h3 { font-size: 12pt; color: #163; margin: 14pt 0 6pt; page-break-after: avoid; }
p { margin: 6pt 0; }
a { color: #0f766e; text-decoration: none; }
strong { color: #0b1b2b; }
em { color: #475569; }
ul, ol { margin: 6pt 0 6pt 0; padding-left: 22pt; }
li { margin: 2.5pt 0; }
hr { border: none; border-top: 1px solid #d7dee6; margin: 18pt 0; }
code {
  font-family: 'Cascadia Code', 'Consolas', monospace; font-size: 9pt;
  background: #f1f5f4; color: #b4275a; padding: 1px 4px; border-radius: 3px;
}
pre { background: #0b1220; color: #e6edf3; padding: 10pt; border-radius: 6px; overflow-x: auto; font-size: 9pt; }
pre code { background: none; color: inherit; padding: 0; }
table {
  border-collapse: collapse; width: 100%; margin: 10pt 0; font-size: 9pt;
  page-break-inside: auto;
}
tr { page-break-inside: avoid; }
th {
  background: #0f766e; color: #fff; text-align: left;
  padding: 6pt 7pt; font-weight: 600; border: 1px solid #0b5e57;
}
td { padding: 5pt 7pt; border: 1px solid #d7dee6; vertical-align: top; }
tbody tr:nth-child(even) { background: #f6faf9; }

/* The lead title-block table */
body > table:first-of-type th { display: none; }
body > table:first-of-type td:first-child { font-weight: 600; color: #0b5e57; width: 30%; background: #eef6f5; }

/* Severity / verdict emphasis colouring via strong text */
td strong, li strong { color: #0b1b2b; }

h2 { string-set: section content(text); }
"""

doc = f"""<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>ScheduTeach QA Audit Report</title>
<style>{CSS}</style>
</head>
<body>
{html_body}
</body>
</html>
"""

with open(OUT, "w", encoding="utf-8") as f:
    f.write(doc)

print(f"HTML written: {OUT} ({len(doc):,} bytes)")
