'use client'

import { useState, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { 
  XIcon, 
  CheckCircleIcon, 
  AlertTriangleIcon,
  ZapIcon 
} from '@ciphera-net/ui'
import { Site } from '@/lib/api/sites'
import { getRealtime } from '@/lib/api/stats'
import { toast } from 'sonner'

interface VerificationModalProps {
  isOpen: boolean
  onClose: () => void
  site: Site
}

export default function VerificationModal({ isOpen, onClose, site }: VerificationModalProps) {
  const [mounted, setMounted] = useState(false)
  const [status, setStatus] = useState<'idle' | 'checking' | 'success' | 'error'>('idle')
  const [attempts, setAttempts] = useState(0)

  useEffect(() => {
    setMounted(true)
    return () => setMounted(false)
  }, [])

  useEffect(() => {
    if (isOpen) {
      setStatus('idle')
      setAttempts(0)
    }
  }, [isOpen])

  // * Polling Logic
  useEffect(() => {
    let interval: NodeJS.Timeout
    const maxAttempts = 30 // 60 seconds (2s interval)

    if (status === 'checking') {
      interval = setInterval(async () => {
        setAttempts(prev => {
            if (prev >= maxAttempts) {
                setStatus('error')
                return prev
            }
            return prev + 1
        })

        try {
          const data = await getRealtime(site.id)
          if (data.visitors > 0) {
            setStatus('success')
            toast.success('Connection established!')
          }
        } catch (e) {
          // Ignore errors
        }
      }, 2000)
    }

    return () => clearInterval(interval)
  }, [status, site.id])

  const handleStartVerification = () => {
    const protocol = site.domain.includes('http') ? '' : 'https://'
    const verificationUrl = `${protocol}${site.domain}/?utm_source=ciphera_verify&_t=${Date.now()}`
    
    // * Open site
    window.open(verificationUrl, '_blank')
    
    // * Start polling
    setStatus('checking')
    setAttempts(0)
  }

  if (!mounted) return null

  return createPortal(
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 z-[100] bg-black/40 backdrop-blur-sm"
          />

          {/* Modal */}
          <div className="fixed inset-0 z-[101] flex items-center justify-center p-4 pointer-events-none">
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="w-full max-w-md bg-white dark:bg-neutral-900 rounded-2xl shadow-xl border border-neutral-200 dark:border-neutral-800 pointer-events-auto overflow-hidden"
            >
              {/* Header */}
              <div className="flex items-center justify-between px-6 py-4 border-b border-neutral-100 dark:border-neutral-800">
                <h3 className="font-semibold text-neutral-900 dark:text-white">
                  Verify Installation
                </h3>
                <button
                  onClick={onClose}
                  className="p-1 rounded-lg text-neutral-500 hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors"
                >
                  <XIcon className="w-5 h-5" />
                </button>
              </div>

              {/* Content */}
              <div className="p-6">
                {status === 'idle' && (
                  <div className="space-y-4">
                    <div className="p-4 rounded-xl bg-brand-orange/5 border border-brand-orange/10 flex gap-4">
                      <div className="p-2 bg-brand-orange/10 rounded-lg h-fit text-brand-orange">
                        <ZapIcon className="w-5 h-5" />
                      </div>
                      <div className="space-y-1">
                        <h4 className="font-medium text-brand-orange">How this works</h4>
                        <p className="text-sm text-neutral-600 dark:text-neutral-400">
                          We will open your website in a new tab. Keep it open while we check if the script sends back a signal.
                        </p>
                      </div>
                    </div>

                    <button
                      onClick={handleStartVerification}
                      className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-neutral-900 dark:bg-white text-white dark:text-neutral-900 rounded-xl font-medium hover:opacity-90 transition-opacity"
                    >
                      Open Website & Verify
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                      </svg>
                    </button>
                  </div>
                )}

                {status === 'checking' && (
                  <div className="flex flex-col items-center justify-center py-8 space-y-6">
                    <div className="relative">
                      <div className="w-16 h-16 border-4 border-neutral-100 dark:border-neutral-800 rounded-full" />
                      <div className="absolute inset-0 w-16 h-16 border-4 border-brand-orange border-t-transparent rounded-full animate-spin" />
                    </div>
                    <div className="text-center space-y-1">
                      <h4 className="font-medium text-neutral-900 dark:text-white">
                        Checking connection...
                      </h4>
                      <p className="text-sm text-neutral-500 dark:text-neutral-400">
                        Waiting for signal from {site.domain}
                      </p>
                    </div>
                  </div>
                )}

                {status === 'success' && (
                  <div className="flex flex-col items-center justify-center py-6 space-y-6">
                    <div className="w-16 h-16 bg-green-100 dark:bg-green-900/20 rounded-full flex items-center justify-center text-green-600 dark:text-green-400">
                      <CheckCircleIcon className="w-8 h-8" />
                    </div>
                    <div className="text-center space-y-1">
                      <h4 className="text-xl font-bold text-neutral-900 dark:text-white">
                        You're all set!
                      </h4>
                      <p className="text-neutral-500 dark:text-neutral-400">
                        We are successfully receiving data from your website.
                      </p>
                    </div>
                    <button
                      onClick={onClose}
                      className="w-full px-4 py-3 bg-neutral-900 dark:bg-white text-white dark:text-neutral-900 rounded-xl font-medium hover:opacity-90 transition-opacity"
                    >
                      Done
                    </button>
                  </div>
                )}

                {status === 'error' && (
                  <div className="space-y-6">
                    <div className="flex flex-col items-center justify-center space-y-2 text-center">
                      <div className="w-12 h-12 bg-red-100 dark:bg-red-900/20 rounded-full flex items-center justify-center text-red-600 dark:text-red-400">
                        <AlertTriangleIcon className="w-6 h-6" />
                      </div>
                      <h4 className="font-medium text-red-600 dark:text-red-400">
                        Connection Timed Out
                      </h4>
                    </div>

                    <div className="p-4 bg-neutral-50 dark:bg-neutral-800/50 rounded-xl border border-neutral-100 dark:border-neutral-800">
                      <p className="text-sm font-medium text-neutral-900 dark:text-white mb-2">
                        Troubleshooting Checklist:
                      </p>
                      <ul className="text-sm text-neutral-600 dark:text-neutral-400 space-y-1 list-disc list-inside">
                        <li>Did the new tab open successfully?</li>
                        <li>Is your ad blocker disabled?</li>
                        <li>Is the script inside the <code>&lt;head&gt;</code> tag?</li>
                        <li>Are you running on a valid domain (not localhost)?</li>
                      </ul>
                    </div>

                    <div className="flex gap-3">
                      <button
                        onClick={onClose}
                        className="flex-1 px-4 py-2.5 bg-white dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 text-neutral-700 dark:text-neutral-300 rounded-xl font-medium hover:bg-neutral-50 dark:hover:bg-neutral-700 transition-colors"
                      >
                        Close
                      </button>
                      <button
                        onClick={handleStartVerification}
                        className="flex-1 px-4 py-2.5 bg-neutral-900 dark:bg-white text-white dark:text-neutral-900 rounded-xl font-medium hover:opacity-90 transition-opacity"
                      >
                        Try Again
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </motion.div>
          </div>
        </>
      )}
    </AnimatePresence>,
    document.body
  )
}
