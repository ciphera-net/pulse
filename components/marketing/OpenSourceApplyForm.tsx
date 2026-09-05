'use client'

import { useState } from 'react'
import { Button, Captcha } from '@ciphera-net/facet'
import { env } from '@/lib/env'

// The /open-source application form — anonymous by ruling (02-09-2026 design
// doc §4a): no account needed to apply, captcha instead. Field treatment is
// the public-surface input recipe from the share page's password form; the
// captcha widget and the token/id+solution fallback follow the same contract
// as PublicSiteAuthHandler.
const INPUT_CLASS =
  'w-full px-4 py-2 border border-neutral-700 rounded-none bg-neutral-800 text-white placeholder:text-neutral-500 focus:outline-none focus:ring-2 focus:ring-brand-orange focus:border-transparent'

// The one form serves both programmes: /open-source posts kind='opensource'
// (the default the backend assumes if the field is absent), /startups posts
// kind='startups'. Same endpoint, same captcha action, same review queue.
export function OpenSourceApplyForm({ kind = 'opensource' }: { kind?: 'opensource' | 'startups' } = {}) {
  const [projectName, setProjectName] = useState('')
  const [projectUrl, setProjectUrl] = useState('')
  const [email, setEmail] = useState('')
  const [description, setDescription] = useState('')
  const [captchaId, setCaptchaId] = useState('')
  const [captchaSolution, setCaptchaSolution] = useState('')
  const [captchaToken, setCaptchaToken] = useState('')
  const [state, setState] = useState<'idle' | 'submitting' | 'done' | 'error'>('idle')
  const [error, setError] = useState<string | null>(null)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (state === 'submitting') return
    if (!captchaToken && !(captchaId && captchaSolution)) {
      setError('Please complete the captcha first.')
      return
    }
    setState('submitting')
    setError(null)
    try {
      const res = await fetch(
        `${env.NEXT_PUBLIC_API_URL}/api/v1/public/opensource-applications`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            kind,
            project_name: projectName,
            project_url: projectUrl,
            contact_email: email,
            description,
            captcha_token: captchaToken,
            captcha_id: captchaId,
            captcha_solution: captchaSolution,
          }),
        }
      )
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { error?: string } | null
        throw new Error(body?.error || 'Something went wrong — try again, or email hello@ciphera.net.')
      }
      setState('done')
    } catch (err) {
      setState('error')
      setError(err instanceof Error ? err.message : 'Something went wrong — try again, or email hello@ciphera.net.')
    }
  }

  if (state === 'done') {
    return (
      <div className="border border-border bg-card p-6" aria-live="polite">
        <p className="text-base font-semibold text-foreground">Application received.</p>
        <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
          A human reads every one — expect an answer at the address you gave
          within a few days. Meanwhile the free tier works without a card, so
          you can install the script today; approval upgrades the workspace in
          place.
        </p>
      </div>
    )
  }

  return (
    <form className="border border-border bg-card p-6" onSubmit={handleSubmit}>
      <div className="mb-4">
        <label htmlFor="oss-project" className="text-sm text-foreground">
          Project or organisation
        </label>
        <input
          id="oss-project"
          type="text"
          required
          maxLength={200}
          value={projectName}
          onChange={(e) => setProjectName(e.target.value)}
          placeholder={kind === 'startups' ? 'Your company' : 'curl, or Médecins Sans Frontières'}
          className={`mt-2 ${INPUT_CLASS}`}
        />
      </div>
      <div className="mb-4">
        <label htmlFor="oss-url" className="text-sm text-foreground">
          Repository or website
        </label>
        <input
          id="oss-url"
          type="text"
          required
          maxLength={500}
          value={projectUrl}
          onChange={(e) => setProjectUrl(e.target.value)}
          placeholder={kind === 'startups' ? 'yourstartup.com' : 'github.com/… or your-nonprofit.org'}
          className={`mt-2 ${INPUT_CLASS}`}
        />
      </div>
      <div className="mb-4">
        <label htmlFor="oss-email" className="text-sm text-foreground">
          Contact email
        </label>
        <input
          id="oss-email"
          type="email"
          required
          maxLength={320}
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@your-project.org"
          className={`mt-2 ${INPUT_CLASS}`}
        />
      </div>
      <div className="mb-4">
        <label htmlFor="oss-about" className="text-sm text-foreground">
          About the project
        </label>
        <textarea
          id="oss-about"
          required
          maxLength={4000}
          rows={4}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder={
            kind === 'startups'
              ? 'What you build, when you started, team size, which site(s) you want on Pulse.'
              : 'License, who uses it, which site(s) you want on Pulse.'
          }
          className={`mt-2 ${INPUT_CLASS}`}
        />
      </div>
      <div className="mb-4">
        <Captcha
          onVerify={(id, solution, token) => {
            setCaptchaId(id)
            setCaptchaSolution(solution)
            setCaptchaToken(token || '')
          }}
          apiUrl={env.NEXT_PUBLIC_CAPTCHA_API_URL}
          // Must match ossCaptchaAction in pulse-backend's handler — the
          // captcha binds tokens to the action at solve time.
          action="pulse_opensource_application"
        />
      </div>
      {error && (
        <p className="mb-4 text-sm text-red-500" role="alert">
          {error}
        </p>
      )}
      <Button type="submit" variant="default" className="w-full" disabled={state === 'submitting'}>
        {state === 'submitting' ? 'Submitting…' : 'Submit application'}
      </Button>
    </form>
  )
}
