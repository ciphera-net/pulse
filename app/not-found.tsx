import Link from 'next/link'
import { Button } from '@ciphera-net/ui'
import { cdnUrl } from '@/lib/cdn'

export default function NotFound() {
  return (
    <div className="relative min-h-[80vh] flex flex-col items-center justify-center overflow-hidden">
      {/* * --- ATMOSPHERE (Background) --- */}
      <div className="absolute inset-0 -z-10 pointer-events-none">
        {/* * Grid Pattern with Radial Mask */}
        <div 
          className="absolute inset-0 bg-grid-pattern opacity-[0.05]"
          style={{ maskImage: 'radial-gradient(ellipse at center, black 0%, transparent 70%)' }}
        />
      </div>

      <div className="text-center px-4 z-10">
        <img
          src={cdnUrl('/illustrations/page-not-found.png')}
          alt=""
          loading="lazy"
          decoding="async"
          className="w-96 h-auto mx-auto mb-8"
        />
        <h2 className="text-2xl font-bold text-white mb-6">
          Page not found
        </h2>
        <p className="text-lg text-neutral-400 max-w-md mx-auto mb-10 leading-relaxed">
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
