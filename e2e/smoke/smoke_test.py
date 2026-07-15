#!/usr/bin/env python3
"""Pulse tracking-script smoke harness (mock-only).

Loads the real public/*.js against a set of sample apps and asserts the wire
behavior. Every event is captured by the in-process mock ingest server — NOTHING
is ever sent to real Pulse ingest, and the sample domain (smoke-test.invalid) is
a reserved test hostname, so this cannot pollute the production dataset even if
it were somehow pointed at a live endpoint.

Archetypes covered here: MPA full-load, SPA-history route change, plus the
privacy short-circuit (?pulse-ignore). Extend `CASES` for hash-router /
sandboxed-pixel / amp as those are built.

Run: python3 e2e/smoke/smoke_test.py   (requires: pip install playwright; playwright install chromium)
"""
import sys
import time
from playwright.sync_api import sync_playwright

import mock_ingest


def events_for(base, page):
    import json
    resp = page.request.get(base + "/__events")
    return json.loads(resp.text())


def reset(base, page):
    page.request.get(base + "/__reset")


def run():
    srv = mock_ingest.serve(0)
    base = f"http://127.0.0.1:{srv.server_address[1]}"
    failures = []

    with sync_playwright() as pw:
        browser = pw.chromium.launch(headless=True)
        ctx = browser.new_context()
        # The script correctly refuses to track automated browsers
        # (navigator.webdriver). Mask it so the harness exercises the real
        # tracking path a human visitor would take. (A dedicated case below keeps
        # a webdriver=true check to prove the short-circuit still fires.)
        ctx.add_init_script("Object.defineProperty(navigator, 'webdriver', {get: () => false})")
        page = ctx.new_page()

        def check(name, cond, detail=""):
            print(f"  [{'PASS' if cond else 'FAIL'}] {name}" + (f" — {detail}" if not cond and detail else ""))
            if not cond:
                failures.append(name)

        # 1) MPA full load → exactly one pageview with the right domain/path.
        reset(base, page)
        page.goto(base + "/index.html", wait_until="networkidle")
        page.wait_for_timeout(500)
        evs = events_for(base, page)
        pvs = [e for e in evs if e["path"].endswith("/events") and not e["body"].get("name")]
        check("MPA fires one pageview", len(pvs) == 1, f"got {len(pvs)}")
        if pvs:
            check("pageview carries the test domain", pvs[0]["body"].get("domain") == "smoke-test.invalid")

        # 2) ?pulse-ignore short-circuits — no events at all.
        reset(base, page)
        page.goto(base + "/index.html?pulse-ignore", wait_until="networkidle")
        page.wait_for_timeout(500)
        evs = events_for(base, page)
        check("?pulse-ignore sends nothing", len(evs) == 0, f"got {len(evs)}")
        # Undo the localStorage ignore flag for subsequent cases.
        page.goto(base + "/index.html?pulse-ignore", wait_until="networkidle")
        page.wait_for_timeout(300)

        # 3) SPA history navigation → a second pageview on route change.
        reset(base, page)
        page.goto(base + "/spa.html", wait_until="networkidle")
        page.wait_for_timeout(400)
        page.click("#go-about")
        page.wait_for_timeout(600)
        evs = events_for(base, page)
        pvs = [e for e in evs if e["path"].endswith("/events") and not e["body"].get("name")]
        check("SPA route change fires a second pageview", len(pvs) >= 2, f"got {len(pvs)}")
        if len(pvs) >= 2:
            check("second pageview URL is the pushState path", pvs[-1]["body"].get("url", "").endswith("/about"))

        # 4) Privacy short-circuit: an automated (webdriver) browser sends nothing.
        wd_ctx = browser.new_context()  # webdriver=true (Playwright default)
        wd_page = wd_ctx.new_page()
        reset(base, wd_page)
        wd_page.goto(base + "/index.html", wait_until="networkidle")
        wd_page.wait_for_timeout(500)
        evs = events_for(base, wd_page)
        check("webdriver browser sends nothing", len(evs) == 0, f"got {len(evs)}")
        wd_ctx.close()

        ctx.close()
        browser.close()

    srv.shutdown()
    print(f"\n{'ALL SMOKE CHECKS PASSED' if not failures else 'FAILURES: ' + ', '.join(failures)}")
    return 1 if failures else 0


if __name__ == "__main__":
    sys.exit(run())
