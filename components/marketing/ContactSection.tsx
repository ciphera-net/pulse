'use client'

import { useRef, useState } from 'react'
import { Button, ArrowRightIcon, Captcha } from '@ciphera-net/facet'
import { env } from '@/lib/env'
import Select from '@/components/ui/select'
import { Eyebrow } from '@/components/marketing/system/Eyebrow'
import { HairlineGrid } from '@/components/marketing/system/HairlineGrid'

// Topics MUST mirror pulse-backend's allowedContactTopics — the server
// rejects anything else.
const TOPICS = [
  'Sales & Enterprise',
  'Technical Support',
  'Billing',
  'Security',
  'Feedback',
  'Other',
] as const

// The channel cards: every route a message can take, with the address in the
// open — the form is a convenience, not a wall.
const CHANNELS: { label: string; value: string; href: string; note: string; external?: boolean }[] = [
  {
    label: 'Sales & enterprise',
    value: 'business@ciphera.net',
    href: 'mailto:business@ciphera.net',
    note: 'Custom plans, SLA, managed proxy, raw data export.',
  },
  {
    label: 'Support & docs',
    value: 'help.ciphera.net',
    href: 'https://help.ciphera.net/docs/pulse',
    note: 'Guides and answers for every Pulse feature.',
    external: true,
  },
  {
    label: 'Security',
    value: 'security@ciphera.net',
    href: 'mailto:security@ciphera.net',
    note: 'Vulnerability reports — see ciphera.net/security for disclosure.',
  },
]

const INPUT_CLASS =
  'w-full border border-border bg-background px-4 py-3 text-sm text-foreground placeholder:text-muted-foreground transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-ring'

