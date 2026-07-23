'use client'

import { useMemo, useState } from 'react'
import { Button, CheckIcon, CopyIcon, Input } from '@ciphera-net/facet'

interface Field {
  key: string
  label: string
  param: string
  placeholder: string
  required: boolean
  hint: string
}

const FIELDS: Field[] = [
  {
    key: 'url',
    label: 'Website URL',
    param: '',
    placeholder: 'https://example.com/landing',
    required: true,
    hint: 'The destination page you are linking to.',
  },
  {
    key: 'source',
    label: 'Campaign source',
    param: 'utm_source',
    placeholder: 'newsletter',
    required: true,
    hint: 'Where the traffic comes from — the referrer or platform (e.g. newsletter, twitter, google).',
  },
  {
    key: 'medium',
    label: 'Campaign medium',
    param: 'utm_medium',
    placeholder: 'email',
    required: true,
    hint: 'The marketing channel or type of link (e.g. email, cpc, social, banner).',
  },
  {
    key: 'campaign',
    label: 'Campaign name',
    param: 'utm_campaign',
    placeholder: 'spring_launch',
    required: true,
    hint: 'The specific campaign or promotion this link belongs to.',
  },
  {
    key: 'term',
    label: 'Campaign term',
    param: 'utm_term',
    placeholder: 'privacy analytics',
    required: false,
    hint: 'Optional. Paid-search keywords for this ad.',
  },
  {
    key: 'content',
    label: 'Campaign content',
    param: 'utm_content',
    placeholder: 'header_cta',
    required: false,
    hint: 'Optional. Distinguishes links that point to the same URL (e.g. which button or variant).',
  },
]

function buildUrl(values: Record<string, string>): string {
  const base = values.url?.trim()
  if (!base) return ''

  const params: [string, string][] = FIELDS.filter((f) => f.param && values[f.key]?.trim()).map(
    (f) => [f.param, values[f.key].trim()],
  )
  if (params.length === 0) return base

  // Prefer the URL API so existing query strings and fragments are handled
  // correctly; fall back to manual concatenation for inputs it can't parse.
  try {
    const url = new URL(base)
    params.forEach(([k, v]) => url.searchParams.set(k, v))
    return url.toString()
  } catch {
    const query = params.map(([k, v]) => `${k}=${encodeURIComponent(v)}`).join('&')
    return base + (base.includes('?') ? '&' : '?') + query
  }
}

export function UtmBuilder() {
  const [values, setValues] = useState<Record<string, string>>({})
  const [copied, setCopied] = useState(false)

  const result = useMemo(() => buildUrl(values), [values])
  const missingRequired = FIELDS.some((f) => f.required && !values[f.key]?.trim())

  function update(key: string, value: string) {
    setValues((prev) => ({ ...prev, [key]: value }))
    setCopied(false)
  }

  async function copy() {
    if (!result) return
    try {
      await navigator.clipboard.writeText(result)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // Clipboard unavailable (insecure context / permission) — no-op; the
      // field is selectable so the user can copy manually.
    }
  }

  return (
    <div className="mt-10 grid gap-10 lg:grid-cols-[1fr_1fr]">
      {/* Form */}
      <div className="space-y-6">
        {FIELDS.map((field) => (
          <div key={field.key}>
            <label
              htmlFor={`utm-${field.key}`}
              className="flex items-center gap-2 text-sm font-medium text-foreground"
            >
              {field.label}
              {!field.required && (
                <span className="font-mono text-[10px] uppercase tracking-[0.08em] text-muted-foreground">
                  optional
                </span>
              )}
            </label>
            <Input
              id={`utm-${field.key}`}
              type={field.key === 'url' ? 'url' : 'text'}
              inputMode={field.key === 'url' ? 'url' : 'text'}
              value={values[field.key] ?? ''}
              onChange={(e) => update(field.key, e.target.value)}
              placeholder={field.placeholder}
              className="mt-2"
            />
            <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">{field.hint}</p>
          </div>
        ))}
      </div>

      {/* Output */}
      <div className="lg:sticky lg:top-24 lg:self-start">
        <div className="border border-border">
          <div className="h-1 bg-gradient-to-r from-brand-orange via-brand-orange/60 to-transparent" />
          <div className="bg-neutral-950 p-5">
            <p className="mb-3 font-mono text-xs text-muted-foreground">Your tagged URL</p>
            {missingRequired ? (
              <p className="font-mono text-[13px] leading-relaxed text-neutral-500">
                Fill in the website URL, source, medium and campaign to generate a link.
              </p>
            ) : (
              <pre className="overflow-x-auto whitespace-pre-wrap break-all font-mono text-[13px] leading-relaxed text-neutral-200">
                {result}
              </pre>
            )}
          </div>
        </div>
        <Button
          type="button"
          onClick={copy}
          disabled={missingRequired || !result}
          className="mt-4"
          size="lg"
        >
          {copied ? (
            <>
              <CheckIcon className="mr-2 h-4 w-4" aria-hidden="true" />
              Copied
            </>
          ) : (
            <>
              <CopyIcon className="mr-2 h-4 w-4" aria-hidden="true" />
              Copy URL
            </>
          )}
        </Button>
        <p className="mt-4 text-xs leading-relaxed text-muted-foreground">
          The link is assembled entirely in your browser — nothing is sent to a server. Pulse reads
          these <code className="font-mono text-neutral-400">utm_*</code> parameters automatically
          and reports each campaign, source and medium in your dashboard.
        </p>
      </div>
    </div>
  )
}
