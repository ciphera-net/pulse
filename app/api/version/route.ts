import { NextResponse } from 'next/server'

const buildId = process.env.NEXT_PUBLIC_BUILD_ID ?? 'dev'

export function GET() {
  return NextResponse.json(
    { buildId },
    { headers: { 'Cache-Control': 'no-store, no-cache, must-revalidate' } }
  )
}
