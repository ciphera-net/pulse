'use client'

/**
 * Shared block: framework picker, tracking script snippet with copy, and integration guide links.
 * Used on welcome (step 5), /sites/new (step 2), and site settings.
 */

import { useState, useCallback } from 'react'
import Link from 'next/link'
import { API_URL, APP_URL } from '@/lib/api/client'
import { integrations, getIntegration } from '@/lib/integrations'
import { toast } from '@ciphera-net/ui'
import { CheckIcon } from '@ciphera-net/ui'

const POPULAR_INTEGRATIONS = integrations.filter((i) => i.category === 'framework').slice(0, 10)

export interface ScriptSetupBlockSite {
  domain: string
  name?: string
}

interface ScriptSetupBlockProps {
  /** Site domain (and optional name for display). */
  site: ScriptSetupBlockSite
  /** Called when user copies the script (e.g. for analytics). */
  onScriptCopy?: () => void
  /** Show framework picker and "View all integrations" / "See full guide" links. Default true. */
  showFrameworkPicker?: boolean
  /** Optional class for the root wrapper. */
  className?: string
}

export default function ScriptSetupBlock({
  site,
  onScriptCopy,
  showFrameworkPicker = true,
  className = '',
}: ScriptSetupBlockProps) {
  const [selectedIntegrationSlug, setSelectedIntegrationSlug] = useState<string | null>(null)
  const [scriptCopied, setScriptCopied] = useState(false)

  const copyScript = useCallback(() => {
    const script = `<script defer data-domain="${site.domain}" data-api="${API_URL}" data-storage="local" data-storage-ttl="24" src="${APP_URL}/script.js"></script>`
    navigator.clipboard.writeText(script)
    setScriptCopied(true)
    toast.success('Script copied to clipboard')
    onScriptCopy?.()
    setTimeout(() => setScriptCopied(false), 2000)
  }, [site.domain, onScriptCopy])

  return (
    <div className={className}>
      {showFrameworkPicker && (
        <>
          <h3 className="text-sm font-semibold text-neutral-900 dark:text-white mb-1">
            Add the script to your site
          </h3>
          <p className="text-xs text-neutral-500 dark:text-neutral-400 mb-3">
            Choose your framework for setup instructions.
          </p>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 mb-4">
            {POPULAR_INTEGRATIONS.map((int) => (
              <button
                key={int.id}
                type="button"
                onClick={() => setSelectedIntegrationSlug(selectedIntegrationSlug === int.id ? null : int.id)}
                className={`flex items-center gap-2 rounded-lg border px-3 py-2.5 text-left text-sm transition-colors ${
                  selectedIntegrationSlug === int.id
                    ? 'border-brand-orange bg-brand-orange/10 text-brand-orange'
                    : 'border-neutral-200 dark:border-neutral-700 bg-neutral-50 dark:bg-neutral-800/50 hover:bg-neutral-100 dark:hover:bg-neutral-800 text-neutral-700 dark:text-neutral-300'
                }`}
              >
                <span className="[&_svg]:h-4 [&_svg]:w-4 [&_svg]:shrink-0 flex items-center justify-center">
                  {int.icon}
                </span>
                <span className="truncate font-medium">{int.name}</span>
              </button>
            ))}
          </div>
          <p className="text-xs text-neutral-500 dark:text-neutral-400 mb-2">
            <Link href="/integrations" target="_blank" rel="noopener noreferrer" className="text-brand-orange hover:underline">
              View all integrations →
            </Link>
          </p>
        </>
      )}

      <div className="rounded-xl bg-neutral-100 dark:bg-neutral-800 p-4 relative group">
        <code className="text-xs text-neutral-900 dark:text-white break-all font-mono block pr-10">
          {`<script defer data-domain="${site.domain}" data-api="${API_URL}" data-storage="local" data-storage-ttl="24" src="${APP_URL}/script.js"></script>`}
        </code>
        <p className="mt-2 text-xs text-neutral-500 dark:text-neutral-400">
          Optional: <code className="rounded px-1 bg-neutral-200 dark:bg-neutral-700">data-storage=&quot;session&quot;</code> for per-tab (ephemeral) visitor counting.
        </p>
        <button
          type="button"
          onClick={copyScript}
          className="absolute top-2 right-2 p-2 bg-white dark:bg-neutral-700 rounded-lg shadow-sm hover:bg-neutral-50 dark:hover:bg-neutral-600 transition-colors"
          title="Copy script"
          aria-label={scriptCopied ? 'Copied' : 'Copy script to clipboard'}
        >
          {scriptCopied ? (
            <CheckIcon className="w-4 h-4 text-green-500" />
          ) : (
            <svg className="w-4 h-4 text-neutral-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <rect x="9" y="9" width="13" height="13" rx="2" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              <path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          )}
        </button>
      </div>

      {showFrameworkPicker && selectedIntegrationSlug && getIntegration(selectedIntegrationSlug) && (
        <p className="mt-3 text-xs">
          <Link
            href={`/integrations/${selectedIntegrationSlug}`}
            target="_blank"
            rel="noopener noreferrer"
            className="text-brand-orange hover:underline"
          >
            See full {getIntegration(selectedIntegrationSlug)!.name} guide →
          </Link>
        </p>
      )}
    </div>
  )
}
