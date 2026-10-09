#!/usr/bin/env python3
"""Aegis 🛡️ — upsert ONE sticky PR comment summarising the CI security scan.

Finds its own previous comment by a hidden marker and PATCHes it in place, so a PR
accumulates edits, never a pile of new comments. HTTP goes through `curl` (CI images
carry ca-certificates; this sidesteps Python's missing-CA-bundle failure on some hosts).

Env:
  AEGIS_TOKEN    GitHub token (ciphera-aegis[bot] installation token in prod)
  GH_REPO        owner/repo              (Woodpecker: CI_REPO)
  PR_NUMBER      pull-request number     (Woodpecker: CI_COMMIT_PULL_REQUEST)
  Scan counts (strings; "?" if a scanner did not run):
    AEGIS_GL_SECRETS, AEGIS_TH_VERIFIED, AEGIS_TH_UNVERIFIED, AEGIS_OG_FINDINGS
Flags:
  --dry-run      read a comments JSON from $AEGIS_DRYRUN_COMMENTS (or []), print the action +
                 body, hit no network. For local validation.
"""
import os, sys, json, subprocess

API = "https://api.github.com"
MARKER = "<!-- aegis:security -->"


def find_existing(comments, marker=MARKER):
    """Return the id of the first comment carrying the marker, else None. Pure — unit-tested."""
    for c in comments:
        if marker in (c.get("body") or ""):
            return c.get("id")
    return None


def verdict(gl, th_v, th_u, og):
    """Aegis's one-line mood. A live secret is the only thing that lowers the shield in alarm."""
    if th_v not in ("0", "?", ""):
        return "🛡️❗ Aegis caught a **live secret** — rotate it before this merges."
    gating = os.environ.get("AEGIS_GATING", "false") == "true"
    if gating and gl not in ("0", "?", ""):
        return f"🛡️⛔ Aegis is **blocking** — gitleaks found {gl} secret(s) in non-test code. Remove them to merge."
    noisy = [n for n in (gl, th_u, og) if n not in ("0", "?", "")]
    if not noisy:
        return "🛡️ Shield's up — Aegis found nothing to flag on this diff."
    return "🛡️ Aegis has advisory notes (nothing is blocking your merge)."


def compose_body(gl, th_v, th_u, og):
    """Build the sticky-comment markdown. Pure — validated locally."""
    def cell(n):
        return n if n != "?" else "—"
    # Live-verification is OFF in CI (no egress), so th_v="?" means "not checked", NOT "clean".
    verified_note = ("off (no egress — sovereign)" if th_v in ("?", "")
                     else ("**must fix** if > 0" if th_v != "0" else "none live"))
    rows = [
        ("🔑 Secrets — live-verified", cell(th_v), verified_note),
        ("🔑 Secrets (gitleaks)", cell(gl), (("**blocking**" if gl not in ("0", "?", "") else "gating · test files allowlisted") if os.environ.get("AEGIS_GATING", "false") == "true" else "advisory · test files allowlisted")),
        ("🔑 Secret candidates (trufflehog)", cell(th_u), "triage"),
        ("🔍 SAST findings (Opengrep)", cell(og), "triage"),
    ]
    table = "| Check | Count | |\n|---|--:|---|\n" + "\n".join(
        f"| {label} | {count} | {note} |" for label, count, note in rows
    )
    return (
        f"### 🛡️ Aegis — security scan\n\n"
        f"{verdict(gl, th_v, th_u, og)}\n\n"
        f"{table}\n\n"
        f"<sub>Advisory — Aegis comments, it never blocks or authors commits. "
        f"Counts are from this PR's `security` workflow (gitleaks · trufflehog · Opengrep), "
        f"all self-hosted. Updated in place on every push.</sub>\n"
        f"{MARKER}"
    )


def curl(method, url, token, data=None):
    cmd = ["curl", "-sS", "--fail-with-body", "--max-time", "30", "-X", method,
           "-H", f"Authorization: Bearer {token}",
           "-H", "Accept: application/vnd.github+json",
           "-H", "X-GitHub-Api-Version: 2022-11-28", url]
    if data is not None:
        cmd += ["--data-binary", "@-"]
        p = subprocess.run(cmd, input=json.dumps(data), capture_output=True, text=True)
    else:
        p = subprocess.run(cmd, capture_output=True, text=True)
    if p.returncode != 0:
        sys.exit(f"aegis: curl {method} {url} failed (exit {p.returncode}): {p.stderr or p.stdout}")
    return p.stdout


def main():
    dry = "--dry-run" in sys.argv
    body = compose_body(
        os.environ.get("AEGIS_GL_SECRETS", "?"),
        os.environ.get("AEGIS_TH_VERIFIED", "?"),
        os.environ.get("AEGIS_TH_UNVERIFIED", "?"),
        os.environ.get("AEGIS_OG_FINDINGS", "?"),
    )
    if dry:
        comments = json.loads(os.environ.get("AEGIS_DRYRUN_COMMENTS", "[]"))
        existing = find_existing(comments)
        print(f"[dry-run] action: {'PATCH comment ' + str(existing) if existing else 'POST new comment'}")
        print("[dry-run] body:\n" + body)
        return
    token, repo, pr = os.environ["AEGIS_TOKEN"], os.environ["GH_REPO"], os.environ["PR_NUMBER"]
    comments = json.loads(curl("GET", f"{API}/repos/{repo}/issues/{pr}/comments?per_page=100", token))
    existing = find_existing(comments)
    if existing:
        curl("PATCH", f"{API}/repos/{repo}/issues/comments/{existing}", token, {"body": body})
        print(f"aegis: updated comment {existing}")
    else:
        curl("POST", f"{API}/repos/{repo}/issues/{pr}/comments", token, {"body": body})
        print("aegis: posted new comment")


if __name__ == "__main__":
    main()
