import Link from 'next/link'
import { Button } from '@ciphera-net/ui'

export default function NotFound() {
  return (
    <div className="relative min-h-[80vh] flex flex-col items-center justify-center overflow-hidden selection:bg-brand-orange/20">
      {/* * --- ATMOSPHERE (Background) --- */}
      <div className="absolute inset-0 -z-10 pointer-events-none">
        {/* * Center Orange Glow */}
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[500px] bg-brand-orange/10 rounded-full blur-[128px] opacity-60" />
        {/* * Grid Pattern with Radial Mask */}
        <div 
          className="absolute inset-0 bg-grid-pattern opacity-[0.02] dark:opacity-[0.05]"
          style={{ maskImage: 'radial-gradient(ellipse at center, black 0%, transparent 70%)' }}
        />
      </div>

      <div className="text-center px-4 z-10">
        <h1 className="text-9xl font-bold text-transparent bg-clip-text bg-gradient-to-b from-neutral-900 to-neutral-500 dark:from-white dark:to-neutral-500 mb-4">
          404
        </h1>
        <h2 className="text-2xl md:text-3xl font-bold text-neutral-900 dark:text-white mb-6">
          Page not found
        </h2>
        <p className="text-lg text-neutral-600 dark:text-neutral-400 max-w-md mx-auto mb-10 leading-relaxed">
          Sorry, we couldn't find the page you're looking for. It might have been moved or deleted.
        </p>

        <div className="flex flex-col sm:flex-row gap-4 justify-center items-center">
          <Link href="/">
            <Button variant="primary" className="px-8 py-3 shadow-lg shadow-brand-orange/20">
              Go back home
            </Button>
          </Link>
          <Link href="/faq">
            <Button variant="secondary" className="px-8 py-3">
              View FAQ
            </Button>
          </Link>
        </div>
      </div>
    </div>
  )
}
