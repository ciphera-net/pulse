'use client'

import { Header, Footer } from '@ciphera-net/ui'
import { useAuth } from '@/lib/auth/context'
import Link from 'next/link'

export default function LayoutContent({ children }: { children: React.ReactNode }) {
  const auth = useAuth()
  
  return (
    <>
      <Header 
        auth={auth} 
        LinkComponent={Link} 
        logoSrc="/ciphera_icon_no_margins.png"
        appName="Ciphera Analytics"
      />
      <main className="flex-1 pt-24 pb-8">
        {children}
      </main>
      <Footer 
        LinkComponent={Link}
        appName="Ciphera Analytics"
      />
    </>
  )
}
