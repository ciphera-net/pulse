'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { type Site } from '@/lib/api/sites'
import { trackWelcomeCompleted } from '@/lib/welcomeAnalytics'
import { Button } from '@ciphera-net/ui'
import { ArrowLeftIcon, CheckCircleIcon } from '@ciphera-net/ui'
import ScriptSetupBlock from '@/components/sites/ScriptSetupBlock'
import VerificationModal from '@/components/sites/VerificationModal'

const WELCOME_COMPLETED_KEY = 'pulse_welcome_completed'

interface StepInstallProps {
  site: Site | null
  onBack: () => void
}

export default function StepInstall({ site, onBack }: StepInstallProps) {
  const router = useRouter()
  const [showVerificationModal, setShowVerificationModal] = useState(false)

  const goToDashboard = () => {
    if (typeof window !== 'undefined') localStorage.setItem(WELCOME_COMPLETED_KEY, 'true')
    trackWelcomeCompleted(!!site)
    router.push('/')
  }

  const goToSite = () => {
    if (!site) return
    if (typeof window !== 'undefined') localStorage.setItem(WELCOME_COMPLETED_KEY, 'true')
    trackWelcomeCompleted(true)
    router.push(`/sites/${site.id}`)
  }

  return (
    <>
      <button
        type="button"
        onClick={onBack}
        className="flex items-center gap-2 text-sm text-neutral-400 hover:text-neutral-300 mb-8 transition-colors"
      >
        <ArrowLeftIcon className="h-4 w-4" />
        Back
      </button>

      <div className="text-center mb-8">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-emerald-500/10 text-emerald-400 mb-5">
          <CheckCircleIcon className="h-7 w-7" />
        </div>
        <h1 className="text-2xl font-bold tracking-tight text-white">
          {site ? 'Install the tracking script' : "You're all set"}
        </h1>
        <p className="mt-2 text-sm text-neutral-400 max-w-sm mx-auto">
          {site
            ? `Add this snippet to "${site.name}" to start collecting data.`
            : 'Head to your dashboard to add sites and start tracking.'}
        </p>
      </div>

      {site && (
        <>
          <div className="mb-6">
            <ScriptSetupBlock
              site={{ domain: site.domain, name: site.name }}
              showFrameworkPicker
            />
          </div>

          <div className="flex items-center justify-center gap-2 mb-8">
            <button
              type="button"
              onClick={() => setShowVerificationModal(true)}
              className="text-sm font-medium text-brand-orange hover:text-brand-orange/80 transition-colors"
            >
              Verify installation
            </button>
            <span className="text-xs text-neutral-500">— Check if your site is sending data</span>
          </div>
        </>
      )}

      <div className="flex flex-col sm:flex-row gap-3 justify-center">
        <Button variant="primary" onClick={goToDashboard} className="min-w-40">
          Go to dashboard
        </Button>
        {site && (
          <Button variant="secondary" onClick={goToSite} className="min-w-40">
            View {site.name}
          </Button>
        )}
      </div>

      {site && (
        <VerificationModal
          isOpen={showVerificationModal}
          onClose={() => setShowVerificationModal(false)}
          site={site}
        />
      )}
    </>
  )
}
