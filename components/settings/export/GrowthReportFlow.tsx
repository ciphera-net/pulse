'use client'

import { useId, useState } from 'react'
import { ArrowSquareOut, Copy, FilePdf } from '@phosphor-icons/react'
import { Button, Input, Select, Switcher, toast } from '@ciphera-net/facet'
import { PanelRow, PanelRows } from '@/components/settings/panels'
import {
  createReport,
  downloadReportPdf,
  serverMessage,
  type Report,
  type ReportCompare,
  type ReportExpiry,
  type ReportPdfTheme,
  type ReportPeriod,
  type ReportPreset,
  type ReportSection,
} from '@/lib/api/reports'
import { DEFAULT_SECTIONS, PRESET_LABELS, presetSpan, siteDayTime, spanLabel } from '@/lib/reports/format'
import { CUSTOM_RANGE_LABEL } from '@/lib/constants/periods'
import { formatDate } from '@/lib/utils/format'
import { safeTimeZone, siteWallClockNow } from '@/lib/utils/siteTime'
import type { Site } from '@/lib/api/sites'
import type { DateSpan } from '@/lib/view/view'
import { CustomRangeFields, customRangeProblem } from './dateFields'
import {
  COMPARE_OPTIONS,
  PDF_THEME_CAPTION,
  PDF_THEME_OPTIONS,
  ReportLinkChip,
  SlidesField,
  orderedSections,
} from './reportFields'

// Settings → Export → Growth report (PULSE-133; approved shots B-3 and B-6,
// owner rulings D1, D2, R2, R3, R5). The form asks pulse-backend to freeze a
// report; the server resolves the period in the site's calendar, computes the
// numbers once and hands back the link. Nothing here computes a number.

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

interface Made {
  report: Report
  url: string
}

export function GrowthReportFlow({
  site,
  onCancel,
  onChanged,
}: {
  site: Site
  /** Leaves the flow (back to the first tile). */
  onCancel: () => void
  /** A report was made: the list below should read it. */
  onChanged: () => void
}) {
  const idBase = useId()
  const timezone = safeTimeZone(site.timezone)
  const now = siteWallClockNow(timezone)
  const today = formatDate(now)

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
  const [made, setMade] = useState<Made | null>(null)

  const reset = () => {
    setName('')
    setPeriodKey('last_90_days')
    setCustom(null)
    setCompare('previous')
    setSections(new Set(DEFAULT_SECTIONS))
    setPdfTheme('light')
    setAccess('link')
    setPassword('')
    setExpiry('30')
    setTried(false)
  }

  const customProblem = periodKey === CUSTOM ? customRangeProblem(custom, today) : null
  const nameProblem = name.trim() ? null : 'Give the report a name.'
  const slidesProblem = sections.size > 0 ? null : 'Choose at least one slide.'
  const passwordProblem = access === 'password' && !password.trim() ? 'Choose a password.' : null
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
      setMade({ report: res.report, url: res.url })
      reset()
      onChanged()
    } catch (err) {
      toast.error(serverMessage(err, "Couldn't make the report. Try again."))
    } finally {
      setBusy(false)
    }
  }

  if (made) {
    return <ReportMade site={site} made={made} onDone={() => setMade(null)} />
  }

  const problem = (text: string | null) =>
    tried && text ? (
      <p role="alert" className="mt-1.5 text-xs text-destructive">
        {text}
      </p>
    ) : null

  return (
    <>
      <PanelRows>
        <PanelRow label="Name" htmlFor={`${idBase}-name`}>
          <Input
            id={`${idBase}-name`}
            placeholder="Investor update"
            value={name}
            maxLength={120}
            onChange={(e) => setName(e.target.value)}
          />
          {problem(nameProblem)}
        </PanelRow>

        <PanelRow label="Period" htmlFor={`${idBase}-period`}>
          <Select
            id={`${idBase}-period`}
            aria-label="Period"
            value={periodKey}
            onChange={pickPeriod}
            options={periodOptions}
            className="w-full"
          />
          {periodKey === CUSTOM && (
            <CustomRangeFields value={custom} onChange={setCustom} today={today} problem={customProblem} />
          )}
        </PanelRow>

        <PanelRow label="Compare with">
          <Switcher
            size="sm"
            tone="solid"
            aria-label="Compare with"
            options={COMPARE_OPTIONS}
            value={compare}
            onChange={(v) => setCompare(v as ReportCompare)}
          />
        </PanelRow>

        <PanelRow label="Slides" caption="Each becomes one slide, in this order.">
          <SlidesField value={sections} onChange={setSections} />
          {problem(slidesProblem)}
        </PanelRow>

        <PanelRow label="PDF" caption={PDF_THEME_CAPTION}>
          <Switcher
            size="sm"
            tone="solid"
            aria-label="PDF"
            options={PDF_THEME_OPTIONS}
            value={pdfTheme}
            onChange={(v) => setPdfTheme(v as ReportPdfTheme)}
          />
        </PanelRow>

        <PanelRow label="Who can open it" caption="People you send it to see this report only, never your dashboard.">
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
              {problem(passwordProblem)}
            </div>
          )}
        </PanelRow>

        <PanelRow label="Link expires">
          <Switcher
            size="sm"
            tone="solid"
            aria-label="Link expires"
            options={EXPIRY_OPTIONS}
            value={expiry}
            onChange={setExpiry}
          />
        </PanelRow>
      </PanelRows>

      <div className="flex items-center justify-end gap-2 border-t border-border px-5 py-4">
        <Button
          variant="ghost"
          size="sm"
          disabled={busy}
          onClick={() => {
            reset()
            onCancel()
          }}
        >
          Cancel
        </Button>
        <Button size="sm" onClick={submit} isLoading={busy} aria-busy={busy}>
          Create report
        </Button>
      </div>
    </>
  )
}

