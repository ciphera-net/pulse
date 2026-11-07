# Changelog notes

Every customer-facing change adds one note here, in the same PR. A Monday job collects the notes that reached
`main` during the week and opens one PR on `ciphera-net/docs`; merging that PR publishes them on
[docs.ciphera.net/changelog](https://docs.ciphera.net/changelog), one dated post per product.

Write one file per change: `.changes/<branch-name>.md`, with a slash in the branch name written as a dash
(`fix/own-visits` becomes `.changes/fix-own-visits.md`). A second, unrelated change in the same PR gets
`<branch-name>-2.md`. Notes are never deleted.

```markdown
---
product: pulse        # pulse | id | captcha | developers | integrations | platform (a YAML list for several)
type: fixed           # new | beta | everyone | improved | changed | fixed | removed | deprecated | security
flag: weekly-summary  # optional: the Unleash flag, for beta and everyone
highlight: false      # optional: true when it should lead the week's post
---
One to three sentences a customer understands: what changed, where to find it (Settings → Privacy), and what
they need to do, if anything.
```

Which PRs need one: a PR titled `[Feature]`, `[Fix]`, `[Change]`, `[Design]`, `[Copy]` or `[Improvement]` must add a
note, and the `changes` check fails without one. A change customers cannot notice takes a `[Chore]`, `[CI]`, `[Test]`,
`[Refactor]` or `[Docs]` title instead. A feature split across PRs or repos gets one note, in the PR whose merge makes
it visible; the other half is a `[Chore]`.

The text is public: no em or en dashes, no curly quotes, no ticket keys, PR numbers, people or customers, and sentences
with a subject. The weekly job leaves out a note that breaks these rules and lists it in its PR.
