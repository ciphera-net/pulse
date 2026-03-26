'use client'

// Mollie.js types (no official @types package)
export interface MollieInstance {
  createComponent: (type: string, options?: { styles?: Record<string, unknown> }) => MollieComponent
  createToken: () => Promise<{ token: string | null; error: MollieError | null }>
}

export interface MollieComponent {
  mount: (selector: string | HTMLElement) => void
  unmount: () => void
  addEventListener: (event: string, callback: (event: unknown) => void) => void
}

export interface MollieError {
  field: string
  message: string
}

declare global {
  interface Window {
    Mollie: (profileId: string, options?: { locale?: string; testmode?: boolean }) => MollieInstance
  }
}

const MOLLIE_PROFILE_ID = process.env.NEXT_PUBLIC_MOLLIE_PROFILE_ID || ''

// Mollie Components card field styles — matches Pulse dark theme
export const MOLLIE_FIELD_STYLES = {
  base: {
    color: '#ffffff',
    fontSize: '14px',
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
    fontWeight: '400',
    letterSpacing: '0.025em',
    '::placeholder': {
      color: '#737373',
    },
  },
  valid: {
    color: '#ffffff',
  },
  invalid: {
    color: '#ef4444',
  },
}

let mollieInstance: MollieInstance | null = null

/**
 * Initialize Mollie.js. Must be called after the Mollie script has loaded.
 */
export function initMollie(): MollieInstance | null {
  if (mollieInstance) return mollieInstance
  if (typeof window === 'undefined' || !window.Mollie || !MOLLIE_PROFILE_ID) return null

  // testmode must match the API key type on the backend (test_ = true, live_ = false)
  const testmode = process.env.NEXT_PUBLIC_MOLLIE_TESTMODE === 'true'
  mollieInstance = window.Mollie(MOLLIE_PROFILE_ID, {
    locale: 'en_US',
    testmode,
  })
  return mollieInstance
}

/**
 * Get the current Mollie instance (must call initMollie first).
 */
export function getMollie(): MollieInstance | null {
  return mollieInstance
}
