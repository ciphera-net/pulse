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
image: settings-billing  # optional, on a highlight note only: the post's one picture, shown under its lead
---
One to three sentences a customer understands: what changed, where to find it (Settings → Privacy), and what
they need to do, if anything.
```

The first sentence has to stand on its own: the Pulse dashboard's What's new panel shows it alone, so keep it
short. `image` takes the name of a docs screenshot (a key in `shots.manifest.json` in `ciphera-net/docs`, for
example `settings-billing`). A post has one picture, its main item's: the job keeps `image` on the highlight note
only, the post page shows it under the lead on an orange strip, and What's new shows it with the lead. Only its top
left corner shows, so frame a shot with the feature in its top left. The weekly job drops a name the docs do not
have, keeps the note, and says so in its PR.

Which PRs need one: a PR titled `[Feature]`, `[Fix]`, `[Change]`, `[Design]`, `[Copy]` or `[Improvement]` must add a
note, and the `changes` check fails without one. A change customers cannot notice takes a `[Chore]`, `[CI]`, `[Test]`,
`[Refactor]` or `[Docs]` title instead. A feature split across PRs or repos gets one note, in the PR whose merge makes
it visible; the other half is a `[Chore]`.

A feature leaves beta only on a Monday, together with that week's changelog post, which announces it. The PR that
then stops reading its flag is a `[Chore]` and adds no note.

The text is public: no em or en dashes, no curly quotes, no ticket keys, PR numbers, people or customers, and sentences
with a subject. The weekly job leaves out a note that breaks these rules and lists it in its PR.
