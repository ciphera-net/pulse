'use client'

import { useCallback, useEffect, useId, useState, type FormEvent, type ReactNode } from 'react'
import { FilePdf, LockSimple } from '@phosphor-icons/react'
import { Button, Input, toast } from '@ciphera-net/facet'
import { SiteFavicon } from '@/components/sites/SiteFavicon'
import ReportSlides from '@/components/reports/ReportSlides'
import {
  downloadPublicReportPdf,
  getPublicReport,
  serverMessage,
  unlockPublicReport,
  type ReportPayload,
} from '@/lib/api/reports'

// ---------------------------------------------------------------------------
// pulse.ciphera.net/r/<token> (PULSE-133, design §5.3; approved shot
// R-B-slides): a frozen report, read anonymously. No dashboard chrome and no
// marketing chrome: the site's own mark, the slides, and a Download PDF.
//
// Four states and only four: the report; its password form (401); "not
// available" (404, which is the same answer for a link that never existed,
// expired or was deleted, so the page is no existence oracle either); and a
// retryable failure for anything else, which is NOT "not available".
// ---------------------------------------------------------------------------

type State =
  | { kind: 'loading' }
  | { kind: 'ok'; report: ReportPayload; name: string }
  | { kind: 'password' }
  | { kind: 'not_found' }
  | { kind: 'error' }

export default function PublicReport({ token }: { token: string }) {
  const [state, setState] = useState<State>({ kind: 'loading' })

  const load = useCallback(async () => {
    try {
      const res = await getPublicReport(token)
      if (res.status === 'ok') setState({ kind: 'ok', report: res.report, name: res.name })
      else if (res.status === 'password_required') setState({ kind: 'password' })
      else setState({ kind: 'not_found' })
    } catch {
      setState({ kind: 'error' })
    }
  }, [token])

  useEffect(() => {
    void load()
  }, [load])

  useEffect(() => {
    if (state.kind === 'ok') document.title = `${state.name} | Pulse Analytics`
  }, [state])

  switch (state.kind) {
    case 'loading':
      return <div role="status" aria-busy="true" aria-label="Loading the report" className="min-h-screen" />
    case 'password':
      return <PasswordGate token={token} onUnlocked={load} />
    case 'not_found':
      return (
        <Notice title="This report is not available">
          The link may have expired or been closed. Ask the person who sent it for a new one.
        </Notice>
      )
    case 'error':
      return (
        <Notice
          title="Couldn't load this report"
          action={
            <Button variant="outline" size="sm" onClick={() => { setState({ kind: 'loading' }); void load() }}>
              Try again
            </Button>
          }
        >
          This is usually temporary. Try again in a moment.
        </Notice>
      )
    case 'ok':
      return <ReportView token={token} report={state.report} name={state.name} />
  }
}

function Notice({ title, children, action }: { title: string; children: ReactNode; action?: ReactNode }) {
  return (
    <main id="main-content" className="flex min-h-screen items-center justify-center px-4">
      <div className="w-full max-w-sm text-center">
        <h1 className="text-lg font-semibold text-foreground">{title}</h1>
        <p className="mt-2 text-sm text-muted-foreground">{children}</p>
        {action && <div className="mt-4">{action}</div>}
      </div>
    </main>
  )
}

function PasswordGate({ token, onUnlocked }: { token: string; onUnlocked: () => Promise<void> }) {
  const fieldId = useId()
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [problem, setProblem] = useState<string | null>(null)

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    if (busy) return
    if (!password) {
      setProblem('Enter the password.')
      return
    }
    setBusy(true)
    setProblem(null)
    try {
      const ok = await unlockPublicReport(token, password)
      if (!ok) {
        setProblem('That password is not right.')
        return
      }
      await onUnlocked()
    } catch (err) {
      setProblem(serverMessage(err, "Couldn't check the password. Try again in a moment."))
    } finally {
      setBusy(false)
    }
  }

  return (
    <main id="main-content" className="flex min-h-screen items-center justify-center px-4">
      <form onSubmit={submit} className="w-full max-w-sm border border-border bg-card p-6" noValidate>
        <LockSimple aria-hidden="true" className="h-5 w-5 text-muted-foreground" />
        <h1 className="mt-3 text-lg font-semibold text-foreground">This report has a password</h1>
        <p className="mt-1 text-sm text-muted-foreground">Enter it to open the report.</p>
        <label htmlFor={fieldId} className="mt-5 block text-sm font-medium text-foreground">
          Password
        </label>
        <Input
          id={fieldId}
          type="password"
          autoComplete="current-password"
          autoFocus
          className="mt-1.5"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          aria-invalid={problem ? true : undefined}
        />
        {problem && (
          <p role="alert" className="mt-1.5 text-xs text-destructive">
            {problem}
          </p>
        )}
        <Button type="submit" className="mt-5 w-full" isLoading={busy} aria-busy={busy}>
          Open report
        </Button>
      </form>
    </main>
  )
}

function ReportView({ token, report, name }: { token: string; report: ReportPayload; name: string }) {
  const [busy, setBusy] = useState(false)

  const pdf = async () => {
    if (busy) return
    setBusy(true)
    try {
      await downloadPublicReportPdf(token, name)
    } catch (err) {
      toast.error(serverMessage(err, "Couldn't make the PDF. Try again."))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="border-b border-border">
        <div className="mx-auto flex h-14 max-w-5xl items-center justify-between gap-4 px-4 sm:px-6">
          <div className="flex min-w-0 items-center gap-2.5">
            <SiteFavicon domain={report.site.domain} name={report.site.name} size={18} className="h-[18px] w-[18px] shrink-0 rounded-none object-contain" />
            <span className="truncate text-sm font-medium text-foreground">{report.site.domain}</span>
          </div>
          <Button variant="outline" size="sm" onClick={pdf} isLoading={busy} aria-busy={busy}>
            {!busy && <FilePdf className="h-4 w-4" />}
            Download PDF
          </Button>
        </div>
      </header>
      <main id="main-content" className="mx-auto max-w-5xl space-y-8 px-4 py-10 sm:px-6">
        <ReportSlides payload={report} mode="page" />
      </main>
    </div>
  )
}
