'use client'

import { useState } from 'react'
import { Button, Captcha, ZapIcon, toast } from '@ciphera-net/facet'
import { authenticatePublicDashboard } from '@/lib/api/stats'
import { env } from '@/lib/env'

/**
 * The password gate of a protected share link, moved here from components/share/PublicDashboard
 * with its copy and behaviour as they were (PUL-34 Phase 2).
 *
 * The share cookie is the ONLY grant, so its expiry is the normal way a protected share
 * fails; the root shows this in place of the page whenever a public read answers 401
 * `is_protected`, and clears what the page had cached when the password is accepted. Showing
 * the page's old numbers behind a live-looking indicator is the lie a gate exists not to tell.
 */
export default function PasswordGate({ siteId, onUnlocked }: { siteId: string; onUnlocked: () => void | Promise<void> }) {
  const [password, setPassword] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const [captchaId, setCaptchaId] = useState('')
  const [captchaSolution, setCaptchaSolution] = useState('')
  const [captchaToken, setCaptchaToken] = useState('')
  // A solved challenge is single-use: after a refusal the widget is mounted afresh, or it
  // would go on showing "verified" for a token this form has already spent.
  const [captchaRound, setCaptchaRound] = useState(0)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSubmitting(true)
    try {
      await authenticatePublicDashboard(siteId, password, captchaToken, captchaId, captchaSolution)
      // The cookie is set: the page's reads carry it from here on.
      await onUnlocked()
    } catch (error: unknown) {
      const status = (error as { status?: unknown } | null)?.status
      if (status === 401) {
        const body = (error as { data?: Record<string, unknown> }).data
        const message = typeof body?.error === 'string' ? body.error : undefined
        toast.error(message || 'Invalid password or captcha')
      } else {
        toast.error('Authentication failed')
      }
      setCaptchaId('')
      setCaptchaSolution('')
      setCaptchaToken('')
      setCaptchaRound((round) => round + 1)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4">
      <div className="bg-card border border-border max-w-md w-full rounded-none p-6 transition-shadow duration-slow ease-apple">
        <div className="text-center mb-6">
          <div className="w-12 h-12 bg-brand-orange/10 rounded-none flex items-center justify-center mx-auto mb-4 text-brand-ink">
            <ZapIcon className="w-6 h-6" />
          </div>
          <h1 className="text-2xl font-bold text-white mb-2">Protected Dashboard</h1>
          <p className="text-neutral-400">This dashboard is password protected. Please enter the password to view stats.</p>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="mb-4">
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Enter password"
              aria-label="Password"
              className="w-full px-4 py-2 border border-neutral-700 rounded-none bg-neutral-800 text-white focus:ring-2 focus:ring-brand-orange focus:border-transparent"
              autoFocus
            />
          </div>
          <div className="mb-4">
            <Captcha
              key={captchaRound}
              onVerify={(id, solution, token) => {
                setCaptchaId(id)
                setCaptchaSolution(solution)
                setCaptchaToken(token || '')
              }}
              apiUrl={env.NEXT_PUBLIC_CAPTCHA_API_URL}
              action="share-access"
            />
          </div>
          <Button type="submit" variant="default" className="w-full" disabled={submitting}>
            Access Dashboard
          </Button>
        </form>
      </div>
    </div>
  )
}