/** The report just made (shot B-6): its link, its PDF, a way to open it. */
function ReportMade({ site, made, onDone }: { site: Site; made: Made; onDone: () => void }) {
  const idBase = useId()
  const timezone = safeTimeZone(site.timezone)
  const [pdfBusy, setPdfBusy] = useState(false)
  const { report, url } = made

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url)
      toast.success('Link copied.')
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
      toast.error(serverMessage(err, "Couldn't make the PDF. Try again."))
    } finally {
      setPdfBusy(false)
    }
  }

  return (
    <>
      <PanelRows>
        <PanelRow
          label={report.name}
          caption={`Ready. Its numbers are fixed as of ${siteDayTime(report.created_at, timezone)}.`}
          control={<ReportLinkChip report={report} timezone={timezone} now={new Date()} />}
        />
        <PanelRow label="Link" htmlFor={`${idBase}-link`}>
          <div className="flex items-center gap-2">
            {/* The one monospace on the tab: a URL is machine text. */}
            <Input
              id={`${idBase}-link`}
              readOnly
              value={url}
              className="font-mono"
              onFocus={(e) => e.currentTarget.select()}
            />
            <Button variant="outline" size="sm" onClick={copy}>
              <Copy className="h-4 w-4" />
              Copy
            </Button>
          </div>
        </PanelRow>
        <PanelRow label="PDF" caption="The same report, ready to print or attach.">
          <Button variant="outline" size="sm" onClick={pdf} isLoading={pdfBusy} aria-busy={pdfBusy}>
            {!pdfBusy && <FilePdf className="h-4 w-4" />}
            Download PDF
          </Button>
        </PanelRow>
      </PanelRows>
      <div className="flex items-center justify-end gap-2 border-t border-border px-5 py-4">
        <Button asChild variant="ghost" size="sm">
          <a href={url} target="_blank" rel="noopener noreferrer">
            <ArrowSquareOut className="h-4 w-4" />
            Open report
          </a>
        </Button>
        <Button size="sm" onClick={onDone}>
          Done
        </Button>
      </div>
    </>
  )
}
