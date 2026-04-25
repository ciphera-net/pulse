declare global {
  interface Window {
    Chargebee: {
      init: (config: { site: string; publishableKey: string }) => ChargebeeInstance
      getInstance: () => ChargebeeInstance
    }
  }
}

export interface ChargebeeInstance {
  openCheckout: (options: CheckoutOptions) => void
  createChargebeePortal: () => PortalInstance
  setPortalSession: (callback: () => Promise<PortalSession>) => void
  load: (module: string) => Promise<void>
  createComponent: (type: string, options?: Record<string, unknown>) => unknown
}

export interface CheckoutOptions {
  hostedPage: () => Promise<{ url: string }>
  success: (hostedPageId: string) => void
  error: (error: unknown) => void
  close: () => void
}

export interface PortalInstance {
  open: (options: { sectionType?: string; close?: () => void }) => void
}

export interface PortalSession {
  id: string
  token: string
  access_url: string
}

let chargebeeInstance: ChargebeeInstance | null = null

export function initChargebee(): ChargebeeInstance | null {
  if (chargebeeInstance) return chargebeeInstance
  if (typeof window === 'undefined' || !window.Chargebee) return null

  chargebeeInstance = window.Chargebee.init({
    site: process.env.NEXT_PUBLIC_CHARGEBEE_SITE!,
    publishableKey: process.env.NEXT_PUBLIC_CHARGEBEE_PUBLISHABLE_KEY!,
  })

  return chargebeeInstance
}

export function getChargebee(): ChargebeeInstance | null {
  return chargebeeInstance
}
