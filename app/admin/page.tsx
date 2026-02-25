'use client'

import Link from 'next/link'
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@ciphera-net/ui'

export default function AdminDashboard() {
  return (
    <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
      <Link href="/admin/orgs" className="block transition-transform hover:scale-[1.02]">
        <Card>
          <CardHeader>
            <CardTitle>Organizations</CardTitle>
            <CardDescription>Manage organization plans and limits</CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-neutral-500 dark:text-neutral-400">
              View all organizations, check billing status, and manually grant plans.
            </p>
          </CardContent>
        </Card>
      </Link>
    </div>
  )
}
