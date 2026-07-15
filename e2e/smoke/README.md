# Tracking-script smoke harness (mock-only)

Loads the real `public/*.js` tracking scripts against sample apps and asserts the
wire behavior. **Mock-only by construction — this must never touch real Pulse
ingest**, because Pulse staging shares the production database.

Two independent safety layers make that guarantee:

1. **Events go to an in-process mock server**, not Pulse. The sample apps set
   `window.pulseConfig = { api: location.origin }`, so every beacon is captured
   by `mock_ingest.py` and nowhere else.
2. **The sample domain is `smoke-test.invalid`** — a reserved test hostname. Even
   if a beacon were somehow pointed at a live endpoint, the backend's write-time
   test-traffic exclusion (`TEST_TRAFFIC_DOMAINS`, when configured) would drop it
   before persistence.

Never repoint the sample apps at `pulse-api.ciphera.net` or
`pulse-api-staging.ciphera.net`.

## Run

```bash
pip install playwright && playwright install chromium
python3 e2e/smoke/smoke_test.py
```

## Archetypes covered

- **MPA full load** → one pageview with the correct domain.
- **SPA history** (`pushState`) → a second pageview on route change, with the new path.
- **Privacy short-circuit** — `?pulse-ignore` sends nothing; an automated
  (`navigator.webdriver`) browser sends nothing.

The tracker correctly refuses to track automated browsers, so the human-path
cases mask `navigator.webdriver` (a test-only override); a dedicated case keeps
`webdriver=true` to prove the short-circuit still fires.

## Extending

Add sample apps under `apps/` and cases to `CASES`/`run()` for the remaining
archetypes: hash-router (Angular `HashLocationStrategy`), sandboxed-pixel, and
`amp-analytics`. Wire this into CI as a gate before any rolling-script promote.
