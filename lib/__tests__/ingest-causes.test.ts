import { describe, it, expect } from 'vitest'
import {
  INGEST_REJECTION_CAUSES,
  INGEST_CAUSE_LABEL,
  INGEST_CAUSE_CLAUSE,
  isIngestRejectionCause,
  knownCauses,
} from '@/lib/ingest-causes'

/**
 * The point of this module is that ONE key set feeds two registers. These tests
 * pin that, because the failure it prevents is silent: a fourth cause added to
 * one map and not the other renders on the notification card and vanishes from
 * the Monitoring tab (or the reverse), and nothing type-checks that away once
 * the maps have drifted apart.
 */
describe('ingest causes — one key set, two registers', () => {
  it('both registers cover exactly the published causes, and nothing else', () => {
    expect(Object.keys(INGEST_CAUSE_LABEL).sort()).toEqual([...INGEST_REJECTION_CAUSES].sort())
    expect(Object.keys(INGEST_CAUSE_CLAUSE).sort()).toEqual([...INGEST_REJECTION_CAUSES].sort())
  })

  it('the published order is the server\'s order — it must not be alphabetised', () => {
    // pulse-backend internal/ingestdrops/causes.go emits an ordered SLICE, not
    // a map, precisely so the order is stable across calls.
    expect(INGEST_REJECTION_CAUSES).toEqual(['plan_ceiling', 'rate_limited', 'outdated_script'])
  })

  it('the two registers are genuinely different registers', () => {
    // A noun phrase for a list beside a chip; a clause for a sentence. If these
    // ever collapse into one string, one of the two surfaces is reading wrong.
    for (const c of INGEST_REJECTION_CAUSES) {
      expect(INGEST_CAUSE_LABEL[c]).not.toBe(INGEST_CAUSE_CLAUSE[c])
      expect(INGEST_CAUSE_LABEL[c]).toBe(INGEST_CAUSE_LABEL[c].toLowerCase())
      expect(INGEST_CAUSE_CLAUSE[c]).toBe(INGEST_CAUSE_CLAUSE[c].toLowerCase())
    }
  })

  it('🔴 refuses every internal drop-reason slug', () => {
    // The eight-reason taxonomy is operator-only by security ruling. None of
    // the five benign reasons, and none of the three alarming SLUGS, is a cause.
    for (const slug of [
      'over_hard_ceiling', 'site_rate_limit', 'retired_event',
      'page_rule_exclude', 'test_traffic', 'session_dedup', 'session_rate_limit', 'quarantined',
    ]) {
      expect(isIngestRejectionCause(slug)).toBe(false)
    }
  })

  it('knownCauses drops the unrecognised and keeps the rest in order', () => {
    expect(knownCauses(['quarantined', 'outdated_script', 'plan_ceiling'])).toEqual(['outdated_script', 'plan_ceiling'])
    expect(knownCauses(null)).toEqual([])
    expect(knownCauses(undefined)).toEqual([])
    expect(knownCauses([])).toEqual([])
    expect(knownCauses([null, 42, {}, 'plan_ceiling'])).toEqual(['plan_ceiling'])
  })

  it('does not accept an inherited Object property as a cause', () => {
    // `'toString' in INGEST_CAUSE_LABEL` is true on a plain object literal, so
    // a naive `in` check would publish "toString" as a cause.
    expect(isIngestRejectionCause('toString')).toBe(false)
    expect(isIngestRejectionCause('constructor')).toBe(false)
  })
})
