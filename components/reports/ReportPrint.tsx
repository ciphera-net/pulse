'use client'

import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import ReportSlides from '@/components/reports/ReportSlides'
import { getPublicReport, type ReportPayload, type ReportPdfTheme } from '@/lib/api/reports'
import { applyThemeClass } from '@/lib/theme'

// ---------------------------------------------------------------------------
// /r/<token>/print (PULSE-133, design §5.3 and §6.1b R3/R5): the page the PDF
// runner prints with Page.printToPDF. The same slides as the report page, one
// per 16:9 page (13.333 × 7.5 in, margin 0), no chrome.
//
// 🔑 THE LIGHT THEME IS ROOT-SCOPED (`:root.light`, measured in round 1): a
// light subtree inside a dark page is impossible, so this route puts the class
// on <html> itself. ThemeSync leaves this route alone (lib/auth/appRoutes
// isReportPrintRoute), so it is the only writer of the class here.
//
// The runner is handed a 5-minute print key (`pk`) that stands in for the
// report's password on this read only. When the slides are on the page, the
// fonts loaded and every image settled, <html data-print-ready="true"> (data-print-error on failure, the two attributes the runner's /pdf mode waits for) tells
// the runner it may print; a report it cannot read sets "failed" instead, so a
// PDF of an error page is never cached as the report.
// ---------------------------------------------------------------------------

type State = { kind: 'loading' } | { kind: 'ok'; report: ReportPayload; theme: ReportPdfTheme } | { kind: 'failed' }

export function parsePrintTheme(value: string | null | undefined): ReportPdfTheme | null {
  return value === 'light' || value === 'dark' ? value : null
}

const PRINT_CSS = `
@page { size: 13.333in 7.5in; margin: 0; }
html, body { margin: 0 !important; padding: 0 !important; min-height: 0 !important; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
.report-print-slide { break-after: page; page-break-after: always; }
.report-print-slide:last-child { break-after: auto; page-break-after: auto; }
`

/** Waits for web fonts and every image under `root`, never longer than `capMs`. */
function settle(root: HTMLElement, capMs = 5000): Promise<void> {
  const fonts = (document as Document & { fonts?: { ready: Promise<unknown> } }).fonts?.ready ?? Promise.resolve()
  const images = Array.from(root.querySelectorAll('img')).map((img) =>
    img.complete
      ? Promise.resolve()
      : new Promise<void>((resolve) => {
          img.addEventListener('load', () => resolve(), { once: true })
          img.addEventListener('error', () => resolve(), { once: true })
        }),
  )
  return Promise.race([
    Promise.all([fonts, ...images]).then(() => undefined),
    new Promise<void>((resolve) => setTimeout(resolve, capMs)),
  ])
}

export default function ReportPrint({
  token,
  theme,
  printKey,
}: {
  token: string
  /** The `theme` query parameter; the report's own PDF theme when absent. */
  theme: string | null
  printKey: string | null
}) {
  const [state, setState] = useState<State>({ kind: 'loading' })
  const rootRef = useRef<HTMLDivElement>(null)
  const requested = parsePrintTheme(theme)
  const effective: ReportPdfTheme = requested ?? (state.kind === 'ok' ? state.theme : 'light')

  // Before paint, so not one frame is laid out in the wrong palette.
  useLayoutEffect(() => {
    applyThemeClass(document.documentElement, effective)
  }, [effective])

  useEffect(() => {
    let cancelled = false
    getPublicReport(token, printKey)
      .then((res) => {
        if (cancelled) return
        setState(res.status === 'ok' ? { kind: 'ok', report: res.report, theme: res.pdf_theme } : { kind: 'failed' })
      })
      .catch(() => {
        if (!cancelled) setState({ kind: 'failed' })
      })
    return () => {
      cancelled = true
    }
  }, [token, printKey])

  useEffect(() => {
    const html = document.documentElement
    if (state.kind === 'failed') {
      html.dataset.printError = 'true'
      return
    }
    if (state.kind !== 'ok' || !rootRef.current) return
    let cancelled = false
    void settle(rootRef.current).then(() => {
      if (!cancelled) html.dataset.printReady = 'true'
    })
    return () => {
      cancelled = true
    }
  }, [state])

  useEffect(() => () => {
    delete document.documentElement.dataset.printReady
    delete document.documentElement.dataset.printError
  }, [])

  return (
    <div ref={rootRef} className="bg-background text-foreground">
      <style>{PRINT_CSS}</style>
      {state.kind === 'ok' && <ReportSlides payload={state.report} mode="print" />}
      {state.kind === 'failed' && <p className="p-10 text-sm text-muted-foreground">This report is not available.</p>}
    </div>
  )
}
