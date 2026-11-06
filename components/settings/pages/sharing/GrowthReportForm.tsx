'use client'

import { useId, useState } from 'react'
import { ArrowSquareOut, Copy, FilePdf } from '@phosphor-icons/react'
import { Button, Input, Select, Switcher, toast } from '@ciphera-net/facet'
import {
  createReport,
  downloadReportPdf,
  type Report,
  type ReportCompare,
  type ReportExpiry,
  type ReportPdfTheme,
  type ReportPeriod,
  type ReportPreset,
  type ReportSection,
} from '@/lib/api/reports'
import type { Site } from '@/lib/api/sites'
import { DEFAULT_SECTIONS, PRESET_LABELS, presetSpan, siteDayTime, spanLabel } from '@/lib/reports/format'
import { CUSTOM_RANGE_LABEL } from '@/lib/constants/periods'
import { isValidDateString } from '@/lib/hooks/periodUrl'
import { formatDate } from '@/lib/utils/format'
import { safeTimeZone, siteWallClockNow } from '@/lib/utils/siteTime'
import type { DateSpan } from '@/lib/view/view'
import { CustomRangeFields } from '@/components/settings/export/dateFields'
import {
  COMPARE_OPTIONS,
  PDF_THEME_CAPTION,
  PDF_THEME_OPTIONS,
  SlidesField,
  orderedSections,
  reportLinkOpen,
} from '@/components/settings/export/reportFields'
import { KitRow, KitRows, KitStatus } from '@/components/settings/kit/Kit'
import { MAX_PASSWORD_BYTES, PASSWORD_TOO_LONG, makeReportError, pdfError } from './errors'
import { FormFooter, Problem, linkWords } from './parts'

// Sharing → Growth reports: the form that asks pulse-backend to freeze a report, and the report it made (copy deck
// §6.3; the form approved as shots B-3 and B-6, drawn here in the kit). The server resolves the period in the site's
// calendar, computes the numbers once and hands back the link: nothing here computes a number.

const PRESETS: ReportPreset[] = ['last_30_days', 'last_90_days', 'last_month', 'last_quarter', 'year_to_date']
const CUSTOM = 'custom'
type PeriodKey = ReportPreset | typeof CUSTOM

type Access = 'link' | 'password'
const ACCESS_OPTIONS: { value: Access; label: string }[] = [
  { value: 'link', label: 'Anyone with the link' },
  { value: 'password', label: 'Link and password' },
]

const EXPIRY_OPTIONS: { value: string; label: string }[] = [
  { value: '7', label: '7 days' },
  { value: '30', label: '30 days' },
  { value: '90', label: '90 days' },
  { value: 'never', label: 'Never' },
]

function expiryValue(key: string): ReportExpiry {
  return key === 'never' ? null : (Number(key) as 7 | 30 | 90)
}

/** Why a custom range cannot be sent yet, or null when it can. `today` is the SITE's day. */
export function rangeProblem(range: DateSpan | null, today: string): string | null {
  if (!range || !isValidDateString(range.start) || !isValidDateString(range.end)) return 'Pick a first and a last day.'
  if (range.start > range.end) return 'The last day comes before the first.'
  if (range.end > today) return 'Pick days up to today.'
  return null
}

export interface MadeReport {
  report: Report
  url: string
}

