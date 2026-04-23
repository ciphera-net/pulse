'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { getAdminMe } from '@/lib/api/admin'
import { LoadingOverlay } from '@ciphera-net/ui'
import { cdnUrl } from '@/lib/cdn'

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const [isAdmin, setIsAdmin] = useState<boolean | null>(null)
  const router = useRouter()

  useEffect(() => {
    getAdminMe()
      .then((res) => {
        if (res.is_admin) {
          setIsAdmin(true)
        } else {
          setIsAdmin(false)
          // Redirect to home if not admin
          router.push('/')
        }
      })
      .catch(() => {
        setIsAdmin(false)
        router.push('/')
      })
  }, [router])

  if (isAdmin === null) {
    return <LoadingOverlay logoSrc={cdnUrl('/pulse_icon_no_margins.png')} title="Checking access..." />
  }

  if (!isAdmin) {
    return null // Will redirect
  }

  return (
    <div className="w-full max-w-6xl mx-auto px-4 sm:px-6 py-8">
      <div className="mb-8 flex items-center justify-between">
        <h1 className="text-2xl font-bold text-white">Pulse Admin</h1>
      </div>
      {children}
    </div>
  )
}
