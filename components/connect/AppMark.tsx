'use client'

import { useState } from 'react'
import { cdnUrl } from '@/lib/cdn'
import { cn } from '@/lib/utils'
import type { ClientBrand } from '@/lib/api/connect'

/**
 * The marks of the apps Pulse has VERIFIED, served from Pulse's own CDN so the
 * viewer's browser never contacts the vendor. Each file name carries a version:
 * a changed logo gets a new name, never a new body at the same path (a stable
 * asset path with a long cache ships stale bytes). Sources, measured
 * 24-09-2026: claude.ai/favicon.svg; the logo_uri in chatgpt.com's own CIMD
 * document; Cursor's favicon as Sigil resolves it; the logo_uri in VS Code's
 * own CIMD document (vscode.dev/oauth/client-metadata.json), scaled to 256 px.
 */
export const BRAND_MARKS: Record<ClientBrand, string> = {
  claude: '/connect/claude-v1.svg',
  chatgpt: '/connect/chatgpt-v1.png',
  cursor: '/connect/cursor-v1.png',
  vscode: '/connect/vscode-v1.png',
}

/**
 * An MCP client's mark: its logo when the server named a verified brand,
 * otherwise SiteFavicon's neutral monogram — the device Pulse already uses for
 * a site with no favicon. A self-registered app NEVER gets an image: nothing it
 * says about itself is drawn, so a look-alike cannot borrow a real logo
 * (owner ruling 24-09-2026, "we need to add logos"; options doc, "Logos").
 * An image that fails to load falls back to the monogram too.
 */
export function AppMark({
  name,
  brand,
  size,
  className,
}: {
  name: string
  brand: ClientBrand | null
  /** 36 beside the Pulse mark on /connect (its own w-9 h-9); 32 in rows. */
  size: 32 | 36
  className?: string
}) {
  const [failed, setFailed] = useState(false)
  const box = size === 36 ? 'h-9 w-9' : 'h-8 w-8'
  if (brand && !failed) {
    return (
      // eslint-disable-next-line @next/next/no-img-element -- a fixed CDN asset; next/image adds nothing here
      <img
        src={cdnUrl(BRAND_MARKS[brand])}
        alt=""
        width={size}
        height={size}
        className={cn(box, 'shrink-0 object-contain', className)}
        data-brand={brand}
        onError={() => setFailed(true)}
      />
    )
  }
  return (
    <div
      aria-hidden
      data-monogram=""
      className={cn(box, 'flex shrink-0 items-center justify-center bg-neutral-800 font-semibold text-neutral-400', className)}
      style={{ fontSize: size === 36 ? 18 : 16 }}
    >
      {(name.trim()[0] ?? '?').toUpperCase()}
    </div>
  )
}