export function GrowthReportForm({
  site,
  onCancel,
  onMade,
}: {
  site: Site
  onCancel: () => void
  onMade: (made: MadeReport) => void
}) {
  const idBase = useId()
  const timezone = safeTimeZone(site.timezone)
  const today = formatDate(siteWallClockNow(timezone))

  const [name, setName] = useState('')
  const [periodKey, setPeriodKey] = useState<PeriodKey>('last_90_days')
  const [custom, setCustom] = useState<DateSpan | null>(null)
  const [compare, setCompare] = useState<ReportCompare>('previous')
  const [sections, setSections] = useState<ReadonlySet<ReportSection>>(() => new Set(DEFAULT_SECTIONS))
  const [pdfTheme, setPdfTheme] = useState<ReportPdfTheme>('light')
  const [access, setAccess] = useState<Access>('link')
  const [password, setPassword] = useState('')
  const [expiry, setExpiry] = useState('30')
  const [tried, setTried] = useState(false)
  const [busy, setBusy] = useState(false)

  const customProblem = periodKey === CUSTOM ? rangeProblem(custom, today) : null
  const nameProblem = name.trim() ? null : 'Give the report a name.'
  const slidesProblem = sections.size > 0 ? null : 'Pick at least one slide.'
  const passwordProblem =
    access !== 'password'
      ? null
      : !password.trim()
        ? 'Pick a password.'
        : new TextEncoder().encode(password).length > MAX_PASSWORD_BYTES
          ? PASSWORD_TOO_LONG
          : null
  const valid = !customProblem && !nameProblem && !slidesProblem && !passwordProblem

  const periodOptions = [
    ...PRESETS.map((p) => {
      const span = presetSpan(p, today)
      return { value: p, label: `${PRESET_LABELS[p]} (${spanLabel(span.start, span.end)})` }
    }),
    {
      value: CUSTOM,
      label: periodKey === CUSTOM && custom && !customProblem ? spanLabel(custom.start, custom.end) : CUSTOM_RANGE_LABEL,
    },
  ]

  const pickPeriod = (value: string) => {
    // The first custom range starts as the preset that was showing.
    if (value === CUSTOM && periodKey !== CUSTOM) {
      setCustom((prev) => prev ?? presetSpan(periodKey as ReportPreset, today))
    }
    setPeriodKey(value as PeriodKey)
  }

  const submit = async () => {
    setTried(true)
    if (!valid || busy) return
    const period: ReportPeriod =
      periodKey === CUSTOM && custom ? { from: custom.start, to: custom.end } : { preset: periodKey as ReportPreset }
    setBusy(true)
    try {
      const res = await createReport(site.id, {
        name: name.trim(),
        period,
        compare,
        sections: orderedSections(sections),
        pdf_theme: pdfTheme,
        password: access === 'password' ? password : null,
        expires_in_days: expiryValue(expiry),
      })
      onMade({ report: res.report, url: res.url })
    } catch (err) {
      toast.error(makeReportError(err))
    } finally {
      setBusy(false)
    }
  }

  const shown = (text: string | null) => (tried ? text : null)

  return (
    <div data-sharing-form="report">
      <KitRows>
        <KitRow label="Name" htmlFor={`${idBase}-name`}>
          <Input
            id={`${idBase}-name`}
            placeholder="Investor update"
            value={name}
            maxLength={120}
            // The form opens from the section's button, which leaves the page: the cursor goes to the first field.
            autoFocus
            onChange={(e) => setName(e.target.value)}
          />
          <Problem text={shown(nameProblem)} />
        </KitRow>

        <KitRow label="Period" htmlFor={`${idBase}-period`}>
          <Select
            id={`${idBase}-period`}
            aria-label="Period"
            value={periodKey}
            onChange={pickPeriod}
            options={periodOptions}
            className="w-full"
          />
          {periodKey === CUSTOM && <CustomRangeFields value={custom} onChange={setCustom} today={today} problem={customProblem} />}
        </KitRow>

        <KitRow label="Compare with">
          <Switcher
            size="sm"
            tone="solid"
            aria-label="Compare with"
            options={COMPARE_OPTIONS}
            value={compare}
            onChange={(v) => setCompare(v as ReportCompare)}
          />
        </KitRow>

        <KitRow label="Slides" caption="Each becomes one slide, in this order.">
          <SlidesField value={sections} onChange={setSections} />
          <Problem text={shown(slidesProblem)} />
        </KitRow>

        <KitRow label="PDF" caption={PDF_THEME_CAPTION}>
          <Switcher
            size="sm"
            tone="solid"
            aria-label="PDF"
            options={PDF_THEME_OPTIONS}
            value={pdfTheme}
            onChange={(v) => setPdfTheme(v as ReportPdfTheme)}
          />
        </KitRow>

        <KitRow label="Who can open it" caption="People you send it to see this report only, never your dashboard.">
          <Switcher
            size="sm"
            tone="solid"
            aria-label="Who can open it"
            options={ACCESS_OPTIONS}
            value={access}
            onChange={(v) => setAccess(v as Access)}
          />
          {access === 'password' && (
            <div className="mt-2">
              <Input
                type="password"
                aria-label="Password"
                placeholder="Password"
                autoComplete="new-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
              <Problem text={shown(passwordProblem)} />
            </div>
          )}
        </KitRow>

        <KitRow label="Link expires">
          <Switcher size="sm" tone="solid" aria-label="Link expires" options={EXPIRY_OPTIONS} value={expiry} onChange={setExpiry} />
        </KitRow>
      </KitRows>

      <FormFooter>
        <Button variant="outline" size="sm" disabled={busy} onClick={onCancel}>
          Cancel
        </Button>
        <Button size="sm" onClick={submit} isLoading={busy} aria-busy={busy}>
          Create report
        </Button>
      </FormFooter>
    </div>
  )
}