export default function ContactSection() {
  const [status, setStatus] = useState<'idle' | 'submitting' | 'success' | 'error'>('idle')
  const [errorMessage, setErrorMessage] = useState('')
  const [submitAttempted, setSubmitAttempted] = useState(false)
  const [form, setForm] = useState({
    name: '',
    email: '',
    company: '',
    topic: TOPICS[0] as string,
    message: '',
  })
  const [fieldErrors, setFieldErrors] = useState({ name: '', email: '', message: '' })

  // Captcha state — token preferred, id+solution fallback (auth pattern).
  const [captchaId, setCaptchaId] = useState('')
  const [captchaSolution, setCaptchaSolution] = useState('')
  const [captchaToken, setCaptchaToken] = useState('')

  // Honeypot ref — hidden field real users never touch; a ref (not state)
  // also catches automation that sets input.value directly.
  const honeypotRef = useRef<HTMLInputElement>(null)

  // Captured once on mount; the backend rejects sub-2s submissions.
  const [pageLoadedAt] = useState<number>(() => Date.now())

  const MESSAGE_MAX = 2000

  const validateField = (field: string, value: string) => {
    switch (field) {
      case 'name':
        return value.trim().length < 2 ? 'Name must be at least 2 characters' : ''
      case 'email':
        return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value) ? '' : 'Please enter a valid email address'
      case 'message':
        if (value.trim().length < 10) return 'Message must be at least 10 characters'
        if (value.length > MESSAGE_MAX) return `Message must not exceed ${MESSAGE_MAX} characters`
        return ''
      default:
        return ''
    }
  }

  const handleBlur = (field: 'name' | 'email' | 'message') => {
    if (!submitAttempted) return
    setFieldErrors((prev) => ({ ...prev, [field]: validateField(field, form[field]) }))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setErrorMessage('')
    setSubmitAttempted(true)

    const errors = {
      name: validateField('name', form.name),
      email: validateField('email', form.email),
      message: validateField('message', form.message),
    }
    setFieldErrors(errors)
    if (Object.values(errors).some(Boolean)) {
      setErrorMessage('Please fix the errors above before submitting')
      return
    }
    if (!captchaToken && (!captchaId || !captchaSolution)) {
      setErrorMessage('Please complete the captcha verification')
      return
    }

    setStatus('submitting')
    try {
      const res = await fetch(`${env.NEXT_PUBLIC_API_URL}/api/contact`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: form.name,
          email: form.email,
          company: form.company,
          topic: form.topic,
          message: form.message,
          captcha_id: captchaId,
          captcha_solution: captchaSolution,
          captcha_token: captchaToken,
          website: honeypotRef.current?.value || '',
          page_loaded_at: pageLoadedAt,
        }),
      })
      if (res.ok) {
        setStatus('success')
        setForm({ name: '', email: '', company: '', topic: TOPICS[0], message: '' })
        setCaptchaId('')
        setCaptchaSolution('')
        setCaptchaToken('')
      } else {
        const data = await res.json().catch(() => null)
        setErrorMessage(data?.error || 'Something went wrong — please try again')
        setStatus('error')
      }
    } catch {
      setErrorMessage('Network error — please try again')
      setStatus('error')
    }
  }

  return (
    <>
      {/* Header — eyebrow, semantic h1, short dek */}
      <section className="border-b border-border">
        <div className="px-6 pb-12 pt-16 text-center sm:pt-20">
          <Eyebrow label="Pulse · Contact" className="text-center" />
          <h1 className="mt-6 font-display text-5xl font-semibold tracking-tight text-foreground sm:text-6xl">
            Contact
          </h1>
          <p className="mx-auto mt-6 max-w-xl text-base leading-relaxed text-muted-foreground sm:text-lg">
            Sales, support, security, feedback — pick a topic and write. Every
            message lands in a human inbox, and replies come from one too.
          </p>
        </div>
      </section>

      {/* Channels — one hairline grid, addresses in the open */}
      <section className="border-b border-border">
        <div className="px-6 py-16 sm:py-20">
          <HairlineGrid columns={3}>
            {CHANNELS.map((ch) => (
              <div key={ch.label} className="bg-card p-6">
                <p className="text-xs uppercase tracking-[0.08em] text-muted-foreground">
                  {ch.label}
                </p>
                <a
                  href={ch.href}
                  {...(ch.external ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
                  className="mt-3 inline-block text-sm font-medium text-foreground underline decoration-border underline-offset-4 transition-colors duration-150 hover:decoration-foreground motion-reduce:transition-none"
                >
                  {ch.value}
                </a>
                <p className="mt-3 text-sm leading-relaxed text-muted-foreground">{ch.note}</p>
              </div>
            ))}
          </HairlineGrid>
        </div>
      </section>

      {/* Form — bordered card on tokens */}
      <section className="border-b border-border">
        <div className="px-6 py-16 sm:py-20">
          <div className="mx-auto max-w-2xl border border-border bg-card p-6 sm:p-10">
            <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-5">
              <div className="grid gap-5 sm:grid-cols-2">
                <div>
                  <label htmlFor="contact-name" className="mb-2 block text-sm text-muted-foreground">
                    Name
                  </label>
                  <input
                    id="contact-name"
                    type="text"
                    value={form.name}
                    onChange={(e) => setForm({ ...form, name: e.target.value })}
                    onBlur={() => handleBlur('name')}
                    className={INPUT_CLASS}
                    placeholder="Your name"
                    aria-invalid={(submitAttempted && !!fieldErrors.name) || undefined}
                    aria-describedby={submitAttempted && fieldErrors.name ? 'contact-name-error' : undefined}
                  />
                  {submitAttempted && fieldErrors.name && (
                    <p id="contact-name-error" className="mt-1 text-sm text-destructive">
                      {fieldErrors.name}
                    </p>
                  )}
                </div>
                <div>
                  <label htmlFor="contact-email" className="mb-2 block text-sm text-muted-foreground">
                    Email
                  </label>
                  <input
                    id="contact-email"
                    type="email"
                    value={form.email}
                    onChange={(e) => setForm({ ...form, email: e.target.value })}
                    onBlur={() => handleBlur('email')}
                    className={INPUT_CLASS}
                    placeholder="you@example.com"
                    aria-invalid={(submitAttempted && !!fieldErrors.email) || undefined}
                    aria-describedby={submitAttempted && fieldErrors.email ? 'contact-email-error' : undefined}
                  />
                  {submitAttempted && fieldErrors.email && (
                    <p id="contact-email-error" className="mt-1 text-sm text-destructive">
                      {fieldErrors.email}
                    </p>
                  )}
                </div>
              </div>

              <div className="grid gap-5 sm:grid-cols-2">
                <div>
                  <label htmlFor="contact-company" className="mb-2 block text-sm text-muted-foreground">
                    Company <span className="text-muted-foreground/60">(optional)</span>
                  </label>
                  <input
                    id="contact-company"
                    type="text"
                    value={form.company}
                    onChange={(e) => setForm({ ...form, company: e.target.value })}
                    className={INPUT_CLASS}
                    placeholder="Company name"
                  />
                </div>
                <div>
                  <label id="contact-topic-label" className="mb-2 block text-sm text-muted-foreground">
                    Topic
                  </label>
                  <Select
                    variant="input"
                    fullWidth
                    value={form.topic}
                    onChange={(v) => setForm({ ...form, topic: v })}
                    options={TOPICS.map((t) => ({ value: t, label: t }))}
                  />
                </div>
              </div>

              <div>
                <label htmlFor="contact-message" className="mb-2 block text-sm text-muted-foreground">
                  Message
                </label>
                <textarea
                  id="contact-message"
                  rows={6}
                  value={form.message}
                  onChange={(e) => setForm({ ...form, message: e.target.value })}
                  onBlur={() => handleBlur('message')}
                  maxLength={MESSAGE_MAX}
                  className={`${INPUT_CLASS} resize-none`}
                  placeholder="How can we help?"
                  aria-invalid={(submitAttempted && !!fieldErrors.message) || undefined}
                  aria-describedby={submitAttempted && fieldErrors.message ? 'contact-message-error' : undefined}
                />
                {submitAttempted && fieldErrors.message && (
                  <p id="contact-message-error" className="mt-1 text-sm text-destructive">
                    {fieldErrors.message}
                  </p>
                )}
              </div>

              {/* Honeypot — visually hidden, unreachable by keyboard; bots
                  auto-fill it and the backend silently drops those. */}
              <div aria-hidden="true" className="absolute -left-[9999px] h-0 w-0 overflow-hidden">
                <label htmlFor="contact-website">Website</label>
                <input
                  ref={honeypotRef}
                  id="contact-website"
                  type="text"
                  name="website"
                  tabIndex={-1}
                  autoComplete="off"
                />
              </div>

              <Captcha
                onVerify={(id: string, solution: string, token?: string) => {
                  setCaptchaId(id)
                  setCaptchaSolution(solution)
                  setCaptchaToken(token || '')
                }}
                apiUrl={env.NEXT_PUBLIC_CAPTCHA_API_URL}
                action="contact"
              />

              <Button type="submit" disabled={status === 'submitting'} isLoading={status === 'submitting'} className="justify-center">
                {status !== 'submitting' && (
                  <>
                    Send message
                    <ArrowRightIcon className="ml-2 h-4 w-4" aria-hidden="true" />
                  </>
                )}
              </Button>

              {status === 'success' && (
                <p role="status" className="border border-border bg-background px-4 py-3 text-sm text-foreground">
                  Message sent — we&apos;ll reply to your email.
                </p>
              )}
              {errorMessage && status !== 'success' && (
                <p role="alert" className="border border-destructive/40 bg-background px-4 py-3 text-sm text-destructive">
                  {errorMessage}
                </p>
              )}
            </form>
          </div>
        </div>
      </section>
    </>
  )
}
