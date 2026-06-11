'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { Toggle, Button, toast, Spinner, getAuthErrorMessage } from '@ciphera-net/facet'
import Select from '@/components/ui/select'
import { CheckCircle, XCircle } from '@phosphor-icons/react'
import {
  getPrivacyScanConfig,
  updatePrivacyScanConfig,
  triggerPrivacyScan,
  getLatestPrivacyScan,
  type PrivacyScanConfig,
  type PrivacyScanResult,
  type SecurityHeaders,
} from '@/lib/api/privacy'
import { formatRelativeTime } from '@/lib/utils/formatDate'
import SettingsSaveBar from '@/components/settings/SettingsSaveBar'
import { useCan } from '@/lib/auth/permissions'

const SCAN_COOLDOWN_SECONDS = 300

export default function SitePrivacyScanTab({ siteId }: { siteId: string }) {
  const canManage = useCan('privacy_scan.manage')
  const [enabled, setEnabled] = useState(false)
  const [frequency, setFrequency] = useState('weekly')
  const [configLoaded, setConfigLoaded] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [scanning, setScanning] = useState(false)
  const [cooldown, setCooldown] = useState(0)
  const [lastScan, setLastScan] = useState<PrivacyScanResult | null>(null)

  const initialRef = useRef('')
  const hasInitialized = useRef(false)

  // Load config and latest scan result on mount
  useEffect(() => {
    if (hasInitialized.current) return

    async function load() {
      try {
        const [config, scan] = await Promise.all([
          getPrivacyScanConfig(siteId),
          getLatestPrivacyScan(siteId),
        ])

        const resolvedEnabled = config?.enabled ?? false
        const resolvedFrequency = config?.frequency ?? 'weekly'

        setEnabled(resolvedEnabled)
        setFrequency(resolvedFrequency)
        setLastScan(scan)

        initialRef.current = JSON.stringify({ enabled: resolvedEnabled, frequency: resolvedFrequency })
        hasInitialized.current = true
        setConfigLoaded(true)
      } catch (err) {
        setError(getAuthErrorMessage(err))
      }
    }

    load()
  }, [siteId])

  // Track dirty state
  const isDirty = initialRef.current
    ? JSON.stringify({ enabled, frequency }) !== initialRef.current
    : false

  const handleDiscard = () => {
    if (!initialRef.current) return
    const snap = JSON.parse(initialRef.current)
    setEnabled(snap.enabled)
    setFrequency(snap.frequency)
  }

  const handleSave = useCallback(async () => {
    try {
      await updatePrivacyScanConfig(siteId, enabled, frequency)
      initialRef.current = JSON.stringify({ enabled, frequency })
      toast.success('Privacy scan settings updated')
    } catch (err) {
      toast.error(getAuthErrorMessage(err as Error) || 'Failed to save settings')
    }
  }, [siteId, enabled, frequency])

  // Cooldown countdown
  useEffect(() => {
    if (cooldown <= 0) return
    const interval = setInterval(() => {
      setCooldown(prev => {
        if (prev <= 1) {
          clearInterval(interval)
          return 0
        }
        return prev - 1
      })
    }, 1000)
    return () => clearInterval(interval)
  }, [cooldown])

  const handleScan = useCallback(async () => {
    setScanning(true)
    try {
      await triggerPrivacyScan(siteId)
      toast.success('Privacy scan triggered — results will appear shortly')
      setCooldown(SCAN_COOLDOWN_SECONDS)
    } catch (err) {
      toast.error(getAuthErrorMessage(err as Error) || 'Failed to trigger scan')
    } finally {
      setScanning(false)
    }
  }, [siteId])

  if (error) {
    const retry = () => {
      setError(null)
      hasInitialized.current = false
    }
    return (
      <div className="rounded-xl border border-red-900/50 bg-red-950/20 p-6 text-center">
        <p className="text-red-400 text-sm">{error}</p>
        <Button
          type="button"
          variant="secondary"
          onClick={retry}
          className="mt-4"
        >
          Retry
        </Button>
      </div>
    )
  }

  if (!configLoaded) {
    return (
      <div className="flex items-center justify-center py-12">
        <Spinner className="w-6 h-6 text-neutral-500" />
      </div>
    )
  }

  const scripts = lastScan?.third_party_scripts ?? []
  const headers = lastScan?.security_headers ?? ({} as SecurityHeaders)
  const score = lastScan?.privacy_score ?? 0

  const HEADER_CHECKS: { key: keyof SecurityHeaders; label: string }[] = [
    { key: 'hsts', label: 'Strict-Transport-Security' },
    { key: 'x_content_type', label: 'X-Content-Type-Options' },
    { key: 'x_frame_options', label: 'X-Frame-Options' },
    { key: 'csp', label: 'Content-Security-Policy' },
    { key: 'referrer_policy', label: 'Referrer-Policy' },
    { key: 'permissions_policy', label: 'Permissions-Policy' },
  ]

  return (
    <div className="space-y-6">
      {/* Heading */}
      <div>
        <h3 className="text-base font-semibold text-white mb-1">Privacy Scanner</h3>
        <p className="text-sm text-neutral-400">Scan your site for third-party trackers, cookies, and security headers</p>
      </div>

      {/* Enable toggle */}
      <div className="flex items-center justify-between p-4 rounded-xl border border-neutral-800 bg-neutral-800/30">
        <div>
          <p className="text-sm font-medium text-white">Enable privacy scanning</p>
          <p className="text-xs text-neutral-500">Automatically scan for trackers and security issues</p>
        </div>
        <Toggle checked={enabled} onChange={() => setEnabled(v => !v)} disabled={!canManage} />
      </div>

      {/* Frequency selector — revealed when enabled */}
      <AnimatePresence>
        {enabled && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="overflow-hidden"
          >
            <div className="p-4 rounded-xl border border-neutral-800 bg-neutral-800/30">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-white">Scan frequency</p>
                  <p className="text-xs text-neutral-500">How often to check for privacy issues</p>
                </div>
                <Select
                  variant="input"
                  value={frequency}
                  onChange={setFrequency}
                  options={[
                    { value: 'daily', label: 'Daily' },
                    { value: 'weekly', label: 'Weekly' },
                    { value: 'monthly', label: 'Monthly' },
                  ]}
                  className="shrink-0 min-w-[200px]"
                  disabled={!canManage}
                />
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Scan Now */}
      <div className="flex items-center gap-3">
        <Button
          variant="secondary"
          onClick={handleScan}
          disabled={!canManage || scanning || cooldown > 0}
        >
          {scanning ? (
            <>
              <Spinner className="w-4 h-4" />
              Scanning...
            </>
          ) : cooldown > 0 ? (
            `Wait ${cooldown}s`
          ) : (
            'Scan Now'
          )}
        </Button>
        {lastScan && (
          <span className="text-xs text-neutral-500">
            Last scan: {formatRelativeTime(lastScan.scanned_at)}
          </span>
        )}
      </div>

      {/* Results — only shown when a scan result exists */}
      {lastScan && (
        <div className="pt-6 border-t border-neutral-800 space-y-5">

          {/* Privacy Score */}
          <div className="flex flex-col items-center py-4">
            <div
              className={`text-5xl font-bold tabular-nums ${
                score >= 80
                  ? 'text-green-400'
                  : score >= 50
                  ? 'text-amber-400'
                  : 'text-red-400'
              }`}
            >
              {score}
            </div>
            <span className="text-sm text-neutral-500 mt-1">Privacy Score</span>
          </div>

          {/* Third-party scripts */}
          <div>
            <h4 className="text-sm font-semibold text-white mb-3">Third-party scripts</h4>
            {scripts.length === 0 ? (
              <p className="text-sm text-neutral-500">No third-party scripts detected</p>
            ) : (
              <div className="space-y-2">
                {scripts.map(s => (
                  <div
                    key={s.host}
                    className="flex items-center justify-between p-3 rounded-xl border border-neutral-800 bg-neutral-800/30"
                  >
                    <span className="text-sm text-white font-mono">{s.host}</span>
                    <span
                      className={`text-[10px] font-medium px-2 py-0.5 rounded-full ${
                        s.category === 'analytics'
                          ? 'bg-blue-500/20 text-blue-400'
                          : s.category === 'advertising'
                          ? 'bg-red-500/20 text-red-400'
                          : s.category === 'social'
                          ? 'bg-purple-500/20 text-purple-400'
                          : 'bg-neutral-500/20 text-neutral-400'
                      }`}
                    >
                      {s.category}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Cookies */}
          {lastScan.cookies && lastScan.cookies.length > 0 && (
            <div>
              <h4 className="text-sm font-semibold text-white mb-3">Cookies</h4>
              <div className="space-y-2">
                {lastScan.cookies.map(c => (
                  <div
                    key={`${c.name}-${c.domain}`}
                    className="flex items-center justify-between p-3 rounded-xl border border-neutral-800 bg-neutral-800/30"
                  >
                    <div>
                      <span className="text-sm text-white font-mono">{c.name}</span>
                      <span className="text-xs text-neutral-500 ml-2">{c.domain}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      {c.secure && (
                        <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-green-500/20 text-green-400">
                          Secure
                        </span>
                      )}
                      {c.http_only && (
                        <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-blue-500/20 text-blue-400">
                          HttpOnly
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Security headers checklist */}
          <div>
            <h4 className="text-sm font-semibold text-white mb-3">Security headers</h4>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {HEADER_CHECKS.map(h => (
                <div
                  key={h.key}
                  className="flex items-center gap-2 p-2.5 rounded-xl border border-neutral-800 bg-neutral-800/30"
                >
                  {headers[h.key] ? (
                    <CheckCircle className="w-4 h-4 text-green-400 flex-shrink-0" weight="fill" />
                  ) : (
                    <XCircle className="w-4 h-4 text-red-400 flex-shrink-0" weight="fill" />
                  )}
                  <span className="text-xs text-neutral-300 font-mono">{h.label}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Issues list */}
          {lastScan.issues && lastScan.issues.length > 0 && (
            <div>
              <h4 className="text-sm font-semibold text-white mb-3">Issues</h4>
              <div className="space-y-2">
                {lastScan.issues.map((issue, i) => (
                  <div
                    key={i}
                    className="flex items-start gap-2 p-3 rounded-xl border border-neutral-800 bg-neutral-800/30"
                  >
                    <XCircle className="w-4 h-4 text-amber-400 flex-shrink-0 mt-0.5" weight="fill" />
                    <span className="text-sm text-neutral-300">{issue}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {canManage && (
        <SettingsSaveBar
          isDirty={isDirty}
          onSave={handleSave}
          onDiscard={handleDiscard}
        />
      )}
    </div>
  )
}