/** The report just made (shot B-6): its link, its PDF, a way to open it. */
export function ReportMade({ site, made, onDone }: { site: Site; made: MadeReport; onDone: () => void }) {
  const idBase = useId()
  const timezone = safeTimeZone(site.timezone)
  const [pdfBusy, setPdfBusy] = useState(false)
  const { report, url } = made
  const now = new Date()

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url)
      toast.success('Link copied')
    } catch {
      toast.error("Couldn't copy the link. Select it and copy it by hand.")
    }
  }

  const pdf = async () => {
    if (pdfBusy) return
    setPdfBusy(true)
    try {
      await downloadReportPdf(site.id, report)
    } catch (err) {
      toast.error(pdfError(err))
    } finally {
      setPdfBusy(false)
    }
  }

  return (
    <div data-sharing-made="">
      <KitRows>
        <KitRow
          label={report.name}
          caption={`Ready. Its numbers are fixed as of ${siteDayTime(report.created_at, timezone)}.`}
          control={
            <span className="text-xs">
              <KitStatus tone={reportLinkOpen(report, now) ? 'live' : 'off'}>{linkWords(report, timezone, now)}</KitStatus>
            </span>
          }
        />
        <KitRow label="Link" htmlFor={`${idBase}-link`}>
          <div className="flex items-center gap-2">
            {/* A web address is machine text: monospace. */}
            <Input id={`${idBase}-link`} readOnly value={url} className="font-mono" onFocus={(e) => e.currentTarget.select()} />
            {/* The form's button left the page with the form: the cursor lands on what comes next, the link. */}
            <Button variant="outline" size="sm" onClick={copy} className="shrink-0" autoFocus>
              <Copy className="h-4 w-4" />
              Copy link
            </Button>
          </div>
        </KitRow>
        <KitRow
          label="PDF"
          caption="The same report, ready to print or attach."
          control={
            <Button variant="outline" size="sm" onClick={pdf} isLoading={pdfBusy} aria-busy={pdfBusy}>
              {!pdfBusy && <FilePdf className="h-4 w-4" />}
              Download PDF
            </Button>
          }
        />
      </KitRows>
      <FormFooter>
        {/* The outbound arrow turns orange on hover, like every outbound arrow in the app (PUL-22). */}
        <Button asChild variant="ghost" size="sm">
          <a href={url} target="_blank" rel="noopener noreferrer" className="group">
            <ArrowSquareOut className="h-4 w-4 transition-colors group-hover:text-brand-ink" />
            Open report
          </a>
        </Button>
        <Button size="sm" onClick={onDone}>
          Done
        </Button>
      </FormFooter>
    </div>
  )
}
