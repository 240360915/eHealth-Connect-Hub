#!/usr/bin/env python3
"""Check admin HTML embedded JavaScript and key finance DOM/RPC links."""
from html.parser import HTMLParser
from pathlib import Path
import subprocess
import sys
import tempfile


class InlineScripts(HTMLParser):
    def __init__(self):
        super().__init__()
        self.active = False
        self.current = []
        self.scripts = []

    def handle_starttag(self, tag, attrs):
        if tag.lower() == "script":
            attributes = dict(attrs)
            script_type = attributes.get("type", "")
            self.active = not attributes.get("src") and script_type in ("", "text/javascript", "module")
            self.current = []

    def handle_data(self, data):
        if self.active:
            self.current.append(data)

    def handle_endtag(self, tag):
        if tag.lower() == "script" and self.active:
            body = "".join(self.current).strip()
            if body:
                self.scripts.append(body)
            self.active = False
            self.current = []


html_path = Path("AdminDashboard.html")
html = html_path.read_text(encoding="utf-8")
required = (
    'id="tab-finances"',
    'id="financeHistoryTable"',
    'id="financeUnverifiedCompleted"',
    'id="financeGrossPaid"',
    "admin_get_demo_finance_report_v2",
    "admin_refund_cancelled_demo_payment",
    "needs_completion_review",
    "financeFilter",
    "loadDemoFinances()",
)
missing = [value for value in required if value not in html]
if missing:
    sys.exit("Missing required finance UI/RPC wiring: " + ", ".join(missing))

parser = InlineScripts()
parser.feed(html)
if not parser.scripts:
    sys.exit("No inline admin JavaScript found")

for n, source in enumerate(parser.scripts, 1):
    with tempfile.NamedTemporaryFile(mode="w", encoding="utf-8", suffix=".js") as js:
        js.write(source)
        js.flush()
        result = subprocess.run(["node", "--check", js.name], text=True, capture_output=True)
        if result.returncode:
            sys.stderr.write(result.stderr)
            sys.exit(f"Admin JS script {n} failed syntax check")

print(f"Checked {len(parser.scripts)} admin JavaScript block(s) and required finance DOM/RPC wiring")
