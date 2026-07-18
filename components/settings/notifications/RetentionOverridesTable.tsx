'use client'
import { Select, Table, THead, TBody, TR, TH, TD } from '@ciphera-net/facet'
import type { Preferences } from '@/lib/api/notifications-preferences'
import type { Category } from '@/lib/notifications/types'
import { RETENTION_DEFAULTS, OVERRIDE_OPTIONS_DAYS } from '@/lib/notifications/retention-policy'
import { NOTIFICATION_CATEGORIES } from '@/lib/notifications/categories'

interface Props {
  prefs: Preferences
  onChange: (next: Preferences) => void
}

/**
 * Retention overrides — the Facet RuledTable (spec §2.2): micro-label caps
 * column headers, mono defaults, a per-row Select. Sits flush inside its
 * SettingsPanel, so the Table's own bordered container is suppressed
 * (`!border-0`) to avoid a box-in-box hairline.
 *
 * Overrides can only shorten retention (options filtered to `<= default`), and
 * clearing an override deletes the key — never widening the stored TTL.
 */
export default function RetentionOverridesTable({ prefs, onChange }: Props) {
  const setOverride = (cat: Category, days: number | null) => {
    const next = { ...prefs.retention_overrides }
    if (days == null) delete next[cat]
    else next[cat] = { read_ttl_days: days }
    onChange({ ...prefs, retention_overrides: next })
  }

  return (
    <>
      <Table containerClassName="!border-0">
        <THead>
          <TR>
            <TH>Category</TH>
            <TH>Default</TH>
            <TH>Purge my read items after</TH>
          </TR>
        </THead>
        <TBody>
          {NOTIFICATION_CATEGORIES.map(c => {
            const def = RETENTION_DEFAULTS[c.id].read_ttl_days
            const allowedOpts = OVERRIDE_OPTIONS_DAYS.filter(d => d <= def)
            const current = prefs.retention_overrides?.[c.id]?.read_ttl_days ?? null
            return (
              <TR key={c.id}>
                <TD className="font-medium text-foreground">{c.label}</TD>
                <TD className="font-mono tabular-nums text-muted-foreground">{def} days</TD>
                <TD>
                  <div className="w-48">
                    <Select
                      aria-label={`Read retention override for ${c.label}`}
                      size="sm"
                      value={String(current ?? '')}
                      onChange={v => setOverride(c.id, v === '' ? null : Number(v))}
                      options={[
                        { value: '', label: `Default (${def} days)` },
                        ...allowedOpts.map(d => ({ value: String(d), label: `${d} days` })),
                      ]}
                    />
                  </div>
                </TD>
              </TR>
            )
          })}
        </TBody>
      </Table>
      <p className="border-t border-border px-5 py-3 text-xs text-muted-foreground">
        Overrides can only shorten retention — never extend it. Unread notifications still follow the
        default unread TTL.
      </p>
    </>
  )
}
