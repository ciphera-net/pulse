## Summary

<1-3 bullet points>

## Changes

<Technical details>

## Privacy Impact Assessment

If this PR touches user data (new fields, new logging, new integrations,
new metrics, new log statements, new third-party calls), answer these.
If the PR is unrelated to user data, write "N/A — no user data involved"
and skip the questions.

1. **What new PII does this collect, read, or expose?**
   <e.g., new field in request body, new log line, new metric label,
    new third-party API call that sends user data>

2. **Where is it stored, for how long, and who can see it?**
   <which DB/log store, retention period, access path, which operators
    or services can read it>

3. **Is it encrypted, hashed, or ephemeral?**
   <encryption at rest? HMAC hash with what salt? in-memory only and
    zeroed after use? plaintext on stdout?>

4. **What happens to this data when the user deletes their account?**
   <cascade delete? cryptographic overwrite? retained as aggregate?
    references to the DeleteUser flow>

5. **Does this change what we disclose in the transparency blog post
   at `ciphera.net/blog/what-we-see-about-you-what-we-dont`?**
   <if yes, update the post in the same PR>

If yes to any of questions 1-4, also update
`Infra/docs/data-retention-policy.md` in this PR.

## Test Plan

- [ ] Step 1
- [ ] Step 2
