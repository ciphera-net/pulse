'use client'

import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { motion } from 'framer-motion'
import { useSetup } from '@/lib/setup/context'
import { getRealtime } from '@/lib/api/stats'
import { Button, Spinner, CheckCircleIcon, UsersIcon, BookOpenIcon, FunnelIcon } from '@ciphera-net/ui'

export default function SetupDonePage() {
  const router = useRouter()
  const { site, completeStep } = useSetup()
  const [dataReceived, setDataReceived] = useState(false)
  const cancelledRef = useRef(false)

  useEffect(() => {
    completeStep('done')
  }, [completeStep])

  // Poll for first pageview if a site was created
  useEffect(() => {
    if (!site) return
    cancelledRef.current = false

    const poll = async () => {
      for (let i = 0; i < 30; i++) {
        if (cancelledRef.current) return
        try {
          const data = await getRealtime(site.id)
          if (data && data.visitors > 0) {
            setDataReceived(true)
            return
          }
        } catch {
          // keep polling
        }
        await new Promise((r) => setTimeout(r, 3000))
      }
    }
    poll()

    return () => { cancelledRef.current = true }
  }, [site])

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.5 }}
    >
      <div className="text-center mb-10">
        <motion.div
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          transition={{ delay: 0.2, type: 'spring', stiffness: 200 }}
          className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-emerald-500/20 mb-5"
        >
          <CheckCircleIcon className="h-8 w-8 text-emerald-400" />
        </motion.div>
        <h1 className="text-2xl font-bold tracking-tight text-white">
          You&apos;re all set!
        </h1>
        <p className="mt-2 text-sm text-neutral-400 max-w-sm mx-auto">
          Your workspace is ready. Here are some things to do next.
        </p>
      </div>

      {/* Live data indicator */}
      {site && (
        <div className="mb-6 p-4 rounded-xl border border-neutral-800 bg-neutral-900/50">
          <div className="flex items-center gap-3">
            {dataReceived ? (
              <>
                <div className="h-2.5 w-2.5 rounded-full bg-emerald-400 animate-pulse" />
                <span className="text-sm text-emerald-400 font-medium">Live data flowing from {site.name}</span>
              </>
            ) : (
              <>
                <Spinner size="sm" />
                <span className="text-sm text-neutral-400">Waiting for first pageview from {site.name}...</span>
              </>
            )}
          </div>
        </div>
      )}

      {/* Next steps cards */}
      <div className="space-y-3 mb-8">
        <Link
          href="/sites/new"
          className="flex items-center gap-3 p-3 rounded-xl border border-neutral-800 hover:border-neutral-700 hover:bg-neutral-800/30 transition-all"
        >
          <div className="h-9 w-9 rounded-lg bg-blue-500/10 flex items-center justify-center shrink-0">
            <FunnelIcon className="h-4.5 w-4.5 text-blue-400" />
          </div>
          <div>
            <p className="text-sm font-medium text-white">Set up a goal</p>
            <p className="text-xs text-neutral-500">Track conversions and key events</p>
          </div>
        </Link>

        <Link
          href="/org-settings"
          className="flex items-center gap-3 p-3 rounded-xl border border-neutral-800 hover:border-neutral-700 hover:bg-neutral-800/30 transition-all"
        >
          <div className="h-9 w-9 rounded-lg bg-purple-500/10 flex items-center justify-center shrink-0">
            <UsersIcon className="h-4.5 w-4.5 text-purple-400" />
          </div>
          <div>
            <p className="text-sm font-medium text-white">Invite your team</p>
            <p className="text-xs text-neutral-500">Add members to your workspace</p>
          </div>
        </Link>

        <a
          href="https://docs.ciphera.net/pulse"
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-3 p-3 rounded-xl border border-neutral-800 hover:border-neutral-700 hover:bg-neutral-800/30 transition-all"
        >
          <div className="h-9 w-9 rounded-lg bg-amber-500/10 flex items-center justify-center shrink-0">
            <BookOpenIcon className="h-4.5 w-4.5 text-amber-400" />
          </div>
          <div>
            <p className="text-sm font-medium text-white">Read the docs</p>
            <p className="text-xs text-neutral-500">Guides, API reference, and more</p>
          </div>
        </a>
      </div>

      <Button onClick={() => router.push('/')} className="w-full">
        Go to dashboard
      </Button>
    </motion.div>
  )
}
