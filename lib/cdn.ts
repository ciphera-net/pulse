const CDN_BASE = process.env.NEXT_PUBLIC_CDN_URL || ''

export function cdnUrl(path: string): string {
  return `${CDN_BASE}${path}`
}
