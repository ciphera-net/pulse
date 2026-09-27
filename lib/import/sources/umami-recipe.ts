// ─── Umami: the published export recipe (M8-a, M8-b; §3.12c amendment 6) ──
//
// Self-hosted Umami has no export a per-day import can use: its dashboard
// download is seven range totals with no dates (§3.12m8 §1). So Pulse
// PUBLISHES a read-only query the customer runs against their own database,
// and this parser reads exactly what it writes. The query text lives HERE, in
// the repo that reads its output, so the two can never drift: a test asserts
// that the columns the query selects are, name for name, the header the
// parser accepts. M14's docs print exactly this text, and the live contract
// and staging runs execute it.
//
// This module has no imports and no side effects, so the page (M11's import
// screen, the docs) can show the recipe without pulling the parser, the zip
// reader or the CSV reader into its bundle.
//
// 🔑 `event_name` IS SELECTED ALTHOUGH v1 NEVER READS IT (§3.12c amendment 6,
// D8's "no re-import"). v1 imports pageviews only and skips every custom-event
// row (`event_type` 2) as `not_a_pageview`; M12 reads those rows later from the
// SAME file, so the file a customer exports today must already carry the event
// names. The parser requires the column for the same reason: an export without
// it would need exporting again the day events ship.
//
// Why each choice (§3.12m8 M8-a):
//   - The customer's own database joins `website_event` to `session`, so the
//     browser reads one flat file, never two it would have to join.
//   - `created_at` is formatted HERE, as UTC with a `T` and a `Z`, never left to
//     the engine's default text form, which carries the session's own offset
//     (Postgres writes `2026-09-22 09:00:00+00`). The parser still reads that
//     form, and a bare one, defensively (M8-d).
//   - The hostname line is commented out: it is for an Umami website whose
//     tracking code runs on more than one hostname. The filter runs in the
//     database; the parser never reads `hostname` (M8-b).
//   - PostgreSQL: `COPY (…) TO STDOUT`, run through psql, writes the CSV to
//     psql's own output, which the customer redirects into a file on their own
//     machine. It needs no superuser and no access to the
//     database server's filesystem (a server-side `COPY … TO 'file'` would), and
//     unlike psql's `\copy` it may span several lines.
//   - MySQL/MariaDB (Umami v2 only; v3 dropped it): the session's time zone is
//     set to UTC with a numeric offset, which needs none of the `mysql.time_zone*`
//     tables `CONVERT_TZ` does (often missing on shared hosting).

/**
 * The header both queries write, in their order: the columns the parser
 * accepts (M8-b as amended by §3.12c amendment 6). Every one is required and
 * no other is allowed; the ORDER is not checked (`checkHeader` reads by name).
 */
export const UMAMI_COLUMNS = [
  'created_at',
  'session_id',
  'visit_id',
  'event_type',
  'event_name',
  'hostname',
  'url_path',
  'referrer_domain',
  'utm_source',
  'utm_medium',
  'utm_campaign',
  'browser',
  'os',
  'device',
  'screen',
  'language',
  'country',
  'region',
  'city',
] as const
export type UmamiColumn = (typeof UMAMI_COLUMNS)[number]

/** What the customer replaces with their own website id (Umami: Settings → Websites → Edit). */
export const UMAMI_WEBSITE_ID_PLACEHOLDER = '00000000-0000-0000-0000-000000000000'

/**
 * PostgreSQL, any Umami version on PostgreSQL. Save as a file and run:
 *
 *   psql "$DATABASE_URL" -X -f pulse-umami-export.sql > umami-export.csv
 */
export const UMAMI_POSTGRES_QUERY = `-- Pulse: Umami history export (PostgreSQL). Read-only.
-- Replace the website id below with your own (Umami: Settings, Websites, Edit),
-- then run:  psql "$DATABASE_URL" -X -f pulse-umami-export.sql > umami-export.csv
COPY (
  SELECT
    to_char(we.created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS created_at,
    we.session_id::text AS session_id,
    we.visit_id::text AS visit_id,
    we.event_type AS event_type,
    we.event_name AS event_name,
    we.hostname AS hostname,
    we.url_path AS url_path,
    we.referrer_domain AS referrer_domain,
    we.utm_source AS utm_source,
    we.utm_medium AS utm_medium,
    we.utm_campaign AS utm_campaign,
    s.browser AS browser,
    s.os AS os,
    s.device AS device,
    s.screen AS screen,
    s.language AS language,
    s.country AS country,
    s.region AS region,
    s.city AS city
  FROM website_event we
  JOIN session s ON s.session_id = we.session_id
  WHERE we.website_id = '${UMAMI_WEBSITE_ID_PLACEHOLDER}'
    -- Only if this website's tracking code runs on several hostnames and you
    -- want one of them: uncomment the next line and put that hostname in it.
    -- AND we.hostname = 'example.com'
  ORDER BY we.created_at
) TO STDOUT WITH (FORMAT csv, HEADER true);
`

/**
 * MySQL or MariaDB, Umami v2 only (v3 runs on PostgreSQL alone). Run both
 * statements in ONE session, then export the result as CSV WITH its header row
 * from your SQL client (phpMyAdmin, TablePlus, DBeaver, MySQL Workbench).
 */
export const UMAMI_MYSQL_QUERY = `-- Pulse: Umami history export (MySQL or MariaDB, Umami v2). Read-only.
-- Replace the website id below with your own (Umami: Settings, Websites, Edit).
-- Run both statements in one session: the first makes created_at read back in UTC.
SET time_zone = '+00:00';

SELECT
  DATE_FORMAT(we.created_at, '%Y-%m-%dT%H:%i:%sZ') AS created_at,
  we.session_id AS session_id,
  we.visit_id AS visit_id,
  we.event_type AS event_type,
  we.event_name AS event_name,
  we.hostname AS hostname,
  we.url_path AS url_path,
  we.referrer_domain AS referrer_domain,
  we.utm_source AS utm_source,
  we.utm_medium AS utm_medium,
  we.utm_campaign AS utm_campaign,
  s.browser AS browser,
  s.os AS os,
  s.device AS device,
  s.screen AS screen,
  s.language AS language,
  s.country AS country,
  s.region AS region,
  s.city AS city
FROM website_event we
JOIN session s ON s.session_id = we.session_id
WHERE we.website_id = '${UMAMI_WEBSITE_ID_PLACEHOLDER}'
  -- Only if this website's tracking code runs on several hostnames and you
  -- want one of them: uncomment the next line and put that hostname in it.
  -- AND we.hostname = 'example.com'
ORDER BY we.created_at;
`
